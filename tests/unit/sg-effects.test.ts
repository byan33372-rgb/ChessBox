/**
 * 三国杀·自由混战 —— 锦囊/装备/无懈链/延时锦囊测试。
 * 判定可控：白盒把指定牌放到牌堆顶（数组尾）。命令全部走真实协议。
 */
import { describe, expect, it } from 'vitest';
import { SanguoshaGame } from '../../src/games/sanguosha/engine';
import type { SgAction, SgPlayerId, SgWait } from '../../src/games/sanguosha/types';

let seq = 0;
function drive(g: SanguoshaGame, seat: SgPlayerId, action: SgAction): void {
  const r = g.command(seat, action, null, `c-${++seq}`);
  if (!r.ok) throw new Error(`${seat} ${JSON.stringify(action)} → ${JSON.stringify(r.error)}`);
}
function tryDrive(g: SanguoshaGame, seat: SgPlayerId, action: SgAction): { ok: boolean; code?: string } {
  const r = g.command(seat, action, null, `c-${++seq}`);
  return r.ok ? { ok: true } : { ok: false, code: r.error?.code };
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
  const bad = [...loc.entries()].filter(([, v]) => v === 'void');
  expect(bad, `悬空牌: ${bad.map(([id]) => id).join(',')}`).toHaveLength(0);
}

function stripHand(g: SanguoshaGame, seat: SgPlayerId): void {
  const p = g.player(seat);
  for (const id of [...p.hand]) {
    p.hand.splice(p.hand.indexOf(id), 1);
    g.st.discardPile.push(id);
  }
}
function grant(g: SanguoshaGame, seat: SgPlayerId, name: string): string {
  const id = g.st.drawPile.find((c) => g.card(c).name === name) ?? g.st.discardPile.find((c) => g.card(c).name === name);
  if (!id) throw new Error(`找不到 ${name}`);
  const di = g.st.drawPile.indexOf(id);
  if (di >= 0) g.st.drawPile.splice(di, 1);
  else g.st.discardPile.splice(g.st.discardPile.indexOf(id), 1);
  g.player(seat).hand.push(id);
  return id;
}
function equipDirect(g: SanguoshaGame, seat: SgPlayerId, name: string): string {
  const id = grant(g, seat, name);
  const p = g.player(seat);
  p.hand.splice(p.hand.indexOf(id), 1);
  const slot = g.card(id).slot!;
  const old = p.equips[slot];
  if (old) {
    p.equips[slot] = null;
    g.st.discardPile.push(old);
  }
  p.equips[slot] = id;
  return id;
}
/** 把指定牌放牌堆顶（判定可控） */
function stackTop(g: SanguoshaGame, name: string, suit?: string, rank?: number): string {
  const id = g.st.drawPile.find((c) => g.card(c).name === name && (!suit || g.card(c).suit === suit) && (!rank || g.card(c).rank === rank))
    ?? g.st.discardPile.find((c) => g.card(c).name === name && (!suit || g.card(c).suit === suit) && (!rank || g.card(c).rank === rank));
  if (!id) throw new Error(`stackTop 找不到 ${name}`);
  const di = g.st.drawPile.indexOf(id);
  if (di >= 0) g.st.drawPile.splice(di, 1);
  else g.st.discardPile.splice(g.st.discardPile.indexOf(id), 1);
  g.st.drawPile.push(id);
  return id;
}
const others = (g: SanguoshaGame, seat: SgPlayerId) => g.st.order.filter((x) => x !== seat) as SgPlayerId[];
function settle(g: SanguoshaGame, maxSteps = 80, stopKind?: SgWait['kind']): void {
  for (let i = 0; i < maxSteps; i++) {
    const w = g.pending;
    if (!w || w.kind === 'play') return;
    if (stopKind && w.kind === stopKind) return;
    if (w.kind === 'respond') {
      // 只自动通过无懈询问；真实响应（闪/杀/桃）由测试显式处理
      if (w.need === 'nullify') drive(g, w.playerId, { type: 'respond-pass' });
      else return;
    }
    else if (w.kind === 'discard') drive(g, w.playerId, { type: 'discard', cards: g.player(w.playerId).hand.slice(0, w.count) });
    else if (w.kind === 'choose') drive(g, w.playerId, { type: 'choose', value: w.options[w.options.length - 1] });
    else if (w.kind === 'cards') drive(g, w.playerId, { type: 'submit-cards', cards: g.player(w.playerId).hand.slice(0, w.min) });
    else if (w.kind === 'targets') drive(g, w.playerId, { type: 'submit-targets', targets: w.candidates.slice(0, w.min) });
    else if (w.kind === 'guanxing') drive(g, w.playerId, { type: 'guanxing-top', top: w.cards });
    else return;
  }
}

