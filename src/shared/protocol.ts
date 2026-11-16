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
  /** 国象 SAN；中象中文纵线记谱；跳棋路径记法 */
  notation: string;
  fenBefore: string;
  fenAfter: string;
  captured?: string | null;
  /** 被吃棋子实际所在格（过路兵 ≠ to；普通吃子 = to 或省略） */
  capturedSq?: string | null;
  /** 中国跳棋：规范化完整跳跃路径（含起点与终点；单步省略） */
  path?: string[];
  /** 特殊动作附加轨迹（国象王车易位的车、吃过路兵被吃兵等） */
  extra?: Array<{ from: string; to: string; piece: string }>;
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
  /** 座位占用/在线情况；键为棋种的有效座位（中象/国象 a,b；跳棋 a..f 中前 N 个） */
  seats: Partial<Record<Side, SeatPublic>>;
  /** 本房间的座位轮转顺序与座位数（跳棋 2/3/4/6；其余 2） */
  seatOrder: Side[];
  seatCount: number;
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
  /** 选座等操作后返回当前会话座位 */
  seat?: Side | 'spectator';
}

export interface CreateAck extends AckBase {
  roomId?: string;
  token?: string;
  seat?: Side | 'spectator';
}

export interface JoinAck extends AckBase {
  token?: string;
  seat?: Side | 'spectator';
}

/** 三国杀客户端视图（服务端 engine.view 序列化；字段与引擎保持同步） */
export interface SgClientView {
  revision: number;
  phase: string;
  turnNumber: number;
  current: string;
  winner: string | null;
  deckConfig: string;
  rulesetVersion: string;
  drawCount: number;
  discardCount: number;
  discardTop: { id: string; name: string; suit: string; rank: number } | null;
  myHand: string[];
  /** 出牌阶段合法性提示（仅轮到自己出牌时非空） */
  hints: Array<{ cardId: string; as?: string; ok: boolean; reason?: string; targets: string[]; minTargets: number; maxTargets: number; multi?: boolean }>;
  players: Array<{
    id: string;
    general: string | null;
    hp: number;
    maxHp: number;
    alive: boolean;
    chained: boolean;
    handCount: number;
    equips: { weapon: string | null; armor: string | null; horsePlus: string | null; horseMinus: string | null };
    judgments: string[];
    selected: boolean;
  }>;
  pending: {
    kind: string;
    playerId?: string;
    need?: string;
    promptId?: string;
    dyingId?: string;
    legalCards?: string[];
    converters?: string[];
    prompt?: string;
    min?: number;
    max?: number;
    count?: number;
    options?: string[];
    candidates?: string[];
    cards?: string[];
    windowId: string;
  } | null;
  log: Array<{ seq: number; rev: number; t: string; [k: string]: unknown }>;
}

/** UNO 客户端视图（服务端 uno.view 序列化） */
export interface UnoClientView {
  revision: number;
  phase: string;
  ruleProfile: string;
  deckProfile: string;
  turnNumber: number;
  turn: string;
  direction: 1 | -1;
  currentColor: string;
  drawCount: number;
  discardCount: number;
  discardTop: string | null;
  myHand: string[];
  playableIds: string[];
  myUnoCalled: boolean;
  winner: string | null;
  winningTeam: string | null;
  roundWinner: string | null;
  teamPassDone: boolean;
  pendingDraw: number;
  lastActor: { seat: string; calledUno: boolean } | null;
  players: Array<{ id: string; team: string | null; handCount: number; unoCalled: boolean; isOut: boolean; ready: boolean }>;
  pending: { kind: string; playerId?: string; windowId?: string; picks?: Record<string, string> } | null;
  log: Array<{ seq: number; rev: number; t: string; [k: string]: unknown }>;
}
export interface MoveAck extends AckBase {
  revision?: number;
  /** 服务端分阶段耗时（仅延迟诊断使用，ttl 内缓存于幂等 ack） */
  serverTiming?: ServerTiming;
}

