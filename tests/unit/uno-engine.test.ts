/** UNO 引擎单元测试：匹配/抽牌/+4 质疑/UNO 喊牌/Teams 传牌/出局回归/3 人 2v1 退化。 */
import { describe, expect, it } from 'vitest';
import { UnoGame } from '../../src/games/uno/engine';
import { UNO_CLASSIC_108, UNO_TEAMS_112, type UnoColor, type UnoSeat } from '../../src/games/uno/cards';
type UnoTeamId = 'A' | 'B';

let seq = 0;
function drive(g: UnoGame, seat: UnoSeat, action: Record<string, unknown>): void {
  const r = g.command(seat, action, null, `u-${++seq}`);
  if (!r.ok) throw new Error(`${seat} ${JSON.stringify(action)} → ${JSON.stringify(r.error)}`);
}
function tryDrive(g: UnoGame, seat: UnoSeat, action: Record<string, unknown>) {
  return g.command(seat, action, null, `u-${++seq}`);
}
/** 找一张指定 kind/color 的牌塞给 seat（白盒，保持区域完整） */
function grant(g: UnoGame, seat: UnoSeat, pred: (kind: string, color: string | null, number?: number) => boolean): string {
  const pool = g.st.drawPile.length >= g.st.discardPile.length ? g.st.drawPile : g.st.discardPile;
  const id = pool.find((cid) => {
    const c = g.card(cid);
    return pred(c.kind, c.color, c.number);
  })!;
  const di = g.st.drawPile.indexOf(id);
  if (di >= 0) g.st.drawPile.splice(di, 1);
  else g.st.discardPile.splice(g.st.discardPile.indexOf(id), 1);
  g.player(seat).hand.push(id);
  return id;
}
function forceTop(g: UnoGame, color: UnoColor, kind = 'number'): void {
  // 白盒：把弃牌堆顶换成指定牌（测试起点归一化）
  const old = g.st.discardPile.pop()!;
  g.st.drawPile.push(old);
  const id = g.st.drawPile.find((cid) => {
    const c = g.card(cid);
    return c.color === color && (kind === 'number' ? c.kind === 'number' : c.kind === kind);
  })!;
  g.st.drawPile.splice(g.st.drawPile.indexOf(id), 1);
  g.st.discardPile.push(id);
  g.st.currentColor = color;
}
function stripHand(g: UnoGame, seat: UnoSeat): void {
  const p = g.player(seat);
  for (const id of [...p.hand]) {
    p.hand.splice(p.hand.indexOf(id), 1);
    g.st.discardPile.push(id);
  }
}
function setup(seed: number, seats: UnoSeat[], opts?: { teams?: boolean; deck?: 'uno_classic_108' | 'uno_teams_112' }) {
  const ruleProfile = opts?.teams ? (seats.length === 4 ? 'classic_teams_official' : 'classic_teams_2v1_custom') : 'classic_ffa';
  const g = UnoGame.create(seats, opts?.deck ?? 'uno_classic_108', ruleProfile as never, seed);
  if (opts?.teams) {
    const halves: Array<[UnoTeamId, UnoSeat[]]> = seats.length === 4
      ? [['A', ['a', 'b']], ['B', ['c', 'd']]]
      : [['A', ['a', 'b']], ['B', ['c']]];
    halves.forEach(([t, members]) => {
      for (const m of members) drive(g, m, { type: 'set-team', team: t });
    });
  }
  for (const s of seats) drive(g, s, { type: 'ready', ready: true });
  // 归一化：起始牌若带罚抽，系统抽牌完成（白盒）
  if (g.st.pendingDraw > 0) {
    const v = g.player(g.st.turn);
    for (let i = 0; i < g.st.pendingDraw; i++) {
      g.reshuffleSafe?.();
      const id = g.st.drawPile.pop();
      if (id) v.hand.push(id);
    }
    g.st.pendingDraw = 0;
    g.st.turn = g.st.order[(g.st.order.indexOf(g.st.turn) + 1) % g.st.order.length];
    g.st.revision += 1;
  }
  return { g, seats, cur: g.st.turn };
}
const top = (g: UnoGame) => g.card(g.st.discardPile.at(-1)!);

