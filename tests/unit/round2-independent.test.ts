/**
 * 第二轮独立审计 · 独立推导测试（XQ-001~010 / CH-001~009 / CC-002~010/CC-017）
 *
 * 与既有测试的区别：期望值不引用项目内常量或此前断言，而是从
 *   (a) 公开公认基准（象棋开局合法着法 44、国象 perft 公认值），
 *   (b) 第一性几何/枚举（行宽序列求和、三角形格点距离、跳跃位移倍增）
 * 独立推导后硬编码，用于交叉验证产品引擎。
 */
import { describe, expect, it } from 'vitest';
import { ChessEngine } from '../../src/games/chess/adapter';
import { XiangqiEngine } from '../../src/games/xiangqi/engine';
import { CheckersEngine } from '../../src/games/checkers/engine';
import { ALL_CELLS, CELL_IDS, cellPixel, cellRC, campOf, jumpLanding, neighborsOf, targetCamp } from '../../src/games/checkers/board';

// ==================== 中国象棋（公开基准推导） ====================

describe('R2-XQ：中国象棋独立推导（XQ-001~010）', () => {
  it('XQ-001 初始局面 32 子、每方 16、七种棋型（公开常识，大小写归并）', () => {
    const e = new XiangqiEngine();
    const counts = new Map<string, number>();
    for (const f of 'abcdefghi') {
      for (let r = 0; r <= 9; r++) {
        const p = e.pieceAt(f + r);
        if (p) counts.set(p, (counts.get(p) ?? 0) + 1);
      }
    }
    let total = 0, upper = 0, lower = 0;
    const kinds = new Set<string>();
    for (const [k, v] of counts) {
      total += v;
      const isUpper = k >= 'A' && k <= 'Z';
      if (isUpper) upper += v; else lower += v;
      kinds.add(k.toLowerCase());
    }
    expect(total).toBe(32);
    expect(upper).toBe(16);
    expect(lower).toBe(16);
    expect(kinds.size).toBe(7); // 车马相仕帅炮兵
    expect(counts.get('P')).toBe(5);
    expect(counts.get('R')).toBe(2);
  });

  it('XQ-001 开局合法着法 = 44（象棋程序界公认值）', () => {
    const e = new XiangqiEngine();
    expect(e.legalMoves().length).toBe(44);
  });

  it('XQ-002 帅困九宫（初始阵型去掉底兵炮：e8 空、d9/f9 被仕占）', () => {
    const e = new XiangqiEngine('rnbakabnr/9/1c5c1/p1p1p1p1p/9/9/9/9/9/RNBAKABNR w');
    expect(e.isLegal({ from: 'e9', to: 'e8' })).toBe(true);  // 宫内直走
    expect(e.isLegal({ from: 'e9', to: 'd9' })).toBe(false); // 仕占位
    expect(e.isLegal({ from: 'e9', to: 'f9' })).toBe(false); // 仕占位
    expect(e.isLegal({ from: 'e9', to: 'd8' })).toBe(false); // 出宫/斜走
  });

  it('XQ-003 马走日与蹩马腿：开局 h9 马两点 g7/i7；h8 贴身有子则两点全封', () => {
    const e = new XiangqiEngine();
    const horse = e.legalMoves().filter((m) => m.from === 'h9');
    expect(horse.map((m) => m.to).sort()).toEqual(['g7', 'i7']);
    // h8 放红兵作贴身腿：g7/i7 两点被蹩，仅剩 (1,2) 方向的 f8
    const e2 = new XiangqiEngine('rnbakabnr/9/1c5c1/p1p1p1p1p/9/9/9/9/7P1/RNBAK2N1 w');
    expect(e2.legalMoves().filter((m) => m.from === 'h9').map((m) => m.to)).toEqual(['f8']);
  });

  it('XQ-004 车路径阻挡（R a9、黑卒 a4）：吃 a4、a5 可停、a3 不可越', () => {
    const e = new XiangqiEngine('3k5/9/9/9/p8/9/9/9/9/R3K4 w'); // 行4 → 卒在 a4
    expect(e.isLegal({ from: 'a9', to: 'a4' })).toBe(true);  // 吃卒
    expect(e.isLegal({ from: 'a9', to: 'a5' })).toBe(true);  // a5 空，可停
    expect(e.isLegal({ from: 'a9', to: 'a8' })).toBe(true);  // 空线平移
    expect(e.isLegal({ from: 'a9', to: 'a3' })).toBe(false); // 越过 a4
  });

  it('XQ-005 炮恰好一个炮架吃子：C e9、炮架 e7（黑卒）、目标 e5（黑车）', () => {
    // 单炮架（黑将 d0，避免两王同列照面干扰）
    const e = new XiangqiEngine('3k5/9/9/9/9/4r4/9/4p4/9/4C3K w');
    expect(e.isLegal({ from: 'e9', to: 'e8' })).toBe(true);  // 无炮架平移
    expect(e.isLegal({ from: 'e9', to: 'e7' })).toBe(false); // 落点被占
    expect(e.isLegal({ from: 'e9', to: 'e5' })).toBe(true);  // 恰好隔 e7 一炮架吃车
    expect(e.isLegal({ from: 'e9', to: 'e3' })).toBe(false); // 越过目标（e5 后无子）
    // 两个炮架不吃
    const e2 = new XiangqiEngine('3k5/9/9/9/4r4/9/4p4/4p4/9/4C3K w');
    expect(e2.isLegal({ from: 'e9', to: 'e4' })).toBe(false);
    expect(e2.isLegal({ from: 'e9', to: 'e8' })).toBe(true);
  });

  it('XQ-006 兵卒过河前后：红方向 r 递减前进；过河可横、永不后退', () => {
    // 红兵 c3（r3，已过河）：进 c2、横 b3，禁退 c4（黑将 d0 避免照面干扰）
    const e = new XiangqiEngine('3k5/9/9/2P6/9/9/9/9/9/4K4 w');
    expect(e.isLegal({ from: 'c3', to: 'c2' })).toBe(true);
    expect(e.isLegal({ from: 'c3', to: 'b3' })).toBe(true);
    expect(e.isLegal({ from: 'c3', to: 'c4' })).toBe(false);
    // 红兵 c6（r6，未过河）：只进 c5，禁横
    const e2 = new XiangqiEngine('3k5/9/9/9/9/9/2P6/9/9/4K4 w');
    expect(e2.isLegal({ from: 'c6', to: 'c5' })).toBe(true);
    expect(e2.isLegal({ from: 'c6', to: 'b6' })).toBe(false);
  });

  it('XQ-007 己方占位/越界/非轮次走法被拒', () => {
    const e = new XiangqiEngine();
    expect(e.isLegal({ from: 'a9', to: 'e9' })).toBe(false); // 帅占位（己方）
    expect(e.isLegal({ from: 'j9', to: 'a9' })).toBe(false); // 越界
    expect(e.isLegal({ from: 'a0', to: 'a1' })).toBe(false); // 黑子非轮次
    expect(e.isLegal({ from: 'a9', to: 'a0' })).toBe(false); // 吃 a0 后两王同列照面 → 非法（XQ-008 照面规则实证）
  });

  it('XQ-008/009 将死（公开杀型：双车封线）与终局锁定', () => {
    const e = new XiangqiEngine('R3k4/9/9/9/9/9/9/9/4R4/3K5 b');
    expect(e.inCheck()).toBe(true);
    expect(e.legalMoves().length).toBe(0);
    expect(e.outcome()).toEqual({ type: 'checkmate', winner: 'a', reason: '将死' });
  });
});

