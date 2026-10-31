/**
 * 跳棋 UI 交互纯函数（前端提示用；服务端仍是唯一权威，CHECKERS-010/011）。
 * 与引擎同规则：无强制跳跃、无吃子、目标营地不得离开、他人营地禁入。
 * sim：cellId → 座位字母（小写 'a'..'f'）——支持连跳中途的假设局面。
 */
import { campOf, cellRC, isValidCell, jumpLanding, neighborsOf } from '../../games/checkers/board';

export type CheckersSim = Map<string, string>; // cellId → seat letter

/** 解析 cc1 FEN 的 p= 段为座位→格子映射（前端渲染用；解析失败返回 null） */
export function parseCheckersFenPieces(fen: string): CheckersSim | null {
  const parts = fen.split('|');
  if (parts[0] !== 'cc1') return null;
  const pPart = parts.find((x) => x.startsWith('p='));
  if (!pPart) return new Map();
  const sim: CheckersSim = new Map();
  let cur: string | null = null;
  for (const tok of pPart.slice(2).split(/[;,:]/)) {
    if (!tok) continue;
    if (/^[a-f]$/.test(tok)) {
      cur = tok;
      continue;
    }
    if (cur && isValidCell(tok)) sim.set(tok, cur);
  }
  return sim;
}

export type CheckersCellSeat = string; // 'a'..'f'

const DIRS: Array<[number, number]> = [
  [0, 1],
  [0, -1],
  [1, 0],
  [-1, 0],
  [1, 1],
  [-1, -1],
];

/** 营地约束：他人营地禁入；已在目标营地不得离开 */
export function campBlocked(cell: string, movingFrom: string, targetCamp: number): boolean {
  const camp = campOf(cell);
  if (camp >= 0 && camp !== targetCamp) return true;
  if (campOf(movingFrom) === targetCamp && camp !== targetCamp) return true;
  return false;
}

/** 普通移动目标（相邻空位） */
export function stepTargetsFrom(sim: CheckersSim, from: string, targetCamp: number): string[] {
  const out: string[] = [];
  for (const n of neighborsOf(from)) {
    if (!sim.has(n) && !campBlocked(n, from, targetCamp)) out.push(n);
  }
  return out;
}

/** 单段跳跃目标（越过紧邻棋子、落点为空） */
export function jumpTargetsFrom(sim: CheckersSim, from: string, targetCamp: number): string[] {
  const fc = cellRC(from);
  if (!fc) return [];
  const [fr, fcol] = fc;
  const out: string[] = [];
  for (const [dr, dc] of DIRS) {
    // mid 必须是 from 的紧邻且在盘内
    const midR = fr + dr;
    const midC = fcol + dc;
    const mid = neighborsOf(from).find((n) => {
      const rc = cellRC(n)!;
      return rc[0] === midR && rc[1] === midC;
    });
    if (!mid || !sim.has(mid)) continue;
    const land = jumpLanding(from, dr, dc);
    if (land && !sim.has(land) && !campBlocked(land, from, targetCamp)) out.push(land);
  }
  return out;
}

/** 把连跳链（[起点, ...落点]）应用到 sim 上，返回链尾局面 */
export function simAfterChain(sim: CheckersSim, chain: string[], seat: CheckersCellSeat): CheckersSim {
  if (chain.length < 2) return sim;
  const next = new Map(sim);
  next.delete(chain[0]);
  next.set(chain[chain.length - 1], seat);
  return next;
}

export type CheckersClickResult =
  | { type: 'none' }
  | { type: 'select'; cell: string }
  | { type: 'extend'; chain: string[]; canContinue: boolean }
  | { type: 'commit'; from: string; to: string; path?: string[] };

/**
 * 连跳交互判定（逐段选点；每段点击即延伸，无后续跳跃时自动提交）：
 * - 点击己方棋子 → 选中（清空链）；
 * - 已选中且点击合法目标：
 *   - 普通移动（仅允许作为第一段）→ 直接提交；
 *   - 跳跃 → 延伸链；若新落点无后续跳跃则自动提交完整路径，否则等待继续/确认。
 */
export function checkersClick(
  sim: CheckersSim,
  seat: CheckersCellSeat,
  targetCamp: number,
  selected: string | null,
  chain: string[] | null,
  sq: string,
): CheckersClickResult {
  if (selected && (chain ?? [selected]).length >= 1) {
    const base = chain ?? [selected];
    const last = base[base.length - 1];
    const simBase = simAfterChain(sim, base, seat);
    const firstSeg = base.length === 1;
    // 普通移动：仅当尚未起跳
    if (firstSeg && stepTargetsFrom(simBase, last, targetCamp).includes(sq)) {
      return { type: 'commit', from: base[0], to: sq };
    }
    if (jumpTargetsFrom(simBase, last, targetCamp).includes(sq)) {
      const nextChain = [...base, sq];
      const simNext = simAfterChain(sim, nextChain, seat);
      const more = jumpTargetsFrom(simNext, sq, targetCamp);
      if (more.length === 0) {
        return nextChain.length > 2
          ? { type: 'commit', from: nextChain[0], to: sq, path: nextChain }
          : { type: 'commit', from: nextChain[0], to: sq };
      }
      return { type: 'extend', chain: nextChain, canContinue: true };
    }
  }
  const piece = sim.get(sq);
  if (piece === seat) {
    return sq === selected ? { type: 'none' } : { type: 'select', cell: sq };
  }
  return { type: 'none' };
}
