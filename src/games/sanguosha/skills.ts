/**
 * 三国杀·自由混战 —— 技能钩子实现（27 名武将；主公技不实现）。
 * 单向依赖：仅 import type 引擎类型，运行时由 engine 调用。
 * 顺序裁定与简化项见 docs/sanguosha/RULES_DECISIONS.md。
 */
import { GENERAL_BY_ID } from './generals';
import { isBlack, isRed } from './cards';
import type { CmdResult, SanguoshaGame } from './engine';
import type { SgAction, SgPlayerId, SgPlayerState, SgWait } from './types';

type G = Generator<SgWait, void, CmdResult>;
type GV<T> = Generator<SgWait, T, CmdResult>;

/** 类型化挂起：yield 一个窗口并返回玩家命令 */
type DistOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;
function* wait(w: DistOmit<SgWait, 'windowId'>): GV<CmdResult> {
  return (yield w as SgWait) as CmdResult;
}

// ─── 通用工具 ────────────────────────────────────────────────
export function* askChoice(e: SanguoshaGame, pid: SgPlayerId, promptId: string, options: string[], prompt: string): GV<string> {
  const cmd = yield* wait({ kind: 'choose', playerId: pid, promptId, options, prompt });
  if (cmd.type === 'option' && cmd.value && options.includes(cmd.value)) return cmd.value;
  if (cmd.type === 'pass') return options[0]; // 超时/断线托管：默认第一项（多为否定/安全项时放首位）
  throw new Error('REJECT:INVALID_OPTION');
}

function* askCards(e: SanguoshaGame, p: SgPlayerState, min: number, max: number, prompt: string): GV<string[]> {
  const cmd = yield* wait({ kind: 'cards', playerId: p.id, min, max, zone: 'hand', prompt });
  if (cmd.type === 'cards' && cmd.cards) {
    if (cmd.cards.length < min || cmd.cards.length > max) throw new Error('REJECT:CARDS_COUNT');
    for (const id of cmd.cards) if (!p.hand.includes(id)) throw new Error('REJECT:NOT_YOUR_CARD');
    return cmd.cards;
  }
  if (cmd.type === 'pass' && min === 0) return [];
  throw new Error('REJECT:CARDS_EXPECTED');
}

function* askTargets(e: SanguoshaGame, pid: SgPlayerId, candidates: SgPlayerId[], min: number, max: number, prompt: string): GV<SgPlayerId[]> {
  const cmd = yield* wait({ kind: 'targets', playerId: pid, candidates, min, max, prompt });
  if (cmd.type === 'targets' && cmd.targets) {
    if (cmd.targets.length < min || cmd.targets.length > max) throw new Error('REJECT:TARGETS_COUNT');
    for (const t of cmd.targets) if (!candidates.includes(t)) throw new Error('REJECT:TARGET_INVALID');
    return cmd.targets;
  }
  throw new Error('REJECT:TARGETS_EXPECTED');
}

function hasSkill(e: SanguoshaGame, p: SgPlayerState, id: string): boolean {
  return e.hasSkill(p, id);
}

// ─── 区域事件钩子 ────────────────────────────────────────────
/** 失去装备（替换/被拆/被拿）：枭姬 */
export function onLoseEquipment(e: SanguoshaGame, p: SgPlayerState, cardId: string): void {
  void cardId;
  if (hasSkill(e, p, 'xiaoji') && p.alive) {
    e.drawCards(p, 2);
    e.log('SKILL', { player: p.id, skill: 'xiaoji' });
  }
}

/** 失去最后一张手牌：连营 */
export function onLoseLastHand(e: SanguoshaGame, p: SgPlayerState): void {
  if (hasSkill(e, p, 'lianying') && p.alive && p.hand.length === 0) {
    e.drawCards(p, 1);
    e.log('SKILL', { player: p.id, skill: 'lianying' });
  }
}

/** 使用普通锦囊：集智（自动，house rule） */
export function onCardUsed(e: SanguoshaGame, p: SgPlayerState, cardId: string, asName: string): void {
  void cardId;
  if (hasSkill(e, p, 'jizhi')) {
    if (isNormalTrickName(asName)) {
      e.drawCards(p, 1);
      e.log('SKILL', { player: p.id, skill: 'jizhi' });
    }
  }
}

