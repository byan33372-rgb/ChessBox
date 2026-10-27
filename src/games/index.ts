/** 引擎工厂：按棋种创建权威规则引擎（前后端共用） */
import type { GameEngine, GameKind } from './types';
import { ChessEngine } from './chess/adapter';
import { XiangqiEngine } from './xiangqi/engine';
import { START_FEN as XIANGQI_START_FEN } from './xiangqi/engine';

export { ChessEngine } from './chess/adapter';
export { XiangqiEngine, START_FEN, parseFen, squareOf, parseSquare, kingsFacing, isSquareAttacked, xColorOf } from './xiangqi/engine';
export type { XColor, XBoard } from './xiangqi/engine';
export { chineseNotation, pieceLabel } from './xiangqi/notation';
export { CHESS_START_FEN } from './chess/adapter';

export function startFenOf(kind: GameKind): string {
  return kind === 'xiangqi' ? XIANGQI_START_FEN : new ChessEngine().fen();
}

export function createEngine(kind: GameKind, fen?: string): GameEngine {
  if (kind === 'xiangqi') return new XiangqiEngine(fen ?? XIANGQI_START_FEN);
  return new ChessEngine(fen);
}

/** 从初始局面重放到指定 FEN 之后（用于悔棋/重启后重建引擎状态） */
export function replayEngine(kind: GameKind, moves: Array<{ from: string; to: string; promotion?: string }>): GameEngine {
  const engine = createEngine(kind);
  for (const m of moves) {
    const applied = engine.applyMove(m);
    if (!applied) throw new Error(`重放失败: ${JSON.stringify(m)}`);
  }
  return engine;
}
