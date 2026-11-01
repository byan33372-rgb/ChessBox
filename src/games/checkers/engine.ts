/**
 * 中国跳棋规则引擎（自研，无第三方依赖；服务端与前端共用同一实现 = 服务端权威验证）。
 *
 * 采用规则变体（CHECKERS-014/015/022，UI 规则说明需一致展示）：
 * - 无强制跳跃：玩家可自由选择普通移动或跳跃；
 * - 无吃子：被跳过的棋子保留；
 * - 每人 10 枚棋子；目标营地 = 起始营地的正对面；
 * - 已进入目标营地的棋子不得离开目标营地（营内可移动）；
 * - 不得进入任何非自己目标营地的营地（含中转跳跃落点）；
 * - 连续跳跃：一着内可多段跳跃，客户端提交完整路径，服务端逐段校验
 *   （每段越过紧邻棋子、落点为空、路径无重复格）；普通移动必须恰好 2 点路径；
 * - 胜利：己方全部 10 枚棋子进入目标营地（CHECKERS-021）。
 *
 * 状态序列化（fen 槽位复用，格式 "cc1"，DATA-004）：
 *   `cc1|turn=a|order=abc|p=a:i9,h8,..;b:..`（order = 座位轮转顺序）
 */

import type { AppliedMove, GameEngine, GameOutcome, LegalMove, MoveInput, Side } from '../types';
import { ALL_CELLS, SEAT_CAMP_MAPS, SUPPORTED_SEAT_COUNTS, campOf, cellRC, isValidCell, jumpLanding, neighborsOf, targetCamp } from './board';

export type CheckersSeat = 'a' | 'b' | 'c' | 'd' | 'e' | 'f';

export const CHECKERS_PIECE_COUNT = 10;

/** 六个营地的玩家颜色（UI 与棋盘渲染共用） */
export const CHECKERS_COLORS: Record<string, string> = {
  a: '#c43e2f', // 红
  b: '#2f6fb0', // 蓝
  c: '#3f8f4f', // 绿
  d: '#d9a521', // 黄
  e: '#2b2620', // 黑
  f: '#7d5bb5', // 紫
};

export const CHECKERS_NAMES: Record<string, string> = {
  a: '红方',
  b: '蓝方',
  c: '绿方',
  d: '黄方',
  e: '黑方',
  f: '紫方',
};

function parseState(fen: string): { turn: CheckersSeat; order: CheckersSeat[]; pieces: Map<string, CheckersSeat>; seatCount: number } | null {
  const parts = fen.split('|');
  if (parts[0] !== 'cc1') return null;
  let turn: CheckersSeat = 'a';
  let order: CheckersSeat[] = ['a', 'b'];
  const pieces = new Map<string, CheckersSeat>();
  for (let i = 1; i < parts.length; i++) {
    const kv = parts[i].split('=');
    if (kv.length !== 2) continue;
    const [k, v] = kv;
    if (k === 'turn' && /^[a-f]$/.test(v)) turn = v as CheckersSeat;
    else if (k === 'order' && /^[a-f]{1,6}$/.test(v)) order = v.split('') as CheckersSeat[];
    else if (k === 'p') {
      // 鲁棒解析：座位段以 ';' 或 ',' 分隔均可（'a:i10;b:j10' 或 'a:i10,b:j10'）
      let cur: CheckersSeat | null = null;
      for (const tok of v.split(/[;,:]/)) {
        if (!tok) continue;
        if (/^[a-f]$/.test(tok)) {
          cur = tok as CheckersSeat;
          continue;
        }
        if (cur && isValidCell(tok)) pieces.set(tok, cur);
      }
    }
  }
  return { turn, order, pieces, seatCount: order.length };
}

function serialize(turn: CheckersSeat, order: CheckersSeat[], pieces: Map<string, CheckersSeat>): string {
  const bySeat = new Map<CheckersSeat, string[]>();
  for (const [cell, seat] of pieces) {
    const arr = bySeat.get(seat) ?? [];
    arr.push(cell);
    bySeat.set(seat, arr);
  }
  const p = order
    .map((s) => `${s}:${(bySeat.get(s) ?? []).sort().join(',')}`)
    .join(';');
  return `cc1|turn=${turn}|order=${order.join('')}|p=${p}`;
}

