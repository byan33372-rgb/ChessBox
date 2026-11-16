/**
 * 三国杀·自由混战 —— 引擎核心测试（PHASE 2/3）：
 * 牌张完整性、回合流转、杀/闪/伤害、濒死救援、胜负、目标限制、距离。
 * 全部走真实命令流（select-general → play/respond）；白盒仅用于准备手牌（区域搬运保持完整性）。
 */
import { describe, expect, it } from 'vitest';
import { SanguoshaGame } from '../../src/games/sanguosha/engine';
import type { SgAction, SgPlayerId, SgWait } from '../../src/games/sanguosha/types';

let seq = 0;
function drive(g: SanguoshaGame, seat: SgPlayerId, action: SgAction): void {
  const r = g.command(seat, action, null, `t-${++seq}`);
  if (!r.ok) throw new Error(`${seat} ${JSON.stringify(action)} → ${JSON.stringify(r.error)}`);
}

function expectWait(g: SanguoshaGame, kind: SgWait['kind'], playerId?: string): void {
  const w = g.pending;
  expect(w, `期望窗口 ${kind}，实际 ${w ? w.kind : 'null'}`).not.toBeNull();
  expect(w!.kind).toBe(kind);
  if (playerId) expect((w as { playerId?: string }).playerId).toBe(playerId);
}

/** 推进直到出现指定窗口（防御式：响应 pass、弃牌最少张、选择默认最后项、play 结束） */
function runUntil(g: SanguoshaGame, kind: SgWait['kind'], playerId?: string, maxSteps = 200): void {
  for (let i = 0; i < maxSteps; i++) {
    const w = g.pending;
    if (w && w.kind === kind && (!playerId || (w as { playerId?: string }).playerId === playerId)) return;
    if (!w) return;
    if (w.kind === 'respond') drive(g, w.playerId, { type: 'respond-pass' });
    else if (w.kind === 'discard') drive(g, w.playerId, { type: 'discard', cards: g.player(w.playerId).hand.slice(0, w.count) });
    else if (w.kind === 'choose') drive(g, w.playerId, { type: 'choose', value: w.options[w.options.length - 1] });
    else if (w.kind === 'cards') drive(g, w.playerId, { type: 'submit-cards', cards: g.player(w.playerId).hand.slice(0, w.min) });
    else if (w.kind === 'targets') drive(g, w.playerId, { type: 'submit-targets', targets: w.candidates.slice(0, w.min) });
    else if (w.kind === 'guanxing') drive(g, w.playerId, { type: 'guanxing-top', top: w.cards });
    else if (w.kind === 'play') drive(g, w.playerId, { type: 'end-play' });
  }
  throw new Error(`runUntil 超限: ${kind}`);
}

function setup(seed: number, generals: string[], deck: 'standard_only' | 'standard_plus_military' = 'standard_plus_military') {
  const order = ['a', 'b', 'c'].slice(0, generals.length) as SgPlayerId[];
  const g = SanguoshaGame.create(order, deck, seed);
  generals.forEach((gid, i) => drive(g, order[i], { type: 'select-general', generalId: gid }));
  runUntil(g, 'play');
  return { g, order, cur: g.st.current };
}

function zoneIntegrity(g: SanguoshaGame): void {
  const loc = g.locationOfAll();
  const bad = [...loc.entries()].filter(([, v]) => v === 'void');
  expect(bad, `悬空牌: ${bad.map(([id]) => id).join(',')}`).toHaveLength(0);
}

/** 白盒：把某玩家手牌中的指定牌面移入弃牌堆（保持完整性） */
function stripHand(g: SanguoshaGame, seat: SgPlayerId, names: string[]): void {
  const p = g.player(seat);
  for (const id of [...p.hand]) {
    if (names.includes(g.card(id).name)) {
      p.hand.splice(p.hand.indexOf(id), 1);
      g.st.discardPile.push(id);
    }
  }
}

/** 白盒：从牌堆/弃牌堆拿一张指定牌面塞进手牌 */
function grantCard(g: SanguoshaGame, seat: SgPlayerId, name: string): string {
  const id = g.st.drawPile.find((cid) => g.card(cid).name === name)
    ?? g.st.discardPile.find((cid) => g.card(cid).name === name);
  if (!id) throw new Error(`牌堆/弃牌堆找不到 ${name}`);
  const fromDraw = g.st.drawPile.indexOf(id);
  if (fromDraw >= 0) g.st.drawPile.splice(fromDraw, 1);
  else g.st.discardPile.splice(g.st.discardPile.indexOf(id), 1);
  g.player(seat).hand.push(id);
  return id;
}

