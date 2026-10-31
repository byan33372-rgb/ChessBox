/**
 * 房间网络客户端：Socket.IO 连接管理、加入/重连、事件动作。
 * 会话令牌仅保存在 localStorage（不进入 URL）。
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import type {
  AckBase,
  AppError,
  ChatMessage,
  CreateAck,
  JoinAck,
  MoveAck,
  RoomState,
} from '../../shared/protocol';
import type { GameKind, Side } from '../../games/types';

export type ConnState = 'connecting' | 'online' | 'reconnecting';

export interface Toast {
  id: number;
  text: string;
  kind: 'info' | 'error' | 'success';
}

const NAME_KEY = 'dc:name';
const tokenKey = (roomId: string) => `dc:token:${roomId}`;

export function getSavedName(): string {
  return window.localStorage.getItem(NAME_KEY) ?? '';
}

export function saveName(name: string): void {
  window.localStorage.setItem(NAME_KEY, name);
}

function loadToken(roomId: string): string | null {
  return window.localStorage.getItem(tokenKey(roomId));
}

function storeToken(roomId: string, token: string): void {
  window.localStorage.setItem(tokenKey(roomId), token);
}

function emitWithAck<T extends AckBase>(socket: Socket, event: string, payload: unknown, timeoutMs = 8000): Promise<T> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      resolve({ ok: false, error: { code: 'INTERNAL', message: '请求超时，请检查网络' } } as T);
    }, timeoutMs);
    socket.emit(event as never, payload as never, ((r: T) => {
      clearTimeout(timer);
      resolve(r);
    }) as never);
  });
}

export interface RoomActions {
  move(input: { from: string; to: string; promotion?: string; path?: string[] }): Promise<void>;
  resign(): Promise<void>;
  drawOffer(): Promise<void>;
  drawRespond(accept: boolean): Promise<void>;
  undoOffer(): Promise<void>;
  undoRespond(accept: boolean): Promise<void>;
  restartOffer(): Promise<void>;
  restartRespond(accept: boolean): Promise<void>;
  chat(text: string): Promise<void>;
  leave(): Promise<void>;
}

export interface RoomSession {
  conn: ConnState;
  /** 加入流程状态 */
  status: 'joining' | 'ready' | 'fatal';
  fatal: string | null;
  seat: Side | 'spectator' | null;
  state: RoomState | null;
  chat: ChatMessage[];
  toasts: Toast[];
  dismissToast(id: number): void;
  toast(text: string, kind?: Toast['kind']): void;
  actions: RoomActions;
}

