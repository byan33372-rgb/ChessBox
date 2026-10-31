/**
 * 国际象棋规则适配器 —— 封装 chess.js（BSD-2-Clause）。
 * 权威走法校验、FEN/PGN、终局判定（将死/逼和/三次重复/子力不足/50 回合）
 * 全部由 chess.js 提供；本适配层仅做统一接口转换。
 *
 * 说明：chess.js 的 isDraw() 将三次重复与 50 回合作为自动判和处理，
 * 本项目沿用其语义（三次重复自动判和，而非等待一方发起要求），
 * 因此 FIDE 的 75 回合规则在实际对局中不会先于 50 回合触发。
 */

import { Chess, type Move as ChessJsMove } from 'chess.js';
import type { AppliedMove, GameEngine, GameOutcome, LegalMove, MoveInput, Side } from '../types';

export const CHESS_START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

const PROMO = new Set(['q', 'r', 'b', 'n']);

export class ChessEngine implements GameEngine {
  readonly kind = 'chess' as const;
  private c: Chess;

  constructor(fen: string = CHESS_START_FEN) {
    this.c = new Chess(fen);
  }

  fen(): string {
    return this.c.fen();
  }

  turn(): Side {
    return this.c.turn() === 'w' ? 'a' : 'b';
  }

  inCheck(): boolean {
    return this.c.inCheck();
  }

  checkedKingSquare(): string | null {
    if (!this.c.inCheck()) return null;
    const board = this.c.board(); // [rank8..rank1][file a..h]
    const color = this.c.turn();
    for (let r = 0; r < 8; r++) {
      for (let f = 0; f < 8; f++) {
        const cell = board[r][f];
        if (cell && cell.type === 'k' && cell.color === color) {
          return String.fromCharCode(97 + f) + String(8 - r);
        }
      }
    }
    return null;
  }

  legalMoves(): LegalMove[] {
    return this.c
      .moves({ verbose: true })
      .map((m) => ({ from: m.from, to: m.to, promotion: m.promotion, capture: m.captured !== undefined }));
  }

  isLegal(move: MoveInput): boolean {
    if (move.promotion !== undefined && !PROMO.has(move.promotion)) return false;
    return this.c.moves({ verbose: true }).some(
      (m) => m.from === move.from && m.to === move.to && (m.promotion ?? undefined) === move.promotion,
    );
  }

  applyMove(move: MoveInput): AppliedMove | null {
    if (move.promotion !== undefined && !PROMO.has(move.promotion)) return null;
    const matched = this.c.moves({ verbose: true }).some(
      (m) => m.from === move.from && m.to === move.to && (m.promotion ?? undefined) === move.promotion,
    );
    if (!matched) return null;
    const fenBefore = this.c.fen();
    let res: ChessJsMove;
    try {
      res = this.c.move({ from: move.from, to: move.to, promotion: move.promotion });
    } catch {
      return null;
    }
    const gaveCheck = this.c.inCheck(); // 轮次已翻转，即对方被将军

    // 特殊动作轨迹（MOVE-006/007/008）：
    // - 王车易位：extra 携带车的完整位移（服务端权威推导，前端直接展示）
    // - 吃过路兵：capturedSq = 被吃兵实际所在格（≠ 落点）
    // - 普通吃子：capturedSq = 落点
    const flags = res.flags ?? '';
    const extra: AppliedMove['extra'] = [];
    if (flags.includes('k')) {
      const rank = res.from[1];
      extra.push({ from: `h${rank}`, to: `f${rank}`, piece: res.color === 'w' ? 'R' : 'r' });
    } else if (flags.includes('q')) {
      const rank = res.from[1];
      extra.push({ from: `a${rank}`, to: `d${rank}`, piece: res.color === 'w' ? 'R' : 'r' });
    }
    const capturedSq =
      res.captured !== undefined
        ? flags.includes('e')
          ? `${res.to[0]}${res.from[1]}` // 过路兵：被吃兵在 to 的纵线、from 的横线
          : res.to
        : null;

    return {
      notation: res.san,
      captured: res.captured ?? null,
      capturedSq,
      extra: extra.length > 0 ? extra : undefined,
      gaveCheck,
      fenBefore,
      fenAfter: this.c.fen(),
      outcome: this.computeOutcome(),
    };
  }

  outcome(): GameOutcome | null {
    return this.computeOutcome();
  }

  moveCount(): number {
    return this.c.history().length;
  }

  boardGrid(): (string | null)[][] {
    // 行 0 = rank 8，列 0 = a 线；大写=白，小写=黑
    const b = this.c.board();
    return b.map((row) => row.map((cell) => (cell ? (cell.color === 'w' ? cell.type.toUpperCase() : cell.type) : null)));
  }

  pieceAt(sq: string): string | null {
    const file = sq.charCodeAt(0) - 97;
    const rank = 8 - Number(sq[1]);
    const cell = this.c.board()[rank]?.[file];
    return cell ? (cell.color === 'w' ? cell.type.toUpperCase() : cell.type) : null;
  }

  private computeOutcome(): GameOutcome | null {
    const c = this.c;
    if (c.isCheckmate()) {
      // 将死：被将死方为当前走棋方，胜方为另一方
      return { type: 'checkmate', winner: this.turn() === 'a' ? 'b' : 'a', reason: '将死' };
    }
    if (c.isStalemate()) {
      return { type: 'stalemate', winner: null, reason: '逼和（无子可动且未被将军）' };
    }
    if (c.isThreefoldRepetition()) {
      return { type: 'repetition', winner: null, reason: '三次重复局面，判和' };
    }
    if (c.isInsufficientMaterial()) {
      return { type: 'insufficient', winner: null, reason: '子力不足，判和' };
    }
    const half = Number(c.fen().split(' ')[4] ?? '0');
    if (half >= 100) {
      return { type: 'fifty-move', winner: null, reason: '50 回合无吃子/无兵动，判和' };
    }
    return null;
  }
}
