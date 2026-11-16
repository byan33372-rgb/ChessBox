/**
 * 三国杀·自由混战 —— 服务端权威规则引擎（PHASE 2/3 主体）。
 *
 * 架构：单 generator 协程驱动整局流程；`yield` 挂起等待玩家命令（响应窗口/选择/弃牌/选目标）。
 * - 服务端唯一权威：手牌/牌堆/判定结果/胜负只在这里改变。
 * - 伤害统一管线 resolveDamage（伤害前修正 → 结算 → 濒死 → 死亡 → 受伤后技能 → 连环传导）。
 * - 结算批次内死亡不立即判胜（resolveDepth>0 时挂起，回 0 统一判定）——同归于尽判平局。
 * - 无懈可击嵌套链、濒死救援窗口（本人优先→顺时针）、判定（鬼才/天妒/八卦）。
 * - 恢复：重放命令历史（serialize=seed+武将+命令流），保证牌堆顺序与挂起窗口完全一致。
 * - 牌张完整性：任何时刻一张实体牌只在一个区域（tests 断言）。
 *
 * 技能钩子实现于 ./skills（单向依赖：engine → skills）。
 */
import { CARD_BY_ID, buildPile, isBlack, isRed, type CardDef, type DeckConfig, type Suit, type SgCard } from './cards';
import { GENERAL_BY_ID, disabledSkillIds } from './generals';
import { SgRng } from './rng';
import { SG_MAX_DEPTH, SG_SEATS, type SgAction, type SgLogEvent, type SgNature, type SgPhase, type SgPlayerId, type SgPlayerState, type SgState, type SgWait } from './types';
import * as skills from './skills';

export interface CmdResult {
  type: 'pass' | 'cards' | 'option' | 'targets' | 'guanxing' | 'command';
  cards?: string[];
  value?: string;
  targets?: SgPlayerId[];
  top?: string[];
  action?: SgAction;
}

export interface SgCommandAck {
  ok: boolean;
  error?: { code: string; message: string };
  revision: number;
}

const WIN_LIMIT = 4096;

function shufflePile(cards: SgCard[]): string[] {
  return cards.map((c) => c.id);
}

export class SanguoshaGame {
  st: SgState;
  pending: SgWait | null = null;
  /** 命令历史（持久化=重放恢复） */
  history: Array<{ seat: SgPlayerId; action: SgAction }> = [];
  private iter: Generator<SgWait, void, CmdResult> | null = null;
  private seenCmds = new Set<string>();
  /** 伤害/事件链深度；>0 时死亡不立即判胜 */
  depth = 0;
  /** 房间层注入：窗口打开/关闭回调（用于超时托管） */
  onWait: ((w: SgWait | null) => void) | null = null;
  rng: SgRng;
  private winSeq = 0;

  constructor(st: SgState) {
    this.st = st;
    this.rng = new SgRng(st.rng.seed, st.rng.counter);
  }

  // ─── 创建/恢复 ───────────────────────────────────────────────
  static create(order: SgPlayerId[], deckConfig: DeckConfig, seed: number): SanguoshaGame {
    const players = order.map((id) => ({
      id,
      generalId: null,
      hp: 4,
      maxHp: 4,
      alive: true,
      hand: [] as string[],
      equips: { weapon: null, armor: null, horsePlus: null, horseMinus: null },
      judgments: [] as string[],
      chained: false,
      selected: false,
      flags: {
        shaUsed: 0, jiuActive: false, luyiActive: false,
        zhihengUsed: false, fanjianUsed: false, qingnangUsed: false, jieyinUsed: false, lijianUsed: false,
        rendeGiven: 0, rendeHealed: false, yijiPending: 0, skipDraw: false, skipPlay: false,
      },
    }));
    const st: SgState = {
      deckConfig,
      rulesetVersion: 'sg-ffa-1.0',
      revision: 1,
      turnNumber: 0,
      current: order[0],
      phase: 'select',
      players,
      order: [...order],
      drawPile: [],
      discardPile: [],
      processing: [],
      delayedAs: {},
      winner: null,
      log: [],
      rng: { seed: seed >>> 0, counter: 0 },
      v: 1,
    };
    return new SanguoshaGame(st);
  }

  serialize(): string {
    return JSON.stringify({ seed: this.st.rng.seed, order: this.st.order, deckConfig: this.st.deckConfig, history: this.history });
  }

  static deserialize(json: string): SanguoshaGame | null {
    try {
      const raw = JSON.parse(json) as { seed: number; order: SgPlayerId[]; deckConfig: DeckConfig; history: Array<{ seat: SgPlayerId; action: SgAction }> };
      const g = SanguoshaGame.create(raw.order, raw.deckConfig, raw.seed);
      // 选将重放
      for (const p of g.st.players) {
        const sel = raw.history.find((h) => h.seat === p.id && h.action.type === 'select-general');
        if (sel && sel.action.type === 'select-general') g.selectGeneral(p.id, sel.action.generalId);
      }
      for (const h of raw.history) {
        if (h.action.type === 'select-general') continue;
        const r = g.commandRaw(h.seat, h.action);
        if (!r.ok) return null; // 历史不一致则放弃恢复（理论不可达：历史均为已验证命令）
      }
      return g;
    } catch {
      return null;
    }
  }

  // ─── 基础查询 ────────────────────────────────────────────────
  player(id: SgPlayerId) {
    return this.st.players.find((p) => p.id === id)!;
  }
  alivePlayers(): SgPlayerState[] {
    return this.st.order.map((id) => this.player(id)).filter((p) => p.alive);
  }
  others(p: SgPlayerId): SgPlayerState[] {
    return this.alivePlayers().filter((x) => x.id !== p);
  }
  hasSkill(p: SgPlayerState, skillId: string): boolean {
    if (!p.generalId || !p.alive) return false;
    const g = GENERAL_BY_ID.get(p.generalId);
    return !!g?.skills.some((s) => s.id === skillId && !s.disabledInMode);
  }
  card(id: string): SgCard {
    return CARD_BY_ID.get(id)!;
  }
  handCount(p: SgPlayerId): number {
    return this.player(p).hand.length;
  }

  /** 牌张完整性：每张牌唯一区域（测试用） */
  locationOfAll(): Map<string, string> {
    const loc = new Map<string, string>();
    for (const c of ALL_IDS) loc.set(c, 'void');
    for (const p of this.st.players) {
      for (const id of p.hand) loc.set(id, `hand:${p.id}`);
      for (const [slot, id] of Object.entries(p.equips)) if (id) loc.set(id, `equip:${p.id}:${slot}`);
      for (const id of p.judgments) loc.set(id, `judge:${p.id}`);
    }
    for (const id of this.st.drawPile) loc.set(id, 'draw');
    for (const id of this.st.discardPile) loc.set(id, 'discard');
    for (const id of this.st.processing) loc.set(id, 'processing');
    return loc;
  }

  // ─── 距离与目标 ──────────────────────────────────────────────
  /** 存活玩家环形座次距离（死亡不计入） */
  distance(from: SgPlayerId, to: SgPlayerId): number {
    if (from === to) return 0;
    const ring = this.alivePlayers().map((p) => p.id);
    const i = ring.indexOf(from);
    const j = ring.indexOf(to);
    if (i < 0 || j < 0) return 99;
    const raw = Math.min((j - i + ring.length) % ring.length, (i - j + ring.length) % ring.length);
    let d = raw;
    const f = this.player(from);
    const t = this.player(to);
    if (f.equips.horseMinus) d -= 1;
    if (t.equips.horsePlus) d += 1;
    if (this.hasSkill(f, 'mashu')) d -= 1;
    // 同疾（house rule）：袁术手牌唯一最多 → 其他角色计算与袁术距离+1
    if (this.hasSkill(t, 'tongji')) {
      const counts = this.alivePlayers().map((x) => x.hand.length);
      const maxC = Math.max(...counts);
      if (counts.filter((c) => c === maxC).length === 1 && t.hand.length === maxC) d += 1;
    }
    return Math.max(1, d);
  }

  attackRange(p: SgPlayerState): number {
    if (p.equips.weapon) return this.card(p.equips.weapon).range ?? 1;
    return 1;
  }

  inAttackRange(from: SgPlayerId, to: SgPlayerId): boolean {
    const f = this.player(from);
    return this.distance(from, to) <= this.attackRange(f);
  }

  /** 目标合法性：空城/谦逊/距离 */
  blockedByTargetable(user: SgPlayerId, target: SgPlayerId, cardName: string): boolean {
    const t = this.player(target);
    if (!t.alive) return true;
    if (this.hasSkill(t, 'kongcheng') && t.hand.length === 0 && (cardName === 'sha' || cardName === 'juedou')) return true;
    if (this.hasSkill(t, 'qianxun') && (cardName === 'shunshouqianyang' || cardName === 'lebusishu')) return true;
    return false;
  }

  // ─── 区域操作（保持完整性）─────────────────────────────────
  private reshuffleIfNeeded(): void {
    if (this.st.drawPile.length > 0) return;
    if (this.st.discardPile.length === 0) return;
    const ids = this.st.discardPile;
    this.st.discardPile = [];
    this.rng.shuffle(ids);
    this.st.drawPile = ids;
    this.log('SHUFFLE', { count: ids.length });
  }

  drawCards(p: SgPlayerState, n: number): string[] {
    const got: string[] = [];
    for (let i = 0; i < n; i++) {
      this.reshuffleIfNeeded();
      const id = this.st.drawPile.pop();
      if (!id) break; // 牌堆与弃牌堆均空：按规则放弃剩余摸牌
      p.hand.push(id);
      got.push(id);
    }
    if (got.length) this.log('DRAW_HIDDEN', { player: p.id, count: got.length });
    return got;
  }

  discardCards(ids: string[]): void {
    for (const id of ids) this.st.discardPile.push(id);
    if (ids.length) this.log('DISCARD', { count: ids.length, cards: this.publicCards(ids) });
  }

  /** 公开牌信息（弃牌/使用时公布） */
  publicCards(ids: string[]) {
    return ids.map((id) => {
      const c = this.card(id);
      return { id, name: c.name, suit: c.suit, rank: c.rank };
    });
  }