function isNormalTrickName(name: string): boolean {
  return ['guohechaiqiao', 'shunshouqianyang', 'wuzhongshengyou', 'juedou', 'nanmanruqin', 'wanjianqifa', 'taoyuanjieyi', 'wugufengdeng', 'jiedaosharen', 'huogong', 'tiesuolianhuan'].includes(name);
}

// ─── 阶段钩子 ────────────────────────────────────────────────
/** 回合开始：观星 */
export function* hookStartPhase(e: SanguoshaGame, p: SgPlayerState): G {
  if (!hasSkill(e, p, 'guanxing')) return;
  const x = Math.min(e.alivePlayers().length, 5);
  const top: string[] = [];
  for (let i = 0; i < x; i++) {
    const id = e.st.drawPile.pop();
    if (!id) break;
    top.push(id);
  }
  if (top.length === 0) return;
  e.log('SKILL', { player: p.id, skill: 'guanxing', count: top.length });
  const cmd = yield* wait({ kind: 'guanxing', playerId: p.id, cards: top });
  if (cmd.type === 'guanxing' && cmd.top) {
    const set = new Set(cmd.top);
    for (const id of cmd.top) if (!top.includes(id)) throw new Error('REJECT:GUANXING_CARD');
    if (new Set(cmd.top).size !== cmd.top.length) throw new Error('REJECT:GUANXING_DUP');
    // 未选中的按原相对顺序置底
    const bottom = top.filter((id) => !set.has(id));
    e.st.drawPile.unshift(...bottom);
    // 选中的按提交顺序放回顶部（数组尾=顶）
    e.st.drawPile.push(...cmd.top);
    e.log('GUANXING_DONE', { player: p.id, topCount: cmd.top.length, bottomCount: bottom.length });
    return;
  }
  throw new Error('REJECT:GUANXING_EXPECTED');
}

/** 准备阶段：洛神 */
export function* hookPreparePhase(e: SanguoshaGame, p: SgPlayerState): G {
  if (!hasSkill(e, p, 'luoshen')) return;
  while (p.alive && e.st.winner === null) {
    const go = yield* askChoice(e, p.id, 'luoshen', ['yes', 'no'], '洛神：进行判定？');
    if (go === 'no') return;
    const r = yield* e.judge(p, 'luoshen');
    if (isBlack(r.suit)) {
      // 获得判定牌（judge 未天妒时已进弃牌堆）
      const di = e.st.discardPile.indexOf(r.cardId);
      if (di >= 0) e.st.discardPile.splice(di, 1);
      p.hand.push(r.cardId);
      e.log('SKILL_GAIN', { player: p.id, skill: 'luoshen', card: e.pubCard(r.cardId) });
      e.log('CARD_GAINED', { player: p.id, from: 'judge', card: e.pubCard(r.cardId) });
      onLoseLastHand(e, p);
      continue;
    }
    e.log('SKILL_FAIL', { player: p.id, skill: 'luoshen' });
    return;
  }
}

/** 判定牌生效前：鬼才（司马懿可打出手牌替换） */
export function* hookJudgeBefore(e: SanguoshaGame, who: SgPlayerState, judgeCardId: string): GV<string | null> {
  for (const p of e.alivePlayers()) {
    if (!hasSkill(e, p, 'guicai')) continue;
    if (p.hand.length === 0) continue;
    const cards = yield* askCards(e, p, 0, 1, `鬼才：是否用一张手牌替换判定牌（${who.id} 的判定）？`);
    if (cards.length === 0) continue;
    const rep = cards[0];
    // 原判定牌 → 弃牌堆；替换牌 → 处理区作为判定牌
    const pi = e.st.processing.indexOf(judgeCardId);
    if (pi >= 0) e.st.processing.splice(pi, 1);
    e.st.discardPile.push(judgeCardId);
    p.hand.splice(p.hand.indexOf(rep), 1);
    e.st.processing.push(rep);
    e.log('SKILL', { player: p.id, skill: 'guicai', card: e.pubCard(rep) });
    onLoseLastHand(e, p);
    return rep;
  }
  return null;
}