/** 服务端处理链路耗时（毫秒，同一进程单调时钟，不可跨设备比较绝对值） */
export interface ServerTiming {
  /** 从 socket 收到事件到进入房间队列 */
  queueMs: number;
  /** 座位/回合/版本/幂等校验 */
  validateMs: number;
  /** 规则引擎计算合法性与终局判定 */
  applyMs: number;
  /** 权威状态构建（publicState） */
  stateMs: number;
  /** SQLite 持久化（事务：落子 + 房间快照） */
  persistMs: number;
  /** 广播 emit 调用耗时（序列化在 socket.io 内部异步完成，不计入） */
  broadcastMs: number;
  /** 从收到事件到 ack 回调前的总耗时 */
  totalMs: number;
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
  /** 中国跳棋：连续跳跃完整路径（含起点与终点） */
  path?: string[];
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
  | 'seat'
  | 'spectator'
  | 'sg';

export interface ClientToServerEvents {
  'room:create': (p: { kind: GameKind; name?: string; seatCount?: number; boardSize?: number; seat?: Side }, ack: (r: CreateAck) => void) => void;
  'room:join': (p: { roomId: string; name?: string }, ack: (r: JoinAck) => void) => void;
  'room:rejoin': (p: { roomId: string; token: string }, ack: (r: JoinAck) => void) => void;
  'room:leave': (p: Record<string, never>, ack: (r: AckBase) => void) => void;
  /** 房间内选择/更换阵营（仅等待阶段；目标座位必须为空） */
  'room:take-seat': (p: { seat: Side }, ack: (r: AckBase) => void) => void;
  'game:move': (p: MoveRequest, ack: (r: MoveAck) => void) => void;
  'game:resign': (p: Record<string, never>, ack: (r: AckBase) => void) => void;
  'game:draw:offer': (p: Record<string, never>, ack: (r: AckBase) => void) => void;
  'game:draw:respond': (p: { accept: boolean }, ack: (r: AckBase) => void) => void;
  'game:undo:offer': (p: Record<string, never>, ack: (r: AckBase) => void) => void;
  'game:undo:respond': (p: { accept: boolean }, ack: (r: AckBase) => void) => void;
  'game:restart:offer': (p: Record<string, never>, ack: (r: AckBase) => void) => void;
  'game:restart:respond': (p: { accept: boolean }, ack: (r: AckBase) => void) => void;
  'chat:send': (p: { text: string }, ack: (r: AckBase) => void) => void;
  /** 延迟探针（只回环时间，不改变对局状态） */
  'latency:ping': (p: Record<string, never>, ack: (r: { ok: boolean; t: number }) => void) => void;
  /** UNO 命令（服务端权威校验+结算） */
  'uno:command': (
    p: { commandId: string; expectedRevision?: number | null; action: { type: string } & Record<string, unknown> },
    ack: (r: { ok: boolean; error?: AppError; revision?: number; view?: UnoClientView }) => void,
  ) => void;
  /** 三国杀命令（服务端权威校验+结算） */
  'sg:command': (
    p: { commandId: string; expectedRevision?: number | null; action: { type: string } & Record<string, unknown> },
    ack: (r: { ok: boolean; error?: AppError; revision?: number; view?: SgClientView }) => void,
  ) => void;
}

export interface ServerToClientEvents {
  'room:state': (p: { state: RoomState; reason: StateReason }) => void;
  /** UNO 个性化脱敏视图（每 socket 独立） */
  'uno:state': (p: { view: UnoClientView; reason: StateReason }) => void;
  /** 三国杀个性化脱敏视图（每 socket 独立） */
  'sg:state': (p: { view: SgClientView; reason: StateReason }) => void;
  'chat:message': (p: ChatMessage) => void;
  /** 加入/重连时下发的历史聊天（仅发给该 socket） */
  'chat:history': (p: { messages: ChatMessage[] }) => void;
}

export const ROOM_ID_PATTERN = /^[a-z2-9]{10}$/;
export const SESSION_TOKEN_PATTERN = /^[A-Za-z0-9_-]{24,64}$/;
export const SIDE_NAMES: Record<Side, string> = {
  a: '红方/白方',
  b: '黑方/蓝方',
  c: '绿方',
  d: '黄方',
  e: '黑方',
  f: '紫方',
};