  /** 从玩家的某区域移除一张牌（校验归属） */
  removeCardFrom(p: SgPlayerState, cardId: string): boolean {
    const hi = p.hand.indexOf(cardId);
    if (hi >= 0) {
      p.hand.splice(hi, 1);
      return true;
    }
    for (const slot of ['weapon', 'armor', 'horsePlus', 'horseMinus'] as const) {
      if (p.equips[slot] === cardId) {
        p.equips[slot] = null;
        this.log('LOSE_EQUIP', { player: p.id, slot, card: this.pubCard(cardId) });
        skills.onLoseEquipment(this, p, cardId);
        return true;
      }
    }
    return false;
  }

  pubCard(id: string | null) {
    if (!id) return null;
    const c = this.card(id);
    return { id, name: c.name, suit: c.suit, rank: c.rank };
  }

  // ─── 日志/版本 ───────────────────────────────────────────────
  log(t: string, fields: Record<string, unknown> = {}): void {
    this.st.revision += 1;
    const e: SgLogEvent = { seq: this.st.log.length + 1, rev: this.st.revision, t, ...fields };
    this.st.log.push(e);
    if (this.st.log.length > 4000) this.st.log.splice(0, 1000); // 防膨胀（复盘仍完整：客户端已收）
  }

  touch(): void {
    this.st.revision += 1;
  }

  // ─── 对局开始 ────────────────────────────────────────────────
  allSelected(): boolean {
    return this.st.players.every((p) => p.selected);
  }

  selectGeneral(seat: SgPlayerId, generalId: string): SgCommandAck {
    const p = this.player(seat);
    if (!p) return { ok: false, error: { code: 'INVALID_INPUT', message: '座位不存在' }, revision: this.st.revision };
    if (p.selected) return { ok: false, error: { code: 'INVALID_INPUT', message: '已选择武将' }, revision: this.st.revision };
    const g = GENERAL_BY_ID.get(generalId);
    if (!g) return { ok: false, error: { code: 'INVALID_INPUT', message: '武将不存在' }, revision: this.st.revision };
    if (this.st.players.some((x) => x.generalId === generalId)) {
      return { ok: false, error: { code: 'INVALID_INPUT', message: '该武将已被选择' }, revision: this.st.revision };
    }
    p.generalId = generalId;
    p.maxHp = g.maxHp;
    p.hp = g.maxHp;
    p.selected = true;
    this.log('GENERAL_SELECTED', { player: seat, general: generalId });
    if (this.allSelected()) this.begin();
    return { ok: true, revision: this.st.revision };
  }

  private begin(): void {
    // 洗牌（服务端 RNG）、发 4 张、随机先手
    const pile = this.rng.shuffle(shufflePile(buildPile(this.st.deckConfig)));
    this.st.drawPile = pile;
    for (const p of this.st.players) this.drawCards(p, 4);
    const first = this.st.order[this.rng.int(this.st.order.length)];
    this.st.current = first;
    this.st.turnNumber = 1;
    this.st.phase = 'prepare';
    this.log('GAME_START', { deck: this.st.deckConfig, first });
    this.iter = this.gameLoop();
    this.pump();
  }

  // ─── 协程驱动 ────────────────────────────────────────────────
  private pump(input?: CmdResult): void {
    while (this.iter) {
      let r: IteratorResult<SgWait, void>;
      try {
        r = this.iter.next(input as CmdResult);
      } catch (e) {
        this.iter = null;
        this.pending = null;
        this.onWait?.(null);
        this.log('ENGINE_ERROR', { message: String((e as Error).message).slice(0, 120) });
        return;
      }
      if (r.done) {
        this.iter = null;
        this.pending = null;
        this.onWait?.(null);
        return;
      }
      input = undefined;
      this.winSeq = (this.winSeq + 1) % WIN_LIMIT;
      this.pending = { ...r.value, windowId: `${this.st.revision}-${this.winSeq}` } as SgWait;
      this.onWait?.(this.pending);
      return;
    }
    this.pending = null;
  }

  private newWindow<T extends SgWait>(w: Omit<T, 'windowId'>): T {
    this.winSeq += 1;
    return { ...w, windowId: `w${this.winSeq}` } as T;
  }

  // ─── 主循环：回合流转 ────────────────────────────────────────
  private *gameLoop(): Generator<SgWait, void, CmdResult> {
    while (this.st.winner === null) {
      const p = this.player(this.st.current);
      if (!p.alive) {
        this.nextTurn();
        continue;
      }
      yield* this.runTurn(p);
      if (this.st.winner !== null) break;
      this.nextTurn();
    }
    this.st.phase = 'ended';
    this.log('GAME_FINISHED', { winner: this.st.winner });
  }

  private nextTurn(): void {
    const ring = this.st.order;
    let i = ring.indexOf(this.st.current);
    for (let k = 0; k < ring.length; k++) {
      i = (i + 1) % ring.length;
      if (this.player(ring[i]).alive) {
        this.st.current = ring[i];
        this.st.turnNumber += 1;
        return;
      }
    }
  }

  private *runTurn(p: SgPlayerState): Generator<SgWait, void, CmdResult> {
    // 回合重置
    p.flags = {
      shaUsed: 0, jiuActive: false, luyiActive: false,
      zhihengUsed: false, fanjianUsed: false, qingnangUsed: false, jieyinUsed: false, lijianUsed: false,
      rendeGiven: 0, rendeHealed: false, yijiPending: 0, skipDraw: false, skipPlay: false,
    };
    this.st.phase = 'prepare';
    this.log('TURN_START', { player: p.id, turn: this.st.turnNumber });
    yield* skills.hookStartPhase(this, p); // 观星
    yield* skills.hookPreparePhase(this, p); // 洛神

    // 判定阶段
    this.st.phase = 'judge';
    this.log('PHASE', { player: p.id, phase: 'judge' });
    yield* this.judgmentPhase(p);

    if (!p.alive || this.st.winner !== null) return; // 闪电可能致死 / 对局已结束

    // 摸牌阶段（兵粮寸断命中 → 跳过）
    const skipDraw = p.flags.skipDraw;
    this.st.phase = 'draw';
    this.log('PHASE', { player: p.id, phase: 'draw' });
    yield* this.drawPhase(p, skipDraw);

    // 出牌阶段（乐不思蜀命中 → 跳过）
    const skipPlay = p.flags.skipPlay;
    this.st.phase = 'play';
    this.log('PHASE', { player: p.id, phase: 'play' });
    if (!skipPlay) {
      yield* this.playPhase(p);
    } else {
      this.log('PHASE_SKIPPED', { player: p.id, phase: 'play', reason: 'lebusishu' });
    }

    if (!p.alive || this.st.winner !== null) return; // 苦肉等可能致死 / 对局已结束

    // 弃牌阶段
    this.st.phase = 'discard';
    this.log('PHASE', { player: p.id, phase: 'discard' });
    yield* this.discardPhase(p);

    // 结束阶段
    this.st.phase = 'end';
    this.log('PHASE', { player: p.id, phase: 'end' });
    yield* skills.hookEndPhase(this, p); // 闭月
  }

  private *judgmentPhase(p: SgPlayerState): Generator<SgWait, void, CmdResult> {
    // 判定区：尾=最新，先判定（house rule：后放先判，见 RULES_DECISIONS）
    while (p.judgments.length > 0 && p.alive && this.st.winner === null) {
      const cid = p.judgments[p.judgments.length - 1];
      const card = this.card(cid);
      const effectName = this.st.delayedAs[cid] ?? card.name;
      const result = yield* this.judge(p, effectName);
      p.judgments.pop();
      if (effectName === 'lebusishu') {
        if (result.suit !== 'H') {
          p.flags.skipPlay = true;
          this.log('DELAYED_EFFECT', { card: 'lebusishu', player: p.id, hit: true });
        } else this.log('DELAYED_EFFECT', { card: 'lebusishu', player: p.id, hit: false });
      } else if (effectName === 'bingliangcunduan') {
        if (result.suit !== 'C') {
          p.flags.skipDraw = true;
          this.log('DELAYED_EFFECT', { card: 'bingliangcunduan', player: p.id, hit: true });
        } else this.log('DELAYED_EFFECT', { card: 'bingliangcunduan', player: p.id, hit: false });
      } else if (effectName === 'shandian') {
        if (result.suit === 'S' && result.rank >= 2 && result.rank <= 9) {
          this.log('DELAYED_EFFECT', { card: 'shandian', player: p.id, hit: true });
          this.st.discardPile.push(cid);
          delete this.st.delayedAs[cid];
          yield* this.resolveDamage({ source: null, target: p.id, amount: 3, nature: 'thunder', cardId: null, reason: 'shandian' });
        } else {
          // 传给顺时针下一位存活玩家
          const next = this.nextAliveOf(p.id);
          this.log('DELAYED_EFFECT', { card: 'shandian', player: p.id, hit: false, passTo: next?.id ?? null });
          if (next) next.judgments.push(cid);
          else {
            this.st.discardPile.push(cid);
            delete this.st.delayedAs[cid];
          }
        }
        continue; // 闪电已处理区域归属
      }
      // 乐不思蜀/兵粮寸断判定后进弃牌堆
      this.st.discardPile.push(cid);
      delete this.st.delayedAs[cid];
    }
  }

  private *drawPhase(p: SgPlayerState, skip: boolean): Generator<SgWait, void, CmdResult> {
    if (skip) {
      this.log('PHASE_SKIPPED', { player: p.id, phase: 'draw', reason: 'bingliangcunduan' });
      return;
    }
    yield* skills.hookDrawPhase(this, p); // 突袭/裸衣/英姿；未替代则摸2
  }

  private *playPhase(p: SgPlayerState): Generator<SgWait, void, CmdResult> {
    while (true) {
      if (this.st.winner !== null) return;
      const cmd = yield this.newWindow<SgWait>({ kind: 'play', playerId: p.id } as never);
      if (cmd.type === 'command' && cmd.action) {
        const a = cmd.action;
        if (a.type === 'end-play') break;
        if (a.type === 'play-card') {
          const err = this.validatePlay(p, a);
          if (err) throw new Error(`REJECT:${err}`);
          yield* this.executePlay(p, a);
          continue;
        }
        if (a.type === 'use-skill') {
          yield* skills.execActiveSkill(this, p, a.skillId, a);
          continue;
        }
      }
      throw new Error('REJECT:INVALID_PLAY_ACTION');
    }
  }