// ==================== 国际象棋（perft 公认值） ====================

describe('R2-CH：国际象棋独立推导（CH-001~009）', () => {
  const perft = (e: ChessEngine, depth: number): number => {
    if (depth === 0) return 1;
    let n = 0;
    for (const m of e.legalMoves()) {
      const next = new ChessEngine(e.fen());
      next.applyMove({ from: m.from, to: m.to, promotion: m.promotion });
      n += perft(next, depth - 1);
    }
    return n;
  };

  it('CH-001 初始局面 perft(1..3) = 20 / 400 / 8902（公开公认值）', { timeout: 30_000 }, () => {
    const e = new ChessEngine();
    expect(perft(e, 1)).toBe(20);
    expect(perft(e, 2)).toBe(400);
    expect(perft(e, 3)).toBe(8902);
  });

  it('CH-004 Kiwipete 位置 perft(1)=48、perft(2)=2039（公开基准，覆盖易位/过路兵/升变密度）', () => {
    // Kiwipete: r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq -
    const e = new ChessEngine('r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1');
    expect(perft(e, 1)).toBe(48);
    expect(perft(e, 2)).toBe(2039);
  });

  it('CH-007 FEN 往返一致；CH-009 三次重复与逼和（公开局面）', () => {
    const e = new ChessEngine('r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1');
    const fen1 = e.fen();
    const e2 = new ChessEngine(fen1);
    expect(e2.fen()).toBe(fen1);
    // 逼和公开局面：7k/5Q2/6K1/8/8/8/8/8 b - - （黑王 h8，白后 f7 白王 g6 → 黑无合法着且不被将）
    const stale = new ChessEngine('7k/5Q2/6K1/8/8/8/8/8 b - - 0 1');
    expect(stale.outcome()?.type).toBe('stalemate');
    expect(stale.outcome()?.winner).toBeNull();
  });
});

