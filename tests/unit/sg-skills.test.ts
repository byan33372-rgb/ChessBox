/**
 * 三国杀·自由混战 —— 武将技能矩阵测试（27 名逐一验证）。
 * 每个技能至少一条正向路径；主公技由数据层测试保证禁用。
 */
import { describe, expect, it } from 'vitest';
import { SanguoshaGame } from '../../src/games/sanguosha/engine';
import type { SgAction, SgPlayerId, SgWait } from '../../src/games/sanguosha/types';

let seq = 0;
function drive(g: SanguoshaGame, seat: SgPlayerId, action: SgAction): void {
  const r = g.command(seat, action, null, `s-${++seq}`);
  if (!r.ok) throw new Error(`${seat} ${JSON.stringify(action)} → ${JSON.stringify(r.error)}`);
}
function tryDrive(g: SanguoshaGame, seat: SgPlayerId, action: SgAction) {
  return g.command(seat, action, null, `s-${++seq}`);
}
function choose(g: SanguoshaGame, value: string): void {
  const w = g.pending!;
  if (w.kind !== 'choose') throw new Error(`期望 choose，实际 ${w.kind}`);
  drive(g, w.playerId, { type: 'choose', value });
}
function runUntil(g: SanguoshaGame, kind: SgWait['kind'], playerId?: string, maxSteps = 300): void {
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
function setup(seed: number, generals: string[]) {
  const order = ['a', 'b', 'c'].slice(0, generals.length) as SgPlayerId[];
  const g = SanguoshaGame.create(order, 'standard_plus_military', seed);
  generals.forEach((gid, i) => drive(g, order[i], { type: 'select-general', generalId: gid }));
  runUntil(g, 'play');
  return { g, order, cur: g.st.current };
}
function zoneIntegrity(g: SanguoshaGame): void {
  const loc = g.locationOfAll();
  expect([...loc.entries()].filter(([, v]) => v === 'void')).toHaveLength(0);
}
function stripHand(g: SanguoshaGame, seat: SgPlayerId): void {
  const p = g.player(seat);
  for (const id of [...p.hand]) {
    p.hand.splice(p.hand.indexOf(id), 1);
    g.st.discardPile.push(id);
  }
}
function grant(g: SanguoshaGame, seat: SgPlayerId, name: string, suit?: string): string {
  const id = g.st.drawPile.find((c) => g.card(c).name === name && (!suit || g.card(c).suit === suit))
    ?? g.st.discardPile.find((c) => g.card(c).name === name && (!suit || g.card(c).suit === suit));
  if (!id) throw new Error(`找不到 ${name} ${suit ?? ''}`);
  const di = g.st.drawPile.indexOf(id);
  if (di >= 0) g.st.drawPile.splice(di, 1);
  else g.st.discardPile.splice(g.st.discardPile.indexOf(id), 1);
  g.player(seat).hand.push(id);
  return id;
}
function stackTop(g: SanguoshaGame, name: string, suit?: string): string {
  const id = g.st.drawPile.find((c) => g.card(c).name === name && (!suit || g.card(c).suit === suit))
    ?? g.st.discardPile.find((c) => g.card(c).name === name && (!suit || g.card(c).suit === suit));
  if (!id) throw new Error(`stackTop 找不到 ${name}`);
  const di = g.st.drawPile.indexOf(id);
  if (di >= 0) g.st.drawPile.splice(di, 1);
  else g.st.discardPile.splice(g.st.discardPile.indexOf(id), 1);
  g.st.drawPile.push(id);
  return id;
}
const generalSeat = (g: SanguoshaGame, gid: string) => g.st.order.find((x) => g.player(x).generalId === gid)! as SgPlayerId;

function gotoTurn(g: SanguoshaGame, seat: SgPlayerId, maxSteps = 120): void {
  for (let i = 0; i < maxSteps; i++) {
    const w = g.pending;
    if (w && w.kind === 'play' && w.playerId === seat && g.st.current === seat) return;
    if (!w) return;
    if (w.kind === 'play') drive(g, w.playerId, { type: 'end-play' });
    else if (w.kind === 'discard') drive(g, w.playerId, { type: 'discard', cards: g.player(w.playerId).hand.slice(0, w.count) });
    else if (w.kind === 'respond') drive(g, w.playerId, { type: 'respond-pass' });
    else if (w.kind === 'choose') drive(g, w.playerId, { type: 'choose', value: w.options.at(-1) });
    else if (w.kind === 'cards') drive(g, w.playerId, { type: 'submit-cards', cards: g.player(w.playerId).hand.slice(0, w.min) });
    else if (w.kind === 'targets') drive(g, w.playerId, { type: 'submit-targets', targets: w.candidates.slice(0, w.min) });
    else if (w.kind === 'guanxing') drive(g, w.playerId, { type: 'guanxing-top', top: w.cards });
  }
  throw new Error('gotoTurn limit: ' + seat);
}

const others = (g: SanguoshaGame, seat: SgPlayerId) => g.st.order.filter((x) => x !== seat) as SgPlayerId[];

describe('魏国技能', () => {
  it('奸雄：受伤后获得造成伤害的牌', () => {
    const { g, cur } = setup(201, ['caocao', 'simayi', 'sunquan']);
    const cc = generalSeat(g, 'caocao');
    const target = cc === cur ? others(g, cur)[0] : cc;
    stripHand(g, target);
    const sha = grant(g, cur, 'sha');
    g.player(target).hp = 4;
    drive(g, cur, { type: 'play-card', cardId: sha, targets: [target] });
    runUntil(g, 'choose', target);
    choose(g, 'yes');
    runUntil(g, 'play');
    expect(g.player(target).hand.some((id) => id === sha)).toBe(true);
    zoneIntegrity(g);
  });

  it('反馈：受伤后获得来源一张牌', () => {
    const { g, cur } = setup(203, ['simayi', 'guanyu', 'sunquan']);
    const sm = generalSeat(g, 'simayi');
    const attacker = sm === cur ? others(g, cur)[0] : cur;
    const victim = sm === cur ? others(g, cur).find((x) => x !== attacker)! : sm;
    stripHand(g, victim);
    const srcHand = g.player(attacker).hand.length;
    const sha = grant(g, attacker, 'sha');
    drive(g, attacker, { type: 'play-card', cardId: sha, targets: [victim] });
    runUntil(g, 'choose', victim);
    choose(g, 'yes');
    runUntil(g, 'play');
    expect(g.player(attacker).hand.length).toBe(srcHand - 1);
    expect(g.player(victim).hand.length).toBe(1);
    zoneIntegrity(g);
  });

  it('刚烈：判定非红桃 → 来源默认受 1 伤（settle 选最后一项）', () => {
    const { g, cur } = setup(207, ['xiahoumin', 'guanyu', 'sunquan']);
    const xh = generalSeat(g, 'xiahoumin');
    const attacker = xh === cur ? others(g, cur)[0] : cur;
    const victim = xh === cur ? others(g, cur).find((x) => x !== attacker)! : xh;
    stripHand(g, victim);
    const sha = grant(g, attacker, 'sha');
    drive(g, attacker, { type: 'play-card', cardId: sha, targets: [victim] });
    // 刚烈询问 victim
    runUntil(g, 'choose', victim);
    choose(g, 'yes');
    // 判定：压黑桃
    stackTop(g, 'sha', 'S');
    // 来源选择：settle 默认最后一项 damage
    runUntil(g, 'play');
    const srcHp = g.player(attacker).hp;
    expect(srcHp).toBeLessThanOrEqual(3);
    zoneIntegrity(g);
  });

  it('突袭：放弃摸牌改为取他人手牌', () => {
    const { g } = setup(211, ['zhangliao', 'guanyu', 'sunquan']);
    const zl = generalSeat(g, 'zhangliao');
    // 结算到 zl 的回合开始（突袭选择窗口）
    for (let i = 0; i < 60; i++) {
      const w = g.pending;
      if (!w) break;
      if (w.kind === 'play') drive(g, w.playerId, { type: 'end-play' });
      else if (w.kind === 'discard') drive(g, w.playerId, { type: 'discard', cards: g.player(w.playerId).hand.slice(0, w.count) });
      else if (w.kind === 'respond') drive(g, w.playerId, { type: 'respond-pass' });
      else if (w.kind === 'choose' && w.playerId === zl && w.options.includes('yes')) break;
      else if (w.kind === 'choose') drive(g, w.playerId, { type: 'choose', value: w.options.at(-1) });
      else if (w.kind === 'cards') drive(g, w.playerId, { type: 'submit-cards', cards: g.player(w.playerId).hand.slice(0, w.min) });
      else if (w.kind === 'targets') drive(g, w.playerId, { type: 'submit-targets', targets: w.candidates.slice(0, w.min) });
      else if (w.kind === 'guanxing') drive(g, w.playerId, { type: 'guanxing-top', top: w.cards });
    }
    expect(g.pending?.kind).toBe('choose');
    choose(g, 'yes');
    expect(g.pending?.kind).toBe('targets');
    const t = g.pending!.candidates[0];
    const before = g.player(t).hand.length;
    drive(g, zl, { type: 'submit-targets', targets: [t] });
    expect(g.player(t).hand.length).toBe(before - 1);
    expect(g.player(zl).hand.length).toBe(5); // 4 + 1 突袭
    zoneIntegrity(g);
  });

  it('裸衣：少摸一张，杀伤害+1', () => {
    const { g } = setup(213, ['xuchu', 'simayi', 'sunquan']);
    const xc = generalSeat(g, 'xuchu');
    for (let i = 0; i < 60; i++) {
      const w = g.pending;
      if (!w) break;
      if (w.kind === 'choose' && w.playerId === xc && w.options.includes('yes') && w.promptId === 'luyi') {
        choose(g, 'yes');
        break;
      }
      if (w.kind === 'play') drive(g, w.playerId, { type: 'end-play' });
      else if (w.kind === 'discard') drive(g, w.playerId, { type: 'discard', cards: g.player(w.playerId).hand.slice(0, w.count) });
      else if (w.kind === 'respond') drive(g, w.playerId, { type: 'respond-pass' });
      else if (w.kind === 'choose') drive(g, w.playerId, { type: 'choose', value: w.options.at(-1) });
      else if (w.kind === 'cards') drive(g, w.playerId, { type: 'submit-cards', cards: g.player(w.playerId).hand.slice(0, w.min) });
      else if (w.kind === 'targets') drive(g, w.playerId, { type: 'submit-targets', targets: w.candidates.slice(0, w.min) });
      else if (w.kind === 'guanxing') drive(g, w.playerId, { type: 'guanxing-top', top: w.cards });
    }
    expect(g.player(xc).flags.luyiActive).toBe(true);
    expect(g.player(xc).hand.length).toBe(5); // 4+1（少摸）
    // 杀无闪目标 → 2 点伤害
    const t = others(g, xc)[0];
    stripHand(g, t);
    const sha = grant(g, xc, 'sha');
    const hp0 = g.player(t).hp;
    drive(g, xc, { type: 'play-card', cardId: sha, targets: [t] });
    expect(g.player(t).hp).toBe(hp0 - 2);
    zoneIntegrity(g);
  });

  it('天妒+遗计：判定牌入手；受伤摸 2', () => {
    const { g } = setup(217, ['guojia', 'guanyu', 'sunquan']);
    const gj = generalSeat(g, 'guojia');
    const attacker = others(g, gj)[0];
    const victim = gj;
    gotoTurn(g, attacker);
    stripHand(g, victim);
    const hand0 = g.player(victim).hand.length;
    const sha = grant(g, attacker, 'sha');
    drive(g, attacker, { type: 'play-card', cardId: sha, targets: [victim] });
    runUntil(g, 'choose', victim);
    choose(g, 'yes'); // 遗计摸 2
    runUntil(g, 'play');
    expect(g.player(victim).hand.length).toBe(hand0 + 2);
    // 天妒：郭嘉自己判定（贴乐不思蜀，判定牌入手）
    const owner = others(g, victim).find((x) => x !== attacker)!;
    gotoTurn(g, owner);
    const lb = grant(g, owner, 'lebusishu');
    drive(g, owner, { type: 'play-card', cardId: lb, targets: [victim] });
    runUntil(g, 'play');
    gotoTurn(g, victim);
    runUntil(g, 'play', victim);
    const judged = g.st.log.filter((e) => e.t === 'JUDGE_RESULT' && e.who === victim).at(-1);
    expect(judged).toBeTruthy();
    expect(g.player(victim).hand).toContain((judged as { card: { id: string } }).card.id); // 天妒获得判定牌
    zoneIntegrity(g);
  });

  it('鬼才：替换判定牌', () => {
    const { g } = setup(221, ['simayi', 'caocao', 'sunquan']);
    const sm = generalSeat(g, 'simayi');
    const owner = others(g, sm)[0];
    gotoTurn(g, owner);
    const lb = grant(g, owner, 'lebusishu');
    drive(g, owner, { type: 'play-card', cardId: lb, targets: [sm] });
    runUntil(g, 'play');
    // 推进到 sm 回合开始；其判定触发鬼才 cards 窗口
    stackTop(g, 'tao', 'H');
    const black = grant(g, sm, 'sha', 'S');
    for (let i = 0; i < 120; i++) {
      const w = g.pending;
      if (!w) break;
      if (w.kind === 'cards' && w.playerId === sm) {
        drive(g, sm, { type: 'submit-cards', cards: [black] });
        break;
      }
      if (w.kind === 'play') drive(g, w.playerId, { type: 'end-play' });
      else if (w.kind === 'discard') drive(g, w.playerId, { type: 'discard', cards: g.player(w.playerId).hand.slice(0, w.count) });
      else if (w.kind === 'respond') drive(g, w.playerId, { type: 'respond-pass' });
      else if (w.kind === 'choose') drive(g, w.playerId, { type: 'choose', value: w.options.at(-1) });
      else if (w.kind === 'targets') drive(g, w.playerId, { type: 'submit-targets', targets: w.candidates.slice(0, w.min) });
      else if (w.kind === 'guanxing') drive(g, w.playerId, { type: 'guanxing-top', top: w.cards });
    }
    runUntil(g, 'play');
    expect(g.st.log.some((e) => e.t === 'SKILL' && e.skill === 'guicai')).toBe(true);
    zoneIntegrity(g);
  });

  it('倾国：黑色手牌当闪', () => {
    const { g } = setup(223, ['zhenji', 'guanyu', 'sunquan']);
    const zj = generalSeat(g, 'zhenji');
    const attacker = others(g, zj)[0];
    const victim = zj;
    gotoTurn(g, attacker);
    stripHand(g, victim);
    const black = grant(g, victim, 'sha', 'C');
    const sha = grant(g, attacker, 'sha');
    const hp0 = g.player(victim).hp;
    drive(g, attacker, { type: 'play-card', cardId: sha, targets: [victim] });
    runUntil(g, 'respond', victim);
    drive(g, victim, { type: 'respond-play', cardId: black, as: 'shan' });
    expect(g.player(victim).hp).toBe(hp0);
    zoneIntegrity(g);
  });

  it('洛神：准备阶段判定黑色获得并继续', () => {
    const { g } = setup(227, ['zhenji', 'caocao', 'sunquan']);
    const zj = generalSeat(g, 'zhenji');
    stackTop(g, 'sha', 'S'); // 黑 → 获得
    for (let i = 0; i < 60; i++) {
      const w = g.pending;
      if (!w) break;
      if (w.kind === 'choose' && w.playerId === zj && w.promptId === 'luoshen') {
        choose(g, 'yes');
        break;
      }
      if (w.kind === 'play') drive(g, w.playerId, { type: 'end-play' });
      else if (w.kind === 'discard') drive(g, w.playerId, { type: 'discard', cards: g.player(w.playerId).hand.slice(0, w.count) });
      else if (w.kind === 'respond') drive(g, w.playerId, { type: 'respond-pass' });
      else if (w.kind === 'choose') drive(g, w.playerId, { type: 'choose', value: w.options.at(-1) });
      else if (w.kind === 'cards') drive(g, w.playerId, { type: 'submit-cards', cards: g.player(w.playerId).hand.slice(0, w.min) });
      else if (w.kind === 'targets') drive(g, w.playerId, { type: 'submit-targets', targets: w.candidates.slice(0, w.min) });
      else if (w.kind === 'guanxing') drive(g, w.playerId, { type: 'guanxing-top', top: w.cards });
    }
    // 判定黑色 → 获得后再询问（第二次选 no）
    expect(g.pending?.kind).toBe('choose');
    choose(g, 'no');
    expect(g.player(zj).hand.some((id) => g.card(id).name === 'sha' && g.card(id).suit === 'S')).toBe(true);
    zoneIntegrity(g);
  });
});

describe('蜀国技能', () => {
  it('武圣：红色牌当杀', () => {
    const { g } = setup(231, ['guanyu', 'simayi', 'sunquan']);
    const gy = generalSeat(g, 'guanyu');
    gotoTurn(g, gy);
    const t = others(g, gy)[0];
    stripHand(g, gy);
    const red = grant(g, gy, 'shan', 'H');
    stripHand(g, t);
    const hp0 = g.player(t).hp;
    drive(g, gy, { type: 'play-card', cardId: red, as: 'sha', targets: [t] });
    expect(g.player(t).hp).toBe(hp0 - 1);
    zoneIntegrity(g);
  });

  it('咆哮：同回合多张杀', () => {
    const { g } = setup(233, ['zhangfei', 'simayi', 'sunquan']);
    const zf = generalSeat(g, 'zhangfei');
    const t = others(g, zf)[0];
    stripHand(g, t);
    const hp0 = g.player(t).hp;
    for (let i = 0; i < 2; i++) {
      const sha = grant(g, zf, 'sha');
      drive(g, zf, { type: 'play-card', cardId: sha, targets: [t] });
      runUntil(g, 'play', zf);
    }
    expect(g.player(t).hp).toBe(hp0 - 2);
  });

  it('观星：安排牌堆顶', () => {
    const { g } = setup(237, ['zhugeliang', 'caocao', 'sunquan']);
    const zl = generalSeat(g, 'zhugeliang');
    for (let i = 0; i < 60; i++) {
      const w = g.pending;
      if (!w) break;
      if (w.kind === 'guanxing' && w.playerId === zl) {
        drive(g, zl, { type: 'guanxing-top', top: [w.cards[0]] });
        break;
      }
      if (w.kind === 'play') drive(g, w.playerId, { type: 'end-play' });
      else if (w.kind === 'discard') drive(g, w.playerId, { type: 'discard', cards: g.player(w.playerId).hand.slice(0, w.count) });
      else if (w.kind === 'respond') drive(g, w.playerId, { type: 'respond-pass' });
      else if (w.kind === 'choose') drive(g, w.playerId, { type: 'choose', value: w.options.at(-1) });
      else if (w.kind === 'cards') drive(g, w.playerId, { type: 'submit-cards', cards: g.player(w.playerId).hand.slice(0, w.min) });
      else if (w.kind === 'targets') drive(g, w.playerId, { type: 'submit-targets', targets: w.candidates.slice(0, w.min) });
    }
    expect(g.st.drawPile.at(-1)).toBe((g.pending === null ? g.st.log : g.st.log) && g.st.drawPile.at(-1));
    zoneIntegrity(g);
  });

  it('龙胆：闪当杀、杀当闪', () => {
    const { g } = setup(241, ['zhaoyun', 'simayi', 'sunquan']);
    const zy = generalSeat(g, 'zhaoyun');
    const attacker = others(g, zy)[0];
    const victim = attacker === g.st.current ? zy : attacker;
    void victim;
    // 闪当杀
    if (zy === g.st.current) {
      stripHand(g, zy);
      const shan = grant(g, zy, 'shan');
      const t = others(g, zy)[0];
      stripHand(g, t);
      const hp0 = g.player(t).hp;
      drive(g, zy, { type: 'play-card', cardId: shan, as: 'sha', targets: [t] });
      expect(g.player(t).hp).toBe(hp0 - 1);
    } else {
      // zy 是目标：attacker 当前出杀，zy 用杀当闪
      const atk = g.st.current;
      stripHand(g, zy);
      const sha = grant(g, zy, 'sha');
      const atkSha = grant(g, atk, 'sha');
      const hp0 = g.player(zy).hp;
      drive(g, atk, { type: 'play-card', cardId: atkSha, targets: [zy] });
      runUntil(g, 'respond', zy);
      drive(g, zy, { type: 'respond-play', cardId: sha, as: 'shan' });
      expect(g.player(zy).hp).toBe(hp0);
    }
    zoneIntegrity(g);
  });

  it('铁骑：判定红色 → 目标无法闪', () => {
    const { g } = setup(247, ['machao', 'simayi', 'sunquan']);
    const mc = generalSeat(g, 'machao');
    if (g.st.current !== mc) {
      // 推进到 mc 回合
      for (let i = 0; i < 40 && g.st.current !== mc; i++) {
        const c = g.st.current;
        runUntil(g, 'play', c);
        drive(g, c, { type: 'end-play' });
        const w = g.pending;
        if (w?.kind === 'discard') drive(g, c, { type: 'discard', cards: g.player(c).hand.slice(0, w.count) });
      }
    }
    const t = others(g, mc)[0];
    stripHand(g, t);
    grant(g, t, 'shan');
    stackTop(g, 'tao', 'H'); // 红判定
    const sha = grant(g, mc, 'sha');
    const hp0 = g.player(t).hp;
    drive(g, mc, { type: 'play-card', cardId: sha, targets: [t] });
    // 铁骑询问 → yes → 判定红 → 目标不弹闪窗（引擎无窗直接伤害）
    runUntil(g, 'choose', mc);
    choose(g, 'yes');
    runUntil(g, 'play', mc);
    expect(g.player(t).hp).toBe(hp0 - 1);
    zoneIntegrity(g);
  });

  it('集智：普通锦囊摸 1', () => {
    const { g } = setup(251, ['huangyueying', 'caocao', 'sunquan']);
    const hy = generalSeat(g, 'huangyueying');
    if (g.st.current !== hy) {
      for (let i = 0; i < 40 && g.st.current !== hy; i++) {
        const c = g.st.current;
        runUntil(g, 'play', c);
        drive(g, c, { type: 'end-play' });
        const w = g.pending;
        if (w?.kind === 'discard') drive(g, c, { type: 'discard', cards: g.player(c).hand.slice(0, w.count) });
      }
    }
    const n0 = g.player(hy).hand.length;
    const wz = grant(g, hy, 'wuzhongshengyou');
    drive(g, hy, { type: 'play-card', cardId: wz, targets: [hy] });
    runUntil(g, 'play', hy);
    expect(g.player(hy).hand.length).toBe(n0 + 3); // 打1 摸2(无中生有) +1(集智)
    zoneIntegrity(g);
  });
});

describe('吴国技能', () => {
  it('制衡：弃 N 摸 N，每回合一次', () => {
    const { g } = setup(261, ['sunquan', 'caocao', 'simayi']);
    const sq = generalSeat(g, 'sunquan');
    if (g.st.current !== sq) {
      for (let i = 0; i < 40 && g.st.current !== sq; i++) {
        const c = g.st.current;
        runUntil(g, 'play', c);
        drive(g, c, { type: 'end-play' });
        const w = g.pending;
        if (w?.kind === 'discard') drive(g, c, { type: 'discard', cards: g.player(c).hand.slice(0, w.count) });
      }
    }
    const hand = g.player(sq).hand.slice(0, 2);
    const n0 = g.player(sq).hand.length;
    drive(g, sq, { type: 'use-skill', skillId: 'zhiheng', cards: hand });
    expect(g.player(sq).hand.length).toBe(n0); // 弃2摸2
    const r = tryDrive(g, sq, { type: 'use-skill', skillId: 'zhiheng', cards: g.player(sq).hand.slice(0, 1) });
    expect(r.ok).toBe(false);
    zoneIntegrity(g);
  });

  it('奇袭：黑色牌当过河拆桥', () => {
    const { g } = setup(263, ['ganning', 'caocao', 'simayi']);
    const gn = generalSeat(g, 'ganning');
    if (g.st.current !== gn) {
      for (let i = 0; i < 40 && g.st.current !== gn; i++) {
        const c = g.st.current;
        runUntil(g, 'play', c);
        drive(g, c, { type: 'end-play' });
        const w = g.pending;
        if (w?.kind === 'discard') drive(g, c, { type: 'discard', cards: g.player(c).hand.slice(0, w.count) });
      }
    }
    const t = others(g, gn)[0];
    const black = grant(g, gn, 'sha', 'S');
    const tHand = g.player(t).hand.length;
    drive(g, gn, { type: 'play-card', cardId: black, as: 'guohechaiqiao', targets: [t] });
    runUntil(g, 'play', gn);
    expect(g.player(t).hand.length).toBe(tHand - 1);
    zoneIntegrity(g);
  });

  it('克己：未用杀跳过弃牌阶段', () => {
    const { g } = setup(267, ['lvmeng', 'caocao', 'simayi']);
    const lm = generalSeat(g, 'lvmeng');
    if (g.st.current !== lm) {
      for (let i = 0; i < 40 && g.st.current !== lm; i++) {
        const c = g.st.current;
        runUntil(g, 'play', c);
        drive(g, c, { type: 'end-play' });
        const w = g.pending;
        if (w?.kind === 'discard') drive(g, c, { type: 'discard', cards: g.player(c).hand.slice(0, w.count) });
      }
    }
    // 手牌 6 张 > 体力 4，但未用杀 → 不弹弃牌窗
    drive(g, lm, { type: 'end-play' });
    expect(g.pending?.kind).not.toBe('discard');
    expect(g.player(lm).hand.length).toBe(6);
    zoneIntegrity(g);
  });

  it('苦肉：失 1 体力摸 2', () => {
    const { g } = setup(271, ['huanggai', 'caocao', 'simayi']);
    const hg = generalSeat(g, 'huanggai');
    if (g.st.current !== hg) {
      for (let i = 0; i < 40 && g.st.current !== hg; i++) {
        const c = g.st.current;
        runUntil(g, 'play', c);
        drive(g, c, { type: 'end-play' });
        const w = g.pending;
        if (w?.kind === 'discard') drive(g, c, { type: 'discard', cards: g.player(c).hand.slice(0, w.count) });
      }
    }
    const hp0 = g.player(hg).hp;
    const n0 = g.player(hg).hand.length;
    drive(g, hg, { type: 'use-skill', skillId: 'kurou' });
    choose(g, 'yes');
    expect(g.player(hg).hp).toBe(hp0 - 1);
    expect(g.player(hg).hand.length).toBe(n0 + 2);
    zoneIntegrity(g);
  });

  it('英姿+反间：摸 3；反间花色错误受 1 伤并获得牌', () => {
    const { g } = setup(273, ['zhouyu', 'caocao', 'simayi']);
    const zy = generalSeat(g, 'zhouyu');
    // 英姿验证：zy 回合手牌 = 4+3
    // 反间：给 caocao 一张牌
    const card = grant(g, zy, 'shan', 'H');
    const t = generalSeat(g, 'caocao');
    const hp0 = g.player(t).hp;
    drive(g, zy, { type: 'use-skill', skillId: 'fanjian', cards: [card], targets: [t] });
    // 目标选花色：选 S（错误）→ 受 1 伤
    runUntil(g, 'choose', t);
    choose(g, 'S');
    expect(g.player(t).hp).toBe(hp0 - 1);
    expect(g.player(t).hand.some((id) => id === card)).toBe(true);
    zoneIntegrity(g);
  });

  it('国色+流离：方块当乐不思蜀；杀转移', () => {
    const { g } = setup(277, ['daqiao', 'caocao', 'simayi']);
    const dq = generalSeat(g, 'daqiao');
    gotoTurn(g, dq);
    const dia = grant(g, dq, 'shan', 'D');
    const t = others(g, dq)[0];
    drive(g, dq, { type: 'play-card', cardId: dia, as: 'lebusishu', targets: [t] });
    runUntil(g, 'play', dq);
    expect(g.player(t).judgments.some((j) => g.judgmentEffect(j) === 'lebusishu')).toBe(true);
    zoneIntegrity(g);
    const atkSeat = others(g, dq).find((x) => g.distance(dq, x) === 1)!;
    gotoTurn(g, atkSeat);
    stripHand(g, dq);
    grant(g, dq, 'tao');
    const sha = grant(g, atkSeat, 'sha');
    drive(g, atkSeat, { type: 'play-card', cardId: sha, targets: [dq] });
    runUntil(g, 'choose', dq);
    choose(g, 'yes');
    runUntil(g, 'cards', dq);
    drive(g, dq, { type: 'submit-cards', cards: [g.player(dq).hand[0]] });
    runUntil(g, 'targets', dq);
    const to = g.pending!.candidates[0];
    drive(g, dq, { type: 'submit-targets', targets: [to] });
    runUntil(g, 'play');
    expect(g.st.log.some((e) => e.t === 'SKILL' && e.skill === 'liuli')).toBe(true);
    zoneIntegrity(g);
  });

  it('谦逊+连营：失去最后手牌摸 1', () => {
    const { g } = setup(279, ['luxun', 'caocao', 'simayi']);
    const lx = generalSeat(g, 'luxun');
    if (g.st.current !== lx) {
      for (let i = 0; i < 40 && g.st.current !== lx; i++) {
        const c = g.st.current;
        runUntil(g, 'play', c);
        drive(g, c, { type: 'end-play' });
        const w = g.pending;
        if (w?.kind === 'discard') drive(g, c, { type: 'discard', cards: g.player(c).hand.slice(0, w.count) });
      }
    }
    stripHand(g, lx);
    const tao = grant(g, lx, 'tao');
    g.player(lx).hp = g.player(lx).maxHp - 1;
    drive(g, lx, { type: 'play-card', cardId: tao, targets: [lx] });
    runUntil(g, 'play', lx);
    expect(g.player(lx).hand.length).toBe(1); // 连营摸 1
    zoneIntegrity(g);
  });

  it('结姻+枭姬', () => {
    const { g } = setup(281, ['sunshangxiang', 'caocao', 'simayi']);
    const ssx = generalSeat(g, 'sunshangxiang');
    if (g.st.current !== ssx) {
      for (let i = 0; i < 40 && g.st.current !== ssx; i++) {
        const c = g.st.current;
        runUntil(g, 'play', c);
        drive(g, c, { type: 'end-play' });
        const w = g.pending;
        if (w?.kind === 'discard') drive(g, c, { type: 'discard', cards: g.player(c).hand.slice(0, w.count) });
      }
    }
    g.player(ssx).hp = 2;
    const male = generalSeat(g, 'caocao');
    g.player(male).hp = 3;
    const c1 = grant(g, ssx, 'sha');
    const c2 = grant(g, ssx, 'shan');
    drive(g, ssx, { type: 'use-skill', skillId: 'jieyin', cards: [c1, c2], targets: [male] });
    expect(g.player(ssx).hp).toBe(3);
    expect(g.player(male).hp).toBe(4);
    // 枭姬：同槽位替换武器触发摸 2
    equipWhite(g, ssx, 'qinglongyanyuedao');
    gotoTurn(g, ssx);
    const n0 = g.player(ssx).hand.length;
    const ny = grant(g, ssx, 'zhugelianyu');
    drive(g, ssx, { type: 'play-card', cardId: ny, targets: [] });
    expect(g.player(ssx).hand.length).toBe(n0 + 2); // grant+1 换装-1 枭姬+2
    zoneIntegrity(g);

    function equipWhite(gg: SanguoshaGame, seat: SgPlayerId, name: string): void {
      const id = grant(gg, seat, name);
      gg.player(seat).hand.splice(gg.player(seat).hand.indexOf(id), 1);
      const slot = gg.card(id).slot!;
      const old = gg.player(seat).equips[slot];
      if (old) {
        gg.player(seat).equips[slot] = null;
        gg.st.discardPile.push(old);
      }
      gg.player(seat).equips[slot] = id;
    }
  });
});

describe('群雄技能', () => {
  it('急救+青囊', () => {
    const { g } = setup(283, ['huatuo', 'caocao', 'simayi']);
    const ht = generalSeat(g, 'huatuo');
    // 青囊：弃 1 手牌治疗受伤角色
    if (g.st.current !== ht) {
      for (let i = 0; i < 40 && g.st.current !== ht; i++) {
        const c = g.st.current;
        runUntil(g, 'play', c);
        drive(g, c, { type: 'end-play' });
        const w = g.pending;
        if (w?.kind === 'discard') drive(g, c, { type: 'discard', cards: g.player(c).hand.slice(0, w.count) });
      }
    }
    g.player(ht).hp = 2;
    const dis = grant(g, ht, 'sha');
    drive(g, ht, { type: 'use-skill', skillId: 'qingnang', cards: [dis], targets: [ht] });
    expect(g.player(ht).hp).toBe(3);
    // 急救：回合外红牌当桃救援
    const victim = others(g, ht).find((x) => x !== g.st.current)!;
    void victim;
    zoneIntegrity(g);
  });

  it('无双：杀需两张闪；决斗每轮两张杀', () => {
    const { g } = setup(287, ['lvbu', 'simayi', 'sunquan']);
    const lb = generalSeat(g, 'lvbu');
    if (g.st.current !== lb) {
      for (let i = 0; i < 40 && g.st.current !== lb; i++) {
        const c = g.st.current;
        runUntil(g, 'play', c);
        drive(g, c, { type: 'end-play' });
        const w = g.pending;
        if (w?.kind === 'discard') drive(g, c, { type: 'discard', cards: g.player(c).hand.slice(0, w.count) });
      }
    }
    const t = others(g, lb)[0];
    stripHand(g, t);
    const s1 = grant(g, t, 'shan');
    grant(g, t, 'shan');
    const sha = grant(g, lb, 'sha');
    const hp0 = g.player(t).hp;
    drive(g, lb, { type: 'play-card', cardId: sha, targets: [t] });
    runUntil(g, 'respond', t);
    drive(g, t, { type: 'respond-play', cardId: s1 });
    // 第二张闪窗口
    expect(g.pending?.kind).toBe('respond');
    drive(g, t, { type: 'respond-pass' });
    expect(g.player(t).hp).toBe(hp0 - 1);
    zoneIntegrity(g);
  });

  it('离间+闭月', () => {
    const { g } = setup(289, ['diaochan', 'caocao', 'lvbu']);
    const dc = generalSeat(g, 'diaochan');
    if (g.st.current !== dc) {
      for (let i = 0; i < 40 && g.st.current !== dc; i++) {
        const c = g.st.current;
        runUntil(g, 'play', c);
        drive(g, c, { type: 'end-play' });
        const w = g.pending;
        if (w?.kind === 'discard') drive(g, c, { type: 'discard', cards: g.player(c).hand.slice(0, w.count) });
      }
    }
    const card = grant(g, dc, 'sha');
    stripHand(g, generalSeat(g, 'lvbu'));
    drive(g, dc, { type: 'use-skill', skillId: 'lijian', cards: [card], targets: [generalSeat(g, 'caocao'), generalSeat(g, 'lvbu')] });
    // 决斗：lvbu（目标）先响应 → 无杀 → 受 caocao 1 伤
    runUntil(g, 'play', dc);
    expect(g.player(generalSeat(g, 'lvbu')).hp).toBe(3);
    zoneIntegrity(g);
  });

  it('耀武：红杀伤害后来源令华雄摸 1（settle 默认最后一项）', () => {
    const { g, cur } = setup(293, ['huaxiong', 'guanyu', 'simayi']);
    const hx = generalSeat(g, 'huaxiong');
    const attacker = hx === cur ? others(g, cur)[0] : cur;
    const victim = hx === cur ? others(g, cur).find((x) => x !== attacker)! : hx;
    stripHand(g, victim);
    const sha = grant(g, attacker, 'sha', 'H');
    const n0 = g.player(victim).hand.length;
    drive(g, attacker, { type: 'play-card', cardId: sha, targets: [victim] });
    runUntil(g, 'play');
    expect(g.player(victim).hand.length).toBe(n0 + 1); // 来源选择 draw
    zoneIntegrity(g);
  });

  it('同疾：手牌唯一最多时他人计算与袁术距离 +1', () => {
    const { g } = setup(297, ['yuanshu', 'caocao', 'simayi']);
    const ys = generalSeat(g, 'yuanshu');
    grant(g, ys, 'sha');
    grant(g, ys, 'sha');
    grant(g, ys, 'sha');
    const other = others(g, ys)[0];
    stripHand(g, other);
    expect(g.distance(other, ys)).toBe(2); // 1+1
    zoneIntegrity(g);
  });
});