export interface CheckersEngineOptions {
  /** 座位顺序（决定营地分配与轮转顺序）；缺省 ['a','b'] */
  order?: CheckersSeat[];
}

export class CheckersEngine implements GameEngine {
  readonly kind = 'checkers' as const;
  private order: CheckersSeat[];
  private turnSeat: CheckersSeat;
  private pieces: Map<string, CheckersSeat>; // cellId → seat
  private camps: Map<CheckersSeat, number>; // seat → 起始营地
  private targets: Map<CheckersSeat, number>; // seat → 目标营地
  private plies = 0;
  private _outcome: GameOutcome | null = null;
  /** 已退出的座位（认输）：轮转时跳过 */
  private resigned = new Set<CheckersSeat>();

  constructor(fen?: string, options?: CheckersEngineOptions) {
    const order = options?.order ?? (fen ? undefined : undefined);
    if (fen) {
      const st = parseState(fen);
      if (!st) throw new Error('跳棋 FEN 非法');
      this.turnSeat = st.turn;
      this.order = st.order;
      this.pieces = st.pieces;
      const map = SEAT_CAMP_MAPS[st.order.length];
      if (!map) throw new Error(`不支持的人数: ${st.order.length}`);
      this.camps = new Map(st.order.map((s) => [s, map[s]]));
      this.targets = new Map(st.order.map((s) => [s, targetCamp(map[s])]));
      // 加载即胜检测（CHECKERS-023）：某座位全部棋子已在目标营地
      for (const seat of this.order) {
        const tSet = new Set(ALL_CELLS.filter((c) => c.camp === this.targets.get(seat)).map((c) => c.id));
        const mine = [...this.pieces.entries()].filter(([, s]) => s === seat).map(([cell]) => cell);
        // 必须是完整 10 子局面（部分局面 FEN 仅用于测试构造，不判胜）
        if (mine.length === CHECKERS_PIECE_COUNT && mine.every((c) => tSet.has(c))) {
          this._outcome = { type: 'goal', winner: seat, reason: `${CHECKERS_NAMES[seat]}全部进入目标营地，获胜` };
          break;
        }
      }
    } else {
      const ord = order ?? (['a', 'b'] as CheckersSeat[]);
      if (!(ord.length in SEAT_CAMP_MAPS) || new Set(ord).size !== ord.length) {
        throw new Error(`不支持的座位: ${ord.join('')}`);
      }
      this.order = ord;
      this.turnSeat = ord[0];
      const campMap = SEAT_CAMP_MAPS[ord.length];
      this.camps = new Map(ord.map((s) => [s, campMap[s]]));
      this.targets = new Map(ord.map((s) => [s, targetCamp(campMap[s])]));
      this.pieces = new Map();
      for (const s of ord) {
        for (const cell of ALL_CELLS.filter((c) => c.camp === campMap[s])) {
          this.pieces.set(cell.id, s);
        }
      }
    }
  }

  static create(seatCount: 2 | 3 | 4 | 6, firstSeat: CheckersSeat = 'a'): CheckersEngine {
    const seats = 'abcdef'.slice(0, seatCount).split('') as CheckersSeat[];
    // 让 firstSeat 排在轮转首位
    const idx = seats.indexOf(firstSeat);
    const order = [...seats.slice(idx), ...seats.slice(0, idx)] as CheckersSeat[];
    return new CheckersEngine(undefined, { order });
  }

  fen(): string {
    return serialize(this.turnSeat, this.order, this.pieces);
  }

  turn(): Side {
    return this.turnSeat;
  }

  /** 座位轮转顺序（多玩家 UI 展示用） */
  seatOrder(): CheckersSeat[] {
    return [...this.order];
  }

  seatCount(): number {
    return this.order.length;
  }