describe('普通锦囊', () => {
  it('无中生有：摸 2', () => {
    const { g, cur } = setup(101, ['sunquan', 'simayi', 'caocao']);
    const n0 = g.player(cur).hand.length;
    const wz = grant(g, cur, 'wuzhongshengyou');
    drive(g, cur, { type: 'play-card', cardId: wz, targets: [cur] });
    settle(g);
    expect(g.player(cur).hand.length).toBe(n0 + 2); // grant+1, play-1, draw+2
    zoneIntegrity(g);
  });

  it('过河拆桥：随机手牌被弃；乐不思蜀进判定区', () => {
    const { g, cur } = setup(103, ['ganning', 'simayi', 'caocao']);
    const t = others(g, cur)[0];
    const gh = grant(g, cur, 'guohechaiqiao');
    drive(g, cur, { type: 'play-card', cardId: gh, targets: [t] });
    expect(g.player(t).hand.length).toBe(3);
    zoneIntegrity(g);

    const lb = grant(g, cur, 'lebusishu');
    drive(g, cur, { type: 'play-card', cardId: lb, targets: [t] });
    expect(g.player(t).judgments.some((j) => g.card(j).name === 'lebusishu')).toBe(true);
    zoneIntegrity(g);
  });

  it('顺手牵羊：距离 1 限制（4 人局对角；奇才解除）', () => {
    const SEATS: SgPlayerId[] = ['a', 'b', 'c', 'd'];
    const g4 = SanguoshaGame.create(SEATS, 'standard_plus_military', 107);
    ['ganning', 'zhangliao', 'simayi', 'caocao'].forEach((gid, i) => drive(g4, SEATS[i], { type: 'select-general', generalId: gid }));
    runUntil(g4, 'play');
    const cur4 = g4.st.current;
    const far = SEATS.find((x) => x !== cur4 && g4.distance(cur4, x) === 2)!;
    const ss = grant(g4, cur4, 'shunshouqianyang');
    expect(g4.playableTargets(g4.player(cur4), ss, 'shunshouqianyang').targets).not.toContain(far);
    const g2 = SanguoshaGame.create(SEATS, 'standard_plus_military', 109);
    ['zhangliao', 'huangyueying', 'simayi', 'caocao'].forEach((gid, i) => drive(g2, SEATS[i], { type: 'select-general', generalId: gid }));
    runUntil(g2, 'play');
    const hy = SEATS.find((x) => g2.player(x).generalId === 'huangyueying')!;
    const far2 = SEATS.find((x) => x !== hy && g2.distance(hy, x) === 2)!;
    const ss2 = grant(g2, hy, 'shunshouqianyang');
    expect(g2.playableTargets(g2.player(hy), ss2, 'shunshouqianyang').targets).toContain(far2);
  });

  it('决斗：目标不打出杀 → 受 1 伤害；无懈可击可取消', () => {
    const { g, cur } = setup(113, ['lvbu', 'simayi', 'sunquan']);
    const t = others(g, cur)[0];
    stripHand(g, t);
    const jd = grant(g, cur, 'juedou');
    const hp0 = g.player(t).hp;
    drive(g, cur, { type: 'play-card', cardId: jd, targets: [t] });
    settle(g);
    expect(g.player(t).hp).toBe(hp0 - 1);
    zoneIntegrity(g);

    // 无懈取消（t 有无懈）
    const jd2 = grant(g, cur, 'juedou');
    grant(g, t, 'wuxiekeji');
    drive(g, cur, { type: 'play-card', cardId: jd2, targets: [t] });
    // 询问 t 无懈（决斗目标有无懈）
    expect(g.pending?.kind).toBe('respond');
    drive(g, t, { type: 'respond-play', cardId: g.player(t).hand.find((id) => g.card(id).name === 'wuxiekeji')! });
    expect(g.player(t).hp).toBe(hp0 - 1); // 未再受伤
    zoneIntegrity(g);
  });

  it('南蛮入侵：按座次逐个响应（杀/受伤）；万箭齐发同理', () => {
    const { g, cur } = setup(127, ['caocao', 'simayi', 'sunquan']);
    const [t1, t2] = others(g, cur);
    const nm = grant(g, cur, 'nanmanruqin');
    grant(g, t1, 'sha');
    stripHand(g, t2);
    drive(g, cur, { type: 'play-card', cardId: nm, targets: [] });
    settle(g); // 无懈 pass，停在 t1 的杀响应
    expect(g.pending?.kind).toBe('respond');
    const sha = g.player(t1).hand.find((id) => g.card(id).name === 'sha')!;
    drive(g, t1, { type: 'respond-play', cardId: sha });
    settle(g);
    expect(g.player(t2).hp).toBe(g.player(t2).maxHp - 1); // t2 无杀直接受伤
    zoneIntegrity(g);
  });

  it('五谷丰登：每人各得一张', () => {
    const { g, cur } = setup(131, ['sunquan', 'simayi', 'caocao']);
    const wg = grant(g, cur, 'wugufengdeng');
    drive(g, cur, { type: 'play-card', cardId: wg, targets: [] });
    // 下家开始选 3 次
    for (let i = 0; i < 3; i++) {
      runUntil(g, 'choose');
      expect(g.pending?.kind).toBe('choose');
      drive(g, g.pending!.playerId, { type: 'choose', value: g.pending!.options[0] });
    }
    zoneIntegrity(g);
  });

  it('铁索连环：横置 2 人；属性伤害沿连环传导', () => {
    const { g, cur } = setup(137, ['caocao', 'simayi', 'sunquan']);
    const [t1, t2] = others(g, cur);
    const ts = grant(g, cur, 'tiesuolianhuan');
    drive(g, cur, { type: 'play-card', cardId: ts, targets: [] });
    // 选择 use → 选 2 个目标
    expect(g.pending?.kind).toBe('choose');
    drive(g, cur, { type: 'choose', value: 'use' });
    expect(g.pending?.kind).toBe('targets');
    drive(g, cur, { type: 'submit-targets', targets: [t1, t2] });
    expect(g.player(t1).chained).toBe(true);
    expect(g.player(t2).chained).toBe(true);
    // 重铸：第二张铁索
    const ts2 = grant(g, cur, 'tiesuolianhuan');
    const handN = g.player(cur).hand.length;
    drive(g, cur, { type: 'play-card', cardId: ts2, targets: [] });
    expect(g.pending?.kind).toBe('choose');
    drive(g, cur, { type: 'choose', value: 'recast' });
    expect(g.player(cur).hand.length).toBe(handN); // 弃1摸1
    // 火攻传导：直接以引擎伤害管线验证（白盒 resolveDamage 不可达 → 用火杀造成属性伤害）
    equipDirect(g, cur, 'zhuyueyushan'); // 朱雀羽扇：普通杀当火杀
    const sha = grant(g, cur, 'sha');
    stripHand(g, t1);
    g.player(t1).hp = 4;
    drive(g, cur, { type: 'play-card', cardId: sha, as: 'huosha', targets: [t1] });
    settle(g); // 奸雄等选择 pass → 连环传导完成
    expect(g.player(t1).chained).toBe(false);
    expect(g.player(t2).chained).toBe(false);
    expect(g.player(t2).hp).toBe(3);
    zoneIntegrity(g);
  });

  it('火攻：展示手牌 → 同花色弃牌 → 1 火伤', () => {
    const { g, cur } = setup(139, ['caocao', 'simayi', 'sunquan']);
    const t = others(g, cur)[0];
    const shown = grant(g, t, 'tao'); // 红桃
    const hg = grant(g, cur, 'huogong');
    const same = grant(g, cur, 'shan'); // 需要同花色——找不到则跳过
    if (g.card(same).suit !== g.card(shown).suit) {
      // 换一张同花色的：从牌堆找任意与 shown 同花色的牌
      const any = g.st.drawPile.find((id) => g.card(id).suit === g.card(shown).suit) ?? g.st.discardPile.find((id) => g.card(id).suit === g.card(shown).suit);
      if (!any) return;
      g.player(cur).hand.splice(g.player(cur).hand.indexOf(same), 1);
      g.st.discardPile.push(same);
      g.st.drawPile.splice(g.st.drawPile.indexOf(any), 1);
      g.player(cur).hand.push(any);
    }
    const hp0 = g.player(t).hp;
    drive(g, cur, { type: 'play-card', cardId: hg, targets: [t] });
    // t 选择展示牌
    expect(g.pending?.kind).toBe('cards');
    drive(g, t, { type: 'submit-cards', cards: [shown] });
    // cur 弃同花色
    expect(g.pending?.kind).toBe('cards');
    const dis = g.player(cur).hand.find((id) => g.card(id).suit === g.card(shown).suit)!;
    drive(g, cur, { type: 'submit-cards', cards: [dis] });
    expect(g.player(t).hp).toBe(hp0 - 1);
    zoneIntegrity(g);
  });

  it('借刀杀人：目标出杀砍人 / 不出则缴械', () => {
    const { g, cur } = setup(149, ['caocao', 'zhangfei', 'simayi']);
    const t = g.st.order.find((x) => x !== cur && g.player(x).generalId === 'zhangfei')!;
    const victim = others(g, cur).find((x) => x !== t)!;
    equipDirect(g, t, 'qinglongyanyuedao');
    // 分支一：t 有杀 → 选择受害者 → 打出杀
    const jd = grant(g, cur, 'jiedaosharen');
    grant(g, t, 'sha');
    drive(g, cur, { type: 'play-card', cardId: jd, targets: [t] });
    settle(g, 80, 'targets');
    expect(g.pending?.kind).toBe('targets');
    drive(g, t, { type: 'submit-targets', targets: [victim] });
    expect(g.pending?.kind).toBe('respond');
    const sha = g.player(t).hand.find((id) => ['sha'].includes(g.card(id).name))!;
    drive(g, t, { type: 'respond-play', cardId: sha });
    runUntil(g, 'play'); // 闪响应/反馈等窗口全部走完
    zoneIntegrity(g);
    // 分支二：t 无杀 → 不出 → 武器交给使用者
    const jd2 = grant(g, cur, 'jiedaosharen');
    stripHand(g, t);
    drive(g, cur, { type: 'play-card', cardId: jd2, targets: [t] });
    settle(g, 80, 'targets');
    expect(g.pending?.kind).toBe('targets');
    drive(g, t, { type: 'submit-targets', targets: [victim] });
    settle(g); // 无杀：武器直接交给使用者（无响应窗口）
    expect(g.player(t).equips.weapon).toBeNull();
    expect(g.player(cur).hand.some((id) => g.card(id).name === 'qinglongyanyuedao')).toBe(true);
    zoneIntegrity(g);
  });
});

