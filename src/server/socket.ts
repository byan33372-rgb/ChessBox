/**
 * Socket.IO 事件层：输入校验（zod）、限流、会话绑定、事件分发。
 * 所有状态变更都经 RoomManager 的房间队列串行执行。
 */

import { z } from 'zod';
import type { Server, Socket } from 'socket.io';
import type { AckBase, AppError, ClientToServerEvents, RoomState, ServerToClientEvents, StateReason } from '../shared/protocol';
import { ROOM_ID_PATTERN, SESSION_TOKEN_PATTERN } from '../shared/protocol';
import { RateLimiter } from './ratelimit';
import { RoomManager, type Room, type SessionInfo } from './rooms';
import type { SgAction, SgPlayerId } from '../games/sanguosha/types';
import type { UnoSeat } from '../games/uno/engine';
import type { CmdResult } from '../games/sanguosha/engine';

/** 全棋种兼容坐标：中象 a0-i9、国象 a1-h8、跳棋 a1-q17、围棋 a1-s19/指令、五子棋 a1-o15 */
const CELL_RE = /^(?:[a-t][0-9]{1,2}|pass|mark:[a-t][0-9]{1,2}|score-confirm|score-resume)$/;

const Schemas = {
  create: z.object({
    kind: z.enum(['xiangqi', 'chess', 'checkers', 'go', 'gomoku', 'sanguosha', 'uno']),
    name: z.string().trim().min(1).max(12).optional(),
    // 仅跳棋多人生效；其他棋种忽略
    seatCount: z.union([z.literal(2), z.literal(3), z.literal(4), z.literal(6)]).optional(),
    // 仅围棋生效：9/13/19 路（GO-003）
    boardSize: z.union([z.literal(9), z.literal(13), z.literal(19)]).optional(),
    // 创建者阵营偏好（a=先手/红/白……；非法或不适用时按首个空位回退）
    seat: z.enum(['a', 'b', 'c', 'd', 'e', 'f']).optional(),
  }),
  join: z.object({
    roomId: z.string().regex(ROOM_ID_PATTERN),
    name: z.string().trim().min(1).max(12).optional(),
  }),
  rejoin: z.object({
    roomId: z.string().regex(ROOM_ID_PATTERN),
    token: z.string().regex(SESSION_TOKEN_PATTERN),
  }),
  unoCommand: z.object({
    commandId: z.string().regex(/^[A-Za-z0-9-]{8,64}$/),
    expectedRevision: z.number().int().nonnegative().nullable().optional(),
    action: z.object({ type: z.string().max(24) }).passthrough(),
  }),
  sgCommand: z.object({
    commandId: z.string().regex(/^[A-Za-z0-9-]{8,64}$/),
    expectedRevision: z.number().int().nonnegative().nullable().optional(),
    action: z.object({ type: z.string().max(24) }).passthrough(),
  }),
  move: z.object({
    requestId: z.string().regex(/^[A-Za-z0-9-]{8,64}$/),
    revision: z.number().int().min(0).max(1_000_000_000),
    from: z.string().regex(CELL_RE),
    to: z.string().regex(CELL_RE),
    promotion: z.enum(['q', 'r', 'b', 'n']).optional(),
    // 跳棋连续跳跃完整路径：2~16 点、逐格合法性格式（权威校验在引擎层）
    path: z.array(z.string().regex(CELL_RE)).min(2).max(16).optional(),
  }),
  respond: z.object({ accept: z.boolean() }),
  takeSeat: z.object({ seat: z.enum(['a', 'b', 'c', 'd', 'e', 'f']) }),
  chat: z.object({ text: z.string().trim().min(1).max(200) }),
};

export interface SocketData {
  roomId?: string;
  session?: SessionInfo;
}

type AppSocket = Socket<ClientToServerEvents, ServerToClientEvents, never, SocketData>;
type AppServer = Server<ClientToServerEvents, ServerToClientEvents, never, SocketData>;
export type { AppServer };

