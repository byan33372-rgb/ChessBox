/**
 * 围棋规则引擎（自研，无第三方依赖；服务端与前端共用同一实现 = 服务端权威验证）。
 *
 * 规则配置（声明式，房间内展示，GO-011/013/017/018）：
 * - 中国规则：区域计分（活子 + 围空），贴目 7.5 目（白方），黑先行；
 * - 禁自杀（自填满后无气且未提子 = 非法）；
 * - 全局同形禁止（positional superko）：禁止重现任意历史全局棋形（中国规则口径，不含打劫特例——superko 已覆盖劫）；
 * - 连续两次停一手（pass）进入数子阶段；双方确认死子后按区域计分终局；
 *   数子阶段可标记/取消死子块（mark:<点>），双方各自确认（score-confirm），意见不一致可恢复对弈（score-resume）；
 * - 认输（resignSeat）。
 *
 * 坐标（GO-005 声明）：列字母 a..s（19 路，连续字母不跳过 I），行号 1..size；如 a1、t 不存在。
 * 平台坐标与 SGF 双字母一一对应（SGF a..s），导出直映射（GO-022，仅支持子集：AB/W/B/W/RE/SZ/KM/C/PB/PW，见 buildSgf）。
 *
 * 状态序列化（fen 槽位，DATA 兼容）：
 *   `go19|turn=b|phase=playing|passes=0|capB=0|capW=0|b:...;w:...|dead:...`
 * 历史局面（superko 集合）不入 fen——由 replay 从首着 fenBefore 逐步重放重建。
 */

import type { AppliedMove, GameEngine, GameOutcome, LegalMove, MoveInput, Side } from '../types';

export type GoSize = 9 | 13 | 19;

export const GO_KOMI = 7.5; // GO-018：中国规则贴目 7.5 目（白方），房间信息展示

const SIZES: GoSize[] = [9, 13, 19];

/** 星位与天元（GO-005）：9 路四星+天元；13 路四星+天元；19 路九星 */
export function starPoints(size: GoSize): string[] {
  const edge = size === 9 ? 2 : size === 13 ? 3 : 3;
  const far = size - 1 - edge;
  const mid = (size - 1) / 2;
  const xs = size === 19 ? [edge, mid, far] : [edge, far];
  const pts: string[] = [];
  for (const x of xs) for (const y of xs) pts.push(col(x) + (y + 1));
  if (size !== 9 || true) {
    // 天元（9/13/19 均有）
    pts.push(col(mid) + (mid + 1));
  }
  return [...new Set(pts)];
}

function col(i: number): string {
  return String.fromCharCode(97 + i);
}
function colIdx(ch: string): number {
  return ch.charCodeAt(0) - 97;
}
function ptName(x: number, y: number): string {
  return col(x) + (y + 1);
}

export interface GoPoint {
  x: number;
  y: number;
}

function parsePoint(sq: string): GoPoint | null {
  const m = /^([a-t])([0-9]{1,2})$/.exec(sq);
  if (!m) return null;
  const x = colIdx(m[1]);
  const y = Number(m[2]) - 1;
  if (x < 0 || y < 0) return null;
  return { x, y };
}

export type Stone = 'b' | 'w';

interface Group {
  stones: string[];
  libs: Set<string>;
}

/** 棋谱 SGF 导出（GO-022；仅支持子集并在 note 中声明） */
export function buildSgf(size: GoSize, moves: Array<{ side: Side; from: string; captured?: string[] | null }>, names: { a?: string; b?: string }, result: string): string {
  const head = `(;GM[1]FF[4]SZ[${size}]KM[${GO_KOMI}]RU[Chinese]PB[${names.b ?? '黑方'}]PW[${names.a ?? '白方'}]RE[${result || '?'}]`;
  // 平台 'a'=黑方先手? 平台约定 a=先手=黑。SGF: B=黑 W=白
  const body = moves
    .map((m) => {
      if (m.from === 'pass') return `;${m.side === 'a' ? 'B' : 'W'}[]`;
      const p = parsePoint(m.from)!;
      const c = col(p.x) + col(p.y);
      return `;${m.side === 'a' ? 'B' : 'W'}[${c}]`;
    })
    .join('');
  const note = `C[平台坐标为连续字母列(不跳过I);SGF仅支持子集: SZ/KM/RU/PB/PW/RE/B/W/pass]`;
  return head + body + ')' + '\n' + note;
}

