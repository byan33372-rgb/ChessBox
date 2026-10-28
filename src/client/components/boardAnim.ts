/**
 * 走棋动画数据源（纯函数，无副作用，不修改任何引擎/服务端状态）。
 *
 * 原则（ENG-014/015）：动画只表现"服务端已确认"的前后局面；
 * 分类完全由 fenBefore/fenAfter 棋子表 diff + from/to 推导，不依赖引擎内部实现。
 *
 * 中象 FEN：10 行 r0..r9（首行=黑方底线 r0），数字=空格跨度，大小写=红黑；
 * 国象 FEN：标准 8 行 rank8→rank1。棋子代码均为单字母（大小写=阵营）。
 */

export interface BoardAnim {
  /** 去重键（调用方用 ply 或等价唯一值） */
  key: string;
  from: string;
  to: string;
  /** 飞行中显示的棋子代码（升变时=兵的代码，落位后由 fenAfter 呈现升变子） */
  moverCode: string;
  /** 被吃棋子所在格与代码（过路兵时 ≠ to；普通吃子 = to） */
  capturedSq: string | null;
  capturedCode: string | null;
  /** 王车易位：车的起止格与代码（与王同时飞行） */
  rook: { from: string; to: string; code: string } | null;
  /** 国象升变目标代码（仅用于落位瞬间确认，权威局面本就来自 fenAfter） */
  promotedTo: string | null;
}

function isUpper(ch: string): boolean {
  return ch >= 'A' && ch <= 'Z';
}

/** 解析 FEN 棋子表 → Map<格, 代码>。kind 决定行序（chess 首行=rank8；xiangqi 首行=r0）。 */
export function fenPieceMap(kind: 'xiangqi' | 'chess', fen: string): Map<string, string> {
  const map = new Map<string, string>();
  const placement = fen.split(/\s+/)[0] ?? '';
  const rows = placement.split('/');
  const fileLetters = kind === 'xiangqi' ? 'abcdefghi' : 'abcdefgh';
  const rowCount = kind === 'xiangqi' ? 10 : 8;
  for (let i = 0; i < rowCount; i++) {
    const row = rows[i] ?? '';
    let file = 0;
    for (const ch of row) {
      if (ch >= '1' && ch <= '9') {
        file += Number(ch);
      } else if (/[a-zA-Z]/.test(ch)) {
        const sq = fileLetters[file] + String(kind === 'xiangqi' ? i : rowCount - i);
        if (fileLetters[file] !== undefined) map.set(sq, ch);
        file++;
      }
    }
  }
  return map;
}

interface Diff {
  gone: Array<{ sq: string; code: string }>; // prev 有 next 无
  appeared: Array<{ sq: string; code: string }>; // next 有 prev 无
}

function diffBoards(prev: Map<string, string>, next: Map<string, string>): Diff {
  const gone: Diff['gone'] = [];
  const appeared: Diff['appeared'] = [];
  for (const [sq, code] of prev) if (next.get(sq) !== code) gone.push({ sq, code });
  for (const [sq, code] of next) if (prev.get(sq) !== code) appeared.push({ sq, code });
  return { gone, appeared };
}

function sqDist(a: string, b: string): number {
  const dx = a.charCodeAt(0) - b.charCodeAt(0);
  const dy = Number(a[1]) - Number(b[1]);
  return Math.abs(dx) + Math.abs(dy);
}

/**
 * 由前后局面 + 走法起止推导动画描述。
 * - 普通走/吃：mover from→to；吃子格 = to（过路兵 = 实际被吃兵的格）。
 * - 王车易位：王 from→to 且 |列差|=2 时，剩余的 同代码 gone↔appeared 配对为车。
 * - 升变：moverCode=兵，promotedTo=to 处新代码。
 * 局面不符（如 from 处无子）时返回 null（调用方直接呈现权威局面，不动画）。
 */
export function buildBoardAnim(
  kind: 'xiangqi' | 'chess',
  fenBefore: string,
  fenAfter: string,
  from: string,
  to: string,
): BoardAnim | null {
  const prev = fenPieceMap(kind, fenBefore);
  const next = fenPieceMap(kind, fenAfter);
  const moverCode = prev.get(from);
  const landedCode = next.get(to);
  if (!moverCode || !landedCode) return null;

  const promotedTo = landedCode !== moverCode ? landedCode : null;
  const { gone, appeared } = diffBoards(prev, next);

  // 从 gone 中去掉走棋方离开的格子
  const goneRest = gone.filter((g) => g.sq !== from);
  // 剩余 appeared（≠ to）与剩余 gone 中同代码、就近配对 → 易位的车
  let rook: BoardAnim['rook'] = null;
  const appearedRest = appeared.filter((a) => a.sq !== to);
  for (const a of appearedRest) {
    let best: { sq: string; code: string } | null = null;
    for (const g of goneRest) {
      if (g.code !== a.code) continue;
      if (g.sq === a.sq) continue;
      if (!best || sqDist(g.sq, a.sq) < sqDist(best.sq, a.sq)) best = g;
    }
    if (best) {
      rook = { from: best.sq, to: a.sq, code: a.code };
      goneRest.splice(goneRest.indexOf(best), 1);
      appearedRest.splice(appearedRest.indexOf(a), 1);
      break;
    }
  }
  // 剩余 gone = 被吃棋子（过路兵时其格 ≠ to）
  let capturedSq: string | null = null;
  let capturedCode: string | null = null;
  if (goneRest.length > 0) {
    // 就近原则选与 to 最近的（正常只有 1 个）
    goneRest.sort((a, b) => sqDist(a.sq, to) - sqDist(b.sq, to));
    capturedSq = goneRest[0].sq;
    capturedCode = goneRest[0].code;
  }

  return {
    key: `${fenAfter}|${from}-${to}`,
    from,
    to,
    moverCode,
    capturedSq,
    capturedCode,
    rook,
    promotedTo,
  };
}