  private *discardPhase(p: SgPlayerState): Generator<SgWait, void, CmdResult> {
    if (this.st.winner !== null) return;
    // 克己：出牌阶段未用杀 → 跳过（house rule 自动，见 RULES_DECISIONS）
    if (this.hasSkill(p, 'keji') && p.flags.shaUsed === 0) {
      this.log('PHASE_SKIPPED', { player: p.id, phase: 'discard', reason: 'keji' });
      return;
    }
    const limit = Math.max(0, p.hp);
    const excess = p.hand.length - limit;
    if (excess <= 0) return;
    while (p.hand.length > limit) {
      const need = p.hand.length - limit;
      const cmd = yield this.newWindow<SgWait>({ kind: 'discard', playerId: p.id, count: need, prompt: `弃牌阶段：请弃置 ${need} 张手牌` } as never);
      if (cmd.type !== 'cards' || !cmd.cards) throw new Error('REJECT:DISCARD_EXPECTED');
      for (const id of cmd.cards) {
        if (!p.hand.includes(id)) throw new Error('REJECT:NOT_YOUR_CARD');
      }
      if (cmd.cards.length !== need) throw new Error('REJECT:DISCARD_COUNT');
      for (const id of cmd.cards) {
        p.hand.splice(p.hand.indexOf(id), 1);
        this.st.discardPile.push(id);
        skills.onLoseLastHand(this, p);
      }
      this.log('DISCARD_PHASE', { player: p.id, cards: this.publicCards(cmd.cards) });
    }
  }

  // ─── 判定 ────────────────────────────────────────────────────
  /** 抽判定牌 → 鬼才替换 → 生效；返回生效判定牌。天妒：判定者获得。 */
  *judge(who: SgPlayerState, reason: string): Generator<SgWait, { suit: Suit; rank: number; cardId: string }, CmdResult> {
    this.reshuffleIfNeeded();
    const cid = this.st.drawPile.pop();
    if (!cid) throw new Error('NO_JUDGE_CARD');
    this.st.processing.push(cid);
    let card = this.card(cid);
    this.log('JUDGE_START', { who: who.id, reason, card: this.pubCard(cid) });
    // 鬼才：任意判定生效前，司马懿可打出手牌替换
    const replaced = yield* skills.hookJudgeBefore(this, who, cid);
    if (replaced) card = this.card(replaced);
    this.log('JUDGE_RESULT', { who: who.id, reason, card: this.pubCard(card.id) });
    // 天妒：判定者获得判定牌；否则进弃牌堆
    if (this.hasSkill(who, 'tiandu')) {
      const pi = this.st.processing.indexOf(card.id);
      if (pi >= 0) this.st.processing.splice(pi, 1);
      who.hand.push(card.id);
      this.log('CARD_GAINED', { player: who.id, from: 'judge', card: this.pubCard(card.id) });
    } else {
      const pi = this.st.processing.indexOf(card.id);
      if (pi >= 0) this.st.processing.splice(pi, 1);
      this.st.discardPile.push(card.id);
    }
    return { suit: card.suit, rank: card.rank, cardId: card.id };
  }

  // ─── 伤害管线 ────────────────────────────────────────────────
  /** 统一伤害入口。source=null 为无来源（闪电）。 */
  *resolveDamage(req: {
    source: SgPlayerId | null;
    target: SgPlayerId;
    amount: number;
    nature: SgNature;
    cardId: string | null;
    reason: string;
  }): Generator<SgWait, void, CmdResult> {
    if (this.st.winner !== null) return;
    this.depth += 1;
    if (this.depth > SG_MAX_DEPTH) {
      this.depth -= 1;
      this.log('DEPTH_LIMIT', { reason: req.reason });
      return;
    }
    try {
      const t = this.player(req.target);
      if (!t.alive) return;
      let amount = req.amount;

      // 伤害前修正
      if (t.equips.armor === idOf('baiyinshizi') && amount > 1) {
        amount = 1;
        this.log('ARMOR_MODIFY', { armor: 'baiyinshizi', player: t.id, amount });
      }
      if (t.equips.armor === idOf('tengjia') && req.nature === 'fire') {
        amount += 1;
        this.log('ARMOR_MODIFY', { armor: 'tengjia', player: t.id, amount });
      }

      // 寒冰剑：普通杀伤害可改为弃两张牌（来源选择）
      if (req.reason === 'sha' && req.source && this.player(req.source).equips.weapon === idOf('hanbingjian') && amount > 0) {
        const useIce = yield* skills.askChoice(this, req.source, 'hanbingjian', ['yes', 'no'], '寒冰剑：防止此伤害，改为弃置其两张牌？');
        if (useIce === 'yes') {
          this.log('WEAPON_EFFECT', { weapon: 'hanbingjian', by: req.source, target: t.id });
          yield* this.discardTwoFromPlayer(t);
          this.finishDamageLog(req, 0);
          return;
        }
      }
      // 麒麟弓：造成伤害时弃目标坐骑
      if (req.reason === 'sha' && req.source && this.player(req.source).equips.weapon === idOf('qilingong') && (t.equips.horsePlus || t.equips.horseMinus)) {
        const useBow = yield* skills.askChoice(this, req.source, 'qilingong', ['yes', 'no'], '麒麟弓：弃置目标的坐骑？');
        if (useBow === 'yes') {
          const horse = t.equips.horsePlus ?? t.equips.horseMinus;
          const slot = t.equips.horsePlus ? 'horsePlus' : 'horseMinus';
          if (horse) {
            t.equips[slot === 'horsePlus' ? 'horsePlus' : 'horseMinus'] = null;
            this.st.discardPile.push(horse);
            this.log('WEAPON_EFFECT', { weapon: 'qilingong', by: req.source, target: t.id, card: this.pubCard(horse) });
          }
        }
      }

      // 结算
      t.hp -= amount;
      this.log('DAMAGE', { source: req.source, target: t.id, amount, nature: req.nature, reason: req.reason, card: this.pubCard(req.cardId), hp: Math.max(0, t.hp) });
      this.finishDamageLog(req, amount);

      if (t.hp <= 0) {
        yield* this.dyingFlow(t, req);
      }
      if (t.alive) {
        yield* skills.hookDamagedAfter(this, t, req, amount);
      }
      // 铁索连环传导（属性伤害）
      if (req.nature !== 'normal' && t.chained) {
        t.chained = false;
        this.log('CHAIN_OFF', { player: t.id });
        const others = this.alivePlayers().filter((x) => x.chained && x.id !== t.id);
        if (others.length > 0) {
          const next = others[0];
          this.log('CHAIN_CONDUCT', { from: t.id, to: next.id, nature: req.nature });
          yield* this.resolveDamage({ source: req.source, target: next.id, amount, nature: req.nature, cardId: null, reason: 'chain' });
        }
      }
    } finally {
      this.depth -= 1;
      if (this.depth === 0) this.checkVictory();
    }
  }

  private finishDamageLog(req: { reason: string }, amount: number): void {
    void req;
    void amount;
  }

  /** 寒冰剑辅助：弃目标两张牌（先随机手牌再装备） */
  private *discardTwoFromPlayer(t: SgPlayerState): Generator<SgWait, void, CmdResult> {
    for (let i = 0; i < 2; i++) {
      if (t.hand.length > 0) {
        const id = t.hand[this.rng.int(t.hand.length)];
        t.hand.splice(t.hand.indexOf(id), 1);
        this.st.discardPile.push(id);
        this.log('DISCARD', { count: 1, cards: this.publicCards([id]) });
      } else {
        const eq = (['weapon', 'armor', 'horsePlus', 'horseMinus'] as const).map((s) => t.equips[s]).find(Boolean);
        if (!eq) break;
        for (const s of ['weapon', 'armor', 'horsePlus', 'horseMinus'] as const) {
          if (t.equips[s] === eq) t.equips[s] = null;
        }
        this.st.discardPile.push(eq);
        this.log('DISCARD', { count: 1, cards: this.publicCards([eq]) });
      }
    }
  }

  /** 濒死：本人优先 → 顺时针其他存活玩家；桃/酒(自救)/急救 */
  *dyingFlow(t: SgPlayerState, req: { source: SgPlayerId | null }): Generator<SgWait, void, CmdResult> {
    this.log('DYING', { player: t.id, hp: t.hp });
    const order: SgPlayerId[] = [t.id, ...this.others(t.id).map((x) => x.id)];
    for (const pid of order) {
      while (t.hp <= 0 && t.alive && this.st.winner === null) {
        const w = this.newWindow<SgWait>({
          kind: 'respond',
          playerId: pid,
          need: 'tao',
          count: 1,
          converters: this.dyingConverters(pid, t.id),
          dyingId: t.id,
          prompt: pid === t.id ? '你处于濒死状态：使用桃或酒自救' : `${t.id} 濒死：你可以使用桃救援`,
        } as never);
        const cmd = yield w;
        if (cmd.type === 'pass') break;
        if (cmd.type === 'command' && cmd.action?.type === 'respond-play') {
          const a = cmd.action;
          const card = this.card(a.cardId);
          const legal = this.legalDyingCards(pid, t.id);
          if (!legal.includes(a.cardId)) throw new Error('REJECT:NOT_LEGAL_SAVE');
          const actor = this.player(pid);
          actor.hand.splice(actor.hand.indexOf(a.cardId), 1);
          this.st.processing.push(a.cardId);
          this.log('CARD_RESPONDED', { by: pid, card: this.pubCard(a.cardId), for: 'dying', target: t.id });
          const heal = card.name === 'jiu' ? 1 : 1;
          t.hp += heal;
          this.log('SAVED', { target: t.id, by: pid, heal });
          this.st.discardPile.push(a.cardId);
          const pi = this.st.processing.indexOf(a.cardId);
          if (pi >= 0) this.st.processing.splice(pi, 1);
          continue;
        }
        throw new Error('REJECT:INVALID_DYING_ACTION');
      }
      if (t.hp > 0) return;
    }
    if (t.hp <= 0) yield* this.kill(t, req.source);
  }

  private dyingConverters(pid: SgPlayerId, dyingId: SgPlayerId): string[] {
    const out: string[] = ['tao'];
    if (pid === dyingId) out.push('jiu');
    const p = this.player(pid);
    if (this.hasSkill(p, 'jijiu') && this.st.current !== pid) out.push('jijiu');
    return out;
  }

