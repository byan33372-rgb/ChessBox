/** 阶段 4：导出器专项（PGN/中文棋谱/JSON/FEN 语义） */

import { describe, expect, it } from 'vitest';
import { Chess } from 'chess.js';
import { ChessEngine } from '../../src/games/chess/adapter';
import { buildPgn, buildXiangqiJson, buildXiangqiText } from '../../src/client/export/exporters';
import type { PublicMove, RoomState } from '../../src/shared/protocol';
import type { GameOutcome } from '../../src/games/types';

function chessMoves(fromTo: Array<[string, string, string?]>): PublicMove[] {
  const e = new ChessEngine();
  const out: PublicMove[] = [];
  for (const [from, to, promotion] of fromTo) {
    const r = e.applyMove({ from, to, promotion });
    if (!r) throw new Error(`构造走法失败 ${from}${to}`);
    out.push({
      ply: out.length + 1,
      side: out.length % 2 === 0 ? 'a' : 'b',
      from,
      to,
      promotion,
      notation: r.notation,
      fenBefore: r.fenBefore,
      fenAfter: r.fenAfter,
      captured: r.captured,
      check: r.gaveCheck,
      ts: Date.now(),
    });
  }
  return out;
}

function chessState(moves: PublicMove[], outcome: GameOutcome | null = null, names = { a: '白先生', b: '黑女士' }): RoomState {
  const lastFen = moves.length > 0 ? moves[moves.length - 1].fenAfter : new ChessEngine().fen();
  return {
    roomId: 'testroom01',
    kind: 'chess',
    revision: moves.length + 2,
    phase: outcome ? 'ended' : 'playing',
    fen: lastFen,
    turn: moves.length % 2 === 0 ? 'a' : 'b',
    inCheck: false,
    checkedKing: null,
    lastMove: moves.at(-1) ?? null,
    moves,
    seats: { a: { name: names.a, connected: true }, b: { name: names.b, connected: true } },
    spectators: 0,
    outcome,
    offers: { draw: null, undo: null, restart: null },
  };
}

describe('导出 · PGN', () => {
  it('空棋谱：只有头部元数据，无走法，Result=*', () => {
    const pgn = buildPgn(chessState([]));
    expect(pgn).toContain('[Event "双人对弈（本地服务）"]');
    expect(pgn).toContain('[White "白先生"]');
    expect(pgn).toContain('[Black "黑女士"]');
    expect(pgn).toContain('[Result "*"]');
    expect(pgn).not.toMatch(/\d+\. /);
  });

  it('走法顺序与 SAN 正确，含王车易位与吃子', () => {
    // 1.e4 e5 2.Nf3 Nf6 3.Bc4 Be7 4.O-O O-O 5.d4 exd4 6.Nxd4
    const moves = chessMoves([
      ['e2', 'e4'],
      ['e7', 'e5'],
      ['g1', 'f3'],
      ['g8', 'f6'],
      ['f1', 'c4'],
      ['f8', 'e7'],
      ['e1', 'g1'],
      ['e8', 'g8'],
      ['d2', 'd4'],
      ['e5', 'd4'],
      ['f3', 'd4'],
    ]);
    const pgn = buildPgn(chessState(moves));
    expect(pgn).toContain('1. e4 e5');
    expect(pgn).toContain('O-O');
    expect(pgn).toContain('exd4');
    expect(pgn).toContain('Nxd4');
  });

  it('吃过路兵的 PGN：exd6 走法记录正确', () => {
    // 1.e4 a6 2.e5 d5 3.exd6（吃过路兵）Qxd6
    const moves = chessMoves([
      ['e2', 'e4'],
      ['a7', 'a6'],
      ['e4', 'e5'],
      ['d7', 'd5'],
      ['e5', 'd6'],
      ['d8', 'd6'],
    ]);
    const pgn = buildPgn(chessState(moves));
    expect(pgn).toContain('3. exd6');
    expect(pgn).toContain('Qxd6');
  });

  it('PGN 可完整回放且终局面与引擎一致', () => {
    const moves = chessMoves([
      ['e2', 'e4'],
      ['e7', 'e5'],
      ['g1', 'f3'],
      ['b8', 'c6'],
      ['f1', 'c4'],
      ['g8', 'f6'],
      ['d2', 'd3'],
      ['f8', 'c5'],
    ]);
    const state = chessState(moves);
    const pgn = buildPgn(state);
    const restored = new Chess();
    restored.loadPgn(pgn);
    expect(restored.fen()).toBe(state.fen);
  });

  it('结果映射：白胜 1-0 / 黑胜 0-1 / 协议和 1/2-1/2', () => {
    const moves = chessMoves([
      ['e2', 'e4'],
      ['e7', 'e5'],
      ['f1', 'c4'],
      ['b8', 'c6'],
      ['d1', 'h5'],
      ['g8', 'f6'],
      ['h5', 'f7'],
    ]);
    const mate = chessState(moves, { type: 'checkmate', winner: 'a', reason: '将死' });
    expect(buildPgn(mate)).toContain('[Result "1-0"]');
    expect(buildPgn(mate)).toContain('[Termination "将死"]');
    const resignB = chessState([], { type: 'resignation', winner: 'a', reason: '黑方认输' });
    expect(buildPgn(resignB)).toContain('[Result "1-0"]');
    const draw = chessState([], { type: 'agreement', winner: null, reason: '双方同意和棋' });
    expect(buildPgn(draw)).toContain('[Result "1/2-1/2"]');
  });

  it('玩家名含引号/反斜杠不会破坏 PGN 结构（净化为可解析文本）', () => {
    const state = chessState([], null, { a: 'Weird"Name', b: 'Back\Slash' });
    const pgn = buildPgn(state);
    const restored = new Chess();
    expect(() => restored.loadPgn(pgn)).not.toThrow();
    expect(pgn).toContain('WeirdName');
    expect(pgn).toContain('BackSlash');
  });
});

