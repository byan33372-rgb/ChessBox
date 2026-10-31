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

/** 全棋种兼容坐标：中象 a0-i9、国象 a1-h8、跳棋 a1-q17（两位行号） */
const CELL_RE = /^[a-q][0-9]{1,2}$/;

const Schemas = {
  create: z.object({
    kind: z.enum(['xiangqi', 'chess', 'checkers']),
    name: z.string().trim().min(1).max(12).optional(),
    // 仅跳棋多人生效；其他棋种忽略
    seatCount: z.union([z.literal(2), z.literal(3), z.literal(4), z.literal(6)]).optional(),
  }),
  join: z.object({
    roomId: z.string().regex(ROOM_ID_PATTERN),
    name: z.string().trim().min(1).max(12).optional(),
  }),
  rejoin: z.object({
    roomId: z.string().regex(ROOM_ID_PATTERN),
    token: z.string().regex(SESSION_TOKEN_PATTERN),
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
  rooms.broadcast = (roomId: string, state: RoomState, reason: StateReason) => {
    io.to(roomId).emit('room:state', { state, reason });
  };
  rooms.broadcastChat = (roomId, msg) => {
    io.to(roomId).emit('chat:message', msg);
  };

  const createLimit = new RateLimiter(2, 0.2); // 建房：突发 2，每 5 秒补 1
  const joinLimit = new RateLimiter(8, 0.15); // 加入：突发 8，每 ~7 秒补 1
  const moveLimit = new RateLimiter(20, 2); // 走棋：突发 20，每秒补 2
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
      const { room, session } = rooms.createRoom(parsed.data.kind, parsed.data.name, parsed.data.seatCount);
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
      const parsed = Schemas.move.safeParse(payload);
      if (!parsed.success) return fail(ack, 'INVALID_INPUT', '走法参数不合法');
      const bound = requireSession();
      if (!bound) return fail(ack, 'SESSION_INVALID', '会话失效，请重新加入房间');
      const { room, session } = bound;
      if (!moveLimit.allow(socket.id)) return fail(ack, 'RATE_LIMITED', '走棋过于频繁，请稍后再试');
      void rooms.enqueue(room, () => {
        try {
          const result = rooms.applyPlayerMove(room, session, parsed.data);
          ack(result);
        } catch (e) {
          console.error(`[io] 走棋处理异常 ${room.id}:`, (e as Error).message);
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