export class GoEngine implements GameEngine {
  readonly kind = 'go' as const;
  size: GoSize = 19;
  private board: Map<string, Stone> = new Map(); // pt → stone
  private turnSeat: Side = 'a'; // a=黑先行（GO-006）
  private phase: 'playing' | 'scoring' | 'ended' = 'playing';
  private passes = 0;
  private capB = 0; // 黑方提子数（提白子）
  private capW = 0;
  private dead = new Set<string>(); // 数子阶段标记的死子
  private deadMarksBy = new Map<Side, Set<string>>(); // 双方各自标记（一致才算确认基础）
  private confirmed = new Set<Side>();
  private positionHistory = new Set<string>(); // superko：历史全局棋形（board 串）
  private plies = 0;
  private lastCaptured: string[] = [];
  private _outcome: GameOutcome | null = null;

  constructor(fen?: string, opts?: { size?: GoSize }) {
    if (fen) {
      this.loadFen(fen);
    } else {
      this.size = (opts?.size ?? 19) as GoSize;
      if (!SIZES.includes(this.size)) throw new Error(`不支持的棋盘: ${this.size}`);
      this.board = new Map();
      // 初始局面历史键：黑（a）行棋（DEF-GO-001 修复：此前误记 'b' 导致打劫回提漏判）
      this.positionHistory.add(this.boardKey('a'));
    }
  }

  private loadFen(fen: string): void {
    const parts = fen.split('|');
    if (parts[0] !== 'go9' && parts[0] !== 'go13' && parts[0] !== 'go19') throw new Error('围棋 FEN 非法');
    this.size = Number(parts[0].slice(2)) as GoSize;
    this.board = new Map();
    let deadStr = '';
    for (let i = 1; i < parts.length; i++) {
      const eq = parts[i].indexOf('=');
      if (eq < 0) continue;
      const k = parts[i].slice(0, eq);
      const v = parts[i].slice(eq + 1);
      switch (k) {
        case 'turn':
          if (v === 'a' || v === 'b') this.turnSeat = v;
          break;
        case 'phase':
          if (v === 'playing' || v === 'scoring' || v === 'ended') this.phase = v;
          break;
        case 'passes':
          this.passes = Number(v) || 0;
          break;
        case 'capB':
          this.capB = Number(v) || 0;
          break;
        case 'capW':
          this.capW = Number(v) || 0;
          break;
        case 'b':
        case 'w':
          if (v) {
            const stone: Stone = k === 'b' ? 'b' : 'w';
            for (const t of v.split(',')) {
              if (!t) continue;
              if (!this.validPt(t)) throw new Error('围棋 FEN 非法');
              this.board.set(t, stone);
            }
          }
          break;
        case 'dead':
          deadStr = v;
          break;
      }
    }
    if (deadStr) for (const t of deadStr.split(',')) if (t && this.validPt(t)) this.dead.add(t);
    // 重载局面的 superko 历史至少包含当前局面（DEF-GO-002：否则重载后回提漏判）
    this.positionHistory.add(this.boardKey(this.turnSeat));
  }

  private validPt(sq: string): boolean {
    const p = parsePoint(sq);
    return !!p && p.x < this.size && p.y < this.size;
  }

  static create(size: GoSize = 19): GoEngine {
    return new GoEngine(undefined, { size });
  }

  fen(): string {
    const byColor: Record<Stone, string[]> = { b: [], w: [] };
    for (const [pt, s] of this.board) byColor[s].push(pt);
    const sort = (a: string[]) => a.sort();
    return `go${this.size}|turn=${this.turnSeat}|phase=${this.phase}|passes=${this.passes}|capB=${this.capB}|capW=${this.capW}|b=${sort(byColor.b).join(',')}|w=${sort(byColor.w).join(',')}${this.dead.size ? `|dead=${sort([...this.dead]).join(',')}` : ''}`;
  }