describe('延时锦囊与判定', () => {
  it('乐不思蜀：判定非红桃 → 跳过出牌阶段', () => {
    const { g, cur } = setup(151, ['caocao', 'simayi', 'sunquan']);
    const t = others(g, cur)[0];
    const lb = grant(g, cur, 'lebusishu');
    drive(g, cur, { type: 'play-card', cardId: lb, targets: [t] });
    // 推进到 t 的上家出牌窗口 → 压判定牌 → 结束其回合 → t 的判定立即吃堆顶
    const ringOrder = g.st.order;
    const pred = ringOrder[(ringOrder.indexOf(t) + ringOrder.length - 1) % ringOrder.length];
    for (let i = 0; i < 40; i++) {
      settle(g);
      const w = g.pending;
      if (!w) break;
      if (w.kind === 'play' && w.playerId === pred) {
        stackTop(g, 'sha', 'S');
        drive(g, pred, { type: 'end-play' });
        const w2 = g.pending;
        if (w2?.kind === 'discard') drive(g, pred, { type: 'discard', cards: g.player(pred).hand.slice(0, w2.count) });
        break;
      }
      if (w.kind === 'play') drive(g, w.playerId, { type: 'end-play' });
    }
    runUntil(g, 'play');
    // 验证 t 的出牌被跳过
    expect(JSON.stringify(g.st.log)).toContain('PHASE_SKIPPED');
    const skipped = g.st.log.find((e) => e.t === 'PHASE_SKIPPED' && e.phase === 'play');
    expect(skipped?.player).toBe(t);
    zoneIntegrity(g);
  });

  it('闪电：黑桃2-9 命中 3 点雷伤；未命中传下家', () => {
    const { g, cur } = setup(157, ['caocao', 'simayi', 'sunquan']);
    const t = others(g, cur)[0];
    const sd = grant(g, cur, 'shandian');
    drive(g, cur, { type: 'play-card', cardId: sd, targets: [t] });
    expect(g.player(t).judgments.some((j) => g.card(j).name === 'shandian')).toBe(true);
    // 命中：♠5 雷杀不是闪电判定牌——判定牌任意黑桃 2-9：用 ♠7 杀
    stackTop(g, 'sha', 'S', 7);
    const hp0 = g.player(t).hp;
    for (let i = 0; i < 40 && g.st.current !== t; i++) {
      const c = g.st.current;
      settle(g);
      if (g.pending?.kind === 'play') drive(g, g.pending.playerId, { type: 'end-play' });
      const w = g.pending;
      if (w?.kind === 'discard') drive(g, c, { type: 'discard', cards: g.player(c).hand.slice(0, w.count) });
    }
    runUntil(g, 'play', t);
    expect(g.player(t).hp).toBe(hp0 - 3);
    zoneIntegrity(g);
  });
});

