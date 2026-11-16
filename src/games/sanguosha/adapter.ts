/**
 * 三国杀·自由混战 —— GameEngine 适配器（占位引擎）。
 *
 * 三国杀不是走子棋：其真实状态机为 SanguoshaGame（引擎独立）。
 * 此适配器仅让房间系统把 sanguosha 当作一种 GameKind 复用
 * （座位/广播/持久化/限流），棋类协议层（game:move 等）对其全部非法。
 */
import type { AppliedMove, GameEngine, GameKind, LegalMove, MoveInput, Side } from '../types';

export class SanguoshaStubEngine implements GameEngine {
  readonly kind: GameKind = 'sanguosha';

  fen(): string {
    return 'sg1|mode=ffa';
  }
  turn(): Side {
    return 'a';
  }
  inCheck(): boolean {
    return false;
  }
  checkedKingSquare(): string | null {
    return null;
  }
  legalMoves(): LegalMove[] {
    return [];
  }
  isLegal(_move: MoveInput): boolean {
    return false;
  }
  applyMove(_move: MoveInput): AppliedMove | null {
    return null;
  }
  outcome(): null {
    return null;
  }
  moveCount(): number {
    return 0;
  }
  pieceAt(_sq: string): string | null {
    return null;
  }
}