  turn(): Side {
    return this.turnSeat;
  }

  phaseOf(): 'playing' | 'scoring' | 'ended' {
    return this.phase;
  }

  capturesOf(side: Side): number {
    return side === 'a' ? this.capB : this.capW;
  }

  deadStones(): string[] {
    return [...this.dead];
  }

  /** 双方各自的死子标记（GO-019 意见展示用） */
  deadMarksOf(side: Side): string[] {
    return [...(this.deadMarksBy.get(side) ?? [])];
  }

  confirmedOf(): Side[] {
    return [...this.confirmed];
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
    if (!s) return null;
    return s === 'b' ? 'B' : 'W';
  }

  stonesOf(side: Side): string[] {
    const want: Stone = side === 'a' ? 'b' : 'w';
    return [...this.board.entries()].filter(([, s]) => s === want).map(([p]) => p);
  }

  outcome(): GameOutcome | null {
    return this._outcome;
  }

  /** 合法着法提示（围棋 UI 不逐点提示；返回空由棋盘组件/服务端 isLegal 决定） */
  legalMoves(): LegalMove[] {
    return [];
  }

  /** 某点当前所属棋块（含气）——数子阶段标记死子与 UI 用 */
  groupAt(sq: string): Group | null {
    if (!this.board.has(sq)) return null;
    const color = this.board.get(sq)!;
    const seen = new Set<string>([sq]);
    const stack = [sq];
    const stones: string[] = [];
    const libs = new Set<string>();
    while (stack.length) {
      const cur = stack.pop()!;
      stones.push(cur);
      for (const n of this.neighbors(cur)) {
        const s = this.board.get(n);
        if (!s) libs.add(n);
        else if (s === color && !seen.has(n)) {
          seen.add(n);
          stack.push(n);
        }
      }
    }
    return { stones, libs };
  }