  /** 支持的座位数列表（静态） */
  static supportedSeatCounts(): ReadonlyArray<number> {
    return SUPPORTED_SEAT_COUNTS;
  }

  inCheck(): boolean {
    return false; // 跳棋无将军概念
  }

  checkedKingSquare(): null {
    return null;
  }

  moveCount(): number {
    return this.plies;
  }

  pieceAt(sq: string): string | null {
    const s = this.pieces.get(sq);
    return s ? s.toUpperCase() : null; // 大写 = 所属座位（与 a/b 大小写约定一致）
  }

  /** 某座位的全部棋子位置 */
  piecesOf(seat: CheckersSeat): string[] {
    return [...this.pieces.entries()].filter(([, s]) => s === seat).map(([c]) => c);
  }

  outcome(): GameOutcome | null {
    return this._outcome;
  }

  private targetCellSet(seat: CheckersSeat): Set<string> {
    const t = this.targets.get(seat)!;
    return new Set(ALL_CELLS.filter((c) => c.camp === t).map((c) => c.id));
  }

  /** 营地约束（CHECKERS-022）：不得进入他人营地；己方起始营与目标营允许；已在目标营地内则不得离开 */
  private campViolation(seat: CheckersSeat, cell: string, movingFrom: string): boolean {
    const camp = campOf(cell);
    const myTarget = this.targets.get(seat)!;
    const myCamp = this.camps.get(seat)!;
    if (camp >= 0 && camp !== myTarget && camp !== myCamp) return true; // 他人营地禁入（起始营内互走合法）
    const fromCamp = campOf(movingFrom);
    if (fromCamp === myTarget && camp !== myTarget) return true; // 已在目标营地不得离开
    return false;
  }

  /** 单段普通移动合法目标（CHECKERS-006/012/013） */
  private stepTargets(from: string, seat: CheckersSeat): string[] {
    const out: string[] = [];
    for (const n of neighborsOf(from)) {
      if (!this.pieces.has(n) && !this.campViolation(seat, n, from)) out.push(n);
    }
    return out;
  }

  /** 单段跳跃合法落点（CHECKERS-007~009）：越过紧邻棋子，落点为空 */
  private jumpTargets(from: string, seat: CheckersSeat): string[] {
    const [fr, fc] = cellRC(from)!;
    const out: string[] = [];
    for (const [dr, dc] of [
      [0, 1],
      [0, -1],
      [1, 0],
      [-1, 0],
      [1, 1],
      [-1, -1],
    ]) {
      const mid = neighborsOf(from).find((n) => {
        const nc = cellRC(n)!;
        return nc[0] === fr + dr && nc[1] === fc + dc;
      });
      if (mid === undefined) continue;
      if (!this.pieces.has(mid)) continue; // 必须恰好越过一枚棋子（己方或对方均可）
      const land = jumpLanding(from, dr, dc);
      if (land && !this.pieces.has(land) && !this.campViolation(seat, land, from)) out.push(land);
    }
    return out;
  }

  legalMoves(): LegalMove[] {
    if (this._outcome) return [];
    const out: LegalMove[] = [];
    for (const from of this.piecesOf(this.turnSeat)) {
      for (const to of this.stepTargets(from, this.turnSeat)) out.push({ from, to, capture: false });
      for (const to of this.jumpTargets(from, this.turnSeat)) out.push({ from, to, capture: false });
    }
    return out;
  }

  isLegal(move: MoveInput): boolean {
    return this.validatePath(move) !== null;
  }

