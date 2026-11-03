/**
 * 五子棋规则引擎（自研；标准自由五子棋——连续五子或以上获胜，无 Renju 禁手，GOMOKU-009/016）。
 *
 * - 15×15 棋盘（GOMOKU-002），坐标 a1..o15（列字母+行号）；
 * - 黑（a）先行（GOMOKU-004）；落子仅限空交叉点（GOMOKU-005）；
 * - 横/竖/两斜四方向连续 ≥5 判胜（GOMOKU-006~009）；
 * - 满盘无胜判和（GOMOKU-010）；终局后拒走（GOMOKU-012）；
 * - 胜利线（全部连点）通过 AppliedMove.extra 返回（EVENT-004 五连方向提示）。
 *
 * fen：`gmk15|turn=b|b:...;w:...`
 */

import type { AppliedMove, GameEngine, GameOutcome, LegalMove, MoveInput, Side } from '../types';

export const GOMOKU_SIZE = 15;

function col(i: number): string {
  return String.fromCharCode(97 + i);
}
export function ptName(x: number, y: number): string {
  return col(x) + (y + 1);
}
function parsePoint(sq: string): { x: number; y: number } | null {
  const m = /^([a-o])([0-9]{1,2})$/.exec(sq);
  if (!m) return null;
  const x = m[1].charCodeAt(0) - 97;
  const y = Number(m[2]) - 1;
  if (x < 0 || x >= GOMOKU_SIZE || y < 0 || y >= GOMOKU_SIZE) return null;
  return { x, y };
}

type Stone = 'b' | 'w';

export class GomokuEngine implements GameEngine {
  readonly kind = 'gomoku' as const;
  private board = new Map<string, Stone>();
  private turnSeat: Side = 'a';
  private plies = 0;
  private _outcome: GameOutcome | null = null;
  private lastWinLine: string[] = [];

  constructor(fen?: string) {
    if (fen) {
      const parts = fen.split('|');
      if (parts[0] !== 'gmk15') throw new Error('五子棋 FEN 非法');
      for (let i = 1; i < parts.length; i++) {
        const [k, v] = parts[i].split('=');
        if (k === 'turn' && (v === 'a' || v === 'b')) this.turnSeat = v;
        else if (k === 'b' && v) for (const t of v.split(',')) { if (!parsePoint(t)) throw new Error('五子棋 FEN 非法'); this.board.set(t, 'b'); }
        else if (k === 'w' && v) for (const t of v.split(',')) { if (!parsePoint(t)) throw new Error('五子棋 FEN 非法'); this.board.set(t, 'w'); }
      }
      // 加载即胜检测（与 applyMove 同判法）
      for (const [pt, s] of this.board) {
        const line = this.winLineAt(pt, s);
        if (line.length >= 5) {
          this._outcome = { type: 'checkmate', winner: s === 'b' ? 'a' : 'b', reason: s === 'b' ? '黑方五连，获胜' : '白方五连，获胜' };
          this.lastWinLine = line;
          break;
        }
      }
    }
  }

  fen(): string {
    const by: Record<Stone, string[]> = { b: [], w: [] };
    for (const [pt, s] of this.board) by[s].push(pt);
    return `gmk15|turn=${this.turnSeat}|b=${by.b.sort().join(',')}|w=${by.w.sort().join(',')}`;
  }

  turn(): Side {
    return this.turnSeat;
  }

  inCheck(): boolean {
    return false;
  }

  checkedKingSquare(): null {
    return null;
  }

  moveCount(): number {
    return this.plies;
  }

  pieceAt(sq: string): string | null {
    const s = this.board.get(sq);
    return s ? s.toUpperCase() : null;
  }

  stonesOf(side: Side): string[] {
    const want: Stone = side === 'a' ? 'b' : 'w';
    return [...this.board.entries()].filter(([, s]) => s === want).map(([p]) => p);
  }

  /** 胜利连线（EVENT-004 五连方向提示） */
  winLine(): string[] {
    return this.lastWinLine;
  }

  outcome(): GameOutcome | null {
    return this._outcome;
  }

  legalMoves(): LegalMove[] {
    if (this._outcome) return [];
    const out: LegalMove[] = [];
    for (const [pt] of this.board) {
      void pt; // 落子型：合法点=全部空点（数量大，UI 不逐点渲染）
    }
    return out;
  }

  isLegal(move: MoveInput): boolean {
    if (this._outcome) return false;
    return parsePoint(move.from) !== null && !this.board.has(move.from);
  }

  private winLineAt(sq: string, s: Stone): string[] {
    const p = parsePoint(sq)!;
    for (const [dx, dy] of [[1, 0], [0, 1], [1, 1], [1, -1]] as const) {
      const line: string[] = [sq];
      for (const sign of [1, -1] as const) {
        let x = p.x + dx * sign;
        let y = p.y + dy * sign;
        while (x >= 0 && x < GOMOKU_SIZE && y >= 0 && y < GOMOKU_SIZE && this.board.get(ptName(x, y)) === s) {
          line.push(ptName(x, y));
          x += dx * sign;
          y += dy * sign;
        }
      }
      if (line.length >= 5) return line.sort();
    }
    return [];
  }

  applyMove(move: MoveInput): AppliedMove | null {
    if (!this.isLegal(move)) return null;
    const fenBefore = this.fen();
    const stone: Stone = this.turnSeat === 'a' ? 'b' : 'w';
    this.board.set(move.from, stone);
    this.plies += 1;
    const line = this.winLineAt(move.from, stone);
    let outcome: GameOutcome | null = null;
    if (line.length >= 5) {
      this.lastWinLine = line;
      this._outcome = { type: 'checkmate', winner: stone === 'b' ? 'a' : 'b', reason: stone === 'b' ? '黑方五连，获胜' : '白方五连，获胜' };
      outcome = this._outcome;
    } else if (this.board.size === GOMOKU_SIZE * GOMOKU_SIZE) {
      this._outcome = { type: 'stalemate', winner: null, reason: '棋盘已满，和棋' };
      outcome = this._outcome;
    } else {
      this.lastWinLine = [];
    }
    this.turnSeat = this.turnSeat === 'a' ? 'b' : 'a';
    return {
      notation: move.from + (line.length >= 5 ? '（五连）' : ''),
      captured: null,
      gaveCheck: false,
      fenBefore,
      fenAfter: this.fen(),
      outcome,
      extra: line.length >= 5 ? line.map((pt) => ({ from: pt, to: pt, piece: stone.toUpperCase() })) : undefined,
    };
  }
}