export function useRoom(roomId: string | null): RoomSession {
  const socketRef = useRef<Socket | null>(null);
  const [conn, setConn] = useState<ConnState>('connecting');
  const [status, setStatus] = useState<'joining' | 'ready' | 'fatal'>('joining');
  const [fatal, setFatal] = useState<string | null>(null);
  const [seat, setSeat] = useState<Side | 'spectator' | null>(null);
  const [state, setState] = useState<RoomState | null>(null);
  const [chat, setChat] = useState<ChatMessage[]>([]);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const toastId = useRef(1);

  const toast = useCallback((text: string, kind: Toast['kind'] = 'info') => {
    const id = toastId.current++;
    setToasts((t) => [...t.slice(-3), { id, text, kind }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4200);
  }, []);

  const dismissToast = useCallback((id: number) => {
    setToasts((t) => t.filter((x) => x.id !== id));
  }, []);

  /** 最新权威局面引用：让 actions 保持稳定引用，避免每次广播重建 */
  const stateRef = useRef<RoomState | null>(null);
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    if (!roomId) return;
    const socket = io({
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionDelay: 800,
      reconnectionDelayMax: 5000,
    });
    socketRef.current = socket;
    setConn('connecting');
    setStatus('joining');
    setFatal(null);

    let joinAttempts = 0;

    const doJoin = async () => {
      if (joinAttempts > 8) {
        setFatal('多次尝试加入失败，请刷新页面重试');
        setStatus('fatal');
        return;
      }
      joinAttempts++;
      const token = loadToken(roomId);
      if (token) {
        const ack = await emitWithAck<JoinAck>(socket, 'room:rejoin', { roomId, token });
        if (ack.ok) {
          setSeat(ack.seat ?? null);
          setState(ack.state ?? null);
          setStatus('ready');
          if (ack.token) storeToken(roomId, ack.token);
          return;
        }
        if (ack.error?.code === 'ROOM_NOT_FOUND') {
          setFatal('房间不存在或已过期');
          setStatus('fatal');
          return;
        }
        if (ack.error?.code === 'RATE_LIMITED') {
          // 频繁重连触达限流：退避后重试，不进入致命态
          setTimeout(() => void doJoin(), 2500);
          return;
        }
        // 会话失效 → 以新身份加入
        window.localStorage.removeItem(tokenKey(roomId));
      }
      const join = await emitWithAck<JoinAck>(socket, 'room:join', { roomId, name: getSavedName() || undefined });
      if (join.ok) {
        setSeat(join.seat ?? null);
        setState(join.state ?? null);
        setStatus('ready');
        if (join.token) storeToken(roomId, join.token);
      } else if (join.error?.code === 'RATE_LIMITED') {
        setTimeout(() => void doJoin(), 2500);
      } else {
        setFatal(join.error?.message ?? '加入房间失败');
        setStatus('fatal');
      }
    };

    socket.on('connect', () => {
      setConn('online');
      // 每次连接（含重连）都恢复会话
      void doJoin();
    });
    socket.on('disconnect', () => {
      setConn('reconnecting');
    });
    socket.on('connect_error', () => {
      setConn('reconnecting');
    });
    socket.on('room:state', (p: { state: RoomState; reason: string }) => {
      setState(p.state);
      if (p.reason === 'restart') setChat([]);
    });
    socket.on('chat:message', (m: ChatMessage) => {
      setChat((c) => [...c.slice(-99), m]);
    });
    socket.on('chat:history', (p: { messages: ChatMessage[] }) => {
      // 加入/重连时一次性恢复历史（之后的新消息继续增量追加）
      setChat(p.messages.slice(-99));
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [roomId]);

  const showError = useCallback(
    (e: AppError | undefined, fallback: string) => {
      toast(e?.message ?? fallback, 'error');
    },
    [toast],
  );

  const actions = useMemo<RoomActions>(
    () => ({
      async move(input) {
        const socket = socketRef.current;
        const current = stateRef.current;
        if (!socket || !current) return;
        const requestId = crypto.randomUUID();
        const ack = await emitWithAck<MoveAck>(socket, 'game:move', {
          requestId,
          revision: current.revision,
          from: input.from,
          to: input.to,
          promotion: input.promotion,
          path: input.path,
        });
        if (ack.ok) {
          if (ack.state) setState(ack.state);
        } else {
          if (ack.state) setState(ack.state); // STALE_REVISION 自愈：同步最新局面
          showError(ack.error, '走棋失败');
        }
      },
      async resign() {
        const socket = socketRef.current;
        if (!socket) return;
        const ack = await emitWithAck<AckBase>(socket, 'game:resign', {});
        if (!ack.ok) showError(ack.error, '操作失败');
        else if (ack.state) setState(ack.state);
      },
      async drawOffer() {
        const socket = socketRef.current;
        if (!socket) return;
        const ack = await emitWithAck<AckBase>(socket, 'game:draw:offer', {});
        if (!ack.ok) showError(ack.error, '操作失败');
        else {
          if (ack.state) setState(ack.state);
          toast('已发送和棋请求', 'info');
        }
      },
      async drawRespond(accept: boolean) {
        const socket = socketRef.current;
        if (!socket) return;
        const ack = await emitWithAck<AckBase>(socket, 'game:draw:respond', { accept });
        if (!ack.ok) showError(ack.error, '操作失败');
        else if (ack.state) setState(ack.state);
      },
      async undoOffer() {
        const socket = socketRef.current;
        if (!socket) return;
        const ack = await emitWithAck<AckBase>(socket, 'game:undo:offer', {});
        if (!ack.ok) showError(ack.error, '操作失败');
        else {
          if (ack.state) setState(ack.state);
          toast('已发送悔棋请求', 'info');
        }
      },
      async undoRespond(accept: boolean) {
        const socket = socketRef.current;
        if (!socket) return;
        const ack = await emitWithAck<AckBase>(socket, 'game:undo:respond', { accept });
        if (!ack.ok) showError(ack.error, '操作失败');
        else if (ack.state) setState(ack.state);
      },
      async restartOffer() {
        const socket = socketRef.current;
        if (!socket) return;
        const ack = await emitWithAck<AckBase>(socket, 'game:restart:offer', {});
        if (!ack.ok) showError(ack.error, '操作失败');
        else {
          if (ack.state) setState(ack.state);
          toast('已发送重开请求', 'info');
        }
      },
      async restartRespond(accept: boolean) {
        const socket = socketRef.current;
        if (!socket) return;
        const ack = await emitWithAck<AckBase>(socket, 'game:restart:respond', { accept });
        if (!ack.ok) showError(ack.error, '操作失败');
        else if (ack.state) setState(ack.state);
      },
      async chat(text: string) {
        const socket = socketRef.current;
        if (!socket) return;
        const ack = await emitWithAck<AckBase>(socket, 'chat:send', { text });
        if (!ack.ok) showError(ack.error, '发送失败');
      },
      async leave() {
        const socket = socketRef.current;
        if (!socket) return;
        if (roomId) window.localStorage.removeItem(tokenKey(roomId));
        await emitWithAck<AckBase>(socket, 'room:leave', {});
        socket.disconnect();
      },
    }),
    [showError, toast, roomId],
  );

  return { conn, status, fatal, seat, state, chat, toasts, dismissToast, toast, actions };
}

/** 创建房间（首页使用）：独立短连接；seatCount 仅跳棋多人生效 */
export async function createRoomViaSocket(kind: GameKind, name?: string, seatCount?: number): Promise<CreateAck> {
  const socket = io({ transports: ['websocket', 'polling'] });
  try {
    const ack = await emitWithAck<CreateAck>(socket, 'room:create', { kind, name, seatCount });
    if (ack.ok && ack.roomId && ack.token) {
      storeToken(ack.roomId, ack.token);
    }
    return ack;
  } finally {
    socket.disconnect();
  }
}
