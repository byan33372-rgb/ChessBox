/**
 * 中国象棋规则引擎（自研实现，无第三方依赖）。
 *
 * 坐标：方形 "a0".."i9"，列 a..i = c 0..8（红方视角从左到右），行 0..9，
 * 行 0 为黑方底线（棋盘上方），行 9 为红方底线（下方）。红方先行。
 *
 * FEN：采用本项目的固定格式 "<10行棋盘> <w|b>"（w=红方走棋，b=黑方），
 * 行序从行 0（黑方底线）到行 9（红方底线），数字表示连续空位，
 * 大写=红子（RNBAKCP），小写=黑子。这与常见象棋 FEN 惯例一致，
 * 但本项目不声称兼容任何第三方工具——导入导出以此格式文档为准。
 *
 * 已实现规则：全兵种走法、马腿、象眼、炮架吃子、过河兵横走、九宫限制、
 * 将帅照面（飞将）禁着、将军/应将（走后己方被将则非法）、将死、困毙（判负）、
 * 三次重复局面（含长将判负的简化仲裁）、60 回合无吃子判和、双方无攻击子力判和。
 *
 * 明确未实现（如实告知）：长捉（非将军性的连续捉子）仲裁、多兵种复合长打细则、
 * 超过 3 个同线兵的完整标准记谱消歧（极罕见，采用近似处理，见 notation.ts）。
 */

import type { AppliedMove, GameEngine, GameOutcome, LegalMove, MoveInput, Side } from '../types';
import { chineseNotation } from './notation';

export type XColor = 'red' | 'black';
type Cell = string | null;
export type XBoard = Cell[][];

export const START_FEN = 'rnbakabnr/9/1c5c1/p1p1p1p1p/9/9/P1P1P1P1P/1C5C1/9/RNBAKABNR w';

const FILES = 'abcdefghi';
const PIECE_CHARS = 'RNBAKCPrnbakcp';

export function xColorOf(piece: string): XColor {
  return piece >= 'A' && piece <= 'Z' ? 'red' : 'black';
}

function other(color: XColor): XColor {
  return color === 'red' ? 'black' : 'red';
}

function sideOf(color: XColor): Side {
  return color === 'red' ? 'a' : 'b';
}

function colorOfSide(side: Side): XColor {
  return side === 'a' ? 'red' : 'black';
}

export function parseSquare(sq: string): { r: number; c: number } {
  if (sq.length !== 2) throw new Error(`非法坐标: ${sq}`);
  const c = FILES.indexOf(sq[0]);
  const r = sq.charCodeAt(1) - 48;
  if (c < 0 || r < 0 || r > 9) throw new Error(`非法坐标: ${sq}`);
  return { r, c };
}

export function squareOf(r: number, c: number): string {
  return FILES[c] + String(r);
}

function inside(r: number, c: number): boolean {
  return r >= 0 && r <= 9 && c >= 0 && c <= 8;
}

function inPalace(color: XColor, r: number, c: number): boolean {
  if (c < 3 || c > 5) return false;
  return color === 'red' ? r >= 7 && r <= 9 : r >= 0 && r <= 2;
}

function inOwnHalf(color: XColor, r: number): boolean {
  return color === 'red' ? r >= 5 : r <= 4;
}

/** 象不能过河：目标行须在己方半场 */
function elephantReachable(color: XColor, r: number): boolean {
  return inOwnHalf(color, r);
}

function canLand(board: XBoard, r: number, c: number, color: XColor): boolean {
  if (!inside(r, c)) return false;
  const t = board[r][c];
  return t === null || xColorOf(t) !== color;
}