/** 摸牌阶段：突袭/裸衣/英姿；默认摸 2 */
export function* hookDrawPhase(e: SanguoshaGame, p: SgPlayerState): G {
  // 突袭
  if (hasSkill(e, p, 'tuxi')) {
    const candidates = e.others(p.id).filter((x) => x.hand.length > 0).map((x) => x.id);
    if (candidates.length > 0) {
      const go = yield* askChoice(e, p.id, 'tuxi', ['yes', 'no'], '突袭：放弃摸牌，改为获得至多两名角色的手牌？');
      if (go === 'yes') {
        const ts = yield* askTargets(e, p.id, candidates, 1, 2, '突袭：选择至多两名有手牌的角色');
        for (const tid of ts) {
          const t = e.player(tid);
          const id = t.hand[e.rng.int(t.hand.length)];
          t.hand.splice(t.hand.indexOf(id), 1);
          p.hand.push(id);
          e.log('CARD_STOLEN', { from: tid, by: p.id, hidden: true });
          onLoseLastHand(e, t);
        }
        e.log('SKILL', { player: p.id, skill: 'tuxi' });
        return;
      }
    }
  }
  // 裸衣
  if (hasSkill(e, p, 'luyi')) {
    const go = yield* askChoice(e, p.id, 'luyi', ['yes', 'no'], '裸衣：少摸一张牌，本回合杀/决斗伤害+1？');
    if (go === 'yes') {
      e.drawCards(p, 1);
      p.flags.luyiActive = true;
      e.log('SKILL', { player: p.id, skill: 'luyi' });
      return;
    }
  }
  const n = 2 + (hasSkill(e, p, 'yingzi') ? 1 : 0);
  e.drawCards(p, n);
}

/** 结束阶段：闭月（自动，house rule） */
export function* hookEndPhase(e: SanguoshaGame, p: SgPlayerState): G {
  if (hasSkill(e, p, 'biyue')) {
    e.drawCards(p, 1);
    e.log('SKILL', { player: p.id, skill: 'biyue' });
  }
}

// ─── 伤害后钩子（按技能表顺序）─────────────────────────────
export function* hookDamagedAfter(
  e: SanguoshaGame,
  victim: SgPlayerState,
  req: { source: SgPlayerId | null; amount: number; nature: string; cardId: string | null; reason: string },
  amount: number,
): G {
  if (!victim.generalId) return;
  const g = GENERAL_BY_ID.get(victim.generalId);
  if (!g) return;
  for (const s of g.skills) {
    if (s.disabledInMode) continue;
    switch (s.id) {
      case 'jianxiong':
        yield* skillJianxiong(e, victim, req);
        break;
      case 'fankui':
        yield* skillFankui(e, victim, req);
        break;
      case 'ganglie':
        yield* skillGanglie(e, victim, req);
        break;
      case 'yiji':
        for (let i = 0; i < amount; i++) yield* skillYijiOnce(e, victim);
        break;
      case 'yaowu':
        yield* skillYaowu(e, victim, req);
        break;
    }
    if (!victim.alive || e.st.winner !== null) return;
  }
}

/** 奸雄：获得造成伤害的牌 */
function* skillJianxiong(e: SanguoshaGame, victim: SgPlayerState, req: { source: SgPlayerId | null; cardId: string | null }): G {
  if (!req.cardId || !e.st.processing.includes(req.cardId)) return;
  const go = yield* askChoice(e, victim.id, 'jianxiong', ['yes', 'no'], '奸雄：获得造成伤害的牌？');
  if (go !== 'yes') return;
  const pi = e.st.processing.indexOf(req.cardId);
  if (pi >= 0) e.st.processing.splice(pi, 1);
  victim.hand.push(req.cardId);
  e.log('SKILL_GAIN', { player: victim.id, skill: 'jianxiong', card: e.pubCard(req.cardId) });
  e.log('CARD_GAINED', { player: victim.id, from: 'damage-card', card: e.pubCard(req.cardId) });
  onLoseLastHand(e, victim);
}

