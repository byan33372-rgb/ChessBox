/**
 * 棋谱导出：
 * - 国际象棋：标准 PGN（由 chess.js 权威生成）+ FEN
 * - 中国象棋：中文记谱文本 + 本项目自定义 JSON（明确声明非通用标准格式）
 */

import { Chess } from 'chess.js';
import type { GameOutcome, Side } from '../../games/types';
import { CHECKERS_NAMES } from '../../games/checkers/engine';
import { buildSgf, type GoSize } from '../../games/go/engine';
import type { PublicMove, RoomState } from '../../shared/protocol';

function resultString(outcome: GameOutcome | null): string {
  if (!outcome) return '*';
  if (outcome.winner === null) return '1/2-1/2';
  return outcome.winner === 'a' ? '1-0' : '0-1';
}

function outcomeZh(outcome: GameOutcome | null): string {
  if (!outcome) return '对局进行中';
  const winner = outcome.winner === null ? '和棋' : outcome.winner === 'a' ? '红方/白方胜' : '黑方胜';
  return `${winner}（${outcome.reason}）`;
}

function getSite(): string {
  // Node 测试环境下无 window；浏览器返回当前站点
  return typeof window !== 'undefined' ? window.location.origin : 'local';
}

/**
 * PGN 标签值净化：移除双引号与反斜杠。
 * 不用转义的原因：chess.js 1.4 的 PGN 解析器不支持 \" 转义（实测连自身输出都无法回读），
 * 剥离字符可保证生成的 PGN 在主流解析器中均可读。
 */