describe('导出 · 中文棋谱与 JSON', () => {
  function xqState(moves: Array<{ ply: number; side: 'a' | 'b'; from: string; to: string; notation: string }>): RoomState {
    return {
      roomId: 'xqtest0001',
      kind: 'xiangqi',
      revision: moves.length + 2,
      phase: 'playing',
      fen: 'rnbakabnr/9/1c5c1/p1p1p1p1p/9/9/P1P1P1P1P/1C5C1/9/RNBAKABNR b',
      turn: 'b',
      inCheck: false,
      checkedKing: null,
      lastMove: null,
      moves: moves as PublicMove[],
      seats: { a: { name: '红方甲', connected: true }, b: { name: '黑方乙', connected: true } },
      spectators: 1,
      outcome: null,
      offers: { draw: null, undo: null, restart: null },
    };
  }

  it('两列对齐：红黑各半，红先行', () => {
    const state = xqState([
      { ply: 1, side: 'a', from: 'h7', to: 'e7', notation: '炮二平五' },
      { ply: 2, side: 'b', from: 'h0', to: 'g2', notation: '马8进7' },
      { ply: 3, side: 'a', from: 'b9', to: 'c7', notation: '马八进七' },
    ]);
    const text = buildXiangqiText(state);
    expect(text).toContain('红方：红方甲');
    expect(text).toContain('结果：对局进行中');
    expect(text).toContain('1. 炮二平五 马8进7');
    expect(text).toContain('2. 马八进七');
  });

  it('空棋谱文本可用', () => {
    const text = buildXiangqiText(xqState([]));
    expect(text).not.toMatch(/\d+\. /);
    expect(text).toContain('中国象棋对局记录');
  });

  it('JSON：本项目格式声明 + 逐步记录完整', () => {
    const state = xqState([
      { ply: 1, side: 'a', from: 'h7', to: 'e7', notation: '炮二平五' },
      { ply: 2, side: 'b', from: 'h0', to: 'g2', notation: '马8进7' },
    ]);
    const json = buildXiangqiJson(state, 'rnbakabnr/9/1c5c1/p1p1p1p1p/9/9/P1P1P1P1P/1C5C1/9/RNBAKABNR w');
    expect(json.format).toBe('chessbox-xiangqi-v1');
    expect(json.note).toContain('非通用标准');
    expect(json.moves.length).toBe(2);
    expect(json.moves[0]).toMatchObject({ from: 'h7', to: 'e7', notation: '炮二平五' });
    expect(json.startFen).toContain('RNBAKABNR');
  });
});
