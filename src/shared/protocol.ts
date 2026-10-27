/**
 * 前后端共享的联机协议类型。
 * 所有走棋请求仅是"请求"：服务端独立校验（席位、轮次、revision、走法合法性、
 * 对局未结束、幂等 requestId）后才落库并广播权威局面。
 */

import type { GameKind, GameOutcome, Side } from '../games/types';

export interface PublicMove {
  ply: number;
  side: Side;
  from: string;
  to: string;
  /** 国际象棋升变：q/r/b/n */
  promotion?: string;
  /** 国象 SAN；中象中文纵线记谱 */
  notation: string;
  fenBefore: string;
  fenAfter: string;
  captured?: string | null;
  /** 本步是否将军 */
  check: boolean;
  ts: number;
}

export interface SeatPublic {
  name: string;
  connected: boolean;
}

export interface OffersState {
  /** 提和发起方 */
  draw: Side | null;
  /** 悔棋请求：发起方与回退步数 */
  undo: { by: Side; plies: number } | null;
  /** 重新开局发起方 */
  restart: Side | null;
}

export type RoomPhase = 'waiting' | 'playing' | 'ended';

export interface RoomState {
  roomId: string;
  kind: GameKind;
  /** 每次权威状态变更 +1；走棋请求必须携带期望 revision */
  revision: number;
  phase: RoomPhase;
  fen: string;
  turn: Side;
  inCheck: boolean;
  checkedKing: string | null;
  lastMove: PublicMove | null;
  moves: PublicMove[];
  seats: { a: SeatPublic | null; b: SeatPublic | null };
  spectators: number;
  outcome: GameOutcome | null;
  offers: OffersState;
}

export type ErrorCode =
  | 'INVALID_INPUT'
  | 'RATE_LIMITED'
  | 'ROOM_NOT_FOUND'
  | 'SESSION_INVALID'
  | 'NOT_PLAYER'
  | 'NOT_YOUR_TURN'
  | 'GAME_NOT_PLAYING'
  | 'GAME_ENDED'
  | 'ILLEGAL_MOVE'
  | 'STALE_REVISION'
  | 'ALREADY_OFFERED'
  | 'NOTHING_TO_UNDO'
  | 'NO_PENDING_OFFER'
  | 'NOT_ALLOWED'
  | 'INTERNAL';

export interface AppError {
  code: ErrorCode;
  message: string;
}

export interface AckBase {
  ok: boolean;
  error?: AppError;
  /** 失败时也可能携带最新状态（如 STALE_REVISION），便于客户端自愈 */
  state?: RoomState;
}

export interface CreateAck extends AckBase {
  roomId?: string;
  token?: string;
  seat?: 'a' | 'b';
}

export interface JoinAck extends AckBase {
  token?: string;
  seat?: 'a' | 'b' | 'spectator';
}

export interface MoveAck extends AckBase {
  revision?: number;
}

export interface ChatMessage {
  name: string;
  side: Side | 'spectator';
  text: string;
  ts: number;
}

export interface MoveRequest {
  requestId: string;
  revision: number;
  from: string;
  to: string;
  promotion?: string;
}

/** 广播状态变化的原因（客户端提示用） */
export type StateReason =
  | 'init'
  | 'move'
  | 'join'
  | 'leave'
  | 'reconnect'
  | 'resign'
  | 'draw'
  | 'undo'
  | 'restart'
  | 'offer'
  | 'spectator';

export interface ClientToServerEvents {
  'room:create': (p: { kind: GameKind; name?: string }, ack: (r: CreateAck) => void) => void;
  'room:join': (p: { roomId: string; name?: string }, ack: (r: JoinAck) => void) => void;
  'room:rejoin': (p: { roomId: string; token: string }, ack: (r: JoinAck) => void) => void;
  'room:leave': (p: Record<string, never>, ack: (r: AckBase) => void) => void;
  'game:move': (p: MoveRequest, ack: (r: MoveAck) => void) => void;
  'game:resign': (p: Record<string, never>, ack: (r: AckBase) => void) => void;
  'game:draw:offer': (p: Record<string, never>, ack: (r: AckBase) => void) => void;
  'game:draw:respond': (p: { accept: boolean }, ack: (r: AckBase) => void) => void;
  'game:undo:offer': (p: Record<string, never>, ack: (r: AckBase) => void) => void;
  'game:undo:respond': (p: { accept: boolean }, ack: (r: AckBase) => void) => void;
  'game:restart:offer': (p: Record<string, never>, ack: (r: AckBase) => void) => void;
  'game:restart:respond': (p: { accept: boolean }, ack: (r: AckBase) => void) => void;
  'chat:send': (p: { text: string }, ack: (r: AckBase) => void) => void;
}

export interface ServerToClientEvents {
  'room:state': (p: { state: RoomState; reason: StateReason }) => void;
  'chat:message': (p: ChatMessage) => void;
  /** 加入/重连时下发的历史聊天（仅发给该 socket） */
  'chat:history': (p: { messages: ChatMessage[] }) => void;
}

export const ROOM_ID_PATTERN = /^[a-z2-9]{10}$/;
export const SESSION_TOKEN_PATTERN = /^[A-Za-z0-9_-]{24,64}$/;
export const SIDE_NAMES: Record<Side, string> = { a: '红方/白方', b: '黑方' };