/** 反馈：获得来源一张牌（随机手牌优先，无手牌取装备——house rule） */
function* skillFankui(e: SanguoshaGame, victim: SgPlayerState, req: { source: SgPlayerId | null }): G {
  if (!req.source) return;
  const src = e.player(req.source);
  if (!src.alive) return;
  const go = yield* askChoice(e, victim.id, 'fankui', ['yes', 'no'], '反馈：获得伤害来源的一张牌？');
  if (go !== 'yes') return;
  let taken: string | null = null;
  if (src.hand.length > 0) {
    taken = src.hand[e.rng.int(src.hand.length)];
    src.hand.splice(src.hand.indexOf(taken), 1);
  } else {
    const eq = (['weapon', 'armor', 'horsePlus', 'horseMinus'] as const).map((s) => src.equips[s]).find(Boolean);
    if (eq) {
      for (const s of ['weapon', 'armor', 'horsePlus', 'horseMinus'] as const) if (src.equips[s] === eq) src.equips[s] = null;
      e.log('LOSE_EQUIP', { player: src.id, slot: 'unknown', card: e.pubCard(eq) });
      onLoseEquipment(e, src, eq);
      taken = eq;
    }
  }
  if (taken) {
    victim.hand.push(taken);
    e.log('CARD_STOLEN', { from: src.id, by: victim.id, hidden: true });
    e.log('CARD_GAINED', { player: victim.id, from: src.id, card: e.pubCard(taken) });
    onLoseLastHand(e, src);
  }
}

/** 刚烈：判定非红桃 → 来源弃2手牌或受1伤 */
function* skillGanglie(e: SanguoshaGame, victim: SgPlayerState, req: { source: SgPlayerId | null }): G {
  if (!req.source) return;
  const src = e.player(req.source);
  if (!src.alive) return;
  const go = yield* askChoice(e, victim.id, 'ganglie', ['yes', 'no'], '刚烈：进行判定？');
  if (go !== 'yes') return;
  const r = yield* e.judge(victim, 'ganglie');
  if (r.suit === 'H') {
    e.log('SKILL_FAIL', { player: victim.id, skill: 'ganglie' });
    return;
  }
  if (src.hand.length >= 2) {
    const opt = yield* askChoice(e, src.id, 'ganglie-pay', ['discard2', 'damage'], '刚烈：弃置两张手牌或受到1点伤害？');
    if (opt === 'discard2') {
      const cards = yield* askCards(e, src, 2, 2, '刚烈：弃置两张手牌');
      for (const id of cards) {
        src.hand.splice(src.hand.indexOf(id), 1);
        e.st.discardPile.push(id);
        onLoseLastHand(e, src);
      }
      e.log('DISCARD', { count: 2, cards: e.publicCards(cards) });
      return;
    }
  }
  yield* e.resolveDamage({ source: victim.id, target: src.id, amount: 1, nature: 'normal', cardId: null, reason: 'ganglie' });
}

/** 遗计（每点伤害）：摸 2，可交出至多 2 张 */
function* skillYijiOnce(e: SanguoshaGame, victim: SgPlayerState): G {
  const go = yield* askChoice(e, victim.id, 'yiji', ['yes', 'no'], '遗计：摸两张牌？');
  if (go !== 'yes') return;
  const drawn = e.drawCards(victim, 2);
  e.log('SKILL', { player: victim.id, skill: 'yiji', count: drawn.length });
  if (drawn.length === 0) return;
  const give = yield* askCards(e, victim, 0, Math.min(2, drawn.length), '遗计：选择至多两张牌交给其他角色');
  for (const id of give) {
    const others = e.others(victim.id).map((x) => x.id);
    if (others.length === 0) break;
    const ts = yield* askTargets(e, victim.id, others, 1, 1, '遗计：选择获得牌的角色');
    victim.hand.splice(victim.hand.indexOf(id), 1);
    e.player(ts[0]).hand.push(id);
    e.log('CARD_GIVEN', { from: victim.id, to: ts[0], card: e.pubCard(id) });
  }
}

