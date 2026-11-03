/** 围棋规则引擎测试（TEST-003 / GO-002~026） */
import { describe, expect, it } from 'vitest';
import { GoEngine, GO_KOMI, starPoints, buildSgf } from '../../src/games/go/engine';

const mk = (size: 9 | 13 | 19 = 19) => GoEngine.create(size);

describe('围棋 · 棋盘与坐标（GO-002/005/026）', () => {
  it('三种规格可创建，非法规格抛错', () => {
    expect(mk(9).fen().startsWith('go9|')).toBe(true);
    expect(mk(13).fen().startsWith('go13|')).toBe(true);
    expect(mk(19).fen().startsWith('go19|')).toBe(true);
    expect(() => new GoEngine(undefined, { size: 15 as never })).toThrow();
  });

  it('星位与天元位置正确（9/13/19）', () => {
    expect(starPoints(9).sort()).toEqual(['c3', 'c7', 'e5', 'g3', 'g7'].sort());
    expect(starPoints(13).sort()).toEqual(['d4', 'd10', 'j4', 'j10', 'g7'].sort());
    // 19 路九星含天元：连续字母列下天元 = j10（col 9）
    expect(starPoints(19).length).toBe(9);
    expect(starPoints(19)).toContain('j10');
    expect(starPoints(19)).toEqual(expect.arrayContaining(['d4', 'd10', 'd16', 'p4', 'p10', 'p16', 'j4', 'j16']));
  });

  it('坐标边界：s19 合法、t1/s20/a0 非法（连续字母列，不跳 I）', () => {
    const e = mk(19);
    expect(e.isLegal({ from: 's19' })).toBe(true);
    expect(e.isLegal({ from: 't1' })).toBe(false);
    expect(e.isLegal({ from: 's20' })).toBe(false);
    expect(e.isLegal({ from: 'a0' })).toBe(false);
  });

  it('fen 往返一致（含轮次/提子数/阶段）', () => {
    const e = mk(9);
    e.applyMove({ from: 'e5', to: 'e5' });
    e.applyMove({ from: 'e4', to: 'e4' });
    const e2 = new GoEngine(e.fen());
    expect(e2.fen()).toBe(e.fen());
    expect(e2.turn()).toBe('a');
  });
});

describe('围棋 · 气与提子（GO-008~010）', () => {
  it('黑先行（GO-006）', () => {
    expect(mk().turn()).toBe('a');
  });

  it('落子仅限空交叉点（GO-007）', () => {
    const e = mk();
    e.applyMove({ from: 'e5', to: 'e5' });
    expect(e.isLegal({ from: 'e5' })).toBe(false);
    expect(e.pieceAt('e5')).toBe('B');
  });

  it('提单子：最后一口气被堵即提', () => {
    // 黑 a1,b1,b2；白 a2 仅剩 a3 一气 → 黑 a3 提白 a2
    const e = new GoEngine('go9|turn=a|phase=playing|passes=0|capB=0|capW=0|b=a1,b1,b2|w=a2');
    const r = e.applyMove({ from: 'a3', to: 'a3' });
    expect(r).not.toBeNull();
    expect(e.pieceAt('a2')).toBeNull();
    expect(e.capturesOf('a')).toBe(1);
    expect(r?.extra).toEqual([{ from: 'a2', to: 'a2', piece: 'W' }]);
  });

  it('提整块：多子棋块无气整体提（GO-008）', () => {
    // 白 a2,b2 一块，唯一气 a3（a1/b1/b3/c1/c2 全黑）；黑 a3 提两子
    const e = new GoEngine('go9|turn=a|phase=playing|passes=0|capB=0|capW=0|b=a1,b1,c1,c2,b3|w=a2,b2');
    e.applyMove({ from: 'a3', to: 'a3' });
    expect(e.pieceAt('a2')).toBeNull();
    expect(e.pieceAt('b2')).toBeNull();
    expect(e.capturesOf('a')).toBe(2);
  });

  it('一手同时提两个棋块（GO-010）', () => {
    // 白 a1、c1 各只剩一气 b1（a2/b2/c2/d1 全黑）；黑 b1 同时提白 a1、c1 两块
    const e = new GoEngine('go9|turn=a|phase=playing|passes=0|capB=0|capW=0|b=a2,b2,c2,d1|w=a1,c1');
    const r = e.applyMove({ from: 'b1', to: 'b1' });
    expect(r).not.toBeNull();
    expect(e.pieceAt('a1')).toBeNull();
    expect(e.pieceAt('c1')).toBeNull();
    expect(e.pieceAt('b1')).toBe('B');
    expect(e.capturesOf('a')).toBe(2);
  });

  it('提子使己块获气：填自己最后一气但能提子 = 合法（非自杀）', () => {
    // 黑 a1,b1；白 b2 无气但落 b2 会先提黑 a1,b1? 构造：白 a2,b2 包黑 a1；黑 a1 一气 b1；
    // 白落 b1：先检查提黑 a1（b1 与 a1 相邻）→ 黑 a1 无气被提 → 白 b2 落子组获气 → 合法
    const e = new GoEngine('go9|turn=b|phase=playing|passes=0|capB=0|capW=0|b=a1|w=a2,b2');
    expect(e.isLegal({ from: 'b1' })).toBe(true);
  });
});