/** 某格是否被 by 方攻击（用于将军判定；象/士永远够不到对方九宫，无需计入） */
export function isSquareAttacked(board: XBoard, r: number, c: number, by: XColor): boolean {
  // 车 / 炮（同列或同行）
  const dirs: Array<[number, number]> = [
    [-1, 0],
    [1, 0],
    [0, -1],
    [0, 1],
  ];
  for (const [dr, dc] of dirs) {
    let rr = r + dr;
    let cc = c + dc;
    // 第一段：滑到第一个棋子为止
    while (inside(rr, cc) && board[rr][cc] === null) {
      rr += dr;
      cc += dc;
    }
    if (!inside(rr, cc)) continue;
    const first = board[rr][cc]!;
    const rook = by === 'red' ? 'R' : 'r';
    if (first === rook) return true; // 车攻击
    // 炮：越过第一个子（炮架）后找第二个子
    let r2 = rr + dr;
    let c2 = cc + dc;
    while (inside(r2, c2) && board[r2][c2] === null) {
      r2 += dr;
      c2 += dc;
    }
    if (inside(r2, c2)) {
      const cannon = by === 'red' ? 'C' : 'c';
      if (board[r2][c2] === cannon) return true; // 炮攻击（有炮架）
    }
  }
  // 马（马腿从攻击者位置计算）
  const knight = by === 'red' ? 'N' : 'n';
  const knightOffsets: Array<[number, number]> = [
    [-2, -1],
    [-2, 1],
    [-1, -2],
    [-1, 2],
    [1, -2],
    [1, 2],
    [2, -1],
    [2, 1],
  ];
  for (const [dr, dc] of knightOffsets) {
    const ar = r - dr; // 攻击者位置（使它攻击 (r,c)）
    const ac = c - dc;
    if (!inside(ar, ac) || board[ar][ac] !== knight) continue;
    // 马腿：攻击者朝目标方向一格
    const legR = Math.abs(dc) === 2 ? ar : ar + Math.trunc(dr / 2);
    const legC = Math.abs(dc) === 2 ? ac + Math.trunc(dc / 2) : ac;
    if (inside(legR, legC) && board[legR][legC] === null) return true;
  }
  // 兵：直进一格攻击 + 过河后横向攻击
  const pawn = by === 'red' ? 'P' : 'p';
  if (by === 'red') {
    if (inside(r + 1, c) && board[r + 1][c] === pawn) return true;
    if (r <= 4) {
      if (inside(r, c - 1) && board[r][c - 1] === pawn) return true;
      if (inside(r, c + 1) && board[r][c + 1] === pawn) return true;
    }
  } else {
    if (inside(r - 1, c) && board[r - 1][c] === pawn) return true;
    if (r >= 5) {
      if (inside(r, c - 1) && board[r][c - 1] === pawn) return true;
      if (inside(r, c + 1) && board[r][c + 1] === pawn) return true;
    }
  }
  return false;
}

function findKing(board: XBoard, color: XColor): { r: number; c: number } | null {
  const k = color === 'red' ? 'K' : 'k';
  for (let r = 0; r <= 9; r++) {
    for (let c = 0; c <= 8; c++) {
      if (board[r][c] === k) return { r, c };
    }
  }
  return null;
}

/** 将帅照面：同列且中间无子 */
export function kingsFacing(board: XBoard): boolean {
  const rk = findKing(board, 'red');
  const bk = findKing(board, 'black');
  if (!rk || !bk || rk.c !== bk.c) return false;
  const lo = Math.min(rk.r, bk.r);
  const hi = Math.max(rk.r, bk.r);
  for (let r = lo + 1; r < hi; r++) {
    if (board[r][rk.c] !== null) return false;
  }
  return true;
}

