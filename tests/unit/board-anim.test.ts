/** boardAnim 分类器单元测试：普通/吃子/过路兵/易位/升变/中象炮吃（不修改引擎，纯 diff 推导） */
import { describe, expect, it } from 'vitest';
import { buildBoardAnim, fenPieceMap } from '../../src/client/components/boardAnim';
import { ChessEngine } from '../../src/games/chess/adapter';
import { XiangqiEngine } from '../../src/games/xiangqi/engine';

describe('fenPieceMap', () => {
  it('中象初始 FEN：32 枚，r0=黑底线行序', () => {
    const m = fenPieceMap('xiangqi', 'rnbakabnr/9/1c5c1/p1p1p1p1p/9/9/P1P1P1P1P/1C5C1/9/RNBAKABNR w');
    expect(m.size).toBe(32);
    expect(m.get('e0')).toBe('k'); // 黑将
    expect(m.get('e9')).toBe('K'); // 红帅
    expect(m.get('h7')).toBe('C'); // 红炮
  });

  it('国象初始 FEN：32 枚，首行=rank8', () => {
    const m = fenPieceMap('chess', new ChessEngine().fen());
    expect(m.size).toBe(32);
    expect(m.get('e1')).toBe('K');
    expect(m.get('e8')).toBe('k');
    expect(m.get('a2')).toBe('P');
  });
});

describe('buildBoardAnim 中象', () => {
  it('普通移步（炮二平五）', () => {
    const eng = new XiangqiEngine();
    const before = eng.fen();
    const applied = eng.applyMove({ from: 'h7', to: 'e7' });
    expect(applied).not.toBeNull();
    const a = buildBoardAnim('xiangqi', before, eng.fen(), 'h7', 'e7');
    expect(a).not.toBeNull();
    expect(a!.moverCode).toBe('C');
    expect(a!.capturedSq).toBeNull();
    expect(a!.rook).toBeNull();
    expect(a!.promotedTo).toBeNull();
  });

  it('炮隔炮架吃子：被吃子格=目标格，炮架不受影响', () => {
    const eng = new XiangqiEngine();
    eng.applyMove({ from: 'h7', to: 'e7' }); // 炮二平五
    eng.applyMove({ from: 'h0', to: 'g2' }); // 马8进7
    const before = eng.fen();
    const applied = eng.applyMove({ from: 'e7', to: 'e3' }); // 炮五进四吃卒（隔 e6 无子？——隔 3 空 + 卒为恰一炮架）
    expect(applied).not.toBeNull();
    expect(applied!.captured).toBe('p');
    const a = buildBoardAnim('xiangqi', before, eng.fen(), 'e7', 'e3');
    expect(a!.capturedSq).toBe('e3');
    expect(a!.capturedCode).toBe('p');
    expect(a!.moverCode).toBe('C');
  });

  it('吃兵：黑车吃红兵，capturedSq=to', () => {
    // 黑车置于 e5，沿 e 线吃 e6 红兵（红兵只在 a/c/e/g/i 线）
    const fen = 'rnbakabnr/9/1cn4c1/p1p1p1p1p/9/4r4/P1P1P1P1P/1C5C1/9/RNBAKABNR b';
    const eng = new XiangqiEngine(fen); // 非法 FEN 会 throw
    const before = eng.fen();
    const applied = eng.applyMove({ from: 'e5', to: 'e6' });
    expect(applied).not.toBeNull();
    expect(applied!.captured).toBe('P');
    const a = buildBoardAnim('xiangqi', before, eng.fen(), 'e5', 'e6');
    expect(a!.moverCode).toBe('r');
    expect(a!.capturedSq).toBe('e6');
    expect(a!.capturedCode).toBe('P');
  });

  it('from 处无子 → null（不动画，直同步）', () => {
    expect(buildBoardAnim('xiangqi', 'rnbakabnr/9/1c5c1/p1p1p1p1p/9/9/P1P1P1P1P/1C5C1/9/RNBAKABNR w', 'rnbakabnr/9/1c5c1/p1p1p1p1p/9/9/P1P1P1P1P/1C5C1/9/RNBAKABNR w', 'h3', 'e7')).toBeNull();
  });
});