  /** 濒死时允许使用的物理牌（含转换） */
  legalDyingCards(pid: SgPlayerId, dyingId: SgPlayerId): string[] {
    const p = this.player(pid);
    const out = p.hand.filter((id) => this.card(id).name === 'tao');
    if (pid === dyingId) out.push(...p.hand.filter((id) => this.card(id).name === 'jiu'));
    if (this.hasSkill(p, 'jijiu') && this.st.current !== pid) {
      out.push(...p.hand.filter((id) => isRed(this.card(id).suit) && this.card(id).name !== 'tao' && this.card(id).name !== 'jiu'));
    }
    return [...new Set(out)];
  }

  /** 死亡：清理区域（不触发枭姬/连营——house rule，见 RULES_DECISIONS） */
  private *kill(t: SgPlayerState, source: SgPlayerId | null): Generator<SgWait, void, CmdResult> {
    t.alive = false;
    t.hp = 0;
    this.log('DEATH', { player: t.id, source });
    const ids = [...t.hand, ...(Object.values(t.equips).filter(Boolean) as string[]), ...t.judgments];
    t.hand = [];
    t.equips = { weapon: null, armor: null, horsePlus: null, horseMinus: null };
    for (const jid of ids) delete this.st.delayedAs[jid];
    t.judgments = [];
    t.chained = false;
    this.st.discardPile.push(...ids);
    this.log('DEATH_CLEANUP', { player: t.id, count: ids.length });
    this.checkVictory();
  }

  /** 胜负：最后存活者胜；同批全员死亡 → 平局 */
  checkVictory(): void {
    if (this.st.winner !== null) return;
    const alive = this.alivePlayers();
    if (alive.length === 1) this.st.winner = alive[0].id;
    else if (alive.length === 0) this.st.winner = 'draw';
    if (this.st.winner) this.log('WINNER_SET', { winner: this.st.winner });
  }

  nextAliveOf(id: SgPlayerId): SgPlayerState | null {
    const ring = this.st.order;
    let i = ring.indexOf(id);
    for (let k = 0; k < ring.length; k++) {
      i = (i + 1) % ring.length;
      const p = this.player(ring[i]);
      if (p.alive) return p;
    }
    return null;
  }

  // ─── 出牌阶段：校验与执行 ────────────────────────────────────
  shaLimit(p: SgPlayerState): number {
    if (this.hasSkill(p, 'paoxiao')) return 99;
    if (p.equips.weapon === idOf('zhugelianyu')) return 99;
    return 1;
  }

  /** 手牌可作为哪些牌面使用/响应（转换技能） */
  convertOptions(p: SgPlayerState, cardId: string, context: 'play' | 'respond-shan' | 'respond-sha' | 'dying'): string[] {
    const c = this.card(cardId);
    const out = new Set<string>([c.name]);
    const isOwnTurn = this.st.current === p.id && this.st.phase === 'play';
    if (this.hasSkill(p, 'qingguo') && isBlack(c.suit)) out.add('shan');
    if (this.hasSkill(p, 'wusheng') && isRed(c.suit)) out.add('sha');
    if (this.hasSkill(p, 'longdan')) {
      if (c.name === 'sha') out.add('shan');
      if (c.name === 'shan') out.add('sha');
    }
    if (this.hasSkill(p, 'qixi') && isBlack(c.suit) && context === 'play') out.add('guohechaiqiao');
    if (this.hasSkill(p, 'guose') && c.suit === 'D' && context === 'play') out.add('lebusishu');
    if (this.hasSkill(p, 'jijiu') && isRed(c.suit) && !isOwnTurn && context === 'dying') out.add('tao');
    // 朱雀羽扇：普通杀可当火杀使用
    if (context === 'play' && c.name === 'sha' && p.equips.weapon === idOf('zhuyueyushan')) out.add('huosha');
    return [...out];
  }

  /** 出牌阶段：单牌可用的牌面与合法目标 */
  playableTargets(p: SgPlayerState, cardId: string, asName: string): { ok: boolean; reason?: string; targets: SgPlayerId[]; multi?: boolean; minTargets?: number; maxTargets?: number } {
    const c = this.card(cardId);
    const inHand = p.hand.includes(cardId);
    const isEquip = c.cat === 'equip';
    const name = asName || c.name;
    const others = this.others(p.id);
    const alive = others.map((x) => x.id);
    const range = this.attackRange(p);
    const distOk = (t: SgPlayerId) => this.distance(p.id, t) <= range;
    const noDist = this.hasSkill(p, 'qicai');

    switch (name) {
      case 'sha':
      case 'huosha':
      case 'leisha': {
        if (!inHand) return { ok: false, reason: '牌不在手牌', targets: [] };
        if (p.flags.shaUsed >= this.shaLimit(p)) return { ok: false, reason: '杀次数已用尽', targets: [] };
        const ts = alive.filter((t) => !this.blockedByTargetable(p.id, t, 'sha') && distOk(t));
        return { ok: true, targets: ts, maxTargets: p.equips.weapon === idOf('fangtianhuaji') && p.hand.length === 1 ? 3 : 1 };
      }
      case 'tao': {
        if (!inHand) return { ok: false, reason: '牌不在手牌', targets: [] };
        if (p.hp >= p.maxHp) return { ok: false, reason: '体力已满', targets: [] };
        return { ok: true, targets: [p.id] };
      }
      case 'jiu':
        return { ok: false, reason: '酒仅在濒死时使用（本实现）', targets: [] };
      case 'wuzhongshengyou':
        return { ok: true, targets: [p.id] };
      case 'guohechaiqiao': {
        const ts = alive.filter((t) => !this.blockedByTargetable(p.id, t, 'guohechaiqiao') && this.zoneCardCount(t) > 0);
        return { ok: true, targets: ts };
      }
      case 'shunshouqianyang': {
        const ts = alive.filter((t) => !this.blockedByTargetable(p.id, t, 'shunshouqianyang') && (noDist || this.distance(p.id, t) === 1) && this.zoneCardCount(t) > 0);
        return { ok: true, targets: ts };
      }
      case 'juedou': {
        const ts = alive.filter((t) => !this.blockedByTargetable(p.id, t, 'juedou'));
        return { ok: true, targets: ts };
      }
      case 'lebusishu': {
        const t = this.player.bind(this);
        const ts = alive.filter((id) => !this.blockedByTargetable(p.id, id, 'lebusishu') && !t(id).judgments.some((j) => this.judgmentEffect(j) === 'lebusishu'));
        return { ok: true, targets: ts };
      }
      case 'bingliangcunduan': {
        const get = (id: SgPlayerId) => this.player(id);
        const ts = alive.filter((id) => !get(id).judgments.some((j) => this.judgmentEffect(j) === 'bingliangcunduan'));
        return { ok: true, targets: ts };
      }
      case 'shandian': {
        const get = (id: SgPlayerId) => this.player(id);
        const ts = alive.filter((id) => !get(id).judgments.some((j) => this.judgmentEffect(j) === 'shandian'));
        return { ok: true, targets: ts };
      }
      case 'nanmanruqin':
      case 'wanjianqifa':
      case 'taoyuanjieyi':
      case 'wugufengdeng':
        return { ok: true, targets: [], multi: true };
      case 'huogong': {
        const ts = alive.filter((id) => this.player(id).hand.length > 0);
        return { ok: true, targets: ts };
      }
      case 'tiesuolianhuan':
        return { ok: true, targets: alive, minTargets: 0, maxTargets: 2 };
      case 'jiedaosharen': {
        const ts = alive.filter((id) => {
          const t = this.player(id);
          return !!t.equips.weapon && this.others(id).some((v) => v.id !== p.id && this.inAttackRange(id, v.id));
        });
        return { ok: true, targets: ts };
      }
      default:
        if (isEquip) return { ok: true, targets: [] }; // 装备无目标
        return { ok: false, reason: '该牌不能在出牌阶段使用', targets: [] };
    }
  }

  /** 判定区牌的效果名（转换后可能≠物理名） */
  judgmentEffect(cid: string): string {
    return this.st.delayedAs[cid] ?? this.card(cid).name;
  }