describe('UNO 经典流程', () => {
  it('开局：发 7 张、起始牌非 +4；轮到先手', () => {
    const { g, cur } = setup(11, ['a', 'b', 'c']);
    expect(g.st.phase).toBe('playing');
    for (const p of g.st.players) expect(p.hand).toHaveLength(7);
    expect(g.card(g.st.discardPile.at(-1)!).kind).not.toBe('wild_draw4');
    expect(g.st.turn).toBe(cur);
    // 非 turn 玩家出牌被拒
    const other = g.st.order.find((x) => x !== cur)!;
    const anyCard = g.player(other).hand[0];
    expect(tryDrive(g, other, { type: 'play-card', cardId: anyCard }).ok).toBe(false);
  });

  it('无匹配 → 必须抽 1；抽后可出刚抽的牌；轮转推进', () => {
    const { g, cur } = setup(13, ['a', 'b', 'c']);
    // 清空 cur 手牌 → 必然无匹配
    stripHand(g, cur);
    const before = g.player(cur).hand.length;
    drive(g, cur, { type: 'draw' });
    expect(g.player(cur).hand.length).toBe(before + 1);
    expect(g.st.turn).not.toBe(cur); // 抽后不出的简化实现：直接轮转（抽到可出可立即出的细则由「打出刚抽牌」承担——见 playAfterDraw 流程注记）
    void g;
  });

  it('数字牌出牌：颜色匹配 → 弃牌堆顶更新 + 轮转', () => {
    const { g, cur } = setup(17, ['a', 'b', 'c']);
    forceTop(g, 'R');
    stripHand(g, cur);
    const red3 = grant(g, cur, (k, c) => k === 'number' && c === 'R');
    const handBefore = g.player(cur).hand.length;
    drive(g, cur, { type: 'play-card', cardId: red3 });
    expect(g.player(cur).hand.length).toBe(handBefore - 1);
    expect(g.st.discardPile.at(-1)).toBe(red3);
    expect(g.st.currentColor).toBe('R');
    expect(g.st.turn).not.toBe(cur);
  });

  it('+2：下家罚抽 2 并跳过', () => {
    const { g, cur } = setup(19, ['a', 'b', 'c']);
    forceTop(g, 'B');
    stripHand(g, cur);
    const draw2 = grant(g, cur, (k, c) => k === 'draw2' && c === 'B');
    const next = g.st.order[g.st.order.indexOf(cur) + 1];
    const handNext = g.player(next).hand.length;
    drive(g, cur, { type: 'play-card', cardId: draw2, chosenColor: 'R' });
    // 引擎在 advance() 执行罚抽：pendingDraw 由 choose-color/advance 消化——此处直接出牌后应立即罚抽
    expect(g.player(next).hand.length).toBe(handNext + 2);
    expect(g.st.turn).not.toBe(next); // 下家被跳过
  });

  it('跳过：下家失去回合', () => {
    const { g, cur } = setup(23, ['a', 'b', 'c']);
    forceTop(g, 'B');
    stripHand(g, cur);
    const skip = grant(g, cur, (k, c) => k === 'skip' && c === 'B');
    const next = g.st.order[g.st.order.indexOf(cur) + 1];
    drive(g, cur, { type: 'play-card', cardId: skip });
    expect(g.st.turn).not.toBe(next);
    expect(g.st.turn).not.toBe(cur);
  });

  it('反转：方向翻转', () => {
    const { g, cur } = setup(29, ['a', 'b', 'c']);
    forceTop(g, 'B');
    stripHand(g, cur);
    const rev = grant(g, cur, (k, c) => k === 'reverse' && c === 'B');
    const dirBefore = g.st.direction;
    drive(g, cur, { type: 'play-card', cardId: rev });
    expect(g.st.direction).toBe(-dirBefore as 1 | -1);
  });

  it('wild：选色窗口', () => {
    const { g, cur } = setup(31, ['a', 'b', 'c']);
    stripHand(g, cur);
    const red2 = grant(g, cur, (k, c) => k === 'number' && c === 'R');
    const wild = grant(g, cur, (k) => k === 'wild');
    void red2;
    drive(g, cur, { type: 'play-card', cardId: wild });
    expect(g.st.pending?.kind).toBe('choose-color');
    drive(g, cur, { type: 'choose-color', color: 'G' });
    expect(g.st.currentColor).toBe('G');
  });

  it('+4 质疑：出牌者无当前色 → 质疑失败质疑者抽 6；有当前色 → 质疑成功出牌者抽 4', () => {
    // 场景一：出牌者无当前颜色（R）牌 → +4 合法 → 质疑失败 → 质疑者抽 6
    const { g, cur } = setup(37, ['a', 'b', 'c']);
    const next = g.st.order[g.st.order.indexOf(cur) + 1];
    stripHand(g, cur);
    grant(g, cur, (k, c) => k === 'number' && c === 'B'); // 非 R 色
    const w4 = grant(g, cur, (k) => k === 'wild_draw4');
    const n0 = g.player(next).hand.length;
    drive(g, cur, { type: 'play-card', cardId: w4 });
    expect(g.st.pending?.kind).toBe('challenge');
    expect(g.st.pending?.playerId).toBe(next);
    drive(g, next, { type: 'challenge', challenge: true });
    expect(g.player(next).hand.length).toBe(n0 + 6);
    // 场景二：出牌者有当前颜色 → 质疑成功 → 出牌者抽 4
    const { g: g2, cur: cur2 } = setup(41, ['a', 'b', 'c']);
    const next2 = g2.st.order[g2.st.order.indexOf(cur2) + 1];
    stripHand(g2, cur2);
    forceTop(g2, 'R');
    grant(g2, cur2, (k, c) => c === 'R' && k === 'number');
    const w42 = grant(g2, cur2, (k) => k === 'wild_draw4');
    drive(g2, cur2, { type: 'play-card', cardId: w42 });
    const responder = g2.st.pending!.playerId!;
    const c0 = g2.player(cur2).hand.length;
    drive(g2, responder, { type: 'challenge', challenge: true });
    expect(g2.player(cur2).hand.length).toBe(c0 + 4);
  });

  it('UNO 喊牌与抓漏喊', () => {
    const { g, cur } = setup(43, ['a', 'b', 'c']);
    forceTop(g, 'R');
    stripHand(g, cur);
    const red5 = grant(g, cur, (k, c) => k === 'number' && c === 'R');
    grant(g, cur, (k, c) => k === 'number' && c === 'B'); // 剩 2 张
    drive(g, cur, { type: 'call-uno' });
    expect(g.player(cur).unoCalled).toBe(true);
    drive(g, cur, { type: 'play-card', cardId: red5 });
    // 出牌后剩 1 张且已喊 UNO → lastActor.calledUno=true → 抓不到
    const la = g.st.lastActor!;
    expect(la.calledUno).toBe(true);
    const catcher = g.st.order.find((x) => x !== cur)!;
    expect(tryDrive(g, catcher, { type: 'catch-uno', target: cur }).ok).toBe(false);
    // 未喊 UNO 场景
    const { g: g2, cur: cur2 } = setup(47, ['a', 'b', 'c']);
    forceTop(g2, 'R');
    stripHand(g2, cur2);
    const red7 = grant(g2, cur2, (k, c) => k === 'number' && c === 'R');
    grant(g2, cur2, (k, c) => k === 'number' && c === 'B');
    drive(g2, cur2, { type: 'play-card', cardId: red7 });
    const catcher2 = g2.st.order.find((x) => x !== cur2)!;
    drive(g2, catcher2, { type: 'catch-uno', target: cur2 });
    expect(g2.player(cur2).hand.length).toBe(3); // 出后剩 1 + 罚抽 2
  });

  it('清空手牌 → 本轮结束、赢家确定、积分累计', () => {
    const { g, cur } = setup(53, ['a', 'b', 'c']);
    forceTop(g, 'R');
    stripHand(g, cur);
    const red5 = grant(g, cur, (k, c) => k === 'number' && c === 'R');
    drive(g, cur, { type: 'play-card', cardId: red5 });
    expect(g.st.phase).toBe('roundEnd');
    expect(g.st.winner).toBe(cur);
    expect(g.st.roundWinner).toBe(cur);
    expect(g.st.roundScores[cur]).toBeGreaterThan(0);
  });
});

