import { describe, expect, it } from 'vitest';
import { ChessEngine } from '../../src/games/chess/adapter';

describe('国象适配器 · 基础', () => {
  it('初始局面 20 个合法走法，白先', () => {
    const e = new ChessEngine();
    expect(e.turn()).toBe('a');
    expect(e.legalMoves().length).toBe(20);
    expect(e.fen()).toBe('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1');
  });

  it('拒绝轮次外的走法（白回合走黑子）', () => {
    const e = new ChessEngine();
    expect(e.applyMove({ from: 'e7', to: 'e5' })).toBeNull();
  });

  it('拒绝非法走法且状态不变', () => {
    const e = new ChessEngine();
    expect(e.applyMove({ from: 'e2', to: 'e5' })).toBeNull();
    expect(e.fen()).toBe('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1');
  });

  it('applyMove 返回 SAN、吃子与将军标记', () => {
    const e = new ChessEngine();
    const r = e.applyMove({ from: 'e2', to: 'e4' });
    expect(r?.notation).toBe('e4');
    expect(r?.captured).toBeNull();
    const r2 = e.applyMove({ from: 'e7', to: 'e5' });
    expect(r2?.notation).toBe('e5');
    const r3 = e.applyMove({ from: 'd1', to: 'h5' });
    expect(r3?.notation).toBe('Qh5');
    expect(r3?.gaveCheck).toBe(false);
    void r;
  });
});

describe('国象适配器 · 王车易位', () => {
  const CLEAN = 'r3k2r/pppppppp/8/8/8/8/PPPPPPPP/R3K2R w KQkq - 0 1';

  it('白方双翼易位可用，SAN 为 O-O / O-O-O', () => {
    const e = new ChessEngine(CLEAN);
    const t = e.legalMoves().filter((m) => m.from === 'e1').map((m) => m.to);
    expect(t).toContain('g1');
    expect(t).toContain('c1');
    const r = e.applyMove({ from: 'e1', to: 'g1' });
    expect(r?.notation).toBe('O-O');
    expect(e.fen()).toContain('R4RK1');
  });

  it('易位路径受攻击时被禁止（f1 被控制 → 不能短易位）', () => {
    // f2 兵移开，黑车 f4 控制 f1
    const e = new ChessEngine('r3k2r/pppppppp/8/8/5r2/8/PPPPP1PP/R3K2R w KQkq - 0 1');
    const t = e.legalMoves().filter((m) => m.from === 'e1').map((m) => m.to);
    expect(t).not.toContain('g1'); // 经过 f1 被黑车控制
    expect(t).toContain('c1'); // 长易位路径安全
  });
});

describe('国象适配器 · 吃过路兵', () => {
  it('兵刚双步时可吃过路兵', () => {
    const e = new ChessEngine();
    e.applyMove({ from: 'e2', to: 'e4' });
    e.applyMove({ from: 'a7', to: 'a6' });
    e.applyMove({ from: 'e4', to: 'e5' });
    e.applyMove({ from: 'd7', to: 'd5' });
    const ep = e.legalMoves().find((m) => m.from === 'e5' && m.to === 'd6');
    expect(ep).toBeTruthy();
    const r = e.applyMove({ from: 'e5', to: 'd6' });
    expect(r?.notation).toBe('exd6');
    expect(r?.captured).toBe('p');
    // d5 黑兵被移除
    expect(e.fen()).not.toMatch(/3p3/);
  });

  it('吃过路兵窗口过期后不可吃', () => {
    const e = new ChessEngine();
    e.applyMove({ from: 'e2', to: 'e4' });
    e.applyMove({ from: 'a7', to: 'a6' });
    e.applyMove({ from: 'e4', to: 'e5' });
    e.applyMove({ from: 'd7', to: 'd5' });
    e.applyMove({ from: 'g1', to: 'f3' }); // 白走他着 → 窗口关闭
    e.applyMove({ from: 'a6', to: 'a5' });
    expect(e.isLegal({ from: 'e5', to: 'd6' })).toBe(false);
  });
});