/** 伪合法走法（不含“走后被将/照面”过滤） */
function pseudoMoves(board: XBoard, color: XColor): Array<{ from: string; to: string; capture: boolean }> {
  const out: Array<{ from: string; to: string; capture: boolean }> = [];
  const push = (fr: number, fc: number, tr: number, tc: number) => {
    if (!canLand(board, tr, tc, color)) return;
    out.push({ from: squareOf(fr, fc), to: squareOf(tr, tc), capture: board[tr][tc] !== null });
  };
  for (let r = 0; r <= 9; r++) {
    for (let c = 0; c <= 8; c++) {
      const p = board[r][c];
      if (p === null || xColorOf(p) !== color) continue;
      switch (p.toUpperCase()) {
        case 'R': {
          for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]] as Array<[number, number]>) {
            let rr = r + dr;
            let cc = c + dc;
            while (inside(rr, cc) && board[rr][cc] === null) {
              push(r, c, rr, cc);
              rr += dr;
              cc += dc;
            }
            if (inside(rr, cc)) push(r, c, rr, cc); // 吃子或顶自子（push 内过滤）
          }
          break;
        }
        case 'C': {
          for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]] as Array<[number, number]>) {
            let rr = r + dr;
            let cc = c + dc;
            while (inside(rr, cc) && board[rr][cc] === null) {
              push(r, c, rr, cc);
              rr += dr;
              cc += dc;
            }
            // 越过炮架，寻找炮架之后的第一个子
            if (inside(rr, cc)) {
              rr += dr;
              cc += dc;
              while (inside(rr, cc) && board[rr][cc] === null) {
                rr += dr;
                cc += dc;
              }
              if (inside(rr, cc)) push(r, c, rr, cc); // 仅当为目标敌方子时 push
            }
          }
          break;
        }
        case 'N': {
          for (const [dr, dc] of [
            [-2, -1],
            [-2, 1],
            [-1, -2],
            [-1, 2],
            [1, -2],
            [1, 2],
            [2, -1],
            [2, 1],
          ] as Array<[number, number]>) {
            const legR = Math.abs(dc) === 2 ? r : r + Math.trunc(dr / 2);
            const legC = Math.abs(dc) === 2 ? c + Math.trunc(dc / 2) : c;
            if (!inside(legR, legC) || board[legR][legC] !== null) continue; // 蹩马腿
            push(r, c, r + dr, c + dc);
          }
          break;
        }
        case 'B': {
          for (const [dr, dc] of [
            [-2, -2],
            [-2, 2],
            [2, -2],
            [2, 2],
          ] as Array<[number, number]>) {
            const tr = r + dr;
            const tc = c + dc;
            if (!inside(tr, tc) || !elephantReachable(color, tr)) continue; // 不能过河
            const legR = r + dr / 2;
            const legC = c + dc / 2;
            if (board[legR][legC] !== null) continue; // 塞象眼
            push(r, c, tr, tc);
          }
          break;
        }
        case 'A': {
          for (const [dr, dc] of [
            [-1, -1],
            [-1, 1],
            [1, -1],
            [1, 1],
          ] as Array<[number, number]>) {
            const tr = r + dr;
            const tc = c + dc;
            if (!inPalace(color, tr, tc)) continue;
            push(r, c, tr, tc);
          }
          break;
        }
        case 'K': {
          for (const [dr, dc] of [
            [-1, 0],
            [1, 0],
            [0, -1],
            [0, 1],
          ] as Array<[number, number]>) {
            const tr = r + dr;
            const tc = c + dc;
            if (!inPalace(color, tr, tc)) continue;
            push(r, c, tr, tc);
          }
          break;
        }
        case 'P': {
          const fwd = color === 'red' ? -1 : 1;
          push(r, c, r + fwd, c);
          const crossed = color === 'red' ? r <= 4 : r >= 5;
          if (crossed) {
            push(r, c, r, c - 1);
            push(r, c, r, c + 1);
          }
          break;
        }
      }
    }
  }
  return out;
}

function boardAfter(board: XBoard, from: { r: number; c: number }, to: { r: number; c: number }): XBoard {
  const nb: XBoard = board.map((row) => row.slice());
  nb[to.r][to.c] = nb[from.r][from.c];
  nb[from.r][from.c] = null;
  return nb;
}

function boardKey(board: XBoard, toMove: XColor): string {
  return board.map((row) => row.map((x) => x ?? '.').join('')).join('/') + ' ' + toMove;
}

function anyAttackPiece(board: XBoard): boolean {
  for (let r = 0; r <= 9; r++) {
    for (let c = 0; c <= 8; c++) {
      const p = board[r][c];
      if (p === null) continue;
      if ('RNCPrncp'.includes(p)) return true;
    }
  }
  return false;
}

interface LogEntry {
  side: XColor;
  gaveCheck: boolean;
}

export class XiangqiEngine implements GameEngine {
  readonly kind = 'xiangqi' as const;
  private board: XBoard;
  private toMove: XColor;
  private plies = 0;
  private halfmoveClock = 0;
  private log: LogEntry[] = [];
  private positions = new Map<string, number[]>();
  private _outcome: GameOutcome | null = null;

  constructor(fen: string = START_FEN) {
    const parsed = parseFen(fen);
    this.board = parsed.board;
    this.toMove = parsed.toMove;
    if (!this.boardHasValidKings()) throw new Error('FEN 双方将/帅缺失');
    this.positions.set(boardKey(this.board, this.toMove), [0]);
    // 从 FEN 加载时检测已终结的局面（将死/困毙/无攻击子力）；
    // 重复局面与限着计数无法从单一 FEN 恢复，从初始局面重放时完整有效。
    this._outcome = this.detectLoadedOutcome();
  }

  private detectLoadedOutcome(): GameOutcome | null {
    if (!anyAttackPiece(this.board)) {
      return { type: 'insufficient', winner: null, reason: '双方均无攻击子力，判和' };
    }
    if (this.legalMovesRaw().length === 0) {
      const loser = this.toMove;
      if (this.inCheck()) {
        return { type: 'checkmate', winner: sideOf(other(loser)), reason: '将死' };
      }
      return { type: 'stalemate', winner: sideOf(other(loser)), reason: '困毙（无子可动判负）' };
    }
    return null;
  }

