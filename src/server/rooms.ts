/**
 * 房间管理器：内存权威状态 + SQLite 持久化。
 *
 * 安全与一致性要点：
 * - 每个房间的状态变更通过 enqueue() 串行处理（防并发分叉）。
 * - 走棋请求必须匹配当前 revision（乐观锁）且 requestId 幂等。
 * - 席位原子分配：会话令牌绑定席位，第三方只能观战，不能抢占。
 * - 令牌仅内存持有明文，数据库只存 SHA-256；日志只打印前 6 位。
 */

import { createEngine, replayEngine } from '../games';
import type { GameEngine, GameKind, GameOutcome, MoveInput, Side } from '../games/types';
import type {
  AckBase,
  AppError,
  ChatMessage,
  MoveAck,
  MoveRequest,
  OffersState,
  PublicMove,
  RoomPhase,
  RoomState,
  StateReason,
} from '../shared/protocol';
import { newRoomId, newSessionToken, randomNick, sha256 } from './ids';
import { Store, type RoomPersist } from './store';

export interface SessionInfo {
  token: string;
  tokenHash: string;
  name: string;
  seat: 'a' | 'b' | 'spectator';
  socketId: string | null;
  roomId: string;
}

export interface Room {
  id: string;
  kind: GameKind;
  engine: GameEngine;
  revision: number;
  moves: PublicMove[];
  outcome: GameOutcome | null;
  seats: { a: SessionInfo | null; b: SessionInfo | null };
  spectators: Set<string>;
  offers: OffersState;
  chat: ChatMessage[];
  queue: Promise<unknown>;
  moveAcks: Map<string, MoveAck>;
  createdAt: number;
  updatedAt: number;
}

function err(code: AppError['code'], message: string): AppError {
  return { code, message };
}

const MAX_NAME = 12;
const MAX_CHAT = 200;
const CHAT_KEEP = 100;
const MOVE_ACK_KEEP = 256;

export class RoomManager {
  private rooms = new Map<string, Room>();
  /** tokenHash → SessionInfo（跨房间全局会话索引） */
  private sessions = new Map<string, SessionInfo>();
  private store: Store;
  /** 状态广播回调（由 socket 层注入） */
  broadcast: (roomId: string, state: RoomState, reason: StateReason) => void = () => {};
  broadcastChat: (roomId: string, msg: ChatMessage) => void = () => {};

  constructor(store: Store) {
    this.store = store;
  }

  /** 服务重启后从 SQLite 恢复所有房间与会话 */
  loadPersisted(): number {
    const persisted = this.store.loadRooms();
    const sessions = this.store.loadSessions();
    const sessionByHash = new Map(sessions.map((s) => [s.tokenHash, s]));
    let restored = 0;
    for (const p of persisted) {
      try {
        const moves = this.store.loadMoves(p.roomId);
        const engine = moves.length > 0 ? replayEngine(p.kind, moves) : createEngine(p.kind, p.fen);
        const room: Room = {
          id: p.roomId,
          kind: p.kind,
          engine,
          revision: p.revision,
          moves,
          outcome: engine.outcome() ?? p.outcome,
          seats: { a: null, b: null },
          spectators: new Set(),
          offers: p.offers ?? { draw: null, undo: null, restart: null },
          chat: this.store.loadChat(p.roomId),
          queue: Promise.resolve(),
          moveAcks: new Map(),
          createdAt: p.createdAt,
          updatedAt: p.updatedAt,
        };
        for (const seat of ['a', 'b'] as const) {
          const persistedSeat = p.seats[seat];
          if (!persistedSeat) continue;
          const s = sessionByHash.get(persistedSeat.tokenHash);
          if (!s) continue;
          const info: SessionInfo = {
            token: '', // 明文令牌重启后不可恢复，客户端凭本地令牌 rejoin
            tokenHash: s.tokenHash,
            name: s.name,
            seat,
            socketId: null,
            roomId: room.id,
          };
          room.seats[seat] = info;
          this.sessions.set(s.tokenHash, info);
        }
        this.rooms.set(room.id, room);
        restored++;
      } catch (e) {
        console.error(`[rooms] 恢复房间 ${p.roomId} 失败:`, (e as Error).message);
      }
    }
    return restored;
  }

  get(roomId: string): Room | undefined {
    return this.rooms.get(roomId);
  }

  /** 串行化同一房间的状态变更 */
  enqueue<T>(room: Room, fn: () => T): Promise<T> {
    const next = room.queue.then(fn, fn);
    room.queue = next.catch(() => undefined);
    return next;
  }