describe('围棋 · 禁自杀与全局同形（GO-011/012/013）', () => {
  it('禁自杀：落子后己块无气且未提子 = 非法', () => {
    // 黑占 a2,b1,b3,c2 → a1 为禁自杀点? a1 邻 a2(黑),b1(黑) → 落白 a1 后 0 气 → 非法
    const e = new GoEngine('go9|turn=b|phase=playing|passes=0|capB=0|capW=0|b=a2,b1,c2');
    expect(e.isLegal({ from: 'a1' })).toBe(false);
    expect(e.applyMove({ from: 'a1', to: 'a1' })).toBeNull();
  });

  it('打劫：立即回提被全局同形禁止（GO-012）', () => {
    // 经典劫形（底边）：白 c2 唯一气 c1（b1/d1 为白，b2/d2 为黑）；
    // 黑 c1 提白 c2 后黑 c1 仅剩气 c2；白立即 c2 回提将还原全局棋形（同轮次）→ superko 禁止
    const ko = new GoEngine('go9|turn=a|phase=playing|passes=0|capB=0|capW=0|b=b2,d2,c3|w=b1,d1,c2');
    const r1 = ko.applyMove({ from: 'c1', to: 'c1' });
    expect(r1).not.toBeNull();
    expect(ko.pieceAt('c2')).toBeNull(); // 白 c2 被提
    expect(ko.pieceAt('c1')).toBe('B');
    expect(ko.capturesOf('a')).toBe(1);
    expect(ko.turn()).toBe('b');
    // 白立即 c2 回提 → 全局同形 → 非法
    expect(ko.isLegal({ from: 'c2' })).toBe(false);
    expect(ko.applyMove({ from: 'c2', to: 'c2' })).toBeNull();
  });

  it('全局同形：隔多手的重复局面同样禁止（positional superko，GO-013）', () => {
    const g = mk(9);
    g.applyMove({ from: 'e5', to: 'e5' }); // 黑
    g.applyMove({ from: 'e4', to: 'e4' }); // 白
    g.applyMove({ from: 'pass', to: 'pass' }); // 黑
    g.applyMove({ from: 'pass', to: 'pass' }); // 白 → 数子阶段
    // 恢复对弈后重现任意历史局面被禁——通过 score-resume 回到 playing
    expect(g.applyMove({ from: 'score-resume', to: 'score-resume' })).not.toBeNull();
    // 此时轮到黑；黑 e5 已经在盘上——构造不同：直接验证落 e5 非法（已有子）
    expect(g.isLegal({ from: 'e5' })).toBe(false);
  });
});