function pgnTagValue(s: string): string {
  return s.replace(/["\\]/g, '').trim();
}

export function buildPgn(state: RoomState): string {
  const chess = new Chess();
  for (const m of state.moves) {
    try {
      chess.move({ from: m.from, to: m.to, promotion: m.promotion });
    } catch {
      break; // 不应发生：防御性处理
    }
  }
  chess.header(
    'Event',
    '双人对弈（本地服务）',
    'Site',
    getSite(),
    'Date',
    new Date().toISOString().slice(0, 10).replace(/-/g, '.'),
    'Round',
    '-',
    'White',
    pgnTagValue(state.seats.a?.name ?? '白方'),
    'Black',
    pgnTagValue(state.seats.b?.name ?? '黑方'),
    'Result',
    resultString(state.outcome),
  );
  if (state.outcome?.reason) {
    chess.header('Termination', state.outcome.reason);
  }
  return chess.pgn({ maxWidth: 72, newline: '\n' });
}

export function buildXiangqiText(state: RoomState): string {
  const lines: string[] = [];
  lines.push('中国象棋对局记录');
  lines.push(`红方：${state.seats.a?.name ?? '红方'}    黑方：${state.seats.b?.name ?? '黑方'}`);
  lines.push(`结果：${outcomeZh(state.outcome)}`);
  lines.push('');
  for (let i = 0; i < state.moves.length; i += 2) {
    const red = state.moves[i];
    const black = state.moves[i + 1];
    const n = Math.floor(i / 2) + 1;
    lines.push(`${n}. ${red.notation}${black ? ` ${black.notation}` : ''}`);
  }
  return lines.join('\n');
}

export interface XiangqiJson {
  format: 'chessbox-xiangqi-v1';
  note: string;
  roomId: string;
  result: string;
  startFen: string;
  moves: Array<{
    ply: number;
    side: Side;
    from: string;
    to: string;
    notation: string;
    fenAfter: string;
    captured?: string | null;
    check: boolean;
    ts: number;
  }>;
}

export function buildXiangqiJson(state: RoomState, startFen: string): XiangqiJson {
  return {
    format: 'chessbox-xiangqi-v1',
    note: '本项目自定义棋谱格式（非通用标准 PGN）；FEN 行序 r0=黑方底线，w=红走',
    roomId: state.roomId,
    result: outcomeZh(state.outcome),
    startFen,
    moves: state.moves.map((m: PublicMove) => ({
      ply: m.ply,
      side: m.side,
      from: m.from,
      to: m.to,
      notation: m.notation,
      fenAfter: m.fenAfter,
      captured: m.captured,
      check: m.check,
      ts: m.ts,
    })),
  };
}

export function buildCheckersText(state: RoomState): string {
  const lines: string[] = [];
  const names = state.seatOrder.map((s) => `${s.toUpperCase()}（${CHECKERS_NAMES[s] ?? s}）：${state.seats[s]?.name ?? '等待加入'}`);
  lines.push('中国跳棋对局记录');
  lines.push(names.join('    '));
  lines.push(`结果：${checkersOutcomeZh(state.outcome)}`);
  lines.push('');
  for (const m of state.moves) {
    lines.push(`${m.ply}. ${CHECKERS_NAMES[m.side] ?? m.side}  ${m.notation}`);
  }
  return lines.join('\n');
}

function checkersOutcomeZh(outcome: GameOutcome | null): string {
  if (!outcome) return '对局进行中';
  const winner = outcome.winner === null ? '和棋' : `${CHECKERS_NAMES[outcome.winner] ?? outcome.winner}胜`;
  return `${winner}（${outcome.reason}）`;
}

export interface CheckersJson {
  format: 'chessbox-checkers-v1';
  note: string;
  roomId: string;
  seatOrder: Side[];
  result: string;
  startFen: string;
  moves: Array<{
    ply: number;
    side: Side;
    from: string;
    to: string;
    path?: string[];
    notation: string;
    fenAfter: string;
    ts: number;
  }>;
}

export function buildCheckersJson(state: RoomState, startFen: string): CheckersJson {
  return {
    format: 'chessbox-checkers-v1',
    note: '本项目自定义跳棋棋谱格式（非通用标准）；path 为连续跳跃完整路径（含起终点）',
    roomId: state.roomId,
    seatOrder: state.seatOrder,
    result: checkersOutcomeZh(state.outcome),
    startFen,
    moves: state.moves.map((m: PublicMove) => ({
      ply: m.ply,
      side: m.side,
      from: m.from,
      to: m.to,
      path: m.path,
      notation: m.notation,
      fenAfter: m.fenAfter,
      ts: m.ts,
    })),
  };
}

function goSizeOf(state: RoomState): GoSize {
  const m = /^go(9|13|19)\|/.exec(state.fen);
  return (m ? Number(m[1]) : 19) as GoSize;
}

function outcomeText(state: RoomState): string {
  if (!state.outcome) return '';
  return state.outcome.winner === null ? '和棋' : `${state.outcome.winner === 'a' ? '黑方' : '白方'}胜`;
}

/** 围棋 SGF 导出（GO-022：仅支持子集，note 由 buildSgf 附带） */
export function buildGoSgf(state: RoomState): string {
  return buildSgf(
    goSizeOf(state),
    state.moves.map((m) => ({ side: m.side, from: m.from })),
    { a: state.seats.a?.name, b: state.seats.b?.name },
    outcomeText(state),
  );
}

/** 五子棋文本导出（GOMOKU-015：明确版本的自定义格式） */
export interface GomokuJson {
  format: 'chessbox-gomoku-v1';
  note: string;
  roomId: string;
  board: number;
  result: string;
  startFen: string;
  moves: Array<{ ply: number; side: Side; point: string; winLine?: string[]; ts: number }>;
}

export function buildGomokuJson(state: RoomState, startFen: string): GomokuJson {
  return {
    format: 'chessbox-gomoku-v1',
    note: '自由五子棋（无禁手）；point 为落点；winLine 为获胜连线（仅终局手）',
    roomId: state.roomId,
    board: 15,
    result: outcomeText(state) || '对局进行中',
    startFen,
    moves: state.moves.map((m) => ({
      ply: m.ply,
      side: m.side,
      point: m.from,
      winLine: m.extra?.map((x) => x.from),
      ts: m.ts,
    })),
  };
}

export function buildGomokuText(state: RoomState): string {
  const lines: string[] = [];
  lines.push('五子棋对局记录（自由规则，15×15）');
  lines.push(`黑方：${state.seats.a?.name ?? '等待加入'}    白方：${state.seats.b?.name ?? '等待加入'}`);
  lines.push(`结果：${outcomeText(state) || '对局进行中'}`);
  lines.push('');
  for (const m of state.moves) {
    lines.push(`${m.ply}. ${m.side === 'a' ? '黑' : '白'}  ${m.notation}${m.extra ? `  （五连：${m.extra.map((x) => x.from).join(' ')}）` : ''}`);
  }
  return lines.join('\n');
}

export function downloadText(filename: string, text: string): void {
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function downloadJson(filename: string, data: unknown): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      ta.remove();
      return ok;
    } catch {
      return false;
    }
  }
}