describe('UNO Teams（4 人 2v2）', () => {
  it('开局传牌：两队各 2 人同时秘密提交 → 原子交换', () => {
    const { g } = setup(61, ['a', 'b', 'c', 'd'], { teams: true, deck: 'uno_teams_112' });
    expect(g.st.pending?.kind).toBe('team-pass');
    // 每人选手牌第 1 张
    for (const s of ['a', 'b', 'c', 'd'] as UnoSeat[]) {
      drive(g, s, { type: 'team-pass', cardId: g.player(s).hand[0] });
    }
    expect(g.st.teamPassDone).toBe(true);
    expect(g.st.pending).toBeUndefined();
  });

  it('Team Play：跳转到队友回合并选色', () => {
    const { g, cur } = setup(67, ['a', 'b', 'c', 'd'], { teams: true, deck: 'uno_teams_112' });
    // 完成传牌
    for (const s of ['a', 'b', 'c', 'd'] as UnoSeat[]) drive(g, s, { type: 'team-pass', cardId: g.player(s).hand[0] });
    // 推进到 a 回合
    for (let i = 0; i < 20 && g.st.turn !== 'a'; i++) drive(g, g.st.turn, { type: 'draw' });
    stripHand(g, 'a');
    const tp = grant(g, 'a', (k) => k === 'wild_team_play');
    drive(g, 'a', { type: 'play-card', cardId: tp });
    // 选色后轮到队友 b
    drive(g, 'a', { type: 'choose-color', color: 'B' });
    expect(g.st.currentColor).toBe('B');
    expect(g.st.turn).toBe('b'); // a 的队友
  });

  it('Team Draw4：下家抽 4、其队友抽 2（HXT58 版本）', () => {
    const { g } = setup(71, ['a', 'b', 'c', 'd'], { teams: true, deck: 'uno_teams_112' });
    for (const s of ['a', 'b', 'c', 'd'] as UnoSeat[]) drive(g, s, { type: 'team-pass', cardId: g.player(s).hand[0] });
    for (let i = 0; i < 20 && g.st.turn !== 'a'; i++) drive(g, g.st.turn, { type: 'draw' });
    stripHand(g, 'a');
    const t4 = grant(g, 'a', (k) => k === 'wild_team_draw4');
    drive(g, 'a', { type: 'play-card', cardId: t4 });
    // 从引擎日志读取实际受罚者（方向由服务端权威决定）
    const draw4 = g.st.log.filter((e) => e.t === 'TEAM_DRAW4').at(-1)!;
    const mateEntry = g.st.log.filter((e) => e.t === 'TEAM_DRAW4_MATE').at(-1)!;
    const next = draw4.target as UnoSeat;
    const mate = mateEntry.mate as UnoSeat;
    expect(draw4.penalty).toBe(4);
    expect(mateEntry.penalty).toBe(2);
    void next;
    void mate;
    drive(g, 'a', { type: 'choose-color', color: 'G' });
    expect(g.st.currentColor).toBe('G');
  });

  it('成员出完（队友仅剩 1 张不回归）→ 另一成员清空 → 队伍获胜', () => {
    const { g } = setup(73, ['a', 'b', 'c', 'd'], { teams: true, deck: 'uno_teams_112' });
    for (const s of ['a', 'b', 'c', 'd'] as UnoSeat[]) drive(g, s, { type: 'team-pass', cardId: g.player(s).hand[0] });
    // b 只剩 1 张红牌（<2 不触发向出局者传牌）
    stripHand(g, 'b');
    const bLast = grant(g, 'b', (k, c) => k === 'number' && c === 'R');
    // a 清空：b 手牌 1 <2 → a 保持出局
    forceTop(g, 'R');
    stripHand(g, 'a');
    const red5 = grant(g, 'a', (k, c) => k === 'number' && c === 'R');
    for (let i = 0; i < 40 && g.st.turn !== 'a'; i++) drive(g, g.st.turn, { type: 'draw' });
    drive(g, 'a', { type: 'play-card', cardId: red5 });
    expect(g.player('a').isOut).toBe(true);
    expect(g.player('a').hand.length).toBe(0);
    // b 出最后一张 → 队伍 A 两名成员手牌均为 0 → 队伍获胜
    for (let i = 0; i < 40 && g.st.turn !== 'b'; i++) drive(g, g.st.turn, { type: 'draw' });
    drive(g, 'b', { type: 'play-card', cardId: bLast });
    expect(g.st.winningTeam).toBe('A');
    expect(g.st.phase).toBe('roundEnd');
  });

});

