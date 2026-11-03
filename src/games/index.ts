/** 引擎工厂：按棋种创建权威规则引擎（前后端共用） */
import type { GameEngine, GameKind, Side } from './types';
import { ChessEngine } from './chess/adapter';
import { XiangqiEngine } from './xiangqi/engine';
import { CheckersEngine } from './checkers/engine';
import { GoEngine, GO_KOMI } from './go/engine';
import { GomokuEngine, GOMOKU_SIZE } from './gomoku/engine';
import { SUPPORTED_SEAT_COUNTS } from './checkers/board';
import { START_FEN as XIANGQI_START_FEN } from './xiangqi/engine';

export { ChessEngine } from './chess/adapter';
export { XiangqiEngine, START_FEN, parseFen, squareOf, parseSquare, kingsFacing, isSquareAttacked, xColorOf } from './xiangqi/engine';
export type { XColor, XBoard } from './xiangqi/engine';
export { chineseNotation, pieceLabel } from './xiangqi/notation';
export { CHESS_START_FEN } from './chess/adapter';
export { CheckersEngine, CHECKERS_COLORS, CHECKERS_NAMES, CHECKERS_PIECE_COUNT } from './checkers/engine';
export { GoEngine, GO_KOMI, starPoints as goStarPoints, buildSgf } from './go/engine';
export { GomokuEngine, GOMOKU_SIZE } from './gomoku/engine';
export {
  ALL_CELLS,
  CELL_IDS,
  SEAT_CAMP_MAPS,
  SUPPORTED_SEAT_COUNTS,
  campOf,
  cellRC,
  cellPixel,
  isValidCell,
  neighborsOf,
  targetCamp,
} from './checkers/board';
export type { CellInfo } from './checkers/board';

/** 各棋种的座位数：中象/国象固定 2；跳棋 2/3/4/6 */
export function seatCountOf(kind: GameKind): number[] {
  return kind === 'checkers' ? [...SUPPORTED_SEAT_COUNTS] : [2];
}

/** 落子型游戏（from=to=交叉点，无移动轨迹） */
export function isPlacementKind(kind: GameKind): boolean {
  return kind === 'go' || kind === 'gomoku';
}

export function isGameKind(v: unknown): v is GameKind {
  return v === 'xiangqi' || v === 'chess' || v === 'checkers';
}

export function isSide(v: unknown): v is Side {
  return typeof v === 'string' && /^[a-f]$/.test(v);
}

export function startFenOf(kind: GameKind, seatCount?: number, boardSize?: number): string {
  if (kind === 'xiangqi') return XIANGQI_START_FEN;
  if (kind === 'chess') return new ChessEngine().fen();
  if (kind === 'go') return GoEngine.create((boardSize ?? 19) as never).fen();
  if (kind === 'gomoku') return new GomokuEngine().fen();
  const n = (seatCount ?? 2) as 2 | 3 | 4 | 6;
  return CheckersEngine.create(n).fen();
}

export function createEngine(kind: GameKind, fen?: string, boardSize?: number): GameEngine {
  if (kind === 'xiangqi') return new XiangqiEngine(fen ?? XIANGQI_START_FEN);
  if (kind === 'checkers') return new CheckersEngine(fen);
  if (kind === 'go') return fen ? new GoEngine(fen) : GoEngine.create((boardSize ?? 19) as never);
  if (kind === 'gomoku') return new GomokuEngine(fen);
  return new ChessEngine(fen);
}

/** 跳棋：按座位数与先手座位创建（房间创建时使用） */
export function createCheckersEngine(seatCount: 2 | 3 | 4 | 6, firstSeat: Side = 'a'): CheckersEngine {
  return CheckersEngine.create(seatCount, firstSeat as never);
}

/** 从初始局面重放到指定 FEN 之后（用于悔棋/重启后重建引擎状态） */
export function replayEngine(
  kind: GameKind,
  moves: Array<{ from: string; to: string; promotion?: string; path?: string[] }>,
  seatCount?: number,
): GameEngine {
  let engine: GameEngine;
  if (kind === 'checkers') {
    // 从首着的 fenBefore 恢复初始座位顺序；无着法时按 seatCount 新建
    const first = moves[0] as unknown as { fenBefore?: string } | undefined;
    engine = new CheckersEngine(first?.fenBefore);
    if (!first?.fenBefore) engine = createCheckersEngine((seatCount ?? 2) as 2 | 3 | 4 | 6);
  } else {
    // go/gomoku 等从首着 fenBefore 恢复规格与局面历史（superko 集合随重放重建）
    const first = moves[0] as unknown as { fenBefore?: string } | undefined;
    engine = createEngine(kind, first?.fenBefore);
  }
  for (const m of moves) {
    const applied = engine.applyMove(m);
    if (!applied) throw new Error(`重放失败: ${JSON.stringify(m)}`);
  }
  return engine;
}