/** 耀武：受红杀伤害后来源选择（弃1手牌 or 令华雄摸1） */
function* skillYaowu(e: SanguoshaGame, victim: SgPlayerState, req: { source: SgPlayerId | null; cardId: string | null; reason: string }): G {
  if (req.reason !== 'sha' || !req.cardId || !req.source) return;
  const card = e.card(req.cardId);
  if (!isRed(card.suit)) return;
  const src = e.player(req.source);
  if (src.hand.length > 0) {
    const opt = yield* askChoice(e, src.id, 'yaowu', ['discard1', 'draw'], '耀武：弃置一张手牌或令华雄摸一张牌？');
    if (opt === 'discard1') {
      const cards = yield* askCards(e, src, 1, 1, '耀武：弃置一张手牌');
      src.hand.splice(src.hand.indexOf(cards[0]), 1);
      e.st.discardPile.push(cards[0]);
      e.log('DISCARD', { count: 1, cards: e.publicCards(cards) });
      onLoseLastHand(e, src);
      return;
    }
  }
  e.drawCards(victim, 1);
  e.log('SKILL', { player: victim.id, skill: 'yaowu' });
}

// ─── 杀相关钩子 ──────────────────────────────────────────────
/** 流离：成为杀目标时转移（弃1手牌 + 攻击范围内另一目标） */
export function* hookTargeted(e: SanguoshaGame, user: SgPlayerState, shaCardId: string, target: SgPlayerState): GV<string | null> {
  void shaCardId;
  if (!hasSkill(e, target, 'liuli')) return null;
  const go = yield* askChoice(e, target.id, 'liuli', ['yes', 'no'], '流离：将此杀转移给攻击范围内的另一名角色？');
  if (go !== 'yes') return null;
  if (target.hand.length === 0) return null;
  const cards = yield* askCards(e, target, 1, 1, '流离：弃置一张手牌');
  const candidates = e.alivePlayers().filter((x) => x.id !== user.id && x.id !== target.id && e.inAttackRange(target.id, x.id)).map((x) => x.id);
  if (candidates.length === 0) return null;
  const ts = yield* askTargets(e, target.id, candidates, 1, 1, '流离：选择转移目标');
  const dis = cards[0];
  target.hand.splice(target.hand.indexOf(dis), 1);
  e.st.discardPile.push(dis);
  e.log('DISCARD', { count: 1, cards: e.publicCards([dis]) });
  e.log('SKILL', { player: target.id, skill: 'liuli', to: ts[0] });
  onLoseLastHand(e, target);
  return ts[0];
}

/** 铁骑：判定红色 → 目标不能闪 */
export function* askTieqi(e: SanguoshaGame, user: SgPlayerState, targetId: SgPlayerId): GV<boolean> {
  const go = yield* askChoice(e, user.id, 'tieqi', ['yes', 'no'], '铁骑：进行判定（红色则目标不能闪）？');
  if (go !== 'yes') return false;
  const r = yield* e.judge(user, 'tieqi');
  const ok = isRed(r.suit);
  e.log('SKILL', { player: user.id, skill: 'tieqi', hit: ok, target: targetId });
  return ok;
}

/** 青龙偃月刀：杀被闪后可追加一张杀 */
export function* hookQinglong(e: SanguoshaGame, user: SgPlayerState, targetId: SgPlayerId): GV<boolean> {
  if (user.equips.weapon !== byNameId('qinglongyanyuedao')) return false;
  const go = yield* askChoice(e, user.id, 'qinglong', ['yes', 'no'], '青龙偃月刀：立即对其再使用一张杀？');
  if (go !== 'yes') return false;
  const legal = user.hand.filter((id) => e.convertOptions(user, id, 'respond-sha').includes('sha'));
  if (legal.length === 0) return false;
  const cards = yield* askCards(e, user, 1, 1, '青龙偃月刀：选择一张杀（红牌可经武圣转换的牌也可）');
  const cid = cards[0];
  if (!legal.includes(cid)) throw new Error('REJECT:NOT_LEGAL_SHA');
  user.hand.splice(user.hand.indexOf(cid), 1);
  e.st.processing.push(cid);
  e.log('CARD_USED', { by: user.id, card: e.pubCard(cid), targets: [targetId], turn: e.st.turnNumber });
  yield* e.resolveSha(user, cid, [targetId], 'normal');
  const pi = e.st.processing.indexOf(cid);
  if (pi >= 0) e.st.processing.splice(pi, 1);
  e.st.discardPile.push(cid);
  return true; // 继续新一轮闪响应
}