  createRoom(kind: GameKind, rawName?: string): { room: Room; session: SessionInfo } {
    let id = newRoomId();
    while (this.rooms.has(id)) id = newRoomId();
    const room: Room = {
      id,
      kind,
      engine: createEngine(kind),
      revision: 1,
      moves: [],
      outcome: null,
      seats: { a: null, b: null },
      spectators: new Set(),
      offers: { draw: null, undo: null, restart: null },
      chat: [],
      queue: Promise.resolve(),
      moveAcks: new Map(),
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    const name = this.cleanName(rawName) ?? `${randomNick()}`;
    const session = this.newSession(room, 'a', name);
    room.seats.a = session;
    this.rooms.set(id, room);
    this.persist(room);
    return { room, session };
  }

  joinRoom(roomId: string, rawName?: string): { ok: true; room: Room; session: SessionInfo } | { ok: false; error: AppError } {
    const room = this.rooms.get(roomId);
    if (!room) return { ok: false, error: err('ROOM_NOT_FOUND', '房间不存在或已过期') };
    const name = this.cleanName(rawName) ?? `${randomNick()}`;
    // 席位原子分配：a → b → 观战（已绑定的席位永不静默抢占）
    const seat: 'a' | 'b' | 'spectator' = !room.seats.a ? 'a' : !room.seats.b ? 'b' : 'spectator';
    const session = this.newSession(room, seat, name);
    if (seat === 'a' || seat === 'b') {
      room.seats[seat] = session;
      room.revision += 1; // 席位绑定改变对局状态（waiting → playing）
    }
    room.updatedAt = Date.now();
    this.persist(room);
    return { ok: true, room, session };
  }

  rejoinRoom(roomId: string, token: string): { ok: true; room: Room; session: SessionInfo } | { ok: false; error: AppError } {
    const room = this.rooms.get(roomId);
    if (!room) return { ok: false, error: err('ROOM_NOT_FOUND', '房间不存在或已过期') };
    const hash = sha256(token);
    let session = this.sessions.get(hash);
    if (!session || session.tokenHash !== hash) {
      return { ok: false, error: err('SESSION_INVALID', '会话已失效，请重新加入') };
    }
    if (session.seat === 'spectator') {
      // 观战会话不绑定席位，直接恢复
      return { ok: true, room, session };
    }
    const seatInfo = room.seats[session.seat];
    if (!seatInfo || seatInfo.tokenHash !== hash) {
      return { ok: false, error: err('SESSION_INVALID', '会话已失效，请重新加入') };
    }
    return { ok: true, room, session };
  }

  bindSocket(session: SessionInfo, room: Room, socketId: string): void {
    if (session.seat !== 'spectator') {
      // 同一会话多标签页：后连的接管绑定
      room.seats[session.seat] = session;
    }
    session.socketId = socketId;
    void room;
  }

  unbindSocket(socketId: string, roomId: string): { room: Room; leftSeat: Side | null } | null {
    const room = this.rooms.get(roomId);
    if (!room) return null;
    room.spectators.delete(socketId);
    let leftSeat: Side | null = null;
    for (const seat of ['a', 'b'] as const) {
      const s = room.seats[seat];
      if (s && s.socketId === socketId) {
        s.socketId = null;
        leftSeat = seat;
      }
    }
    return { room, leftSeat };
  }

  findSessionBySocket(socketId: string, roomId: string): SessionInfo | null {
    const room = this.rooms.get(roomId);
    if (!room) return null;
    for (const seat of ['a', 'b'] as const) {
      const s = room.seats[seat];
      if (s && s.socketId === socketId) return s;
    }
    return null;
  }

  /** 走棋（必须在 room 队列内执行） */
  applyPlayerMove(room: Room, session: SessionInfo, req: MoveRequest): MoveAck {
    const cached = room.moveAcks.get(req.requestId);
    if (cached) return cached;

    const ackFail = (code: AppError['code'], message: string): MoveAck => {
      // 失败不缓存：STALE_REVISION 等瞬态错误允许客户端同步后用同一 requestId 重试
      return { ok: false, error: err(code, message), state: this.publicState(room) };
    };

    if (session.seat === 'spectator') return ackFail('NOT_PLAYER', '观战者不能走棋');
    if (room.outcome) return ackFail('GAME_ENDED', '对局已结束');
    if (!room.seats.a || !room.seats.b) return ackFail('GAME_NOT_PLAYING', '等待对手加入');
    if (room.engine.turn() !== session.seat) return ackFail('NOT_YOUR_TURN', '还没轮到你走棋');
    if (req.revision !== room.revision) return ackFail('STALE_REVISION', '局面版本不一致，已为你同步最新局面');

    const input: MoveInput = { from: req.from, to: req.to, promotion: req.promotion };
    const applied = room.engine.applyMove(input);
    if (!applied) return ackFail('ILLEGAL_MOVE', '非法走法');

    const move: PublicMove = {
      ply: room.moves.length + 1,
      side: session.seat,
      from: req.from,
      to: req.to,
      promotion: req.promotion,
      notation: applied.notation,
      fenBefore: applied.fenBefore,
      fenAfter: applied.fenAfter,
      captured: applied.captured,
      check: applied.gaveCheck,
      ts: Date.now(),
    };
    room.moves.push(move);
    room.revision += 1;
    room.updatedAt = Date.now();
    if (applied.outcome) {
      room.outcome = applied.outcome;
      room.offers = { draw: null, undo: null, restart: null };
    } else {
      // 任何走棋使提和与悔棋请求过期
      room.offers.draw = null;
      room.offers.undo = null;
    }
    this.store.appendMoveAndSaveRoom(room.id, move, this.buildPersist(room));

    const ack: MoveAck = { ok: true, revision: room.revision, state: this.publicState(room) };
    room.moveAcks.set(req.requestId, ack);
    this.trimAcks(room);
    this.broadcast(room.id, ack.state!, 'move');
    return ack;
  }

  resign(room: Room, session: SessionInfo): AckBase {
    if (session.seat === 'spectator') return { ok: false, error: err('NOT_PLAYER', '观战者不能认输') };
    if (room.outcome) return { ok: false, error: err('GAME_ENDED', '对局已结束') };
    if (!room.seats.a || !room.seats.b) return { ok: false, error: err('GAME_NOT_PLAYING', '对局尚未开始') };
    const winner: Side = session.seat === 'a' ? 'b' : 'a';
    const sideName = session.seat === 'a' ? '红方/白方' : '黑方';
    room.outcome = {
      type: 'resignation',
      winner,
      reason: `${sideName}认输`,
    };
    room.revision += 1;
    room.updatedAt = Date.now();
    room.offers = { draw: null, undo: null, restart: null };
    this.persist(room);
    this.broadcast(room.id, this.publicState(room), 'resign');
    return { ok: true, state: this.publicState(room) };
  }

  drawOffer(room: Room, session: SessionInfo): AckBase {
    if (session.seat === 'spectator') return { ok: false, error: err('NOT_PLAYER', '观战者不能提和') };
    if (room.outcome) return { ok: false, error: err('GAME_ENDED', '对局已结束') };
    if (!room.seats.a || !room.seats.b) return { ok: false, error: err('GAME_NOT_PLAYING', '对局尚未开始') };
    const me = session.seat;
    if (room.offers.draw === me) return { ok: false, error: err('ALREADY_OFFERED', '你已经提过和棋，等待对方回应') };
    if (room.offers.draw && room.offers.draw !== me) {
      // 对方已提和，再点即视为接受
      return this.finishDraw(room);
    }
    room.offers.draw = me;
    room.revision += 1;
    room.updatedAt = Date.now();
    this.persist(room);
    this.broadcast(room.id, this.publicState(room), 'offer');
    return { ok: true, state: this.publicState(room) };
  }

  drawRespond(room: Room, session: SessionInfo, accept: boolean): AckBase {
    if (session.seat === 'spectator') return { ok: false, error: err('NOT_PLAYER', '观战者不能回应和棋') };
    if (!room.offers.draw) return { ok: false, error: err('NO_PENDING_OFFER', '当前没有待回应的和棋请求') };
    if (room.offers.draw === session.seat) return { ok: false, error: err('NOT_ALLOWED', '只能由对方回应') };
    if (room.outcome) return { ok: false, error: err('GAME_ENDED', '对局已结束') };
    if (accept) return this.finishDraw(room);
    room.offers.draw = null;
    room.revision += 1;
    room.updatedAt = Date.now();
    this.persist(room);
    this.broadcast(room.id, this.publicState(room), 'offer');
    return { ok: true, state: this.publicState(room) };
  }

  private finishDraw(room: Room): AckBase {
    room.outcome = { type: 'agreement', winner: null, reason: '双方同意和棋' };
    room.offers = { draw: null, undo: null, restart: null };
    room.revision += 1;
    room.updatedAt = Date.now();
    this.persist(room);
    this.broadcast(room.id, this.publicState(room), 'draw');
    return { ok: true, state: this.publicState(room) };
  }

  undoOffer(room: Room, session: SessionInfo): AckBase {
    if (session.seat === 'spectator') return { ok: false, error: err('NOT_PLAYER', '观战者不能悔棋') };
    if (room.moves.length === 0) return { ok: false, error: err('NOTHING_TO_UNDO', '还没有任何走棋') };
    const me = session.seat;
    if (room.offers.undo && room.offers.undo.by === me) {
      return { ok: false, error: err('ALREADY_OFFERED', '你已经发过悔棋请求，等待对方回应') };
    }
    if (room.offers.undo && room.offers.undo.by !== me) {
      return { ok: false, error: err('ALREADY_OFFERED', '对方已发悔棋请求，请回应') };
    }
    const last = room.moves[room.moves.length - 1];
    // 回退到请求方行棋前的局面：若最后一手是对方走的则退 2 步（自己那一手+对方应手），否则退 1 步
    const plies = Math.min(last.side === me ? 1 : 2, room.moves.length);
    room.offers.undo = { by: me, plies };
    room.revision += 1;
    room.updatedAt = Date.now();
    this.persist(room);
    this.broadcast(room.id, this.publicState(room), 'offer');
    return { ok: true, state: this.publicState(room) };
  }

  undoRespond(room: Room, session: SessionInfo, accept: boolean): AckBase {
    if (session.seat === 'spectator') return { ok: false, error: err('NOT_PLAYER', '观战者不能回应悔棋') };
    if (!room.offers.undo) return { ok: false, error: err('NO_PENDING_OFFER', '当前没有待回应的悔棋请求') };
    if (room.offers.undo.by === session.seat) return { ok: false, error: err('NOT_ALLOWED', '只能由对方回应') };
    const plies = room.offers.undo.plies;
    if (!accept) {
      room.offers.undo = null;
      room.revision += 1;
      room.updatedAt = Date.now();
      this.persist(room);
      this.broadcast(room.id, this.publicState(room), 'offer');
      return { ok: true, state: this.publicState(room) };
    }
    try {
      const kept = room.moves.slice(0, room.moves.length - plies);
      const engine = kept.length > 0 ? replayEngine(room.kind, kept) : createEngine(room.kind);
      room.engine = engine;
      room.moves = kept;
      room.outcome = engine.outcome();
      room.offers = { draw: null, undo: null, restart: null };
      room.moveAcks.clear();
      room.revision += 1;
      room.updatedAt = Date.now();
      this.store.deleteMovesFrom(room.id, kept.length + 1);
      this.persist(room);
      this.broadcast(room.id, this.publicState(room), 'undo');
      return { ok: true, state: this.publicState(room) };
    } catch (e) {
      console.error(`[rooms] 悔棋失败 ${room.id}:`, (e as Error).message);
      return { ok: false, error: err('INTERNAL', '悔棋失败，局面未改变') };
    }
  }

  restartOffer(room: Room, session: SessionInfo): AckBase {
    if (session.seat === 'spectator') return { ok: false, error: err('NOT_PLAYER', '观战者不能请求重开') };
    const me = session.seat;
    if (room.offers.restart === me) {
      return { ok: false, error: err('ALREADY_OFFERED', '你已经发过重开请求，等待对方回应') };
    }
    if (room.offers.restart && room.offers.restart !== me) {
      // 对方已请求重开，视为同意
      return this.doRestart(room);
    }
    room.offers.restart = me;
    room.revision += 1;
    room.updatedAt = Date.now();
    this.persist(room);
    this.broadcast(room.id, this.publicState(room), 'offer');
    return { ok: true, state: this.publicState(room) };
  }

  restartRespond(room: Room, session: SessionInfo, accept: boolean): AckBase {
    if (session.seat === 'spectator') return { ok: false, error: err('NOT_PLAYER', '观战者不能回应重开') };
    if (!room.offers.restart) return { ok: false, error: err('NO_PENDING_OFFER', '当前没有待回应的重开请求') };
    if (room.offers.restart === session.seat) return { ok: false, error: err('NOT_ALLOWED', '只能由对方回应') };
    if (!accept) {
      room.offers.restart = null;
      room.revision += 1;
      room.updatedAt = Date.now();
      this.persist(room);
      this.broadcast(room.id, this.publicState(room), 'offer');
      return { ok: true, state: this.publicState(room) };
    }
    return this.doRestart(room);
  }

  private doRestart(room: Room): AckBase {
    room.engine = createEngine(room.kind);
    room.moves = [];
    room.outcome = null;
    room.offers = { draw: null, undo: null, restart: null };
    room.moveAcks.clear();
    room.chat = [];
    room.revision += 1;
    room.updatedAt = Date.now();
    this.store.clearMoves(room.id);
    this.persist(room);
    this.broadcast(room.id, this.publicState(room), 'restart');
    return { ok: true, state: this.publicState(room) };
  }

  addChat(room: Room, session: SessionInfo, text: string): AckBase {
    const msg: ChatMessage = {
      name: session.name,
      side: session.seat,
      text,
      ts: Date.now(),
    };
    room.chat.push(msg);
    if (room.chat.length > CHAT_KEEP) room.chat.splice(0, room.chat.length - CHAT_KEEP);
    room.updatedAt = Date.now();
    this.store.appendChat(room.id, msg);
    this.broadcastChat(room.id, msg);
    return { ok: true };
  }

  publicState(room: Room): RoomState {
    const engine = room.engine;
    return {
      roomId: room.id,
      kind: room.kind,
      revision: room.revision,
      phase: this.phaseOf(room),
      fen: engine.fen(),
      turn: engine.turn(),
      inCheck: engine.inCheck(),
      checkedKing: engine.checkedKingSquare(),
      lastMove: room.moves.length > 0 ? room.moves[room.moves.length - 1] : null,
      moves: room.moves,
      seats: {
        a: room.seats.a ? { name: room.seats.a.name, connected: room.seats.a.socketId !== null } : null,
        b: room.seats.b ? { name: room.seats.b.name, connected: room.seats.b.socketId !== null } : null,
      },
      spectators: room.spectators.size,
      outcome: room.outcome,
      offers: room.offers,
    };
  }

  phaseOf(room: Room): RoomPhase {
    if (room.outcome) return 'ended';
    return room.seats.a && room.seats.b ? 'playing' : 'waiting';
  }

  cleanupStale(): number {
    const now = Date.now();
    const endedBefore = now - 3 * 24 * 3600 * 1000; // 已结束 3 天后清理
    const staleBefore = now - 30 * 24 * 3600 * 1000; // 任意房间 30 天无活动清理
    this.store.cleanup(endedBefore, staleBefore);
    let removed = 0;
    for (const [id, room] of this.rooms) {
      if ((room.outcome && room.updatedAt < endedBefore) || room.updatedAt < staleBefore) {
        this.rooms.delete(id);
        removed++;
      }
    }
    if (removed > 0) {
      // 同步清理内存会话索引，避免长期运行内存无限增长
      for (const [hash, session] of this.sessions) {
        if (!this.rooms.has(session.roomId)) this.sessions.delete(hash);
      }
      console.log(`[rooms] 清理过期房间 ${removed} 个`);
    }
    return removed;
  }

  private newSession(room: Room, seat: 'a' | 'b' | 'spectator', name: string): SessionInfo {
    const token = newSessionToken();
    const tokenHash = sha256(token);
    const session: SessionInfo = { token, tokenHash, name, seat, socketId: null, roomId: room.id };
    this.sessions.set(tokenHash, session);
    this.store.saveSession({ tokenHash, roomId: room.id, seat, name, createdAt: Date.now() });
    return session;
  }

  private cleanName(raw?: string): string | null {
    if (typeof raw !== 'string') return null;
    // 过滤控制字符（防 PGN 头注入/日志污染），再裁剪空白并限长
    const t = raw.replace(/[\u0000-\u001f\u007f\u2028\u2029]/g, '').trim();
    if (t.length === 0 || t.length > MAX_NAME) return null;
    return t;
  }

  private persist(room: Room): void {
    this.store.saveRoom(this.buildPersist(room));
  }

  private buildPersist(room: Room): RoomPersist {
    return {
      roomId: room.id,
      kind: room.kind,
      fen: room.engine.fen(),
      revision: room.revision,
      phase: this.phaseOf(room),
      outcome: room.outcome,
      offers: room.offers,
      seats: {
        a: room.seats.a ? { tokenHash: room.seats.a.tokenHash, name: room.seats.a.name } : null,
        b: room.seats.b ? { tokenHash: room.seats.b.tokenHash, name: room.seats.b.name } : null,
      },
      createdAt: room.createdAt,
      updatedAt: room.updatedAt,
    };
  }

  private trimAcks(room: Room): void {
    if (room.moveAcks.size <= MOVE_ACK_KEEP) return;
    let excess = room.moveAcks.size - MOVE_ACK_KEEP;
    for (const key of room.moveAcks.keys()) {
      room.moveAcks.delete(key);
      if (--excess <= 0) break;
    }
  }
}

export const MAX_CHAT_LEN = MAX_CHAT;