/** Origin 与 Host 一致才放行（同源策略：本地/隧道/局域网直连都满足；跨站伪造被拒） */
function originAllowed(socket: AppSocket): boolean {
  const origin = socket.handshake.headers.origin;
  if (!origin) return true; // 非浏览器客户端（无 Origin 头）
  const host = socket.handshake.headers.host;
  if (!host) return false;
  const o = origin.replace(/^https?:\/\//, '').replace(/:\d+$/, '').toLowerCase();
  const h = host.replace(/:\d+$/, '').toLowerCase();
  return o === h;
}

export function setupSocket(io: AppServer, rooms: RoomManager): void {
  /** 三国杀超时托管定时器（每房间一个） */
  const sgTimers = new Map<string, ReturnType<typeof setTimeout>>();
  const armSgTimer = (room: Room): void => {
    const key = room.id;
    const prev = sgTimers.get(key);
    if (prev) {
      clearTimeout(prev);
      sgTimers.delete(key);
    }
    if (!room.sg?.pending) return;
    const windowId = room.sg.pending.windowId;
    const t = setTimeout(() => {
      sgTimers.delete(key);
      void rooms.enqueue(room, () => {
        if (!room.sg?.pending || room.sg.pending.windowId !== windowId) return;
        room.sg.forceAuto(windowId);
        rooms.persistSanguosha(room);
        rooms.broadcast(room.id, rooms.publicState(room), 'sg');
      });
    }, 45000);
    sgTimers.set(key, t);
  };

  rooms.broadcast = (roomId: string, state: RoomState, reason: StateReason) => {
    const room = rooms.roomById(roomId);
    if (room?.kind === 'uno' && room.uno) {
      const socketIds = io.of('/').adapter.rooms.get(roomId);
      if (socketIds && socketIds.size > 0) {
        for (const sid of socketIds) {
          const sock = io.of('/').sockets.get(sid);
          const seat = sock?.data?.session?.seat;
          const view = seat && seat !== 'spectator' ? room.uno.view(seat as UnoSeat) : room.uno.view(null);
          io.to(sid).emit('uno:state', { view, reason });
        }
        return;
      }
    }
    if (room?.kind === 'sanguosha' && room.sg) {
      const socketIds = io.of('/').adapter.rooms.get(roomId);
      if (socketIds && socketIds.size > 0) {
        for (const sid of socketIds) {
          const sock = io.of('/').sockets.get(sid);
          const seat = sock?.data?.session?.seat;
          const view = seat && seat !== 'spectator' ? room.sg.view(seat as SgPlayerId) : room.sg.view(null);
          io.to(sid).emit('sg:state', { view, reason });
        }
        armSgTimer(room);
        return;
      }
    }
    io.to(roomId).emit('room:state', { state, reason });
  };
  rooms.broadcastChat = (roomId, msg) => {
    io.to(roomId).emit('chat:message', msg);
  };

  const createLimit = new RateLimiter(2, 0.2); // 建房：突发 2，每 5 秒补 1
  const joinLimit = new RateLimiter(8, 0.15); // 加入：突发 8，每 ~7 秒补 1
  const moveLimit = new RateLimiter(20, 2); // 走棋：突发 20，每秒补 2
  const unoLimit = new RateLimiter(30, 12); // UNO：೼奋 30，每秒补 12
  const chatLimit = new RateLimiter(6, 0.5); // 聊天：突发 6，每 2 秒补 1
  const actionLimit = new RateLimiter(15, 1); // 提和/悔棋等

  io.use((socket, next) => {
    if (originAllowed(socket)) return next();
    next(new Error('origin mismatch'));
  });

  io.on('connection', (socket: AppSocket) => {
    console.log(`[io] 连接 ${socket.id}`);

    const fail = (ack: ((r: AckBase) => void) | undefined, code: AppError['code'], message: string) => {
      ack?.({ ok: false, error: { code, message } });
    };

    const requireSession = (): { room: Room; session: SessionInfo } | null => {
      const data = socket.data;
      if (!data.roomId || !data.session) return null;
      const room = rooms.get(data.roomId);
      if (!room) return null;
      return { room, session: data.session };
    };

    socket.on('room:create', (payload, ack) => {
      if (typeof ack !== 'function') return;
      if (!createLimit.allow(socket.id)) return fail(ack, 'RATE_LIMITED', '操作过于频繁，请稍后再试');
      const parsed = Schemas.create.safeParse(payload);
      if (!parsed.success) return fail(ack, 'INVALID_INPUT', '参数不合法');
      const { room, session } = rooms.createRoom(parsed.data.kind, parsed.data.name, parsed.data.seatCount, parsed.data.boardSize, parsed.data.seat);
      socket.data.roomId = room.id;
      socket.data.session = session;
      socket.join(room.id);
      rooms.bindSocket(session, room, socket.id);
      ack({ ok: true, roomId: room.id, token: session.token, seat: session.seat, state: rooms.publicState(room) });
      rooms.broadcast(room.id, rooms.publicState(room), 'join');
    });

    socket.on('room:join', (payload, ack) => {
      if (typeof ack !== 'function') return;
      if (!joinLimit.allow(socket.id)) return fail(ack, 'RATE_LIMITED', '操作过于频繁，请稍后再试');
      const parsed = Schemas.join.safeParse(payload);
      if (!parsed.success) return fail(ack, 'INVALID_INPUT', '房间号格式不正确');
      const result = rooms.joinRoom(parsed.data.roomId, parsed.data.name);
      if (!result.ok) return ack(result);
      const { room, session } = result;
      socket.data.roomId = room.id;
      socket.data.session = session;
      socket.join(room.id);
      rooms.bindSocket(session, room, socket.id);
      if (session.seat === 'spectator') room.spectators.add(socket.id);
      if (room.chat.length > 0) socket.emit('chat:history', { messages: room.chat });
      ack({ ok: true, token: session.token, seat: session.seat, state: rooms.publicState(room) });
      rooms.broadcast(room.id, rooms.publicState(room), 'join');
    });

    socket.on('room:rejoin', (payload, ack) => {
      if (typeof ack !== 'function') return;
      if (!joinLimit.allow(socket.id)) return fail(ack, 'RATE_LIMITED', '操作过于频繁，请稍后再试');
      const parsed = Schemas.rejoin.safeParse(payload);
      if (!parsed.success) return fail(ack, 'INVALID_INPUT', '参数不合法');
      const result = rooms.rejoinRoom(parsed.data.roomId, parsed.data.token);
      if (!result.ok) return ack(result);
      const { room, session } = result;
      socket.data.roomId = room.id;
      socket.data.session = session;
      socket.join(room.id);
      rooms.bindSocket(session, room, socket.id);
      if (session.seat === 'spectator') room.spectators.add(socket.id);
      if (room.chat.length > 0) socket.emit('chat:history', { messages: room.chat });
      ack({ ok: true, token: session.token, seat: session.seat, state: rooms.publicState(room) });
      rooms.broadcast(room.id, rooms.publicState(room), 'reconnect');
    });

    socket.on('room:leave', (_payload, ack) => {
      if (typeof ack !== 'function') return;
      const bound = requireSession();
      if (bound?.room) socket.leave(bound.room.id);
      socket.data.roomId = undefined;
      socket.data.session = undefined;
      if (bound?.room) {
        rooms.unbindSocket(socket.id, bound.room.id);
        rooms.broadcast(bound.room.id, rooms.publicState(bound.room), 'leave');
      }
      ack({ ok: true });
    });

    socket.on('game:move', (payload, ack) => {
      if (typeof ack !== 'function') return;
      const receivedAt = performance.now();
      const parsed = Schemas.move.safeParse(payload);
      if (!parsed.success) return fail(ack, 'INVALID_INPUT', '走法参数不合法');
      const bound = requireSession();
      if (!bound) return fail(ack, 'SESSION_INVALID', '会话失效，请重新加入房间');
      const { room, session } = bound;
      if (!moveLimit.allow(socket.id)) return fail(ack, 'RATE_LIMITED', '走棋过于频繁，请稍后再试');
      void rooms.enqueue(room, () => {
        try {
          const queueStart = performance.now();
          const result = rooms.applyPlayerMove(room, session, parsed.data, receivedAt);
          if (result.serverTiming) {
            result.serverTiming.queueMs = Math.round((queueStart - receivedAt) * 100) / 100;
            result.serverTiming.totalMs = Math.round((performance.now() - receivedAt) * 100) / 100;
          }
          ack(result);
        } catch (e) {
          console.error(`[io] 走棋处理异常 ${room.id}:`, (e as Error).message);
          ack({ ok: false, error: { code: 'INTERNAL', message: '服务器内部错误' } });
        }
      });
    });

    /** 延迟探针：仅回环 RTT，不触碰任何对局状态（SOCKET-010/MEASURE-002） */
    socket.on('latency:ping', (_payload, ack) => {
      if (typeof ack === 'function') ack({ ok: true, t: Date.now() });
    });

    socket.on('uno:command', (payload, ack) => {
      if (typeof ack !== 'function') return;
      const parsed = Schemas.unoCommand.safeParse(payload);
      if (!parsed.success) return fail(ack, 'INVALID_INPUT', '参数不合法');
      const bound = requireSession();
      if (!bound) return fail(ack, 'SESSION_INVALID', '会话失效，请重新加入房间');
      const { room, session } = bound;
      if (room.kind !== 'uno' || !room.uno) return fail(ack, 'NOT_ALLOWED', '房间类型不匹配');
      if (session.seat === 'spectator') return fail(ack, 'NOT_PLAYER', '观战者不能操作');
      const seat = session.seat;
      if (!['a', 'b', 'c', 'd'].includes(seat)) return fail(ack, 'NOT_PLAYER', '座位无效');
      if (!unoLimit.allow(socket.id)) {
        const v = room.uno.view(seat as UnoSeat);
        ack({ ok: false, error: { code: 'RATE_LIMITED', message: '操作过于频繁，请稍后再试' }, revision: room.uno.st.revision, view: v });
        return;
      }
      void rooms.enqueue(room, () => {
        try {
          const uno = room.uno!;
          const r = uno.command(seat as UnoSeat, parsed.data.action as Record<string, unknown>, parsed.data.expectedRevision ?? null, parsed.data.commandId);
          if (r.ok) rooms.persistUno(room);
          const view = uno.view(seat as UnoSeat);
          if (r.ok) {
            ack({ ok: true, revision: r.revision, view });
            rooms.broadcast(room.id, rooms.publicState(room), 'sg');
          } else if (r.error) {
            ack({ ok: false, error: r.error as AppError, revision: r.revision, view });
            // NOT_YOUR_TURN = 提交者视图过期：向全房间重发当前状态，防止其他成员困在过期视图
            if (r.error.code === 'NOT_YOUR_TURN') {
              rooms.broadcast(room.id, rooms.publicState(room), 'sg');
            }
          } else {
            ack({ ok: false, revision: r.revision, view });
          }
        } catch (e) {
          console.error(`[io] UNO 命令异常 ${room.id}:`, (e as Error).message);
          ack({ ok: false, error: { code: 'INTERNAL', message: '服务器内部错误' } });
        }
      });
    });

    socket.on('sg:command', (payload, ack) => {
      if (typeof ack !== 'function') return;
      const parsed = Schemas.sgCommand.safeParse(payload);
      if (!parsed.success) return fail(ack, 'INVALID_INPUT', '参数不合法');
      const bound = requireSession();
      if (!bound) return fail(ack, 'SESSION_INVALID', '会话失效，请重新加入房间');
      const { room, session } = bound;
      if (room.kind !== 'sanguosha' || !room.sg) return fail(ack, 'NOT_ALLOWED', '房间类型不匹配');
      if (session.seat === 'spectator') return fail(ack, 'NOT_PLAYER', '观战者不能操作');
      const seat = session.seat;
      if (!['a', 'b', 'c', 'd'].includes(seat)) return fail(ack, 'NOT_PLAYER', '座位无效');
      if (!moveLimit.allow(socket.id)) {
        // 限流拒绝也携带最新脱敏视图：避免客户端困在过期视图里反复重试
        const v = room.sg ? room.sg.view(seat as SgPlayerId) : null;
        ack({ ok: false, error: { code: 'RATE_LIMITED', message: '操作过于频繁，请稍后再试' }, revision: room.sg?.st.revision ?? 0, view: v ?? undefined });
        return;
      }
      void rooms.enqueue(room, () => {
        try {
          const sg = room.sg!;
          const r = sg.command(seat as SgPlayerId, parsed.data.action as SgAction, parsed.data.expectedRevision ?? null, parsed.data.commandId);
          if (r.ok) rooms.persistSanguosha(room);
          const view = sg.view(seat as SgPlayerId);
          if (r.ok) {
            ack({ ok: true, revision: r.revision, view });
            rooms.broadcast(room.id, rooms.publicState(room), 'sg');
          } else if (r.error) {
            ack({ ok: false, error: r.error as AppError, revision: r.revision, view });
          } else {
            ack({ ok: false, revision: r.revision, view });
          }
        } catch (e) {
          console.error(`[io] 三国杀命令异常 ${room.id}:`, (e as Error).message);
          ack({ ok: false, error: { code: 'INTERNAL', message: '服务器内部错误' } });
        }
      });
    });

    const withRoom = (
      ack: ((r: AckBase) => void) | undefined,
      fn: (room: Room, session: SessionInfo) => void,
    ) => {
      if (typeof ack !== 'function') return;
      const bound = requireSession();
      if (!bound) return fail(ack, 'SESSION_INVALID', '会话失效，请重新加入房间');
      if (!actionLimit.allow(socket.id)) return fail(ack, 'RATE_LIMITED', '操作过于频繁，请稍后再试');
      void rooms.enqueue(bound.room, () => {
        try {
          fn(bound.room, bound.session);
        } catch (e) {
          console.error('[io] 事件处理异常:', (e as Error).message);
          fail(ack, 'INTERNAL', '服务器内部错误');
        }
      });
    };

    socket.on('room:take-seat', (p, ack) => {
      const parsed = Schemas.takeSeat.safeParse(p);
      if (!parsed.success) return fail(ack, 'INVALID_INPUT', '参数不合法');
      withRoom(ack, (room, session) => ack(rooms.takeSeat(room, session, parsed.data.seat)));
    });

    socket.on('game:resign', (_p, ack) => withRoom(ack, (room, session) => ack(rooms.resign(room, session))));

    socket.on('game:draw:offer', (_p, ack) => withRoom(ack, (room, session) => ack(rooms.drawOffer(room, session))));

    socket.on('game:draw:respond', (p, ack) => {
      const parsed = Schemas.respond.safeParse(p);
      if (!parsed.success) return fail(ack, 'INVALID_INPUT', '参数不合法');
      withRoom(ack, (room, session) => ack(rooms.drawRespond(room, session, parsed.data.accept)));
    });

    socket.on('game:undo:offer', (_p, ack) => withRoom(ack, (room, session) => ack(rooms.undoOffer(room, session))));

    socket.on('game:undo:respond', (p, ack) => {
      const parsed = Schemas.respond.safeParse(p);
      if (!parsed.success) return fail(ack, 'INVALID_INPUT', '参数不合法');
      withRoom(ack, (room, session) => ack(rooms.undoRespond(room, session, parsed.data.accept)));
    });

    socket.on('game:restart:offer', (_p, ack) => withRoom(ack, (room, session) => ack(rooms.restartOffer(room, session))));

    socket.on('game:restart:respond', (p, ack) => {
      const parsed = Schemas.respond.safeParse(p);
      if (!parsed.success) return fail(ack, 'INVALID_INPUT', '参数不合法');
      withRoom(ack, (room, session) => ack(rooms.restartRespond(room, session, parsed.data.accept)));
    });

    socket.on('chat:send', (p, ack) => {
      if (typeof ack !== 'function') return;
      const parsed = Schemas.chat.safeParse(p);
      if (!parsed.success) return fail(ack, 'INVALID_INPUT', '消息内容不合法');
      const bound = requireSession();
      if (!bound) return fail(ack, 'SESSION_INVALID', '会话失效');
      if (!chatLimit.allow(socket.id)) return fail(ack, 'RATE_LIMITED', '发言过于频繁，请稍后再试');
      void rooms.enqueue(bound.room, () => {
        ack(rooms.addChat(bound.room, bound.session, parsed.data.text));
      });
    });

    socket.on('disconnect', (reason) => {
      const bound = socket.data;
      console.log(`[io] 断开 ${socket.id} (${reason})`);
      if (bound.roomId) {
        const result = rooms.unbindSocket(socket.id, bound.roomId);
        if (result) {
          rooms.broadcast(result.room.id, rooms.publicState(result.room), 'leave');
        }
      }
    });
  });
}