/** 贯石斧：被闪后弃两张手牌强制伤害（house rule：仅手牌） */
export function* hookGuanshi(e: SanguoshaGame, user: SgPlayerState, targetId: SgPlayerId): GV<boolean> {
  void targetId;
  if (user.equips.weapon !== byNameId('guanshifu')) return false;
  if (user.hand.length < 2) return false;
  const go = yield* askChoice(e, user.id, 'guanshi', ['yes', 'no'], '贯石斧：弃置两张手牌，强制造成伤害？');
  if (go !== 'yes') return false;
  const cards = yield* askCards(e, user, 2, 2, '贯石斧：弃置两张手牌');
  for (const id of cards) {
    user.hand.splice(user.hand.indexOf(id), 1);
    e.st.discardPile.push(id);
    onLoseLastHand(e, user);
  }
  e.log('DISCARD', { count: 2, cards: e.publicCards(cards) });
  e.log('WEAPON_EFFECT', { weapon: 'guanshifu', by: user.id });
  return true;
}

function byNameId(name: string): string | null {
  // 武器是唯一实例，直接线性查找
  for (const id of allIdsCache()) {
    const c = cardOf(id);
    if (c && c.name === name) return id;
  }
  return null;
}

import { ALL_CARDS, CARD_BY_ID } from './cards';
const _ids: string[] = ALL_CARDS.map((c) => c.id);
function allIdsCache(): string[] {
  return _ids;
}
function cardOf(id: string) {
  return CARD_BY_ID.get(id);
}

// ─── 出牌阶段主动技 ─────────────────────────────────────────
export function* execActiveSkill(e: SanguoshaGame, p: SgPlayerState, skillId: string, a: Extract<SgAction, { type: 'use-skill' }>): G {
  switch (skillId) {
    case 'zhiheng': return yield* skillZhiheng(e, p);
    case 'kurou': return yield* skillKurou(e, p);
    case 'qingnang': return yield* skillQingnang(e, p, a);
    case 'fanjian': return yield* skillFanjian(e, p, a);
    case 'lijian': return yield* skillLijian(e, p, a);
    case 'jieyin': return yield* skillJieyin(e, p, a);
    case 'rende': return yield* skillRende(e, p, a);
    case 'zhangbashemao': return yield* skillZhangba(e, p, a);
    default: throw new Error('REJECT:UNKNOWN_SKILL');
  }
}

/** 制衡 */
function* skillZhiheng(e: SanguoshaGame, p: SgPlayerState): G {
  if (p.flags.zhihengUsed) throw new Error('REJECT:SKILL_USED');
  if (p.hand.length === 0) throw new Error('REJECT:NO_CARDS');
  const cards = yield* askCards(e, p, 1, p.hand.length, '制衡：弃置任意张手牌，摸等量的牌');
  for (const id of cards) {
    p.hand.splice(p.hand.indexOf(id), 1);
    e.st.discardPile.push(id);
    onLoseLastHand(e, p);
  }
  e.log('DISCARD', { count: cards.length, cards: e.publicCards(cards) });
  e.drawCards(p, cards.length);
  p.flags.zhihengUsed = true;
  e.log('SKILL', { player: p.id, skill: 'zhiheng' });
}

/** 苦肉 */
function* skillKurou(e: SanguoshaGame, p: SgPlayerState): G {
  const go = yield* askChoice(e, p.id, 'kurou', ['yes', 'no'], '苦肉：失去1点体力，摸两张牌？');
  if (go !== 'yes') return;
  e.log('SKILL', { player: p.id, skill: 'kurou' });
  yield* e.loseHp(p, 1, 'kurou');
  if (p.alive) e.drawCards(p, 2);
}

