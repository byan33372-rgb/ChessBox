/**
 * 棋谱导出：
 * - 国际象棋：标准 PGN（由 chess.js 权威生成）+ FEN
 * - 中国象棋：中文记谱文本 + 本项目自定义 JSON（明确声明非通用标准格式）
 */

import { Chess } from 'chess.js';
import type { GameOutcome, Side } from '../../games/types';
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
    window.location.origin,
    'Date',
    new Date().toISOString().slice(0, 10).replace(/-/g, '.'),
    'Round',
    '-',
    'White',
    state.seats.a?.name ?? '白方',
    'Black',
    state.seats.b?.name ?? '黑方',
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