describe('开局与牌张完整性', () => {
  it('选将后自动开局：4 手牌、先手随机、进入 play 窗口', () => {
    const { g, cur } = setup(7, ['zhaoyun', 'guanyu', 'sunquan']);
    expect(g.st.turnNumber).toBe(1);
    // 初始 4 张；先手已完成摸牌阶段（+2）→ 6 张
    expect(g.player(cur).hand).toHaveLength(6);
    for (const p of g.st.players) {
      if (p.id !== cur) expect(p.hand, p.id).toHaveLength(4);
    }
    expect(g.st.drawPile.length + g.st.discardPile.length).toBe(146);
    expect(g.st.current).toBe(cur);
    expect(g.pending?.kind).toBe('play');
    zoneIntegrity(g);
  });

  it('回合流转：end-play → 弃牌阶段（4手牌/3体力弃1）→ 下家 play', () => {
    const { g, cur } = setup(11, ['simayi', 'guojia', 'zhouyu']);
    expectWait(g, 'play', cur);
    stripHand(g, cur, g.player(cur).hand.map((id) => g.card(id).name)); // 清空手牌
    grantCard(g, cur, 'sha');
    grantCard(g, cur, 'sha');
    grantCard(g, cur, 'tao'); // 3 张 = 体力上限 3 → 无需弃牌？不：3 体力手牌上限 3，正好不弃
    // 改为 4 张制造弃牌窗口
    grantCard(g, cur, 'shan');
    drive(g, cur, { type: 'end-play' });
    expectWait(g, 'discard', cur);
    const need = g.pending!.kind === 'discard' ? g.pending!.count : 0;
    expect(need).toBe(1);
    drive(g, cur, { type: 'discard', cards: g.player(cur).hand.slice(0, need) });
    expect(g.st.current).not.toBe(cur);
    expect(g.st.turnNumber).toBe(2);
    runUntil(g, 'play');
    zoneIntegrity(g);
  });

  it('整局空转：连续 12 个回合正常推进（弃牌/牌堆完整）', () => {
    const { g } = setup(23, ['caocao', 'lvmeng', 'sunquan']);
    for (let i = 0; i < 12 && g.st.winner === null; i++) {
      const cur = g.st.current;
      runUntil(g, 'play', cur);
      drive(g, cur, { type: 'end-play' });
      const w = g.pending;
      if (w?.kind === 'discard') {
        drive(g, cur, { type: 'discard', cards: g.player(cur).hand.slice(0, w.count) });
      }
      zoneIntegrity(g);
    }
    expect(g.st.turnNumber).toBeGreaterThan(3);
  });
});

describe('杀/闪/伤害/濒死', () => {
  it('杀→无闪直接伤害（无响应窗口）；有闪时打出闪完全抵消', () => {
    const { g, cur } = setup(31, ['guanyu', 'simayi', 'sunquan']);
    const target = g.st.order.find((x) => x !== cur)! as SgPlayerId;
    // 诸葛连弩：绕过杀次数限制，便于连续两次测试
    const ny = grantCard(g, cur, 'zhugelianyu');
    drive(g, cur, { type: 'play-card', cardId: ny, targets: [] });
    expect(g.player(cur).equips.weapon).toBe(ny);

    // 分支一：无闪 → 无响应窗口直接扣血
    stripHand(g, target, ['shan', 'baguazhen', 'tao']);
    const sha = grantCard(g, cur, 'sha');
    const hpBefore = g.player(target).hp;
    drive(g, cur, { type: 'play-card', cardId: sha, targets: [target] });
    expect(g.player(target).hp).toBe(hpBefore - 1);
    expect(g.pending?.kind).toBe('play');
    zoneIntegrity(g);

    // 分支二：有闪 → 响应窗口 → 打出闪抵消
    const sha2 = grantCard(g, cur, 'sha');
    stripHand(g, target, ['tao']);
    grantCard(g, target, 'shan');
    drive(g, cur, { type: 'play-card', cardId: sha2, targets: [target] });
    expectWait(g, 'respond', target);
    const shan = g.player(target).hand.find((id) => g.card(id).name === 'shan')!;
    drive(g, target, { type: 'respond-play', cardId: shan });
    expect(g.player(target).hp).toBe(hpBefore - 1);
    zoneIntegrity(g);
  });

  it('濒死救援：他人出桃救回（顺序：本人优先→顺时针）', () => {
    const { g, cur } = setup(41, ['simayi', 'guanyu', 'sunquan']);
    const victim = g.st.order.find((x) => x !== cur)! as SgPlayerId;
    const rescuer = g.st.order.find((x) => x !== cur && x !== victim)! as SgPlayerId;
    stripHand(g, victim, ['shan', 'tao', 'jiu', 'baguazhen']);
    grantCard(g, rescuer, 'tao');
    const sha = grantCard(g, cur, 'sha');
    g.player(victim).hp = 1;
    drive(g, cur, { type: 'play-card', cardId: sha, targets: [victim] });
    runUntil(g, 'respond', victim);
    drive(g, victim, { type: 'respond-pass' });
    expectWait(g, 'respond', rescuer);
    const tao = g.player(rescuer).hand.find((id) => g.card(id).name === 'tao')!;
    drive(g, rescuer, { type: 'respond-play', cardId: tao });
    expect(g.player(victim).hp).toBe(1);
    expect(g.player(victim).alive).toBe(true);
    zoneIntegrity(g);
  });

  it('无人救援 → 死亡清理；3 人局继续；再杀一人 → 最后存活者胜', () => {
    const { g, cur } = setup(43, ['lvbu', 'simayi', 'sunquan']);
    for (const p of ['a', 'b', 'c'] as SgPlayerId[]) {
      stripHand(g, p, ['tao', 'jiu', 'shan', 'baguazhen']);
    }
    const v1 = g.st.order.find((x) => x !== cur)! as SgPlayerId;
    g.player(v1).hp = 1;
    const sha = grantCard(g, cur, 'sha');
    drive(g, cur, { type: 'play-card', cardId: sha, targets: [v1] });
    runUntil(g, 'play');
    expect(g.player(v1).alive).toBe(false);
    expect(g.player(v1).hand).toHaveLength(0);
    expect(g.st.winner).toBeNull();
    for (let i = 0; i < 100 && g.st.winner === null; i++) {
      const c = g.st.current;
      const enemies = g.st.order.filter((x) => x !== c && g.player(x).alive) as SgPlayerId[];
      if (enemies.length === 1) {
        g.player(enemies[0]).hp = 1;
        stripHand(g, enemies[0], ['shan', 'tao', 'baguazhen']);
        // 装备诸葛连弩解除本回合杀次数限制（真实出牌路径）
        const ny = grantCard(g, c, 'zhugelianyu');
        drive(g, c, { type: 'play-card', cardId: ny, targets: [] });
        const s = grantCard(g, c, 'sha');
        drive(g, c, { type: 'play-card', cardId: s, targets: [enemies[0]] });
        runUntil(g, 'play');
        break;
      }
      drive(g, c, { type: 'end-play' });
      const w = g.pending;
      if (w?.kind === 'discard') drive(g, c, { type: 'discard', cards: g.player(c).hand.slice(0, w.count) });
      zoneIntegrity(g);
    }
    expect(g.st.winner).not.toBeNull();
    expect(g.st.winner).not.toBe('draw');
    expect(g.st.phase).toBe('ended');
    zoneIntegrity(g);
  });
});

