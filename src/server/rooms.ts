/**
 * 房间管理器：内存权威状态 + SQLite 持久化。
 *
 * 安全与一致性要点：
 * - 每个房间的状态变更通过 enqueue() 串行处理（防并发分叉）。
 * - 走棋请求必须匹配当前 revision（乐观锁）且 requestId 幂等。
 * - 席位原子分配：会话令牌绑定席位，第三方只能观战，不能抢占。
 * - 令牌仅内存持有明文，数据库只存 SHA-256；日志只打印前 6 位。
 */

import { createEngine, createCheckersEngine, replayEngine } from '../games';
import { CheckersEngine, GoEngine, SUPPORTED_SEAT_COUNTS } from '../games';
import type { GameEngine, GameKind, GameOutcome, MoveInput, Side } from '../games/types';
import { SanguoshaGame } from '../games/sanguosha/engine';
import { SanguoshaStubEngine } from '../games/sanguosha/adapter';
import { UnoGame } from '../games/uno/engine';
import { UnoStubEngine } from '../games/uno/adapter';
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
import { SIDE_NAMES } from '../shared/protocol';
import { newRoomId, newSessionToken, randomNick, sha256 } from './ids';
import { Store, type RoomPersist } from './store';

export interface SessionInfo {
  token: string;
  tokenHash: string;
  name: string;
  seat: Side | 'spectator';
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
  /** 键 = 本房间有效座位字母；缺失 = 未占用（跳棋自由房为六座 a..f 任选） */
  seats: Partial<Record<Side, SessionInfo>>;
  /** 跳棋自由房的入座容量（2/3/4/6）：入座数达到容量即开局 */
  capacity?: number;
  spectators: Set<string>;
  offers: OffersState;
  chat: ChatMessage[];
  queue: Promise<unknown>;
  moveAcks: Map<string, MoveAck>;
  /** 三国杀对局（仅 kind==='sanguosha'） */
  sg?: SanguoshaGame;
  /** 三国杀牌堆配置 */
  sgDeck?: 'standard_only' | 'standard_plus_military';
  /** UNO 对局（仅 kind==='uno'） */
  uno?: UnoGame;
  createdAt: number;
  updatedAt: number;
}

function err(code: AppError['code'], message: string): AppError {
  return { code, message };
}

/** 本房间的有效座位字母（跳棋自由房=六营全开；旧跳棋房=引擎座位序；其余固定 a,b） */
function seatLettersOf(room: Room): Side[] {
  if (room.kind === 'checkers' && room.engine instanceof CheckersEngine) {
    return room.engine.isFree() ? (['a', 'b', 'c', 'd', 'e', 'f'] as Side[]) : room.engine.seatOrder();
  }
  if (room.kind === 'sanguosha') return ['a', 'b', 'c', 'd'].slice(0, room.capacity ?? 4) as Side[];
  if (room.kind === 'uno') return ['a', 'b', 'c', 'd'].slice(0, room.capacity ?? 4) as Side[];
  return ['a', 'b'];
}

/** 已入座玩家数 */
function seatedCount(room: Room): number {
  return seatLettersOf(room).filter((x) => room.seats[x] != null).length;
}

/** 对局可开始：自由跳棋按容量；其余全部有效座位都有玩家 */
function seatsAllFilled(room: Room): boolean {
  if (room.kind === 'checkers' && room.engine instanceof CheckersEngine && room.engine.isFree()) {
    return seatedCount(room) >= (room.capacity ?? 2);
  }
  if (room.kind === 'sanguosha') return seatedCount(room) >= (room.capacity ?? 4);
  if (room.kind === 'uno') return seatedCount(room) >= (room.capacity ?? 4);
  return seatLettersOf(room).every((s) => room.seats[s] != null);
}

/** 自由跳棋重建引擎：按当前已入座玩家重新铺子（重开/悔棋用） */
function freeCheckersEngine(room: Room): CheckersEngine {
  const e = CheckersEngine.createFree();
  const seated = seatLettersOf(room)
    .filter((x) => room.seats[x] != null)
    .sort() as Array<'a' | 'b' | 'c' | 'd' | 'e' | 'f'>;
  for (const seat of seated) e.addSeat(seat);
  return e;
}

/** 按本房间座位数创建全新引擎（重开/悔棋重建用） */
function freshEngine(room: Room): GameEngine {
  if (room.kind === 'checkers' && room.engine instanceof CheckersEngine) {
    if (room.engine.isFree()) return freeCheckersEngine(room);
    return createCheckersEngine(room.engine.seatCount() as 2 | 3 | 4 | 6, room.engine.seatOrder()[0]);
  }
  // 围棋：保留原房间的棋盘规格（DEF-FG-003：此前 9/13 路重开/悔棋至空盘会变 19 路）
  if (room.kind === 'go' && room.engine instanceof GoEngine) {
    return createEngine('go', undefined, room.engine.size as number);
  }
  return createEngine(room.kind);
}