  /** 未做终局短路的原生合法走法（供构造期检测） */
  private legalMovesRaw(): LegalMove[] {
    const res: LegalMove[] = [];
    for (const m of pseudoMoves(this.board, this.toMove)) {
      if (this.moveSafeRaw(m.from, m.to)) res.push({ from: m.from, to: m.to, capture: m.capture });
    }
    return res;
  }

  static fromFen(fen: string): XiangqiEngine {
    return new XiangqiEngine(fen);
  }

  private boardHasValidKings(): boolean {
    let red = 0;
    let black = 0;
    for (let r = 0; r <= 9; r++) {
      for (let c = 0; c <= 8; c++) {
        const p = this.board[r][c];
        if (p === 'K') red++;
        else if (p === 'k') black++;
      }
    }
    return red === 1 && black === 1;
  }

  fen(): string {
    const rows: string[] = [];
    for (let r = 0; r <= 9; r++) {
      let row = '';
      let empty = 0;
      for (let c = 0; c <= 8; c++) {
        const p = this.board[r][c];
        if (p === null) {
          empty++;
        } else {
          if (empty > 0) {
            row += String(empty);
            empty = 0;
          }
          row += p;
        }
      }
      if (empty > 0) row += String(empty);
      rows.push(row);
    }
    return rows.join('/') + ' ' + (this.toMove === 'red' ? 'w' : 'b');
  }

  turn(): Side {
    return sideOf(this.toMove);
  }

  turnColor(): XColor {
    return this.toMove;
  }

  boardGrid(): XBoard {
    return this.board.map((row) => row.slice());
  }

  pieceAt(sq: string): string | null {
    const { r, c } = parseSquare(sq);
    return this.board[r][c];
  }

  moveCount(): number {
    return this.plies;
  }

  inCheck(): boolean {
    const k = findKing(this.board, this.toMove);
    if (!k) return false;
    return isSquareAttacked(this.board, k.r, k.c, other(this.toMove));
  }

  checkedKingSquare(): string | null {
    if (!this.inCheck()) return null;
    const k = findKing(this.board, this.toMove);
    return k ? squareOf(k.r, k.c) : null;
  }

  legalMoves(): LegalMove[] {
    if (this._outcome) return [];
    const res: LegalMove[] = [];
    for (const m of pseudoMoves(this.board, this.toMove)) {
      if (this.moveSafe(m.from, m.to)) res.push({ from: m.from, to: m.to, capture: m.capture });
    }
    return res;
  }

  movesFrom(sq: string): LegalMove[] {
    return this.legalMoves().filter((m) => m.from === sq);
  }

  isLegal(move: MoveInput): boolean {
    if (this._outcome) return false;
    if (move.promotion !== undefined) return false;
    return this.moveSafe(move.from, move.to);
  }

  private moveSafe(from: string, to: string): boolean {
    if (this._outcome) return false;
    return this.moveSafeRaw(from, to);
  }

  private moveSafeRaw(from: string, to: string): boolean {
    let f: { r: number; c: number };
    let t: { r: number; c: number };
    try {
      f = parseSquare(from);
      t = parseSquare(to);
    } catch {
      return false;
    }
    if (f.r === t.r && f.c === t.c) return false;
    const p = this.board[f.r]?.[f.c];
    if (!p || xColorOf(p) !== this.toMove) return false;
    const target = this.board[t.r][t.c];
    if (target === 'K' || target === 'k') return false; // 永不实际吃掉将/帅（将死即终局）
    const pseudo = pseudoMoves(this.board, this.toMove);
    const found = pseudo.some((m) => m.from === from && m.to === to);
    if (!found) return false;
    const nb = boardAfter(this.board, f, t);
    if (kingsFacing(nb)) return false; // 将帅照面禁着
    const ownKing = findKing(nb, this.toMove);
    if (!ownKing) return false;
    if (isSquareAttacked(nb, ownKing.r, ownKing.c, other(this.toMove))) return false;
    return true;
  }