  /**
   * 完整路径校验（服务端权威，CHECKERS-010/011/SEC-005/006）：
   * - 路径 ≥2 点、全部在盘内、无重复格；
   * - 起点棋子属于当前轮次座位；
   * - n=2：相邻空位普通移动 或 单段跳跃；
   * - n>2：每段都必须是跳跃（越过紧邻棋子、落点为空）；
   * - 终点满足营地约束。
   * 返回规范化路径（非法返回 null）。防循环：visited 集合 + 路径长度上限 16。
   */
  validatePath(move: MoveInput): string[] | null {
    if (this._outcome) return null;
    const seat = this.turnSeat;
    const raw = move.path ?? [move.from, move.to];
    if (!Array.isArray(raw) || raw.length < 2 || raw.length > 16) return null;
    const path: string[] = [];
    const visited = new Set<string>();
    for (const cell of raw) {
      if (typeof cell !== 'string' || !isValidCell(cell)) return null;
      if (visited.has(cell)) return null; // 重复落点/循环（SEC-006）
      visited.add(cell);
      path.push(cell);
    }
    const start = path[0];
    if (this.pieces.get(start) !== seat) return null; // 只能动自己的棋子
    for (let i = 1; i < path.length; i++) {
      const from = path[i - 1];
      const to = path[i];
      if (this.stepTargets(from, seat).includes(to)) {
        if (path.length !== 2) return null; // 普通移动只能是一步
      } else if (!this.jumpTargets(from, seat).includes(to)) {
        return null; // 既非普通移动也非合法跳跃
      }
    }
    if (this.campViolation(seat, path[path.length - 1], start)) return null;
    return path;
  }

  applyMove(move: MoveInput): AppliedMove | null {
    const path = this.validatePath(move);
    if (!path) return null;
    const seat = this.turnSeat;
    const from = path[0];
    const to = path[path.length - 1];
    const fenBefore = this.fen();

    this.pieces.delete(from);
    this.pieces.set(to, seat);
    this.plies += 1;

    // 轮转：跳过已退出的座位
    const idx = this.order.indexOf(seat);
    let next = seat;
    for (let step = 1; step <= this.order.length; step++) {
      const cand = this.order[(idx + step) % this.order.length];
      if (!this.resigned.has(cand)) {
        next = cand;
        break;
      }
    }
    this.turnSeat = next;

    const isJump = path.length > 2;
    const notation = isJump
      ? `${path.join('→')}（连跳×${path.length - 1}）`
      : `${from}→${to}`;

    // 胜利判定（CHECKERS-021/023）
    let outcome: GameOutcome | null = null;
    const target = this.targetCellSet(seat);
    const mine = this.piecesOf(seat);
    if (mine.length > 0 && mine.every((c) => target.has(c))) {
      outcome = { type: 'goal', winner: seat, reason: `${CHECKERS_NAMES[seat]}全部进入目标营地，获胜` };
    }

    this._outcome = outcome;
    return {
      notation,
      captured: null, // 无吃子规则（CHECKERS-015）
      gaveCheck: false,
      fenBefore,
      fenAfter: this.fen(),
      outcome,
      // 连续跳跃完整路径（MOVE-004/CHECKERS-027）：单步省略
      path: path.length > 2 ? path : undefined,
    };
  }

  /** 认输：多人局标记该座位退出；若仅剩一名未退出者则其获胜（CHECKERS-024） */
  resignSeat(seat: CheckersSeat): GameOutcome | null {
    this.resigned.add(seat);
    const alive = this.order.filter((s) => !this.resigned.has(s));
    if (alive.length === 1) {
      this._outcome = { type: 'resignation', winner: alive[0], reason: `其余玩家均已认输，${CHECKERS_NAMES[alive[0]]}获胜` };
      return this._outcome;
    }
    if (alive.length === 0) {
      this._outcome = { type: 'resignation', winner: null, reason: '全部玩家认输，和棋' };
      return this._outcome;
    }
    // 若退出的正是当前轮次者，推进轮次
    if (this.turnSeat === seat) {
      const idx = this.order.indexOf(seat);
      for (let step = 1; step <= this.order.length; step++) {
        const cand = this.order[(idx + step) % this.order.length];
        if (!this.resigned.has(cand)) {
          this.turnSeat = cand;
          break;
        }
      }
    }
    return null;
  }

  /** 剩余仍在对局的座位 */
  activeSeats(): CheckersSeat[] {
    return this.order.filter((s) => !this.resigned.has(s));
  }
}