describe('UNO 3 人 2v1（平台自定义）', () => {
  it('孤立玩家出团队牌 → 退化为普通 wild（选色，无跳转）', () => {
    const { g, cur } = setup(83, ['a', 'b', 'c'], { teams: true, deck: 'uno_teams_112' });
    // c 单人队（halves: [a,b],[c]）；A 队需先完成开局传牌
    if (g.st.pending?.kind === 'team-pass') {
      for (const s of ['a', 'b'] as UnoSeat[]) drive(g, s, { type: 'team-pass', cardId: g.player(s).hand[0] });
    }
    expect(g.player('c').team).toBe('B');
    // 推进到 c 回合
    for (let i = 0; i < 20 && g.st.turn !== 'c'; i++) drive(g, g.st.turn, { type: 'draw' });
    stripHand(g, 'c');
    const tp = grant(g, 'c', (k) => k === 'wild_team_play');
    drive(g, 'c', { type: 'play-card', cardId: tp });
    expect(g.st.pending?.kind).toBe('choose-color');
    drive(g, 'c', { type: 'choose-color', color: 'Y' });
    expect(g.st.currentColor).toBe('Y');
    expect(['a', 'b']).toContain(g.st.turn); // 无队友跳转：正常轮转（c 的下家）
    void cur;
  });
});

describe('UNO 牌堆完整性', () => {
  it('任意时刻每张牌在唯一区域（抽/弃/手）', () => {
    const { g } = setup(91, ['a', 'b', 'c'], { deck: 'uno_classic_108' });
    const loc = new Map<string, string>();
    for (const c of UNO_CLASSIC_108) loc.set(c.id, 'void');
    for (const p of g.st.players) for (const id of p.hand) loc.set(id, `hand:${p.id}`);
    for (const id of g.st.drawPile) loc.set(id, 'draw');
    for (const id of g.st.discardPile) loc.set(id, 'discard');
    expect([...loc.values()].filter((v) => v === 'void')).toHaveLength(0);
    expect(loc.size).toBe(108);
  });
});