  applyMove(move: MoveInput): AppliedMove | null {
    if (this._outcome) return null;
    if (move.promotion !== undefined) return null;
    if (!this.isLegal(move)) return null;
    const f = parseSquare(move.from);
    const t = parseSquare(move.to);
    const mover = this.board[f.r][f.c]!;
    const moverColor = xColorOf(mover);
    const captured = this.board[t.r][t.c];
    const notation = chineseNotation(this.board, move.from, move.to);
    const fenBefore = this.fen();

    const nb = boardAfter(this.board, f, t);
    this.board = nb;
    this.plies += 1;
    this.toMove = other(moverColor);
    if (captured !== null) this.halfmoveClock = 0;
    else this.halfmoveClock += 1;

    // 是否将军（走后对方将被攻击）
    const oppKing = findKing(this.board, this.toMove);
    const gaveCheck = oppKing !== null && isSquareAttacked(this.board, oppKing.r, oppKing.c, moverColor);
    this.log.push({ side: moverColor, gaveCheck });

    const fenAfter = this.fen();
    const key = boardKey(this.board, this.toMove);
    const occ = this.positions.get(key) ?? [];
    occ.push(this.plies);
    this.positions.set(key, occ);

    // 终局判定
    let outcome: GameOutcome | null = null;
    if (occ.length === 3) {
      outcome = this.resolveRepetition(occ);
    }
    if (!outcome && this.legalMoves().length === 0) {
      const loser = this.toMove;
      if (this.inCheck()) {
        outcome = { type: 'checkmate', winner: sideOf(other(loser)), reason: '将死' };
      } else {
        outcome = { type: 'stalemate', winner: sideOf(other(loser)), reason: '困毙（无子可动判负）' };
      }
    }
    if (!outcome && !anyAttackPiece(this.board)) {
      outcome = { type: 'insufficient', winner: null, reason: '双方均无攻击子力，判和' };
    }
    if (!outcome && this.halfmoveClock >= 120) {
      outcome = { type: 'fifty-move', winner: null, reason: '60 回合无吃子，判和' };
    }
    this._outcome = outcome;

    return { notation, captured, gaveCheck, fenBefore, fenAfter, outcome };
  }

  outcome(): GameOutcome | null {
    return this._outcome;
  }

  /**
   * 三次重复局面仲裁：
   * - 若重复区间内一方每步都在将军 → 该方长将，判负；
   * - 否则按重复局面判和。
   * 位置 P 出现在 ply p1<p2<p3（走完 p3 步后局面回到 P，轮同一方走）。
   */
  private resolveRepetition(occ: number[]): GameOutcome {
    const [p1, , p3] = occ;
    const checkedSide = this.toMove; // 重复局面轮到走的一方
    const moverSide = other(checkedSide);
    let checkedAllChecks = true;
    let moverAllChecks = true;
    let checkedCount = 0;
    let moverCount = 0;
    for (let ply = p1 + 1; ply <= p3; ply++) {
      const entry = this.log[ply - 1];
      if (!entry) continue;
      if (entry.side === checkedSide) {
        checkedCount++;
        if (!entry.gaveCheck) checkedAllChecks = false;
      } else if (entry.side === moverSide) {
        moverCount++;
        if (!entry.gaveCheck) moverAllChecks = false;
      }
    }
    if (checkedCount > 0 && checkedAllChecks) {
      return { type: 'repetition', winner: sideOf(moverSide), reason: '三次重复局面，长将方判负' };
    }
    if (moverCount > 0 && moverAllChecks) {
      return { type: 'repetition', winner: sideOf(checkedSide), reason: '三次重复局面，长将方判负' };
    }
    return { type: 'repetition', winner: null, reason: '三次重复局面，判和' };
  }
}

export function parseFen(fen: string): { board: XBoard; toMove: XColor } {
  const parts = fen.trim().split(/\s+/);
  if (parts.length < 1) throw new Error('FEN 为空');
  const rows = parts[0].split('/');
  if (rows.length !== 10) throw new Error(`FEN 应有 10 行，实际 ${rows.length}`);
  const board: XBoard = [];
  for (let r = 0; r < 10; r++) {
    const row: Cell[] = [];
    let c = 0;
    for (const ch of rows[r]) {
      if (ch >= '1' && ch <= '9') {
        const n = ch.charCodeAt(0) - 48;
        for (let i = 0; i < n; i++) row.push(null);
        c += n;
      } else if (PIECE_CHARS.includes(ch)) {
        if (c > 8) throw new Error('FEN 行超长');
        row.push(ch);
        c++;
      } else {
        throw new Error(`FEN 含非法字符: ${ch}`);
      }
    }
    if (c !== 9) throw new Error(`FEN 第 ${r} 行应为 9 列`);
    board.push(row);
  }
  const side = parts[1] ?? 'w';
  if (side !== 'w' && side !== 'b') throw new Error(`FEN 走棋方应为 w/b: ${side}`);
  return { board, toMove: side === 'w' ? 'red' : 'black' };
}