describe('距离与目标合法性', () => {
  it('4 人局：对角距离 2；马术 -1；±1 马修正', () => {
    const order: SgPlayerId[] = ['a', 'b', 'c', 'd'];
    const g = SanguoshaGame.create(order, 'standard_plus_military', 5);
    const gens = ['caocao', 'sunquan', 'simayi', 'machao'];
    gens.forEach((gid, i) => drive(g, order[i], { type: 'select-general', generalId: gid }));
    runUntil(g, 'play');
    expect(g.distance('a', 'b')).toBe(1);
    expect(g.distance('a', 'c')).toBe(2);
    expect(g.distance('d', 'b')).toBe(1); // 马超马术：2-1
    const chitu = g.st.drawPile.find((id) => g.card(id).name === 'chitu');
    const dailu = g.st.drawPile.find((id) => g.card(id).name === 'dailu');
    if (chitu && dailu) {
      g.st.drawPile.splice(g.st.drawPile.indexOf(chitu), 1);
      g.player('a').equips.horseMinus = chitu;
      g.st.drawPile.splice(g.st.drawPile.indexOf(dailu), 1);
      g.player('c').equips.horsePlus = dailu;
      expect(g.distance('a', 'c')).toBe(2);
    }
    zoneIntegrity(g);
  });

  it('空城：无手牌的诸葛亮不能成为杀目标', () => {
    const { g, cur } = setup(61, ['zhugeliang', 'guanyu', 'sunquan']);
    const kong = g.st.order.find((x) => g.player(x).generalId === 'zhugeliang')! as SgPlayerId;
    stripHand(g, kong, g.player(kong).hand.map((id) => g.card(id).name));
    expect(g.player(kong).hand).toHaveLength(0);
    const sha = grantCard(g, cur, 'sha');
    const leg = g.playableTargets(g.player(cur), sha, 'sha');
    expect(leg.targets).not.toContain(kong);
  });

  it('谦逊：陆逊不能成为顺手牵羊目标', () => {
    const { g, cur } = setup(67, ['luxun', 'ganning', 'sunquan']);
    const lu = g.st.order.find((x) => g.player(x).generalId === 'luxun')! as SgPlayerId;
    const shun = grantCard(g, cur, 'shunshouqianyang');
    const leg = g.playableTargets(g.player(cur), shun, 'shunshouqianyang');
    expect(leg.targets).not.toContain(lu);
  });
});