/** 青囊 */
function* skillQingnang(e: SanguoshaGame, p: SgPlayerState, a: Extract<SgAction, { type: 'use-skill' }>): G {
  if (p.flags.qingnangUsed) throw new Error('REJECT:SKILL_USED');
  const cards = a.cards ?? [];
  if (cards.length !== 1 || !p.hand.includes(cards[0])) throw new Error('REJECT:QINGNANG_CARD');
  const wounded = e.alivePlayers().filter((x) => x.hp < x.maxHp).map((x) => x.id);
  if (wounded.length === 0) throw new Error('REJECT:NO_TARGET');
  const targets = a.targets ?? [];
  if (targets.length !== 1 || !wounded.includes(targets[0])) throw new Error('REJECT:QINGNANG_TARGET');
  p.hand.splice(p.hand.indexOf(cards[0]), 1);
  e.st.discardPile.push(cards[0]);
  e.log('DISCARD', { count: 1, cards: e.publicCards(cards) });
  onLoseLastHand(e, p);
  const t = e.player(targets[0]);
  t.hp = Math.min(t.maxHp, t.hp + 1);
  p.flags.qingnangUsed = true;
  e.log('HEAL', { target: t.id, amount: 1, by: p.id });
  e.log('SKILL', { player: p.id, skill: 'qingnang' });
}

/** 反间 */
function* skillFanjian(e: SanguoshaGame, p: SgPlayerState, a: Extract<SgAction, { type: 'use-skill' }>): G {
  if (p.flags.fanjianUsed) throw new Error('REJECT:SKILL_USED');
  if (p.flags.fanjianUsed) throw new Error('REJECT:SKILL_USED');
  const cards = a.cards ?? [];
  if (cards.length !== 1 || !p.hand.includes(cards[0])) throw new Error('REJECT:FANJIAN_CARD');
  const targets = a.targets ?? [];
  if (targets.length !== 1 || !e.others(p.id).some((x) => x.id === targets[0])) throw new Error('REJECT:FANJIAN_TARGET');
  const t = e.player(targets[0]);
  const cid = cards[0];
  p.hand.splice(p.hand.indexOf(cid), 1);
  t.hand.push(cid);
  p.flags.fanjianUsed = true;
  e.log('CARD_GIVEN', { from: p.id, to: t.id, hidden: true });
  e.log('SKILL', { player: p.id, skill: 'fanjian', target: t.id });
  // 目标选择花色（不展示手牌内容）
  const suit = yield* askChoice(e, t.id, 'fanjian-suit', ['S', 'H', 'C', 'D'], '反间：选择一种花色');
  const card = e.card(cid);
  e.log('CARD_REVEALED', { by: t.id, card: e.pubCard(cid), reason: 'fanjian' });
  if (card.suit !== suit) {
    yield* e.resolveDamage({ source: p.id, target: t.id, amount: 1, nature: 'normal', cardId: null, reason: 'fanjian' });
  }
  e.log('CARD_GAINED', { player: t.id, from: p.id, card: e.pubCard(cid) });
}

/** 离间：弃1牌，两名男性决斗（先选=使用者） */
function* skillLijian(e: SanguoshaGame, p: SgPlayerState, a: Extract<SgAction, { type: 'use-skill' }>): G {
  if (p.flags.lijianUsed) throw new Error('REJECT:SKILL_USED');
  const cards = a.cards ?? [];
  if (cards.length !== 1 || !p.hand.includes(cards[0])) throw new Error('REJECT:LIJIAN_CARD');
  const males = e.alivePlayers().filter((x) => x.id !== p.id && isMale(e, x.id)).map((x) => x.id);
  if (males.length < 2) throw new Error('REJECT:NO_MALES');
  const targets = a.targets ?? [];
  if (targets.length !== 2 || !males.includes(targets[0]) || !males.includes(targets[1])) throw new Error('REJECT:LIJIAN_TARGETS');
  p.hand.splice(p.hand.indexOf(cards[0]), 1);
  e.st.discardPile.push(cards[0]);
  e.log('DISCARD', { count: 1, cards: e.publicCards(cards) });
  onLoseLastHand(e, p);
  p.flags.lijianUsed = true;
  e.log('SKILL', { player: p.id, skill: 'lijian', user: targets[0], target: targets[1] });
  yield* e.resolveDuel(e.player(targets[0]), null, targets[1]);
}