const MAX_NAME = 12;
const MAX_CHAT = 200;
const CHAT_KEEP = 100;
const round2 = (n: number): number => Math.round(n * 100) / 100;

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

  roomById(id: string): Room | undefined {
    return this.rooms.get(id);
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
        const engine = p.kind === 'sanguosha'
          ? new SanguoshaStubEngine()
          : moves.length > 0
            ? replayEngine(p.kind, moves, p.kind === 'checkers' ? (p.seatCount ?? 2) : undefined)
            : createEngine(p.kind, p.fen);
        const room: Room = {
          id: p.roomId,
          kind: p.kind,
          engine,
          revision: p.revision,
          moves,
          outcome: engine.outcome() ?? p.outcome,
          seats: {},
          capacity: p.kind === 'checkers' ? (p.seatCount ?? 2) : p.kind === 'sanguosha' ? (p.seatCount ?? 4) : undefined,
          spectators: new Set(),
          offers: p.offers ?? { draw: null, undo: null, restart: null },
          chat: this.store.loadChat(p.roomId),
          queue: Promise.resolve(),
          moveAcks: new Map(),
          createdAt: p.createdAt,
          updatedAt: p.updatedAt,
        };
        for (const seat of seatLettersOf(room)) {
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

  createRoom(kind: GameKind, rawName?: string, seatCount?: number, boardSize?: number, preferredSeat?: Side): { room: Room; session: SessionInfo } {
    let id = newRoomId();
    while (this.rooms.has(id)) id = newRoomId();
    // 跳棋按座位数创建（2/3/4/6）；其余棋种固定双人
    const capacity =
      kind === 'checkers' && seatCount != null && (SUPPORTED_SEAT_COUNTS as readonly number[]).includes(seatCount)
        ? seatCount
        : kind === 'checkers'
          ? 2
          : kind === 'sanguosha' || kind === 'uno'
            ? seatCount === 3
              ? 3
              : 4
            : undefined;
    const sgDeck: 'standard_only' | 'standard_plus_military' = 'standard_plus_military';
    const engine =
      kind === 'checkers'
        ? CheckersEngine.createFree()
        : kind === 'sanguosha'
          ? new SanguoshaStubEngine()
          : kind === 'uno'
            ? new UnoStubEngine()
            : createEngine(kind, undefined, boardSize);
    const room: Room = {
      id,
      kind,
      engine,
      revision: 1,
      moves: [],
      outcome: null,
      seats: {},
      capacity,
      spectators: new Set(),
      offers: { draw: null, undo: null, restart: null },
      chat: [],
      queue: Promise.resolve(),
      moveAcks: new Map(),
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    if (kind === 'sanguosha') {
      room.sgDeck = sgDeck;
      room.sg = SanguoshaGame.create(['a', 'b', 'c', 'd'].slice(0, room.capacity ?? 4) as never, sgDeck, (Math.random() * 0xffffffff) >>> 0);
    }
    if (kind === 'uno') {
      room.uno = UnoGame.create(['a', 'b', 'c', 'd'].slice(0, room.capacity ?? 4) as never, 'uno_classic_108', 'classic_ffa', (Math.random() * 0xffffffff) >>> 0);
    }
    const name = this.cleanName(rawName) ?? `${randomNick()}`;
    if (room.kind === 'checkers') {
      // 跳棋：创建者不自动入座，进房后在六阵营面板中自选（其他玩家同理）
      const session = this.newSession(room, 'spectator', name);
      this.rooms.set(id, room);
      this.persist(room);
      return { room, session };
    }
    // 其余棋种：合法座位内取偏好，否则回退首个座位（加入者自动补空位）
    const letters = seatLettersOf(room);
    const seat: Side = preferredSeat && letters.includes(preferredSeat) ? preferredSeat : letters[0];
    const session = this.newSession(room, seat, name);
    room.seats[seat] = session;
    this.rooms.set(id, room);
    this.persist(room);
    return { room, session };
  }

  joinRoom(roomId: string, rawName?: string): { ok: true; room: Room; session: SessionInfo } | { ok: false; error: AppError } {
    const room = this.rooms.get(roomId);
    if (!room) return { ok: false, error: err('ROOM_NOT_FOUND', '房间不存在或已过期') };
    const name = this.cleanName(rawName) ?? `${randomNick()}`;
    // 跳棋自由房：加入者先观战，进房后自选阵营；其余棋种按顺序补空位
    const letters = seatLettersOf(room);
    const seat: Side | 'spectator' =
      room.kind === 'checkers' ? 'spectator' : (letters.find((s) => room.seats[s] == null) ?? 'spectator');
    const session = this.newSession(room, seat, name);
    if (seat !== 'spectator') {
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

  /** 等待阶段选座/换座：目标必须为空位；对局开始后锁定（防中途换边） */
  takeSeat(room: Room, session: SessionInfo, seat: Side): AckBase {
    if (room.outcome) return { ok: false, error: err('GAME_ENDED', '对局已结束') };
    const letters = seatLettersOf(room);
    if (!letters.includes(seat)) return { ok: false, error: err('INVALID_INPUT', '无效座位') };
    if (this.phaseOf(room) === 'playing') return { ok: false, error: err('NOT_ALLOWED', '对局已开始，不能更换阵营') };
    if (room.seats[seat] && room.seats[seat]!.tokenHash !== session.tokenHash) {
      return { ok: false, error: err('NOT_ALLOWED', '该阵营已被占用，请选择空位') };
    }
    // 自由跳棋：容量限制 + 按营位重建引擎（换座=旧营撤子、新营铺子）
    if (room.kind === 'checkers' && room.engine instanceof CheckersEngine && room.engine.isFree()) {
      const cap = room.capacity ?? 2;
      const alreadySeated = session.seat !== 'spectator';
      if (!alreadySeated && seatedCount(room) >= cap) {
        return { ok: false, error: err('NOT_ALLOWED', `房间已满（${cap} 人）`) };
      }
      const seated = seatLettersOf(room)
        .filter((x) => room.seats[x] != null && x !== session.seat)
        .concat(seat)
        .sort() as Array<'a' | 'b' | 'c' | 'd' | 'e' | 'f'>;
      const rebuilt = CheckersEngine.createFree();
      for (const s2 of seated) rebuilt.addSeat(s2);
      room.engine = rebuilt;
    }
    // 释放旧座位（同一会话迁移）
    if (session.seat !== 'spectator' && session.seat !== seat) {
      const old = room.seats[session.seat];
      if (old && old.tokenHash === session.tokenHash) delete room.seats[session.seat];
    }
    session.seat = seat;
    room.seats[seat] = session;
    room.revision += 1;
    room.updatedAt = Date.now();
    this.store.saveSession({ tokenHash: session.tokenHash, roomId: room.id, seat, name: session.name, createdAt: Date.now() });
    this.persist(room);
    this.broadcast(room.id, this.publicState(room), 'seat');
    return { ok: true, state: this.publicState(room), seat };
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
    for (const seat of seatLettersOf(room)) {
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
    for (const seat of seatLettersOf(room)) {
      const s = room.seats[seat];
      if (s && s.socketId === socketId) return s;
    }
    return null;
  }

  /** 走棋（必须在 room 队列内执行） */
  applyPlayerMove(room: Room, session: SessionInfo, req: MoveRequest, receivedAt = performance.now()): MoveAck {
    const t0 = performance.now();
    const cached = room.moveAcks.get(req.requestId);
    if (cached) return cached;
    let tValidate = t0;
    let tApply = t0;
    let tState = t0;
    let tPersist = t0;

    const ackFail = (code: AppError['code'], message: string): MoveAck => {
      // 失败不缓存：STALE_REVISION 等瞬态错误允许客户端同步后用同一 requestId 重试
      return { ok: false, error: err(code, message), state: this.publicState(room) };
    };

    if (room.kind === 'sanguosha') return ackFail('NOT_ALLOWED', '三国杀请使用 sg:command');
    if (room.kind === 'uno') return ackFail('NOT_ALLOWED', 'UNO 请使用 uno:command');
    if (session.seat === 'spectator') return ackFail('NOT_PLAYER', '观战者不能走棋');
    if (room.outcome) return ackFail('GAME_ENDED', '对局已结束');
    if (!seatsAllFilled(room)) return ackFail('GAME_NOT_PLAYING', '等待对手加入');
    if (room.engine.turn() !== session.seat) return ackFail('NOT_YOUR_TURN', '还没轮到你走棋');
    if (req.revision !== room.revision) return ackFail('STALE_REVISION', '局面版本不一致，已为你同步最新局面');
    tValidate = performance.now();

    const input: MoveInput = { from: req.from, to: req.to, promotion: req.promotion, path: req.path };
    const applied = room.engine.applyMove(input);
    if (!applied) return ackFail('ILLEGAL_MOVE', '非法走法');
    tApply = performance.now();

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
      capturedSq: applied.capturedSq,
      path: applied.path,
      extra: applied.extra,
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
    // 持久化失败回滚（C-DB-008 / SERVER-009）：内存局面、棋谱、版本号一起回退，
    // 避免「内存已走、数据库未落、客户端收到错误」的三方不一致。
    const snapFen = move.fenBefore;
    const snapMoves = room.moves.length - 1;
    const snapRevision = room.revision - 1;
    const snapOutcome = null; // 走棋前已校验 room.outcome 为空
    const snapOffers = { ...room.offers };
    const snapUpdatedAt = room.updatedAt;
    try {
      this.store.appendMoveAndSaveRoom(room.id, move, this.buildPersist(room));
    } catch (e) {
      room.engine = createEngine(room.kind, snapFen);
      room.moves.length = snapMoves;
      room.revision = snapRevision;
      room.outcome = snapOutcome;
      room.offers = snapOffers;
      room.updatedAt = snapUpdatedAt;
      throw e;
    }
    tPersist = performance.now();

    const state = this.publicState(room);
    tState = performance.now();
    const ack: MoveAck = {
      ok: true,
      revision: room.revision,
      state,
      serverTiming: {
        queueMs: 0, // socket 层回填真实排队时间
        validateMs: round2(tValidate - t0),
        applyMs: round2(tApply - tValidate),
        stateMs: round2(tState - tPersist),
        persistMs: round2(tPersist - tApply),
        broadcastMs: 0,
        totalMs: round2(performance.now() - t0),
      },
    };
    room.moveAcks.set(req.requestId, ack);
    this.trimAcks(room);
    const tB0 = performance.now();
    this.broadcast(room.id, state, 'move');
    const tB1 = performance.now();
    ack.serverTiming!.broadcastMs = round2(tB1 - tB0);
    ack.serverTiming!.totalMs = round2(performance.now() - t0);
    return ack;
  }

  resign(room: Room, session: SessionInfo): AckBase {
    if (room.kind === 'sanguosha') return { ok: false, error: err('NOT_ALLOWED', '三国杀不支持该操作') };
    if (room.kind === 'uno') return { ok: false, error: err('NOT_ALLOWED', 'UNO 不支持该操作') };
    if (session.seat === 'spectator') return { ok: false, error: err('NOT_PLAYER', '观战者不能认输') };
    if (room.outcome) return { ok: false, error: err('GAME_ENDED', '对局已结束') };
    if (!seatsAllFilled(room)) return { ok: false, error: err('GAME_NOT_PLAYING', '对局尚未开始') };
    const sideName = SIDE_NAMES[session.seat];
    if (room.kind === 'checkers' && room.engine instanceof CheckersEngine) {
      // 多人跳棋：认输者退出轮转；仅剩一人时由引擎判定获胜（CHECKERS-024）
      const outcome = room.engine.resignSeat(session.seat as never);
      room.outcome = outcome;
    } else {
      const letters = seatLettersOf(room);
      const winner: Side = letters.find((s) => s !== session.seat) ?? (session.seat === 'a' ? 'b' : 'a');
      room.outcome = { type: 'resignation', winner, reason: `${sideName}认输` };
    }
    room.revision += 1;
    room.updatedAt = Date.now();
    room.offers = { draw: null, undo: null, restart: null };
    this.persist(room);
    this.broadcast(room.id, this.publicState(room), 'resign');
    return { ok: true, state: this.publicState(room) };
  }

  drawOffer(room: Room, session: SessionInfo): AckBase {
    if (room.kind === 'sanguosha') return { ok: false, error: err('NOT_ALLOWED', '三国杀不支持该操作') };
    if (room.kind === 'uno') return { ok: false, error: err('NOT_ALLOWED', 'UNO 不支持该操作') };
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
    if (room.kind === 'sanguosha') return { ok: false, error: err('NOT_ALLOWED', '三国杀不支持该操作') };
    if (room.kind === 'uno') return { ok: false, error: err('NOT_ALLOWED', 'UNO 不支持该操作') };
    if (session.seat === 'spectator') return { ok: false, error: err('NOT_PLAYER', '观战者不能悔棋') };
    if (room.moves.length === 0) return { ok: false, error: err('NOTHING_TO_UNDO', '还没有任何走棋') };
    const me = session.seat;
    if (room.offers.undo && room.offers.undo.by === me) {
      return { ok: false, error: err('ALREADY_OFFERED', '你已经发过悔棋请求，等待对方回应') };
    }
    if (room.offers.undo && room.offers.undo.by !== me) {
      return { ok: false, error: err('ALREADY_OFFERED', '对方已发悔棋请求，请回应') };
    }
    // 回退到请求方行棋前的局面：从最后一手向前找到请求方最近一手（双人局等价于退 1/2 步）
    let plies = 1;
    for (let i = room.moves.length - 1; i >= 0; i--) {
      if (room.moves[i].side === me) {
        plies = room.moves.length - i;
        break;
      }
    }
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
      const seatCount = room.kind === 'checkers' ? seatLettersOf(room).length : undefined;
      const engine = kept.length > 0 ? replayEngine(room.kind, kept, seatCount) : freshEngine(room);
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
    if (room.kind === 'sanguosha') return { ok: false, error: err('NOT_ALLOWED', '三国杀不支持该操作') };
    if (room.kind === 'uno') return { ok: false, error: err('NOT_ALLOWED', 'UNO 不支持该操作') };
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
    room.engine = freshEngine(room);
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
    const letters = seatLettersOf(room);
    const seats: RoomState['seats'] = {};
    for (const s of letters) {
      const info = room.seats[s];
      if (info) seats[s] = { name: info.name, connected: info.socketId !== null };
    }
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
      seats,
      seatOrder: letters,
      seatCount: room.capacity ?? letters.length,
      spectators: room.spectators.size,
      outcome: room.outcome,
      offers: room.offers,
    };
  }

  phaseOf(room: Room): RoomPhase {
    if (room.kind === 'sanguosha') {
      if (!room.sg) return 'waiting';
      if (room.sg.st.winner !== null) return 'ended';
      return room.sg.st.phase === 'select' ? 'waiting' : 'playing';
    }
    if (room.kind === 'uno') {
      if (!room.uno) return 'waiting';
      if (room.uno.st.winner !== null || room.uno.st.phase === 'roundEnd') return 'ended';
      return room.uno.st.phase === 'select' ? 'waiting' : 'playing';
    }
    if (room.outcome) return 'ended';
    return seatsAllFilled(room) ? 'playing' : 'waiting';
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

  private newSession(room: Room, seat: Side | 'spectator', name: string): SessionInfo {
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
    const seats: RoomPersist['seats'] = {};
    for (const s of seatLettersOf(room)) {
      const info = room.seats[s];
      seats[s] = info ? { tokenHash: info.tokenHash, name: info.name } : null;
    }
    return {
      roomId: room.id,
      kind: room.kind,
      fen: room.engine.fen(),
      revision: room.revision,
      phase: this.phaseOf(room),
      outcome: room.outcome,
      offers: room.offers,
      seats,
      seatCount: room.kind === 'checkers'
        ? (room.capacity ?? seatLettersOf(room).length)
        : room.kind === 'sanguosha'
          ? (room.capacity ?? 4)
          : undefined,
      createdAt: room.createdAt,
      updatedAt: room.updatedAt,
      sgJson: room.sg ? room.sg.serialize() : null,
      sgDeck: room.kind === 'sanguosha' ? room.sgDeck : null,
      unoJson: room.uno ? room.uno.serialize() : null,
    };
  }

  /** 三国杀：持久化对局（命令历史重放式恢复）；节流防 OOM */
  private sgPersistCount = new Map<string, number>();
  private sgPersistLast = new Map<string, number>();
  persistSanguosha(room: Room): void {
    if (room.kind !== 'sanguosha' || !room.sg) return;
    // 节流：每 10 条命令或每 5 秒持久化一次（serialize 整个 history 会产生大量临时字符串）
    const count = (this.sgPersistCount.get(room.id) ?? 0) + 1;
    this.sgPersistCount.set(room.id, count);
    const now = Date.now();
    const last = this.sgPersistLast.get(room.id) ?? 0;
    if (count % 10 !== 0 && now - last < 5000) return;
    this.sgPersistLast.set(room.id, now);
    try {
      this.persist(room);
    } catch {
      // 持久化失败不阻断对局（内存权威；重启后该局退回选将态）
    }
  }

  /** UNO：持久化对局（节流同 SG） */
  persistUno(room: Room): void {
    if (room.kind !== 'uno' || !room.uno) return;
    const count = (this.sgPersistCount.get(room.id) ?? 0) + 1;
    this.sgPersistCount.set(room.id, count);
    const now = Date.now();
    const last = this.sgPersistLast.get(room.id) ?? 0;
    if (count % 10 !== 0 && now - last < 5000) return;
    this.sgPersistLast.set(room.id, now);
    try {
      this.persist(room);
    } catch {
      // 同上
    }
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