describe('buildBoardAnim 国象', () => {
  it('普通吃子 exd5', () => {
    const eng = new ChessEngine();
    eng.applyMove({ from: 'e2', to: 'e4' });
    eng.applyMove({ from: 'd7', to: 'd5' });
    const before = eng.fen();
    const applied = eng.applyMove({ from: 'e4', to: 'd5' });
    expect(applied!.captured).toBe('p');
    const a = buildBoardAnim('chess', before, eng.fen(), 'e4', 'd5');
    expect(a!.moverCode).toBe('P');
    expect(a!.capturedSq).toBe('d5');
    expect(a!.capturedCode).toBe('p');
    expect(a!.rook).toBeNull();
  });

  it('王车易位（王翼）：王 e1→g1 + 车 h1→f1', () => {
    const fen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQK2R w KQkq - 0 1';
    const eng = new ChessEngine(fen); // 非法 FEN 会 throw
    const before = eng.fen();
    const applied = eng.applyMove({ from: 'e1', to: 'g1' });
    expect(applied).not.toBeNull();
    const a = buildBoardAnim('chess', before, eng.fen(), 'e1', 'g1');
    expect(a!.moverCode).toBe('K');
    expect(a!.capturedSq).toBeNull();
    expect(a!.rook).toEqual({ from: 'h1', to: 'f1', code: 'R' });
  });

  it('王车易位（后翼）：王 e1→c1 + 车 a1→d1', () => {
    const fen = 'r3kbnr/pppppppp/8/8/8/8/PPPPPPPP/R3KBNR w KQkq - 0 1';
    const eng = new ChessEngine(fen);
    const before = eng.fen();
    const applied = eng.applyMove({ from: 'e1', to: 'c1' });
    expect(applied).not.toBeNull();
    const a = buildBoardAnim('chess', before, eng.fen(), 'e1', 'c1');
    expect(a!.rook).toEqual({ from: 'a1', to: 'd1', code: 'R' });
    expect(a!.capturedSq).toBeNull();
  });

  it('吃过路兵：被吃兵格 ≠ 目标格（e5×d6 吃 d5 兵）', () => {
    const fen = 'rnbqkbnr/ppp1pppp/8/3pP3/8/8/PPPP1PPP/RNBQKBNR w KQkq d6 0 3';
    const eng = new ChessEngine(fen);
    const before = eng.fen();
    const applied = eng.applyMove({ from: 'e5', to: 'd6' });
    expect(applied!.captured).toBe('p');
    const a = buildBoardAnim('chess', before, eng.fen(), 'e5', 'd6');
    expect(a!.moverCode).toBe('P');
    expect(a!.capturedSq).toBe('d5'); // 不是 d6
    expect(a!.capturedCode).toBe('p');
    expect(a!.rook).toBeNull();
  });

  it('升变吃子 axb8=Q：promotedTo=Q + 被吃子=to 处原守子', () => {
    const fen = 'rn1qkbnr/Pppppppp/8/8/8/8/1PPPPPPP/RNBQKBNR w - - 0 1';
    const eng = new ChessEngine(fen);
    const before = eng.fen();
    const applied = eng.applyMove({ from: 'a7', to: 'b8', promotion: 'q' });
    expect(applied!.captured).toBe('n');
    const a = buildBoardAnim('chess', before, eng.fen(), 'a7', 'b8');
    expect(a!.moverCode).toBe('P');
    expect(a!.promotedTo).toBe('Q');
    expect(a!.capturedSq).toBe('b8');
    expect(a!.capturedCode).toBe('n');
  });

  it('无吃子升变 e7e8=Q：captured 为空', () => {
    const fen = 'k7/4P3/8/8/8/8/4K3/8 w - - 0 1'; // 黑王 a8，e8 为空格可升变
    const eng = new ChessEngine(fen);
    const before = eng.fen();
    const applied = eng.applyMove({ from: 'e7', to: 'e8', promotion: 'q' });
    expect(applied).not.toBeNull();
    const a = buildBoardAnim('chess', before, eng.fen(), 'e7', 'e8');
    expect(a!.promotedTo).toBe('Q');
    expect(a!.capturedSq).toBeNull();
  });
});