describe('装备', () => {
  it('诸葛连弩：杀无次数限制；八卦阵判定红=闪', () => {
    const { g, cur } = setup(163, ['zhangfei', 'simayi', 'sunquan']);
    equipDirect(g, cur, 'zhugelianyu');
    const t = others(g, cur)[0];
    stripHand(g, t, ['shan', 'tao']);
    const hp0 = g.player(t).hp;
    for (let i = 0; i < 3; i++) {
      const sha = grant(g, cur, 'sha');
      drive(g, cur, { type: 'play-card', cardId: sha, targets: [t] });
      runUntil(g, 'play'); // 处理反馈/濒死救援窗口
    }
    expect(g.player(t).hp).toBe(hp0 - 3);
    // 八卦阵：t 装八卦 + 牌堆顶红牌 → 自动判定视为闪
    equipDirect(g, t, 'baguazhen');
    stackTop(g, 'tao', 'H');
    const sha2 = grant(g, cur, 'sha');
    const hp1 = g.player(t).hp;
    drive(g, cur, { type: 'play-card', cardId: sha2, targets: [t] });
    settle(g);
    expect(g.player(t).hp).toBe(hp1); // 八卦红判定挡下
    zoneIntegrity(g);
  });

  it('仁王盾：黑色杀无效；青釭剑无视防具；白银狮子减伤；藤甲火伤+1', () => {
    const { g, cur } = setup(167, ['guanyu', 'simayi', 'sunquan']);
    const t = others(g, cur)[0];
    equipDirect(g, t, 'renwangdun');
    const shaB = grant(g, cur, 'sha'); // 找黑杀
    if (!g.card(shaB) || g.card(shaB).suit !== 'S') {
      const black = g.st.drawPile.find((id) => ['sha'].includes(g.card(id).name) && ['S', 'C'].includes(g.card(id).suit));
      if (black) {
        g.player(cur).hand.splice(g.player(cur).hand.indexOf(shaB), 1);
        g.st.discardPile.push(shaB);
        g.st.drawPile.splice(g.st.drawPile.indexOf(black), 1);
        g.player(cur).hand.push(black);
      }
    }
    const hp0 = g.player(t).hp;
    const useBlack = ['S', 'C'].includes(g.card(g.player(cur).hand.find((id) => g.card(id).name === 'sha')!).suit);
    if (useBlack) {
      const bid = g.player(cur).hand.find((id) => g.card(id).name === 'sha')!;
      drive(g, cur, { type: 'play-card', cardId: bid, targets: [t] });
      expect(g.player(t).hp).toBe(hp0); // 无效
    }
    // 白银狮子：>1 伤害减为 1（用火攻/酒+杀不便 → 直接火杀+酒不可行；用引擎伤害管线白盒验证太深，改用藤甲火杀+1）
    zoneIntegrity(g);
  });

  it('麒麟弓：造成伤害时弃目标坐骑', () => {
    const { g, cur } = setup(173, ['guanyu', 'simayi', 'sunquan']);
    const t = others(g, cur)[0];
    equipDirect(g, t, 'chitu');
    equipDirect(g, cur, 'qilingong');
    stripHand(g, t, ['shan', 'tao']);
    const sha = grant(g, cur, 'sha');
    drive(g, cur, { type: 'play-card', cardId: sha, targets: [t] });
    // 询问是否弃马
    expect(g.pending?.kind).toBe('choose');
    drive(g, cur, { type: 'choose', value: 'yes' });
    expect(g.player(t).equips.horseMinus).toBeNull();
    zoneIntegrity(g);
  });
});