  /** 出牌阶段合法性提示（客户端渲染用）：每张手牌 × 每个可转换牌面 */
  playHints(p: SgPlayerState): Array<{
    cardId: string; as?: string; ok: boolean; reason?: string;
    targets: SgPlayerId[]; minTargets: number; maxTargets: number; multi?: boolean;
  }> {
    const out: Array<{ cardId: string; as?: string; ok: boolean; reason?: string; targets: SgPlayerId[]; minTargets: number; maxTargets: number; multi?: boolean }> = [];
    const seen = new Set<string>();
    for (const cardId of p.hand) {
      for (const as of this.convertOptions(p, cardId, 'play')) {
        const key = `${cardId}|${as}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const leg = this.playableTargets(p, cardId, as);
        out.push({
          cardId,
          as: as === this.card(cardId).name ? undefined : as,
          ok: leg.ok,
          reason: leg.ok ? undefined : leg.reason,
          targets: leg.targets,
          minTargets: leg.minTargets ?? (leg.multi ? 0 : leg.targets.length > 0 ? 1 : 0),
          maxTargets: leg.maxTargets ?? 1,
          multi: leg.multi,
        });
      }
    }
    return out;
  }

  /** 响应窗口：该玩家当前可打出的物理牌 */
  legalRespondCards(pid: SgPlayerId, need: string, dyingId?: SgPlayerId): string[] {
    const p = this.player(pid);
    if (need === 'tao') return dyingId ? this.legalDyingCards(pid, dyingId) : p.hand.filter((id) => this.card(id).name === 'tao');
    if (need === 'nullify') return p.hand.filter((id) => this.card(id).name === 'wuxiekeji');
    const target = need === 'shan' ? 'respond-shan' : 'respond-sha';
    return p.hand.filter((id) => this.convertOptions(p, id, target).includes(need));
  }

  zoneCardCount(p: SgPlayerId): number {
    const t = this.player(p);
    return t.hand.length + Object.values(t.equips).filter(Boolean).length + t.judgments.length;
  }

  validatePlay(p: SgPlayerState, a: { cardId: string; targets?: SgPlayerId[]; as?: string }): string | null {
    const c = this.card(a.cardId);
    if (!c) return '牌不存在';
    if (c.cat === 'equip') {
      if (!p.hand.includes(a.cardId)) return '牌不在手牌';
      return null;
    }
    const opts = this.convertOptions(p, a.cardId, 'play');
    const asName = a.as && opts.includes(a.as) ? a.as : c.name;
    if (a.as && !opts.includes(a.as)) return '不满足转换条件';
    const leg = this.playableTargets(p, a.cardId, asName === c.name ? c.name : asName);
    if (!leg.ok) return leg.reason ?? null;
    if (leg.multi) return null;
    const ts = a.targets ?? [];
    const max = leg.maxTargets ?? 1;
    if (ts.length < (leg.minTargets ?? (leg.targets.length > 0 ? 1 : 0))) return '目标数量不足';
    if (ts.length > max) return '目标数量过多';
    for (const t of ts) if (!leg.targets.includes(t)) return '目标不合法';
    return null;
  }

  private *executePlay(p: SgPlayerState, a: { cardId: string; targets?: SgPlayerId[]; as?: string }): Generator<SgWait, void, CmdResult> {
    const c = this.card(a.cardId);
    if (c.cat === 'equip') {
      p.hand.splice(p.hand.indexOf(a.cardId), 1);
      yield* this.equip(p, a.cardId);
      return;
    }
    const asName = a.as && this.convertOptions(p, a.cardId, 'play').includes(a.as) ? a.as : c.name;
    // 从手牌移除 → 处理区
    p.hand.splice(p.hand.indexOf(a.cardId), 1);
    this.st.processing.push(a.cardId);
    if (asName === 'sha' || asName === 'huosha' || asName === 'leisha') p.flags.shaUsed += 1;
    this.log('CARD_USED', {
      by: p.id, card: this.pubCard(a.cardId), as: asName !== c.name ? asName : undefined,
      targets: a.targets ?? [], turn: this.st.turnNumber,
    });
    skills.onCardUsed(this, p, a.cardId, asName);
    const targets = a.targets ?? [];

    switch (asName) {
      case 'sha': yield* this.resolveSha(p, a.cardId, targets, 'normal'); break;
      case 'huosha': yield* this.resolveSha(p, a.cardId, targets, 'fire'); break;
      case 'leisha': yield* this.resolveSha(p, a.cardId, targets, 'thunder'); break;
      case 'tao': {
        p.hp = Math.min(p.maxHp, p.hp + 1);
        this.log('HEAL', { target: p.id, amount: 1, by: p.id });
        break;
      }
      case 'wuzhongshengyou': {
        const nullified = yield* this.nullifyChain(p.id, 'wuzhongshengyou', null);
        if (!nullified) this.drawCards(p, 2);
        break;
      }
      case 'guohechaiqiao': yield* this.resolveDiscard(p, a.cardId, targets[0], false); break;
      case 'shunshouqianyang': yield* this.resolveDiscard(p, a.cardId, targets[0], true); break;
      case 'juedou': yield* this.resolveDuel(p, a.cardId, targets[0]); break;
      case 'lebusishu':
      case 'bingliangcunduan':
      case 'shandian': {
        const nullified = yield* this.nullifyChain(p.id, asName, targets[0]);
        if (!nullified) {
          this.st.delayedAs[a.cardId] = asName;
          this.player(targets[0]).judgments.push(a.cardId);
        } else this.st.discardPile.push(a.cardId);
        break;
      }
      case 'nanmanruqin': yield* this.resolveAoe(p, a.cardId, 'sha'); break;
      case 'wanjianqifa': yield* this.resolveAoe(p, a.cardId, 'shan'); break;
      case 'taoyuanjieyi': {
        const nullified = yield* this.nullifyChain(p.id, 'taoyuanjieyi', null);
        if (!nullified) {
          for (const x of [p, ...this.others(p.id)]) {
            const nul = yield* this.nullifyChain(p.id, 'taoyuanjieyi', x.id, true);
            if (!nul && x.hp < x.maxHp) {
              x.hp += 1;
              this.log('HEAL', { target: x.id, amount: 1, by: p.id });
            }
          }
        }
        break;
      }
      case 'wugufengdeng': yield* this.resolveWugu(p, a.cardId); break;
      case 'huogong': yield* this.resolveHuogong(p, a.cardId, targets[0]); break;
      case 'tiesuolianhuan': yield* this.resolveTiesuo(p, targets); break;
      case 'jiedaosharen': yield* this.resolveJiedao(p, a.cardId, targets[0]); break;
    }
    // 牌进弃牌堆（延时锦囊除外——已放入判定区）
    const pi = this.st.processing.indexOf(a.cardId);
    if (pi >= 0) {
      this.st.processing.splice(pi, 1);
      if (asName !== 'lebusishu' && asName !== 'bingliangcunduan' && asName !== 'shandian') {
        this.st.discardPile.push(a.cardId);
      }
    }
    // 仁德给出计数通过 use-skill；此处无
    // 连营（失去最后手牌）
    skills.onLoseLastHand(this, p);
  }

  /** 装备：替换旧装备（旧牌入弃牌堆，触发枭姬） */
  private *equip(p: SgPlayerState, cardId: string): Generator<SgWait, void, CmdResult> {
    const c = this.card(cardId);
    const slot = c.slot!;
    const old = p.equips[slot];
    if (old) {
      p.equips[slot] = null;
      this.st.discardPile.push(old);
      this.log('LOSE_EQUIP', { player: p.id, slot, card: this.pubCard(old) });
      skills.onLoseEquipment(this, p, old);
    }
    p.equips[slot] = cardId;
    this.log('EQUIP', { player: p.id, slot, card: this.pubCard(cardId) });
    this.log('CARD_USED', { by: p.id, card: this.pubCard(cardId), targets: [], turn: this.st.turnNumber });
  }

  /** 杀结算：仁王盾→铁骑→闪响应→伤害 */
  *resolveSha(user: SgPlayerState, cardId: string, targets: SgPlayerId[], nature: SgNature): Generator<SgWait, void, CmdResult> {
    for (const tid of targets) {
      if (this.st.winner !== null) return;
      let target = this.player(tid);
      if (!target.alive) continue;
      // 流离：成为杀目标时转移
      const transferred = yield* skills.hookTargeted(this, user, cardId, target);
      if (transferred && transferred !== tid) {
        target = this.player(transferred as SgPlayerId);
        if (!target.alive) continue;
      }
      // 铁骑判定
      let noShan = false;
      if (this.hasSkill(user, 'tieqi')) {
        const r = yield* skills.askTieqi(this, user, target.id);
        if (r) noShan = true;
      }
      // 仁王盾：黑色杀无效（丈八蛇矛视为杀无花色 → 不触发）
      if (cardId && target.equips.armor === idOf('renwangdun') && !isRed(this.card(cardId).suit)) {
        this.log('CARD_NONE', { target: target.id, reason: 'renwangdun' });
        continue;
      }
      // 闪响应（无双=2）
      let need = this.hasSkill(user, 'wushuang') ? 2 : 1;
      let dodged = false;
      while (need > 0) {
        if (noShan) break;
        const resp = yield* this.askShan(target, user.id, cardId);
        if (resp) {
          need -= 1;
          this.log('CARD_RESPONDED', { by: target.id, card: this.pubCard(resp), for: 'shan' });
          if (need > 0) continue;
          dodged = true;
          // 青龙偃月刀：被闪后可追加杀
          const again = yield* skills.hookQinglong(this, user, target.id);
          if (again) {
            dodged = false;
            need = this.hasSkill(user, 'wushuang') ? 2 : 1;
            continue;
          }
        } else break;
      }
      if (dodged) {
        // 贯石斧：被闪后可弃两张手牌强制伤害
        const force = yield* skills.hookGuanshi(this, user, target.id);
        if (force) dodged = false;
      }
      if (!dodged) {
        const bonus = (user.flags.jiuActive ? 1 : 0) + (user.flags.luyiActive ? 1 : 0) + (target.hand.length === 0 && user.equips.weapon === idOf('gudingdao') ? 1 : 0);
        user.flags.jiuActive = false;
        yield* this.resolveDamage({ source: user.id, target: target.id, amount: 1 + bonus, nature, cardId, reason: 'sha' });
      }
    }
  }

  /** 请求目标打出 N 张闪；返回最后一张闪的 id（用于青龙刀），未闪返回 null */
  private *askShan(target: SgPlayerState, userId: SgPlayerId, shaId: string): Generator<SgWait, string | null, CmdResult> {
    const legal = target.hand.filter((id) => this.convertOptions(target, id, 'respond-shan').includes('shan'));
    const hasBagua = target.equips.armor === idOf('baguazhen');
    if (legal.length === 0 && !hasBagua) return null;
    const w = this.newWindow<SgWait>({
      kind: 'respond',
      playerId: target.id,
      need: 'shan',
      count: 1,
      converters: legal.length ? this.convertOptions(target, legal[0], 'respond-shan') : [],
      prompt: `${userId} 对你使用杀：请使用闪`,
    } as never);
    const cmd = yield w;
    if (cmd.type === 'pass') {
      // 八卦阵自动尝试（house rule：有八卦且无闪可用时自动判定）——见 RULES_DECISIONS
      if (hasBagua) {
        const r = yield* this.judge(target, 'baguazhen');
        if (isRed(r.suit)) return r.cardId;
      }
      return null;
    }
    if (cmd.type === 'command' && cmd.action?.type === 'respond-play') {
      const a = cmd.action;
      if (!legal.includes(a.cardId)) throw new Error('REJECT:NOT_LEGAL_SHAN');
      target.hand.splice(target.hand.indexOf(a.cardId), 1);
      this.st.discardPile.push(a.cardId);
      skills.onLoseLastHand(this, target);
      return a.cardId;
    }
    if (cmd.type === 'command' && cmd.action?.type === 'respond-skill' && cmd.action.skillId === 'baguazhen') {
      const r = yield* this.judge(target, 'baguazhen');
      if (isRed(r.suit)) return r.cardId;
      // 判定失败可继续用手牌闪
      const legal2 = target.hand.filter((id) => this.convertOptions(target, id, 'respond-shan').includes('shan'));
      if (legal2.length === 0) return null;
      const w2 = this.newWindow<SgWait>({
        kind: 'respond', playerId: target.id, need: 'shan', count: 1,
        converters: this.convertOptions(target, legal2[0], 'respond-shan'),
        prompt: `${userId} 对你使用杀：请使用闪`,
      } as never);
      const cmd2 = yield w2;
      if (cmd2.type === 'command' && cmd2.action?.type === 'respond-play' && legal2.includes(cmd2.action.cardId)) {
        const id2 = cmd2.action.cardId;
        target.hand.splice(target.hand.indexOf(id2), 1);
        this.st.discardPile.push(id2);
        skills.onLoseLastHand(this, target);
        return id2;
      }
      return null;
    }
    throw new Error('REJECT:INVALID_SHAN');
  }

  /** 拆桥/牵羊：目标选区域（有装备/判定时询问来源） */
  private *resolveDiscard(user: SgPlayerState, cardId: string, tid: SgPlayerId, distance1: boolean): Generator<SgWait, void, CmdResult> {
    const t = this.player(tid);
    if (!t || !t.alive) return;
    const nullified = yield* this.nullifyChain(user.id, distance1 ? 'shunshouqianyang' : 'guohechaiqiao', tid);
    if (nullified) return;
    const options: string[] = [];
    if (t.hand.length > 0) options.push('hand');
    for (const slot of ['weapon', 'armor', 'horsePlus', 'horseMinus'] as const) if (t.equips[slot]) options.push(slot);
    for (const j of t.judgments) options.push(`judge:${j}`);
    let pick: string;
    if (options.length === 1) pick = options[0];
    else pick = yield* skills.askChoice(this, user.id, 'pick-zone', options, '选择要移除的区域');
    let removed: string | null = null;
    if (pick === 'hand') {
      removed = t.hand[this.rng.int(t.hand.length)];
      t.hand.splice(t.hand.indexOf(removed), 1);
    } else if (pick.startsWith('judge:')) {
      const jid = pick.slice(6);
      const ji = t.judgments.indexOf(jid);
      if (ji >= 0) {
        t.judgments.splice(ji, 1);
        delete this.st.delayedAs[jid];
        removed = jid;
      }
    } else {
      removed = t.equips[pick as keyof typeof t.equips] ?? null;
      if (removed) {
        t.equips[pick as keyof typeof t.equips] = null;
        this.log('LOSE_EQUIP', { player: t.id, slot: pick, card: this.pubCard(removed) });
        skills.onLoseEquipment(this, t, removed);
      }
    }
    if (removed) {
      this.st.discardPile.push(removed);
      this.log('CARD_REMOVED', { from: tid, by: user.id, card: this.pubCard(removed) });
      skills.onLoseLastHand(this, t);
    }
  }

  /** 决斗 */
  *resolveDuel(user: SgPlayerState, cardId: string | null, tid: SgPlayerId): Generator<SgWait, void, CmdResult> {
    const t = this.player(tid);
    if (!t || !t.alive) return;
    const nullified = yield* this.nullifyChain(user.id, 'juedou', tid);
    if (nullified) return;
    let attacker = user;
    let defender = t;
    // 目标先响应
    while (true) {
      const needDefender = this.hasSkill(attacker, 'wushuang') ? 2 : 1;
      let played = false;
      for (let i = 0; i < needDefender; i++) {
        const sha = yield* this.askShaPlay(defender);
        if (!sha) {
          yield* this.resolveDamage({ source: attacker.id, target: defender.id, amount: 1 + (attacker.flags.luyiActive ? 1 : 0), nature: 'normal', cardId, reason: 'juedou' });
          return;
        }
        played = true;
      }
      void played;
      // 攻守互换（使用者侧响应）
      const needAttacker = this.hasSkill(defender, 'wushuang') ? 2 : 1;
      let aPlayed = false;
      for (let i = 0; i < needAttacker; i++) {
        const sha = yield* this.askShaPlay(attacker);
        if (!sha) {
          yield* this.resolveDamage({ source: defender.id, target: attacker.id, amount: 1 + (defender.flags.luyiActive ? 1 : 0), nature: 'normal', cardId, reason: 'juedou' });
          return;
        }
        aPlayed = true;
      }
      void aPlayed;
      if (!attacker.alive || !defender.alive) return;
    }
  }

  /** 要求某角色打出一张杀（决斗/南蛮）；可转换（武圣红牌/龙胆闪当杀）。返回牌 id 或 null */
  private *askShaPlay(p: SgPlayerState): Generator<SgWait, string | null, CmdResult> {
    const legal = p.hand.filter((id) => this.convertOptions(p, id, 'respond-sha').includes('sha'));
    if (legal.length === 0) return null;
    const w = this.newWindow<SgWait>({
      kind: 'respond', playerId: p.id, need: 'sha', count: 1,
      converters: this.convertOptions(p, legal[0], 'respond-sha'),
      prompt: '请打出一张杀',
    } as never);
    const cmd = yield w;
    if (cmd.type === 'pass') return null;
    if (cmd.type === 'command' && cmd.action?.type === 'respond-play') {
      const a = cmd.action;
      if (!legal.includes(a.cardId)) throw new Error('REJECT:NOT_LEGAL_SHA');
      p.hand.splice(p.hand.indexOf(a.cardId), 1);
      this.st.discardPile.push(a.cardId);
      this.log('CARD_RESPONDED', { by: p.id, card: this.pubCard(a.cardId), for: 'sha-play' });
      skills.onLoseLastHand(this, p);
      return a.cardId;
    }
    throw new Error('REJECT:INVALID_SHA_PLAY');
  }

  /** AOE：从使用者下家按座次逐个响应 */
  private *resolveAoe(user: SgPlayerState, cardId: string, need: 'sha' | 'shan'): Generator<SgWait, void, CmdResult> {
    const name = this.card(cardId).name;
    const targets = this.others(user.id).map((x) => x.id);
    for (const tid of targets) {
      if (this.st.winner !== null) return;
      const t = this.player(tid);
      if (!t.alive) continue;
      const nullified = yield* this.nullifyChain(user.id, name, tid);
      if (nullified) continue;
      const responder = need === 'sha' ? yield* this.askShaPlay(t) : yield* this.askShanAoe(t);
      if (!responder) {
        yield* this.resolveDamage({ source: user.id, target: tid, amount: 1, nature: 'normal', cardId, reason: name });
      }
    }
  }

  /** 万箭齐发：闪响应（简化为与杀相同的闪窗口，无青龙刀/贯石斧联动） */
  private *askShanAoe(target: SgPlayerState): Generator<SgWait, string | null, CmdResult> {
    const legal = target.hand.filter((id) => this.convertOptions(target, id, 'respond-shan').includes('shan'));
    const hasBagua = target.equips.armor === idOf('baguazhen');
    if (legal.length === 0 && !hasBagua) return null;
    const w = this.newWindow<SgWait>({
      kind: 'respond', playerId: target.id, need: 'shan', count: 1,
      converters: legal.length ? this.convertOptions(target, legal[0], 'respond-shan') : [],
      prompt: '万箭齐发：请使用闪',
    } as never);
    const cmd = yield w;
    if (cmd.type === 'pass') {
      if (hasBagua) {
        const r = yield* this.judge(target, 'baguazhen');
        if (isRed(r.suit)) return r.cardId;
      }
      return null;
    }
    if (cmd.type === 'command' && cmd.action?.type === 'respond-play' && legal.includes(cmd.action.cardId)) {
      const id = cmd.action.cardId;
      target.hand.splice(target.hand.indexOf(id), 1);
      this.st.discardPile.push(id);
      skills.onLoseLastHand(this, target);
      return id;
    }
    throw new Error('REJECT:INVALID_SHAN');
  }

  /** 五谷丰登：亮存活数张，从下家起按座次各选一张 */
  private *resolveWugu(user: SgPlayerState, cardId: string): Generator<SgWait, void, CmdResult> {
    const alive = this.alivePlayers().length;
    const nullified = yield* this.nullifyChain(user.id, 'wugufengdeng', null);
    if (nullified) return;
    const shown: string[] = [];
    for (let i = 0; i < alive; i++) {
      this.reshuffleIfNeeded();
      const id = this.st.drawPile.pop();
      if (!id) break;
      this.st.processing.push(id);
      shown.push(id);
    }
    this.log('WUGU_SHOWN', { cards: this.publicCards(shown) });
    // 从使用者下家开始（含使用者最后）
    const order: SgPlayerId[] = [];
    let cur: SgPlayerState | null = this.nextAliveOf(user.id);
    while (cur && cur.id !== user.id) {
      order.push(cur.id);
      cur = this.nextAliveOf(cur.id);
    }
    order.push(user.id);
    for (const pid of order) {
      if (shown.length === 0) break;
      const p = this.player(pid);
      if (!p.alive) continue;
      const w = this.newWindow<SgWait>({
        kind: 'choose', playerId: pid, promptId: 'wugu',
        options: shown, prompt: '五谷丰登：选择一张牌',
      } as never);
      const cmd = yield w;
      if (cmd.type === 'option' && cmd.value && shown.includes(cmd.value)) {
        shown.splice(shown.indexOf(cmd.value), 1);
        const pi = this.st.processing.indexOf(cmd.value);
        if (pi >= 0) this.st.processing.splice(pi, 1);
        p.hand.push(cmd.value);
        this.log('CARD_GAINED', { player: pid, from: 'wugu', card: this.pubCard(cmd.value) });
      } else throw new Error('REJECT:WUGU_PICK');
    }
    for (const rest of shown) {
      const pi = this.st.processing.indexOf(rest);
      if (pi >= 0) this.st.processing.splice(pi, 1);
      this.st.discardPile.push(rest);
    }
  }

  /** 火攻：目标展示一张手牌（其自选）→ 使用者弃同花色手牌 → 1 火伤 */
  private *resolveHuogong(user: SgPlayerState, cardId: string, tid: SgPlayerId): Generator<SgWait, void, CmdResult> {
    const t = this.player(tid);
    if (!t || !t.alive || t.hand.length === 0) return;
    const nullified = yield* this.nullifyChain(user.id, 'huogong', tid);
    if (nullified) return;
    const w = this.newWindow<SgWait>({
      kind: 'cards', playerId: tid, min: 1, max: 1, zone: 'hand',
      prompt: '火攻：请选择一张手牌展示',
    } as never);
    const cmd = yield w;
    if (cmd.type !== 'cards' || !cmd.cards?.length || !t.hand.includes(cmd.cards[0])) throw new Error('REJECT:HUOGONG_SHOW');
    const shownId = cmd.cards[0];
    const shown = this.card(shownId);
    this.log('HUOGONG_SHOW', { by: tid, card: this.pubCard(shownId) });
    const sameSuit = user.hand.filter((id) => this.card(id).suit === shown.suit);
    if (sameSuit.length === 0) {
      this.log('HUOGONG_FAIL', { by: user.id });
      return;
    }
    const w2 = this.newWindow<SgWait>({
      kind: 'cards', playerId: user.id, min: 1, max: 1, zone: 'hand',
      prompt: '火攻：弃置一张同花色手牌',
    } as never);
    const cmd2 = yield w2;
    if (cmd2.type !== 'cards' || !cmd2.cards?.length || !sameSuit.includes(cmd2.cards[0])) {
      // 火攻弃置是可选：不弃/不合法 → 视为放弃，无伤害（RULES_DECISIONS）
      this.log('HUOGONG_FAIL', { by: user.id });
      return;
    }
    const dis = cmd2.cards[0];
    user.hand.splice(user.hand.indexOf(dis), 1);
    this.st.discardPile.push(dis);
    skills.onLoseLastHand(this, user);
    this.log('DISCARD', { count: 1, cards: this.publicCards([dis]) });
    yield* this.resolveDamage({ source: user.id, target: tid, amount: 1, nature: 'fire', cardId, reason: 'huogong' });
  }

  /** 铁索连环：选 1-2 名角色横置/解除；或重铸（house rule 支持重铸） */
  private *resolveTiesuo(user: SgPlayerState, targets: SgPlayerId[]): Generator<SgWait, void, CmdResult> {
    const act = yield* skills.askChoice(this, user.id, 'tiesuo', ['use', 'recast'], '铁索连环：使用或重铸');
    if (act === 'recast') {
      this.log('RECAST', { by: user.id });
      this.drawCards(user, 1);
      return;
    }
    let picked = targets.filter((t) => this.player(t)?.alive);
    if (picked.length < 1 || picked.length > 2) {
      // 使用时未带目标 → 现场询问 1-2 名
      const candidates = this.alivePlayers().map((x) => x.id);
      const cmd = yield this.newWindow<SgWait>({
        kind: 'targets', playerId: user.id, candidates, min: 1, max: 2,
        prompt: '铁索连环：选择 1-2 名角色横置/解除',
      } as never);
      if (cmd.type === 'targets' && cmd.targets && cmd.targets.length >= 1 && cmd.targets.length <= 2 && cmd.targets.every((t) => candidates.includes(t))) {
        picked = cmd.targets;
      } else throw new Error('REJECT:TIESUO_TARGETS');
    }
    for (const tid of picked) {
      const t = this.player(tid);
      if (!t || !t.alive) continue;
      t.chained = !t.chained;
      this.log(t.chained ? 'CHAIN_ON' : 'CHAIN_OFF', { player: tid });
    }
  }

  /** 借刀杀人：目标有武器且其攻击范围内存在其他角色 */
  private *resolveJiedao(user: SgPlayerState, cardId: string, tid: SgPlayerId): Generator<SgWait, void, CmdResult> {
    const t = this.player(tid);
    if (!t || !t.alive || !t.equips.weapon) return;
    const victims = this.others(tid).filter((v) => v.id !== user.id && this.inAttackRange(tid, v.id)).map((v) => v.id);
    if (victims.length === 0) return;
    const nullified = yield* this.nullifyChain(user.id, 'jiedaosharen', tid);
    if (nullified) return;
    const w = this.newWindow<SgWait>({
      kind: 'targets', playerId: tid, candidates: victims, min: 1, max: 1,
      prompt: '借刀杀人：选择你要杀的角色（否则武器交给对方）',
    } as never);
    const cmd = yield w;
    if (cmd.type === 'targets' && cmd.targets?.length === 1 && victims.includes(cmd.targets[0])) {
      this.log('CARD_USED', { by: tid, card: null, as: 'sha', targets: [cmd.targets[0]], jiedao: true, weapon: this.pubCard(t.equips.weapon) });
      const shaLegal = t.hand.filter((id) => this.convertOptions(t, id, 'respond-sha').includes('sha'));
      if (shaLegal.length === 0) {
        this.log('JIEDAO_NO_SHA', { by: tid });
        const weapon = t.equips.weapon;
        t.equips.weapon = null;
        this.log('LOSE_EQUIP', { player: tid, slot: 'weapon', card: this.pubCard(weapon) });
        skills.onLoseEquipment(this, t, weapon);
        user.hand.push(weapon);
        this.log('CARD_GAINED', { player: user.id, from: tid, card: this.pubCard(weapon) });
        return;
      }
      // 使用一张杀砍受害者（普通杀流程，含闪响应）
      const w2 = this.newWindow<SgWait>({
        kind: 'respond', playerId: tid, need: 'sha', count: 1,
        converters: this.convertOptions(t, shaLegal[0], 'respond-sha'),
        prompt: '借刀杀人：请使用一张杀',
      } as never);
      const cmd2 = yield w2;
      if (cmd2.type === 'pass' || !(cmd2.type === 'command' && cmd2.action?.type === 'respond-play')) {
        const weapon = t.equips.weapon;
        t.equips.weapon = null;
        this.log('LOSE_EQUIP', { player: tid, slot: 'weapon', card: this.pubCard(weapon) });
        skills.onLoseEquipment(this, t, weapon);
        user.hand.push(weapon);
        this.log('CARD_GAINED', { player: user.id, from: tid, card: this.pubCard(weapon) });
        return;
      }
      const shaId = cmd2.action.cardId;
      if (!shaLegal.includes(shaId)) throw new Error('REJECT:NOT_LEGAL_SHA');
      t.hand.splice(t.hand.indexOf(shaId), 1);
      this.st.processing.push(shaId);
      this.log('CARD_USED', { by: tid, card: this.pubCard(shaId), targets: [cmd.targets[0]], turn: this.st.turnNumber });
      yield* this.resolveSha(t, shaId, [cmd.targets[0]], 'normal');
      const pi = this.st.processing.indexOf(shaId);
      if (pi >= 0) this.st.processing.splice(pi, 1);
      this.st.discardPile.push(shaId);
      return;
    }
    throw new Error('REJECT:JIEDAO_TARGET');
  }

  // ─── 无懈可击链 ─────────────────────────────────────────────
  /** 询问全场无懈；返回 true = 该效果被取消。counter=true 时针对上一个无懈本身开反制链。 */
  private *nullifyChain(user: SgPlayerId, trickName: string, target: SgPlayerId | null, counter = false): Generator<SgWait, boolean, CmdResult> {
    const ring = this.alivePlayers().map((p) => p.id);
    const start = (ring.indexOf(user) + 1) % ring.length;
    for (let k = 0; k < ring.length; k++) {
      const pid = ring[(start + k) % ring.length];
      const p = this.player(pid);
      if (!p.alive) continue;
      if (!p.hand.some((id) => this.card(id).name === 'wuxiekeji')) continue;
      const w = this.newWindow<SgWait>({
        kind: 'respond', playerId: pid, need: 'nullify', count: 1,
        prompt: counter ? '是否对上一个【无懈可击】使用无懈可击？' : `是否对【${trickName}】使用无懈可击？`,
      } as never);
      const cmd = yield w;
      if (cmd.type === 'pass') continue;
      if (cmd.type === 'command' && cmd.action?.type === 'respond-play') {
        const a = cmd.action;
        if (this.card(a.cardId).name !== 'wuxiekeji' || !p.hand.includes(a.cardId)) throw new Error('REJECT:NOT_NULLIFY');
        p.hand.splice(p.hand.indexOf(a.cardId), 1);
        this.st.discardPile.push(a.cardId);
        this.log('NULLIFY', { by: pid, for: trickName, target, counter });
        skills.onLoseLastHand(this, p);
        // 反制链：若该无懈被反制（返回 true）→ 原效果存活 → 继续询问原效果的无懈
        const counterCancelled = yield* this.nullifyChain(pid, trickName, target, true);
        if (counterCancelled) continue;
        return true;
      }
      throw new Error('REJECT:INVALID_NULLIFY');
    }
    return false;
  }

  /** 丈八蛇矛/技能出的虚拟杀（无花色） */
  *virtualSha(user: SgPlayerState, targets: SgPlayerId[]): Generator<SgWait, void, CmdResult> {
    this.log('CARD_USED', { by: user.id, card: null, as: 'sha', targets, turn: this.st.turnNumber });
    yield* this.resolveSha(user, '', targets, 'normal');
  }

  /** 失去体力（无来源、不触发受伤后技能），可进入濒死 */
  *loseHp(p: SgPlayerState, n: number, reason: string): Generator<SgWait, void, CmdResult> {
    p.hp -= n;
    this.log('HP_LOSS', { player: p.id, amount: n, reason, hp: Math.max(0, p.hp) });
    if (p.hp <= 0) yield* this.dyingFlow(p, { source: null });
    this.checkVictory();
  }

  // ─── 命令入口 ────────────────────────────────────────────────
  command(seat: SgPlayerId, action: SgAction, expectedRevision: number | null, commandId: string): SgCommandAck {
    if (this.seenCmds.has(commandId)) {
      return { ok: true, revision: this.st.revision }; // 幂等：重复命令直接成功返回当前状态
    }
    if (expectedRevision !== null && expectedRevision !== this.st.revision) {
      return { ok: false, error: { code: 'STALE_REVISION', message: '局面版本不一致' }, revision: this.st.revision };
    }
    if (this.st.winner !== null && action.type !== 'select-general') {
      return { ok: false, error: { code: 'GAME_ENDED', message: '对局已结束' }, revision: this.st.revision };
    }
    const p = this.player(seat);
    if (!p) return { ok: false, error: { code: 'INVALID_INPUT', message: '座位不存在' }, revision: this.st.revision };

    if (this.st.phase === 'select' || !this.iter) {
      if (action.type !== 'select-general') {
        return { ok: false, error: { code: 'INVALID_INPUT', message: '等待选将' }, revision: this.st.revision };
      }
      const r = this.selectGeneral(seat, action.generalId);
      if (r.ok) this.history.push({ seat, action });
      this.seenCmds.add(commandId);
      return r;
    }

    // 挂起窗口命令
    const w = this.pending;
    if (w) {
      const res = this.validateWaitCommand(w, seat, action);
      if (res) return { ok: false, error: { code: 'INVALID_INPUT', message: res }, revision: this.st.revision };
      const deep = this.validateWindowAction(w, action);
      if (deep) return { ok: false, error: { code: 'INVALID_INPUT', message: deep }, revision: this.st.revision };
      const result = this.waitToResult(w, action);
      this.history.push({ seat, action });
      this.seenCmds.add(commandId);
      const done = this.pending;
      this.pending = null;
      this.onWait?.(null);
      void done;
      this.pump(result);
      return { ok: true, revision: this.st.revision };
    }

    // 无挂起窗口时仅允许出牌阶段行动（play 窗口是唯一入口，正常情况 pending 即 play）
    return { ok: false, error: { code: 'INVALID_INPUT', message: '当前不接受该操作' }, revision: this.st.revision };
  }

  /** 测试/恢复用：跳过 revision 与幂等 */
  private commandRaw(seat: SgPlayerId, action: SgAction): SgCommandAck {
    return this.command(seat, action, null, `raw-${this.history.length}-${Math.random()}`);
  }

  /** 窗口动作深度校验（拒绝时不触碰流程，整局绝不因客户端输入崩溃） */
  private validateWindowAction(w: SgWait, action: SgAction): string | null {
    const p = 'playerId' in w ? this.player(w.playerId as SgPlayerId) : null;
    switch (w.kind) {
      case 'respond': {
        if (action.type === 'respond-pass') return null;
        if (action.type === 'respond-skill') {
          if (w.need !== 'shan') return '该窗口不能发动技能';
          return action.skillId === 'baguazhen' && p?.equips.armor ? null : '不能发动该技能';
        }
        if (action.type !== 'respond-play') return '请使用响应操作';
        const cardId = (action as { cardId: string }).cardId;
        const legal = w.need === 'tao' && w.dyingId ? this.legalDyingCards(w.playerId as SgPlayerId, w.dyingId) : this.legalRespondCards(w.playerId as SgPlayerId, w.need);
        if (!legal.includes(cardId)) return '该牌不能用于此响应';
        return null;
      }
      case 'discard': {
        const cards = (action as { cards?: string[] }).cards;
        if (!Array.isArray(cards) || cards.length !== w.count) return `需弃置 ${w.count} 张`;
        for (const id of cards) if (!p!.hand.includes(id)) return '牌不在手牌';
        return null;
      }
      case 'choose': {
        const v = (action as { value?: string }).value;
        if (!v || !w.options.includes(v)) return '选择不合法';
        return null;
      }
      case 'cards': {
        const cards = (action as { cards?: string[] }).cards;
        if (!Array.isArray(cards) || cards.length < w.min || cards.length > w.max) return `需选择 ${w.min}${w.max !== w.min ? `~${w.max}` : ''} 张`;
        for (const id of cards) if (!p!.hand.includes(id)) return '牌不在手牌';
        return null;
      }
      case 'targets': {
        const ts = (action as { targets?: string[] }).targets;
        if (!Array.isArray(ts) || ts.length < w.min || ts.length > w.max) return `需选择 ${w.min}${w.max !== w.min ? `~${w.max}` : ''} 个目标`;
        for (const t of ts) if (!(w.candidates as string[]).includes(t)) return '目标不合法';
        return null;
      }
      case 'guanxing': {
        const top = (action as { top?: string[] }).top;
        if (!Array.isArray(top)) return '请提交观星结果';
        const seen = new Set(w.cards);
        if (new Set(top).size !== top.length) return '观星顺序重复';
        for (const id of top) if (!seen.has(id)) return '观星牌不合法';
        return null;
      }
      default:
        return null;
    }
  }

  private validateWaitCommand(w: SgWait, seat: SgPlayerId, action: SgAction): string | null {
    if (w.kind === 'play') {
      if (seat !== w.playerId) return '还没轮到你';
      if (!['play-card', 'use-skill', 'end-play'].includes(action.type)) return '该阶段不接受此操作';
      return null;
    }
    if (w.kind === 'respond' && seat !== w.playerId) return '当前不需要你响应';
    if (w.kind === 'discard' && seat !== w.playerId) return '当前不需要你弃牌';
    if (w.kind === 'choose' && seat !== w.playerId) return '当前不需要你选择';
    if (w.kind === 'cards' && seat !== w.playerId) return '当前不需要你选牌';
    if (w.kind === 'targets' && seat !== w.playerId) return '当前不需要你选目标';
    if (w.kind === 'guanxing' && seat !== w.playerId) return '当前不需要你观星';
    if (w.kind === 'respond' && !['respond-pass', 'respond-play', 'respond-skill'].includes(action.type)) return '请使用响应操作';
    if (w.kind === 'discard' && action.type !== 'discard') return '请提交弃牌';
    if (w.kind === 'choose' && action.type !== 'choose') return '请提交选择';
    if (w.kind === 'cards' && action.type !== 'submit-cards') return '请提交选牌';
    if (w.kind === 'targets' && action.type !== 'submit-targets') return '请提交目标';
    if (w.kind === 'guanxing' && action.type !== 'guanxing-top') return '请提交观星结果';
    return null;
  }

  private waitToResult(w: SgWait, action: SgAction): CmdResult {
    switch (w.kind) {
      case 'play':
        return { type: 'command', action };
      case 'respond':
        if (action.type === 'respond-pass') return { type: 'pass' };
        if (action.type === 'respond-play') return { type: 'command', action };
        if (action.type === 'respond-skill') return { type: 'command', action };
        return { type: 'pass' };
      case 'discard':
        return { type: 'cards', cards: (action as { cards: string[] }).cards };
      case 'choose':
        return { type: 'option', value: (action as { value: string }).value };
      case 'cards':
        return { type: 'cards', cards: (action as { cards: string[] }).cards };
      case 'targets':
        return { type: 'targets', targets: (action as { targets: SgPlayerId[] }).targets };
      case 'guanxing':
        return { type: 'guanxing', top: (action as { top: string[] }).top };
    }
  }

  /** 断线/超时托管：为当前窗口生成安全默认结果 */
  autoResultFor(w: SgWait): CmdResult {
    switch (w.kind) {
      case 'respond': return { type: 'pass' };
      case 'discard': return { type: 'cards', cards: this.player(w.playerId).hand.slice(0, w.count) };
      case 'choose': return { type: 'option', value: w.options[w.options.length - 1] };
      case 'cards': return { type: 'cards', cards: this.player(w.playerId).hand.slice(0, w.min) };
      case 'targets': return { type: 'targets', targets: w.candidates.slice(0, w.min) };
      case 'guanxing': return { type: 'guanxing', top: w.cards };
      case 'play': return { type: 'command', action: { type: 'end-play' } };
    }
  }

  /** 超时托管入口：仅当该窗口仍是当前挂起窗口时生效 */
  forceAuto(windowId: string): boolean {
    if (!this.pending || this.pending.windowId !== windowId) return false;
    const result = this.autoResultFor(this.pending);
    this.pending = null;
    this.onWait?.(null);
    this.pump(result);
    return true;
  }

  // ─── 视图 ────────────────────────────────────────────────────
  view(forSeat: SgPlayerId | null) {
    const me = forSeat ? this.player(forSeat) : null;
    return {
      revision: this.st.revision,
      phase: this.st.phase,
      turnNumber: this.st.turnNumber,
      current: this.st.current,
      winner: this.st.winner,
      deckConfig: this.st.deckConfig,
      rulesetVersion: this.st.rulesetVersion,
      drawCount: this.st.drawPile.length,
      discardCount: this.st.discardPile.length,
      discardTop: this.pubCard(this.st.discardPile[this.st.discardPile.length - 1] ?? null),
      myHand: me ? [...me.hand] : [],
      players: this.st.order.map((id) => {
        const p = this.player(id);
        return {
          id: p.id,
          general: p.generalId,
          hp: Math.max(0, p.hp),
          maxHp: p.maxHp,
          alive: p.alive,
          chained: p.chained,
          handCount: p.hand.length,
          equips: { ...p.equips },
          judgments: [...p.judgments],
          selected: p.selected,
        };
      }),
      hints: this.pending?.kind === 'play' && forSeat && this.pending.playerId === forSeat && me ? this.playHints(me) : [],
      pending: this.pending
        ? {
            kind: this.pending.kind,
            playerId: this.pending.playerId,
            need: this.pending.kind === 'respond' ? this.pending.need : undefined,
            promptId: 'promptId' in this.pending ? (this.pending as { promptId?: string }).promptId : undefined,
            dyingId: this.pending.kind === 'respond' ? this.pending.dyingId : undefined,
            prompt: 'prompt' in this.pending ? this.pending.prompt : undefined,
            min: 'min' in this.pending ? this.pending.min : undefined,
            max: 'max' in this.pending ? this.pending.max : undefined,
            count: 'count' in this.pending ? this.pending.count : undefined,
            options: 'options' in this.pending ? this.pending.options : undefined,
            candidates: 'candidates' in this.pending ? this.pending.candidates : undefined,
            cards: 'cards' in this.pending ? this.pending.cards : undefined,
            legalCards:
              this.pending.kind === 'respond' && forSeat && this.pending.playerId === forSeat
                ? this.legalRespondCards(forSeat, this.pending.need, this.pending.dyingId)
                : undefined,
            converters: this.pending.kind === 'respond' ? this.pending.converters : undefined,
            windowId: this.pending.windowId,
          }
        : null,
      log: this.st.log.slice(-120),
    };
  }
}

// 牌名 → 简写 helper
function idOf(name: string): string | null {
  for (const c of CARD_BY_ID.values()) {
    if (c.name === name) return c.id;
  }
  return null;
}

// 引入 ALL_IDS（避免循环：cards 未导出全部 id 的常量，这里动态生成）
import { ALL_CARDS } from './cards';
const ALL_IDS: string[] = ALL_CARDS.map((c) => c.id);