  private neighbors(pt: string): string[] {
    const p = parsePoint(pt)!;
    const out: string[] = [];
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const x = p.x + dx;
      const y = p.y + dy;
      if (x >= 0 && x < this.size && y >= 0 && y < this.size) out.push(ptName(x, y));
    }
    return out;
  }

  private boardKey(turn: string): string {
    // 全局棋形（含轮到哪方——中国规则 superko 常用 position-only；此处含行棋方更严格且无歧义，声明于规则文案）
    let s = `${this.size}#${turn}`;
    for (let y = this.size - 1; y >= 0; y--) {
      for (let x = 0; x < this.size; x++) {
        const st = this.board.get(ptName(x, y));
        s += st === 'b' ? 'X' : st === 'w' ? 'O' : '.';
      }
    }
    return s;
  }

  /** 完整规则检查（落子合法性/提子预演）——isLegal 布尔接口的内部实现 */
  checkMove(move: MoveInput): { ok: boolean; reason?: string; captures?: string[] } {
    if (this.phase !== 'playing') return { ok: false, reason: '对局已进入数子/结束阶段' };
    const stone: Stone = this.turnSeat === 'a' ? 'b' : 'w';
    const opp: Stone = stone === 'b' ? 'w' : 'b';
    if (!this.validPt(move.from)) return { ok: false, reason: '坐标非法' };
    if (this.board.has(move.from)) return { ok: false, reason: '交叉点已有棋子' };
    // 试落
    this.board.set(move.from, stone);
    const captured: string[] = [];
    for (const n of this.neighbors(move.from)) {
      if (this.board.get(n) === opp) {
        const g = this.groupAt(n);
        if (g && g.libs.size === 0) {
          for (const st of g.stones) {
            if (!captured.includes(st)) captured.push(st);
          }
        }
      }
    }
    for (const c of captured) this.board.delete(c);
    const own = this.groupAt(move.from)!;
    const suicide = own.libs.size === 0;
    // 还原
    this.board.set(move.from, undefined as never);
    this.board.delete(move.from);
    for (const c of captured) this.board.set(c, opp);
    if (suicide) return { ok: false, reason: '禁自杀点' };
    // superko：模拟后的全局棋形不得与历史重复
    const save = new Map(this.board);
    this.applyBoard(captured, move.from, stone, opp);
    const key = this.boardKey(this.turnSeat === 'a' ? 'b' : 'a');
    const dup = this.positionHistory.has(key);
    this.board.clear();
    for (const [k, v] of save) this.board.set(k, v);
    if (dup) return { ok: false, reason: '全局同形（禁止重复局面）' };
    return { ok: true, captures: captured };
  }

  isLegal(move: MoveInput): boolean {
    return this.checkMove(move).ok;
  }

  private applyBoard(captured: string[], placed: string, stone: Stone, opp: Stone): void {
    for (const c of captured) this.board.delete(c);
    this.board.set(placed, stone);
  }

  /** 数子：中国规则区域计分（活子+围空+贴目）；dead 为确认的死子 */
  score(dead: Set<string>): { black: number; white: number; diff: number; winner: Side | null } {
    let black = 0;
    let white = GO_KOMI; // 贴目归白（GO-018）
    const territory = new Map<string, Stone>(); // 空点归属
    for (const [pt, s] of this.board) {
      if (this.dead.has(pt)) continue; // 死子按空点处理
      if (s === 'b') black++;
      else white++;
    }
    // 空点归属：连通空域只接触一种颜色（死子视为空）
    const visited = new Set<string>();
    for (const [pt, s] of this.board) {
      if (s && !this.dead.has(pt)) continue;
      if (visited.has(pt) || this.board.has(pt)) {
        if (visited.has(pt)) continue;
      }
      if (visited.has(pt)) continue;
      // 从空点出发 flood
      const region: string[] = [];
      const borders = new Set<Stone>();
      const stack = [pt];
      visited.add(pt);
      while (stack.length) {
        const cur = stack.pop()!;
        region.push(cur);
        for (const n of this.neighbors(cur)) {
          const st = this.board.get(n);
          if (!st || this.dead.has(n)) {
            if (!visited.has(n)) {
              visited.add(n);
              stack.push(n);
            }
          } else borders.add(st);
        }
      }
      if (borders.size === 1) {
        const owner = [...borders][0];
        for (const rp of region) territory.set(rp, owner);
      }
    }
    for (const [, owner] of territory) {
      if (owner === 'b') black++;
      else white++;
    }
    // 死子作为提子计入对方（中国规则：死子归对方地盘已由空点+对方活子体现；此处不再重复计提子）
    const diff = black - white;
    return { black, white, diff, winner: diff > 0 ? 'a' : diff < 0 ? 'b' : null };
  }

  applyMove(move: MoveInput): AppliedMove | null {
    const from = move.from;
    // —— 数子阶段指令 ——
    if (this.phase === 'scoring') {
      return this.applyScoringCommand(from);
    }
    if (this.phase === 'ended') return null;

    // —— 停一手（GO-014） ——
    if (from === 'pass') {
      const fenBefore = this.fen();
      this.passes += 1;
      this.plies += 1;
      this.positionHistory.add(this.boardKey(this.turnSeat === 'a' ? 'b' : 'a'));
      this.turnSeat = this.turnSeat === 'a' ? 'b' : 'a';
      let outcome: GameOutcome | null = null;
      if (this.passes >= 2) {
        this.phase = 'scoring';
        this.deadMarksBy = new Map();
        this.confirmed = new Set();
      }
      this.lastCaptured = [];
      return {
        notation: '停一手',
        captured: null,
        gaveCheck: false,
        fenBefore,
        fenAfter: this.fen(),
        outcome,
      };
    }

    // —— 落子（GO-007~013） ——
    const check = this.checkMove(move);
    if (!check.ok) return null;
    const fenBefore = this.fen();
    const stone: Stone = this.turnSeat === 'a' ? 'b' : 'w';
    const opp: Stone = stone === 'b' ? 'w' : 'b';
    this.applyBoard(check.captures!, move.from, stone, opp);
    if (stone === 'b') this.capB += check.captures!.length;
    else this.capW += check.captures!.length;
    this.positionHistory.add(this.boardKey(this.turnSeat === 'a' ? 'b' : 'a'));
    this.passes = 0;
    this.plies += 1;
    this.turnSeat = this.turnSeat === 'a' ? 'b' : 'a';
    this.lastCaptured = check.captures!;
    return {
      notation: check.captures!.length > 0 ? `${move.from}（提${check.captures!.length}子）` : move.from,
      captured: check.captures!.length ? (stone === 'b' ? 'W' : 'B') : null,
      gaveCheck: false,
      fenBefore,
      fenAfter: this.fen(),
      outcome: null,
      // 提子列表（GO-020/EVENT-003）：extra 记录被提点与颜色
      extra: check.captures!.map((pt) => ({ from: pt, to: pt, piece: opp.toUpperCase() })),
    };
  }

  /** 数子阶段：mark:<点> 切换死子块；score-confirm 确认；score-resume 恢复对弈 */
  private applyScoringCommand(from: string): AppliedMove | null {
    const fenBefore = this.fen();
    if (from === 'score-confirm') {
      if (this.confirmed.has(this.turnSeat)) return null;
      this.confirmed.add(this.turnSeat);
      if (this.confirmed.size === 2) {
        // 双方确认 → 按当前 dead 集合计分终局（GO-017/019）
        const s = this.score(this.dead);
        this.phase = 'ended';
        const winner = s.winner;
        const txt = winner ? `黑${s.black} : 白${s.white}（含贴目${GO_KOMI}），${winner === 'a' ? '黑方' : '白方'}胜` : `黑${s.black} : 白${s.white}（含贴目${GO_KOMI}），和棋`;
        this._outcome = { type: 'agreement', winner, reason: `双方确认死子，数子结果：${txt}` };
        this.plies += 1;
        return { notation: '确认数子', captured: null, gaveCheck: false, fenBefore, fenAfter: this.fen(), outcome: this._outcome };
      }
      this.plies += 1;
      this.turnSeat = this.turnSeat === 'a' ? 'b' : 'a';
      return { notation: '确认死子标记', captured: null, gaveCheck: false, fenBefore, fenAfter: this.fen(), outcome: null };
    }
    if (from === 'score-resume') {
      // 意见不一致 → 恢复对弈（GO-019），清空确认与标记
      this.phase = 'playing';
      this.passes = 0;
      this.dead.clear();
      this.deadMarksBy = new Map();
      this.confirmed = new Set();
      this.plies += 1;
      this.turnSeat = this.turnSeat === 'a' ? 'b' : 'a';
      return { notation: '恢复对弈', captured: null, gaveCheck: false, fenBefore, fenAfter: this.fen(), outcome: null };
    }
    if (from.startsWith('mark:')) {
      const pt = from.slice(5);
      if (!this.validPt(pt) || !this.board.has(pt)) return null;
      const g = this.groupAt(pt)!;
      const markOf = this.deadMarksBy.get(this.turnSeat) ?? new Set<string>();
      const has = markOf.has(pt);
      if (has) for (const st of g.stones) markOf.delete(st);
      else for (const st of g.stones) markOf.add(st);
      this.deadMarksBy.set(this.turnSeat, markOf);
      // 双方标记一致时同步 dead 集合（预览）；确认时以此终局
      const a = this.deadMarksBy.get('a');
      const b = this.deadMarksBy.get('b');
      this.dead = new Set();
      if (a && b) for (const st of a) if (b.has(st)) this.dead.add(st);
      this.plies += 1;
      this.turnSeat = this.turnSeat === 'a' ? 'b' : 'a';
      return { notation: `${has ? '恢复' : '标记'}死子（${pt} 所在棋块）`, captured: null, gaveCheck: false, fenBefore, fenAfter: this.fen(), outcome: null };
    }
    return null;
  }

  resignSeat(seat: Side): GameOutcome | null {
    if (this.phase === 'ended') return this._outcome;
    const winner: Side = seat === 'a' ? 'b' : 'a';
    const name = seat === 'a' ? '黑方' : '白方';
    this.phase = 'ended';
    this._outcome = { type: 'resignation', winner, reason: `${name}中盘认输` };
    return this._outcome;
  }

  outcomeNow(): GameOutcome | null {
    return this._outcome;
  }

  /** 上一手提子（前端标记用） */
  lastCaptureList(): string[] {
    return this.lastCaptured;
  }
}