describe('国象适配器 · 升变', () => {
  const PROMO = '8/P7/8/8/8/8/8/K6k w - - 0 1';

  it('升变走法有 4 个升变选项', () => {
    const e = new ChessEngine(PROMO);
    const t = e.legalMoves().filter((m) => m.from === 'a7' && m.to === 'a8');
    expect(t.length).toBe(4);
    expect(new Set(t.map((m) => m.promotion))).toEqual(new Set(['q', 'r', 'b', 'n']));
  });

  it('升变为后并生成 SAN', () => {
    const e = new ChessEngine(PROMO);
    const r = e.applyMove({ from: 'a7', to: 'a8', promotion: 'q' });
    expect(r?.notation).toBe('a8=Q+'); // a8 后在 a8-h1 斜线上将军黑王
    expect(r?.gaveCheck).toBe(true);
    expect(e.fen()).toContain('Q7');
  });

  it('拒绝非法升变子', () => {
    const e = new ChessEngine(PROMO);
    expect(e.applyMove({ from: 'a7', to: 'a8', promotion: 'k' })).toBeNull();
    expect(e.isLegal({ from: 'a7', to: 'a8', promotion: 'p' })).toBe(false);
  });
});

describe('国象适配器 · 终局判定', () => {
  it(' scholar 将杀：将死', () => {
    const e = new ChessEngine();
    for (const [from, to] of [
      ['e2', 'e4'],
      ['e7', 'e5'],
      ['f1', 'c4'],
      ['b8', 'c6'],
      ['d1', 'h5'],
      ['g8', 'f6'],
      ['h5', 'f7'],
    ]) {
      const r = e.applyMove({ from, to });
      expect(r).not.toBeNull();
    }
    const oc = e.outcome();
    expect(oc?.type).toBe('checkmate');
    expect(oc?.winner).toBe('a'); // 白胜
    expect(e.applyMove({ from: 'e8', to: 'e7' })).toBeNull();
  });

  it('逼和（无子可动且未被将军）', () => {
    const e = new ChessEngine('7k/5Q2/6K1/8/8/8/8/8 b - - 0 1');
    expect(e.inCheck()).toBe(false);
    expect(e.legalMoves().length).toBe(0);
    expect(e.outcome()).toEqual({ type: 'stalemate', winner: null, reason: '逼和（无子可动且未被将军）' });
  });

  it('三次重复局面判和', () => {
    const e = new ChessEngine();
    const seq: Array<[string, string]> = [
      ['g1', 'f3'],
      ['g8', 'f6'],
      ['f3', 'g1'],
      ['f6', 'g8'],
      ['g1', 'f3'],
      ['g8', 'f6'],
      ['f3', 'g1'],
      ['f6', 'g8'],
    ];
    let last = null;
    for (const [from, to] of seq) {
      last = e.applyMove({ from, to });
      expect(last).not.toBeNull();
    }
    expect(e.outcome()?.type).toBe('repetition');
    expect(e.outcome()?.winner).toBeNull();
  });

  it('子力不足判和（单王 vs 单王）', () => {
    const e = new ChessEngine('8/8/8/4k3/8/8/8/4K3 w - - 0 1');
    expect(e.outcome()?.type).toBe('insufficient');
  });

  it('50 回合无吃子判和', () => {
    const e = new ChessEngine('8/8/8/8/8/8/1k6/R2K4 w - - 99 60');
    const r = e.applyMove({ from: 'd1', to: 'e1' });
    expect(r).not.toBeNull();
    expect(e.outcome()?.type).toBe('fifty-move');
  });

  it('将军时 checkedKingSquare 指向被将的王', () => {
    const e = new ChessEngine('rnbqkbnr/pppp1ppp/8/4p3/6P1/5P2/PPPPP2P/RNBQKBNR b KQkq g3 0 3');
    // 黑后 h4 将军白王 e1
    const r = e.applyMove({ from: 'd8', to: 'h4' });
    expect(r?.gaveCheck).toBe(true);
    expect(e.checkedKingSquare()).toBe('e1');
    expect(e.inCheck()).toBe(true);
  });
});

describe('国象适配器 · 棋盘网格', () => {
  it('boardGrid 行 0 为第 8 横线（黑方底线）', () => {
    const e = new ChessEngine();
    const g = e.boardGrid();
    expect(g[0]).toEqual(['r', 'n', 'b', 'q', 'k', 'b', 'n', 'r']);
    expect(g[7]).toEqual(['R', 'N', 'B', 'Q', 'K', 'B', 'N', 'R']);
    expect(g.length).toBe(8);
  });
});
