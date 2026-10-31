/** 国际象棋特殊动作轨迹（MOVE-006/007/008）：易位车 extra、过路兵 capturedSq */
import { describe, expect, it } from 'vitest';
import { ChessEngine, CHESS_START_FEN } from '../../src/games/chess/adapter';

describe('国象特殊动作轨迹（extra/capturedSq）', () => {
  it('王翼易位：extra 记录车 h1→f1（MOVE-006）', () => {
    const e = new ChessEngine('r3k2r/pppppppp/8/8/8/8/PPPPPPPP/R3K2R w KQkq - 0 1');
    const r = e.applyMove({ from: 'e1', to: 'g1' });
    expect(r).not.toBeNull();
    expect(r!.notation).toBe('O-O');
    expect(r!.extra).toEqual([{ from: 'h1', to: 'f1', piece: 'R' }]);
  });

  it('后翼易位：extra 记录车 a1→d1（MOVE-006）', () => {
    const e = new ChessEngine('r3k2r/pppppppp/8/8/8/8/PPPPPPPP/R3K2R w KQkq - 0 1');
    const r = e.applyMove({ from: 'e1', to: 'c1' });
    expect(r).not.toBeNull();
    expect(r!.notation).toBe('O-O-O');
    expect(r!.extra).toEqual([{ from: 'a1', to: 'd1', piece: 'R' }]);
  });

  it('吃过路兵：capturedSq 为被吃兵实际格 d5 ≠ 落点 d6（MOVE-007）', () => {
    const e = new ChessEngine('rnbqkbnr/ppp1pppp/8/3pP3/8/8/PPPP1PPP/RNBQKBNR w KQkq d6 0 3');
    const r = e.applyMove({ from: 'e5', to: 'd6' });
    expect(r).not.toBeNull();
    expect(r!.captured).toBe('p');
    expect(r!.capturedSq).toBe('d5');
    expect(r!.extra).toBeUndefined();
  });

  it('普通吃子：capturedSq = 落点；无吃子为 null', () => {
    const e = new ChessEngine('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1');
    const r = e.applyMove({ from: 'e2', to: 'e4' });
    expect(r!.capturedSq).toBeNull();
    // 白兵 d4 斜吃 e5 黑兵：capturedSq = 落点 e5
    const e2 = new ChessEngine('rnbqkbnr/pppp1ppp/8/4p3/3P4/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2');
    const r2 = e2.applyMove({ from: 'd4', to: 'e5' });
    expect(r2!.captured).toBe('p');
    expect(r2!.capturedSq).toBe('e5');
    const e3 = new ChessEngine('rnbqkbnr/pppp1ppp/8/4p3/3PP3/8/PPP2PPP/RNBQKBNR b KQkq d3 0 2');
    const r3 = e3.applyMove({ from: 'e5', to: 'd4' });
    expect(r3!.captured).toBe('p'); // chess.js 约定：captured 恒为子类型小写
    expect(r3!.capturedSq).toBe('d4');
    void CHESS_START_FEN;
  });
});
