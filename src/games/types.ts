/**
 * 统一游戏引擎接口 —— 前后端共用同一套规则语义。
 *
 * 约定：
 * - Side 'a' 恒为先手（中国象棋=红方，国际象棋=白方）；
 *   Side 'b' 恒为后手（黑方）。
 * - 坐标使用各棋种引擎自身的方形串表示：
 *   中国象棋 "a0".."i9"（列 a-i，行 0-9，行 0 为黑方底线）；
 *   国际象棋 "a1".."h8"（标准代数坐标）。
 * - 所有走法均先经引擎校验；服务端为唯一权威。
 */

export type GameKind = 'xiangqi' | 'chess';
export type Side = 'a' | 'b';

export interface MoveInput {
  from: string;
  to: string;
  /** 国际象棋升变：q/r/b/n；中国象棋无此字段 */
  promotion?: string;
}

export type OutcomeType =
  | 'checkmate' // 将死
  | 'stalemate' // 国象=逼和(和棋)；中象=困毙(走棋方判负)
  | 'repetition' // 重复局面（和棋，或长将判负）
  | 'insufficient' // 子力不足/无攻击子力和棋
  | 'fifty-move' // 无吃子限着和棋
  | 'resignation' // 认输（协议层产生，引擎不产生）
  | 'agreement'; // 协议和棋（协议层产生，引擎不产生）

export interface GameOutcome {
  type: OutcomeType;
  /** null = 和棋 */
  winner: Side | null;
  /** 面向用户的中文说明 */
  reason: string;
}

export interface AppliedMove {
  notation: string; // 国象 SAN；中象中文纵线记谱
  captured: string | null; // 被吃子代码（国象字母 / 中象单字码）
  gaveCheck: boolean; // 本步是否将军
  fenBefore: string;
  fenAfter: string;
  /** 本步之后的终局判定（无终局则 null） */
  outcome: GameOutcome | null;
}

export interface LegalMove extends MoveInput {
  /** 用于 UI 高亮吃子 */
  capture: boolean;
}

export interface GameEngine {
  readonly kind: GameKind;
  fen(): string;
  turn(): Side;
  inCheck(): boolean;
  /** 走棋方被将军时返回其王/将位置（UI 红点提示）；否则 null */
  checkedKingSquare(): string | null;
  legalMoves(): LegalMove[];
  isLegal(move: MoveInput): boolean;
  /** 非法返回 null（不改变任何状态） */
  applyMove(move: MoveInput): AppliedMove | null;
  /** 当前终局判定（对局未结束则 null） */
  outcome(): GameOutcome | null;
  moveCount(): number;
  /** 指定格的棋子代码（无子为 null）；大写=先手方 */
  pieceAt(sq: string): string | null;
}