/** 结姻 */
function* skillJieyin(e: SanguoshaGame, p: SgPlayerState, a: Extract<SgAction, { type: 'use-skill' }>): G {
  if (p.flags.jieyinUsed) throw new Error('REJECT:SKILL_USED');
  const cards = a.cards ?? [];
  if (cards.length !== 2 || cards.some((id) => !p.hand.includes(id))) throw new Error('REJECT:JIEYIN_CARDS');
  const targets = a.targets ?? [];
  if (targets.length !== 1) throw new Error('REJECT:JIEYIN_TARGET');
  const t = e.player(targets[0]);
  if (!t.alive || t.id === p.id || !isMale(e, t.id) || t.hp >= t.maxHp) throw new Error('REJECT:JIEYIN_INVALID');
  for (const id of cards) {
    p.hand.splice(p.hand.indexOf(id), 1);
    e.st.discardPile.push(id);
    onLoseLastHand(e, p);
  }
  e.log('DISCARD', { count: 2, cards: e.publicCards(cards) });
  p.hp = Math.min(p.maxHp, p.hp + 1);
  t.hp = Math.min(t.maxHp, t.hp + 1);
  p.flags.jieyinUsed = true;
  e.log('HEAL', { target: p.id, amount: 1, by: p.id });
  e.log('HEAL', { target: t.id, amount: 1, by: p.id });
  e.log('SKILL', { player: p.id, skill: 'jieyin' });
}

/** 仁德：交牌；首次达 2 张回复 1 体力 */
function* skillRende(e: SanguoshaGame, p: SgPlayerState, a: Extract<SgAction, { type: 'use-skill' }>): G {
  const cards = a.cards ?? [];
  if (cards.length < 1 || cards.some((id) => !p.hand.includes(id))) throw new Error('REJECT:RENDE_CARDS');
  const targets = a.targets ?? [];
  if (targets.length !== 1 || !e.others(p.id).some((x) => x.id === targets[0])) throw new Error('REJECT:RENDE_TARGET');
  const t = e.player(targets[0]);
  for (const id of cards) {
    p.hand.splice(p.hand.indexOf(id), 1);
    t.hand.push(id);
    e.log('CARD_GIVEN', { from: p.id, to: t.id, card: e.pubCard(id) });
  }
  onLoseLastHand(e, p);
  p.flags.rendeGiven += cards.length;
  e.log('SKILL', { player: p.id, skill: 'rende', to: t.id, count: cards.length });
  if (p.flags.rendeGiven >= 2 && !p.flags.rendeHealed) {
    p.flags.rendeHealed = true;
    if (p.hp < p.maxHp) {
      p.hp = Math.min(p.maxHp, p.hp + 1);
      e.log('HEAL', { target: p.id, amount: 1, by: p.id });
    }
  }
}

/** 丈八蛇矛：两张手牌当杀 */
function* skillZhangba(e: SanguoshaGame, p: SgPlayerState, a: Extract<SgAction, { type: 'use-skill' }>): G {
  if (p.equips.weapon !== byNameId('zhangbashemao')) throw new Error('REJECT:NO_WEAPON');
  const cards = a.cards ?? [];
  if (cards.length !== 2 || cards.some((id) => !p.hand.includes(id))) throw new Error('REJECT:ZHANGBA_CARDS');
  const targets = a.targets ?? [];
  if (targets.length < 1 || targets.length > 3) throw new Error('REJECT:ZHANGBA_TARGETS');
  const alive = e.others(p.id).map((x) => x.id);
  for (const t of targets) {
    if (!alive.includes(t)) throw new Error('REJECT:TARGET_INVALID');
    if (e.blockedByTargetable(p.id, t, 'sha')) throw new Error('REJECT:TARGET_BLOCKED');
    if (e.distance(p.id, t) > e.attackRange(p)) throw new Error('REJECT:OUT_OF_RANGE');
  }
  for (const id of cards) {
    p.hand.splice(p.hand.indexOf(id), 1);
    e.st.discardPile.push(id);
    onLoseLastHand(e, p);
  }
  e.log('DISCARD', { count: 2, cards: e.publicCards(cards) });
  p.flags.shaUsed += 1;
  yield* e.virtualSha(p, targets);
}

function isMale(e: SanguoshaGame, pid: SgPlayerId): boolean {
  const gid = e.player(pid).generalId;
  const g = gid ? GENERAL_BY_ID.get(gid) : null;
  return g ? g.gender === 'm' : true;
}