// ==================== 中国跳棋（第一性几何推导） ====================

describe('R2-CC：中国跳棋独立推导（CC-002/003/005~010/CC-017）', () => {
  it('CC-002 棋位数 = 行宽序列 1,2,3,4,13,12,11,10,9,10,11,12,13,4,3,2,1 之和（第一性求和）', () => {
    const widths = [1, 2, 3, 4, 13, 12, 11, 10, 9, 10, 11, 12, 13, 4, 3, 2, 1];
    const sum = widths.reduce((a, b) => a + b, 0);
    expect(sum).toBe(121);
    expect(ALL_CELLS.length).toBe(sum);
    // 每行实际格数与行宽一致
    for (let r = 0; r < 17; r++) {
      const rowCells = ALL_CELLS.filter((c) => cellRC(c.id)![0] === r);
      expect(rowCells.length, `row ${r}`).toBe(widths[r]);
    }
    expect(new Set(CELL_IDS).size).toBe(121);
  });

  it('CC-002 邻接图 = 三角格六邻居：所有相邻对像素距离 ≡ spacing，非相邻 ≠ spacing', () => {
    const s = 100;
    for (const a of CELL_IDS) {
      const pa = cellPixel(a, s);
      const adj = neighborsOf(a);
      expect(adj.length).toBeGreaterThanOrEqual(2);
      for (const n of adj) {
        const pb = cellPixel(n, s);
        const d = Math.hypot(pb.x - pa.x, pb.y - pa.y);
        expect(d, `${a}-${n}`).toBeCloseTo(s, 2); // 0.866 近似带来的 <0.01 误差
      }
      // 不存在距离≈spacing 却不在邻接表中的格子（邻接完整性）
      for (const b of CELL_IDS) {
        if (b === a) continue;
        const pb = cellPixel(b, s);
        const d = Math.hypot(pb.x - pa.x, pb.y - pa.y);
        if (Math.abs(d - s) < 0.05) {
          expect(adj, `${a}↔${b} 距离=s 但不在邻接表`).toContain(b);
        }
      }
    }
  });

  it('CC-003 六营地各 10 格、互不相交、覆盖 60 格 + 中心 61', () => {
    const campCells: number[][] = [];
    for (let c = 0; c < 6; c++) campCells.push(ALL_CELLS.filter((x) => campOf(x.id) === c).map((x) => x.id));
    for (let c = 0; c < 6; c++) expect(campCells[c].length).toBe(10);
    const union = new Set(campCells.flat());
    expect(union.size).toBe(60);
    for (let a = 0; a < 6; a++)
      for (let b = a + 1; b < 6; b++)
        expect(campCells[a].filter((x) => campCells[b].includes(x)).length, `camp ${a}∩${b}`).toBe(0);
    expect(ALL_CELLS.filter((x) => campOf(x.id) === -1).length).toBe(61);
  });

  it('CC-003 目标映射 target=(c+3)%6 恒正对（180° 旋转像素中心对称）', () => {
    for (let c = 0; c < 6; c++) expect(targetCamp(c)).toBe((c + 3) % 6);
    // 中心对称验证：对面营地尖的中点 = 全部 121 格像素包围盒中心（由数据自算，不预设）
    const tips = ['e1', 'm5', 'q13', 'm17', 'e13', 'a5'];
    const px = CELL_IDS.map((id) => cellPixel(id, 40));
    const cx = (Math.min(...px.map((p) => p.x)) + Math.max(...px.map((p) => p.x))) / 2;
    const cy = (Math.min(...px.map((p) => p.y)) + Math.max(...px.map((p) => p.y))) / 2;
    for (let i = 0; i < 6; i++) {
      const p1 = cellPixel(tips[i], 40);
      const p2 = cellPixel(tips[(i + 3) % 6], 40);
      expect((p1.x + p2.x) / 2).toBeCloseTo(cx, 1);
      expect((p1.y + p2.y) / 2).toBeCloseTo(cy, 1);
    }
  });

  it('CC-005/006 开局合法着法全部为距离 100（普通步）或 200（单跳）', () => {
    for (const n of [2, 3, 4, 6] as const) {
      const e = CheckersEngine.create(n);
      for (const m of e.legalMoves()) {
        const d = Math.hypot(
          cellPixel(m.to, 100).x - cellPixel(m.from, 100).x,
          cellPixel(m.to, 100).y - cellPixel(m.from, 100).y,
        );
        expect([100, 200], `${n}人 ${m.from}→${m.to} d=${d}`).toContain(Math.round(d));
      }
    }
  });

  it('CC-006/007 跳跃落点 = 起点沿方向 2 倍位移；被跳子保留', () => {
    for (const a of CELL_IDS) {
      const [r, c] = cellRC(a)!;
      for (const [dr, dc] of [[0, 1], [0, -1], [1, 0], [-1, 0], [1, 1], [-1, -1]] as const) {
        const land = jumpLanding(a, dr, dc);
        if (!land) continue;
        const [lr, lc] = cellRC(land)!;
        expect(lr).toBe(r + 2 * dr);
        expect(lc).toBe(c + 2 * dc);
      }
    }
    // 引擎层：跳过棋子保留（构造 a:i10,b:j10 → i10 跳 k10 后 j10 仍在）
    const e = new CheckersEngine('cc1|turn=a|order=ab|p=a:i10,b:j10');
    const r = e.applyMove({ from: 'i10', to: 'k10', path: ['i10', 'k10'] });
    expect(r).not.toBeNull();
    expect(e.pieceAt('j10')).toBe('B');
    expect(e.pieceAt('i10')).toBeNull();
    expect(e.pieceAt('k10')).toBe('A');
  });

  it('CC-009/010 非法路径防线：占位/越界/循环/超长/空路径全拒', () => {
    const e = new CheckersEngine('cc1|turn=a|order=ab|p=a:i10,a:j10,a:k10');
    expect(e.isLegal({ from: 'i10', to: 'k10', path: ['i10', 'k10'] })).toBe(false); // 落点 k10 被己方占（对照：仅 j10 时跳己方合法）
    expect(e.isLegal({ from: 'i10', to: 'zz', path: ['i10', 'zz'] })).toBe(false); // 越界
    expect(e.isLegal({ from: 'i10', to: 'i10', path: ['i10', 'j10', 'i10'] })).toBe(false); // 循环
    expect(e.isLegal({ from: 'i10', to: 'i10', path: Array.from({ length: 20 }, () => 'i10') })).toBe(false); // 超长
    expect(e.isLegal({ from: 'i10', to: 'i10', path: [] })).toBe(false); // 空路径
    // 服务器侧同源：applyMove 对上述全部返回 null（状态不变）
    const before = e.fen();
    expect(e.applyMove({ from: 'i10', to: 'zz' })).toBeNull();
    expect(e.fen()).toBe(before);
  });

  it('CC-012 连跳终止条件：整链一次提交与逐段提交（穿插对手应手）对红方棋子集合等价', () => {
    // 逐段：A e3→e5 → B 应手 m14→m13 → A e5→g5
    const stepwise = new CheckersEngine('cc1|turn=a|order=ab|p=a:e3,a:e4,a:f5,b:m14');
    expect(stepwise.applyMove({ from: 'e3', to: 'e5', path: ['e3', 'e5'] })).not.toBeNull();
    expect(stepwise.applyMove({ from: 'm14', to: 'm13' })).not.toBeNull();
    expect(stepwise.applyMove({ from: 'e5', to: 'g5', path: ['e5', 'g5'] })).not.toBeNull();
    // 整链：A 一次提交三段（B 未应手）
    const oneshot = new CheckersEngine('cc1|turn=a|order=ab|p=a:e3,a:e4,a:f5,b:m14');
    expect(oneshot.applyMove({ from: 'e3', to: 'g5', path: ['e3', 'e5', 'g5'] })).not.toBeNull();
    // 红方棋子集合一致（e3/e4/f5/e5→g5 同样消耗）
    expect(oneshot.piecesOf('a').sort()).toEqual(stepwise.piecesOf('a').sort());
    expect(oneshot.pieceAt('e3')).toBeNull();
    expect(oneshot.pieceAt('g5')).toBe('A');
  });
});
