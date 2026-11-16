/**
 * UNO —— GameEngine 适配器（占位）：复用房间系统；棋类协议对其全非法。
 */
import type { AppliedMove, GameEngine, GameKind, LegalMove, MoveInput, Side } from '../types';

export class UnoStubEngine implements GameEngine {
  readonly kind: GameKind = 'uno';
  fen(): string {
    return 'uno1|mode=classic';
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