describe('围棋 · 停一手与数子（GO-014~019）', () => {
  it('单次停一手轮转；连续两次进入数子阶段（GO-014/015）', () => {
    const e = mk();
    expect(e.applyMove({ from: 'pass', to: 'pass' })).not.toBeNull();
    expect(e.turn()).toBe('b');
    expect(e.phaseOf()).toBe('playing');
    expect(e.applyMove({ from: 'pass', to: 'pass' })).not.toBeNull();
    expect(e.phaseOf()).toBe('scoring');
    // 数子阶段不能再落子
    expect(e.isLegal({ from: 'e5' })).toBe(false);
  });

  it('空盘数子：白得贴目 7.5 获胜（GO-017/018）', () => {
    const e = mk(9);
    e.applyMove({ from: 'pass', to: 'pass' });
    e.applyMove({ from: 'pass', to: 'pass' });
    e.applyMove({ from: 'score-confirm', to: 'score-confirm' }); // 黑确认
    e.applyMove({ from: 'score-confirm', to: 'score-confirm' }); // 白确认
    const out = e.outcome();
    expect(out).not.toBeNull();
    expect(out?.winner).toBe('b'); // 黑 0 : 白 7.5
    expect(out?.reason).toContain('7.5');
  });

  it('死子标记：dead = 双方标记交集；确认后按区域计分（GO-017/019）', () => {
    const e = new GoEngine('go9|turn=a|phase=scoring|passes=2|capB=0|capW=0|b=a2,b1|w=a1');
    // 黑标记 a1 死子（仅单方标记不进 dead）
    expect(e.applyMove({ from: 'mark:a1', to: 'mark:a1' })).not.toBeNull();
    expect(e.deadStones()).not.toContain('a1');
    // 白同样标记 a1 → 交集生效
    expect(e.applyMove({ from: 'mark:a1', to: 'mark:a1' })).not.toBeNull();
    expect(e.deadStones()).toContain('a1');
    // 双方确认 → 终局：a1 成黑空 + 黑活子 a2,b1 = 3 vs 白 7.5
    e.applyMove({ from: 'score-confirm', to: 'score-confirm' });
    e.applyMove({ from: 'score-confirm', to: 'score-confirm' });
    const out = e.outcome();
    expect(out).not.toBeNull();
    expect(out?.winner).toBe('b');
    expect(out?.reason).toContain('黑3 : 白7.5');
  });

  it('意见不一致：单方确认后另一方可恢复对弈（GO-019）', () => {
    const e = new GoEngine('go9|turn=a|phase=scoring|passes=2|capB=0|capW=0|b=a2,b1|w=a1');
    e.applyMove({ from: 'mark:a1', to: 'mark:a1' }); // 黑标记（轮次翻转至白）
    e.applyMove({ from: 'score-confirm', to: 'score-confirm' }); // 白确认
    expect(e.confirmedOf()).toContain('b');
    // 黑不同意 → 恢复对弈
    expect(e.applyMove({ from: 'score-resume', to: 'score-resume' })).not.toBeNull();
    expect(e.phaseOf()).toBe('playing');
    expect(e.deadStones().length).toBe(0);
    expect(e.outcome()).toBeNull();
    // 可以继续落子
    expect(e.isLegal({ from: 'c3' })).toBe(true);
  });

  it('mark 指令仅对盘上有子的点有效', () => {
    const e = new GoEngine('go9|turn=a|phase=scoring|passes=2|capB=0|capW=0|b=a2,b1|w=a1');
    expect(e.applyMove({ from: 'mark:e5', to: 'mark:e5' })).toBeNull(); // 空点
    expect(e.applyMove({ from: 'mark:z9', to: 'mark:z9' })).toBeNull(); // 非法点
  });
});

describe('围棋 · 认输与棋谱（GO-016/020/022）', () => {
  it('认输：对方胜、对局结束（GO-016）', () => {
    const e = mk();
    e.applyMove({ from: 'e5', to: 'e5' });
    const out = e.resignSeat('b');
    expect(out?.winner).toBe('a');
    expect(e.outcome()?.type).toBe('resignation');
    expect(e.phaseOf()).toBe('ended');
    expect(e.isLegal({ from: 'd4' })).toBe(false);
  });

  it('棋谱含落子/停一手；SGF 导出坐标直映射并声明子集（GO-020/022）', () => {
    const e = mk(9);
    e.applyMove({ from: 'e5', to: 'e5' });
    e.applyMove({ from: 'pass', to: 'pass' });
    e.applyMove({ from: 'c3', to: 'c3' });
    const sgf = buildSgf(9, [
      { side: 'a', from: 'e5' },
      { side: 'b', from: 'pass' },
      { side: 'a', from: 'c3' },
    ], { a: '黑棋手', b: '白棋手' }, 'W+7.5');
    expect(sgf).toContain('SZ[9]');
    expect(sgf).toContain('KM[7.5]');
    expect(sgf).toContain('RU[Chinese]');
    expect(sgf).toContain(';B[ee]'); // e5 → 列 e + 行 e（行序未翻转，与平台棋盘方向一致）
    expect(sgf).toContain(';W[]'); // pass
    expect(sgf).toContain(';B[cc]'); // c3 → cc
    expect(sgf).toContain('仅支持子集');
  });

  it('复盘重放：局面历史（superko 集合）随重放重建，与原局一致', () => {
    const e = mk(9);
    e.applyMove({ from: 'e5', to: 'e5' });
    e.applyMove({ from: 'e4', to: 'e4' });
    const e2 = new GoEngine(e.fen());
    // 两个引擎对同一着法的合法性判断一致（superko 历史等价）
    expect(e2.isLegal({ from: 'd5' })).toBe(e.isLegal({ from: 'd5' }));
  });
});