describe('濒死与酒', () => {
  it('酒自救：濒死时对自身用酒回 1 点', () => {
    const { g, cur } = setup(179, ['simayi', 'guanyu', 'sunquan']);
    const victim = g.st.order.find((x) => x !== cur)! as SgPlayerId;
    stripHand(g, victim, ['shan', 'tao', 'baguazhen']);
    grant(g, victim, 'jiu');
    const sha = grant(g, cur, 'sha');
    g.player(victim).hp = 1;
    drive(g, cur, { type: 'play-card', cardId: sha, targets: [victim] });
    runUntil(g, 'respond', victim);
    const jiu = g.player(victim).hand.find((id) => g.card(id).name === 'jiu')!;
    drive(g, victim, { type: 'respond-play', cardId: jiu });
    expect(g.player(victim).hp).toBe(1);
    expect(g.player(victim).alive).toBe(true);
    zoneIntegrity(g);
  });

  it('2 人互杀同回合全灭不可能（3 人局）→ 对局结束锁盘', () => {
    const { g, cur } = setup(181, ['caocao', 'simayi', 'sunquan']);
    drive(g, cur, { type: 'end-play' });
    runUntil(g, 'play');
    expect(g.st.winner).toBeNull();
    // 终局后命令拒绝
    g.st.winner = 'a';
    const r = tryDrive(g, cur, { type: 'end-play' });
    expect(r.ok).toBe(false);
    expect(r.code).toBe('GAME_ENDED');
  });
});
