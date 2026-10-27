/**
 * 中国象棋中文纵线记谱（红方用汉字一~九、从红方右侧数起；
 * 黑方用数字 1~9、从黑方右侧数起）。
 *
 * 已知近似处理（如实告知）：同一线超过 3 个同兵种时的完整标准消歧
 * （如四兵同线用"一、二、三、四"）采用位置序号近似；两条纵线各有
 * 两个以上同兵种时的跨线歧义未按完整标准追加纵线号。上述局面在
 * 实战中极罕见，记谱仍可读，但不声称与竞赛标准 100% 一致。
 */

export type Cell = string | null;
export type Board = Cell[][];

const RED_NAME: Record<string, string> = { R: '车', N: '马', C: '炮', B: '相', A: '仕', K: '帅', P: '兵' };
const BLACK_NAME: Record<string, string> = { r: '车', n: '马', c: '炮', b: '象', a: '士', k: '将', p: '卒' };
const CN_NUMS = ['一', '二', '三', '四', '五', '六', '七', '八', '九'];
const CN_MULTI = ['一', '二', '三', '四', '五', '六'];
/** 斜走子（记谱后缀为目的纵线） */
const DIAGONAL = new Set(['N', 'B', 'A']);

function isRed(piece: string): boolean {
  return piece >= 'A' && piece <= 'Z';
}

function fileLabel(c: number, red: boolean): string {
  return red ? CN_NUMS[8 - c] : String(c + 1);
}

function numeral(n: number, red: boolean): string {
  return red ? CN_NUMS[n - 1] : String(n);
}

/**
 * 依据走子前的棋盘生成一步的中文记谱。
 * @param board 走子前的棋盘（board[r][c]，r=0 为黑方底线）
 */
export function chineseNotation(board: Board, from: string, to: string): string {
  const fc = from.charCodeAt(0) - 97;
  const fr = from.charCodeAt(1) - 48;
  const tc = to.charCodeAt(0) - 97;
  const tr = to.charCodeAt(1) - 48;
  const piece = board[fr][fc];
  if (!piece) return `${from}${to}`;
  const red = isRed(piece);
  const name = red ? RED_NAME[piece] : BLACK_NAME[piece];
  const type = piece.toUpperCase();

  // 同纵线同兵种消歧：前/中/后
  const sameFileRows: number[] = [];
  for (let r = 0; r <= 9; r++) {
    if (board[r][fc] === piece) sameFileRows.push(r);
  }
  let prefix = '';
  let useStartFile = true;
  if (sameFileRows.length >= 2) {
    // 红方"前"更靠近黑方（r 小）；黑方"前"更靠近红方（r 大）
    const ordered = red ? sameFileRows.slice().sort((a, b) => a - b) : sameFileRows.slice().sort((a, b) => b - a);
    const idx = ordered.indexOf(fr);
    const n = ordered.length;
    prefix = n === 2 ? (idx === 0 ? '前' : '后') : n === 3 ? ['前', '中', '后'][idx] ?? '中' : CN_MULTI[idx] ?? '前';
    useStartFile = false;
  }

  // 方向与步数
  const dr = tr - fr;
  const dc = tc - fc;
  let action: string;
  if (dr === 0) action = '平';
  else action = red ? (dr < 0 ? '进' : '退') : dr > 0 ? '进' : '退';
  const forward = action === '进' || action === '退';

  let number: string;
  if (DIAGONAL.has(type)) {
    number = fileLabel(tc, red); // 马/相/士：目的纵线
  } else if (action === '平') {
    number = fileLabel(tc, red);
  } else {
    number = numeral(Math.abs(dr), red);
    void forward;
  }

  if (prefix) {
    return `${prefix}${name}${action}${number}`;
  }
  const startFile = useStartFile ? fileLabel(fc, red) : '';
  return `${name}${startFile}${action}${number}`;
}

/** 棋子代码 → 显示汉字（红黑自动区分） */
export function pieceLabel(piece: string): string {
  return isRed(piece) ? RED_NAME[piece] ?? piece : BLACK_NAME[piece] ?? piece;
}
