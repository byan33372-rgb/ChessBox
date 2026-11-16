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
  ServerTiming,
  SgClientView,
  UnoClientView,
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
  /** 房间内选择/更换阵营（等待阶段） */
  takeSeat(seat: Side): Promise<void>;
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

export interface MoveTrace {
  requestId: string;
  sentAt: number;
  ackAt: number | null;
  ackMs: number | null;
  serverTiming: ServerTiming | null;
  revision: number | null;
  ok: boolean | null;
  errorCode: string | null;
}

/** 延迟诊断数据（仅开发者面板使用；不含令牌/内容） */
export interface LatencyStats {
  transport: string | null;
  rttMs: number | null;
  rttSamples: number;
  lastMove: MoveTrace | null;
  lastStateAt: number | null;
  renderMs: number | null;
  reconnects: number;
  timeouts: number;
  stateVersion: number | null;
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
  /** 三国杀个性化视图（仅 sanguosha 房间） */
  sgView: SgClientView | null;
  /** 三国杀命令（服务端权威校验） */
  sgCommand(action: Record<string, unknown>): Promise<void>;
  /** UNO 个性化视图（仅 uno 房间） */
  unoView: UnoClientView | null;
  /** UNO 命令（服务端权威校验） */
  unoCommand(action: Record<string, unknown>): Promise<void>;
  /** 延迟诊断（阶段二）：开发者面板读取；正常玩家不可见 */
  latency: LatencyStats;
  /** 棋盘提交后回填渲染耗时（下一次绘制），供面板显示 */
  reportRender(ms: number): void;
}

export function useRoom(roomId: string | null): RoomSession {
  const socketRef = useRef<Socket | null>(null);
  const [conn, setConn] = useState<ConnState>('connecting');
  const [status, setStatus] = useState<'joining' | 'ready' | 'fatal'>('joining');
  const [fatal, setFatal] = useState<string | null>(null);
  const [seat, setSeat] = useState<Side | 'spectator' | null>(null);
  const [state, setState] = useState<RoomState | null>(null);
  const [chat, setChat] = useState<ChatMessage[]>([]);
  const [sgView, setSgView] = useState<SgClientView | null>(null);
  const sgViewRef = useRef<SgClientView | null>(null);
  const [unoView, setUnoView] = useState<UnoClientView | null>(null);
  const unoViewRef = useRef<UnoClientView | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const toastId = useRef(1);
  const [latency, setLatency] = useState<LatencyStats>({
    transport: null,
    rttMs: null,
    rttSamples: 0,
    lastMove: null,
    lastStateAt: null,
    renderMs: null,
    reconnects: 0,
    timeouts: 0,
    stateVersion: null,
  });
  const rttRef = useRef<number[]>([]);
  const lastStateAtRef = useRef<number | null>(null);
  const moveSentRef = useRef<Map<string, number>>(new Map());

  // 诊断钩子：供 e2e/延迟脚本读取（仅耗时与 requestId，无令牌/内容）
  useEffect(() => {
    (window as unknown as { __dcLatency?: LatencyStats }).__dcLatency = latency;
  }, [latency]);

  const reportRender = useCallback((ms: number) => {
    setLatency((l) => ({ ...l, renderMs: Math.round(ms * 100) / 100 }));
  }, []);

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
    // 传输看门狗（NET-002/SOCKET-003）：轮询兜底可用但延迟高；
    // 若因握手失败降级为 polling，有限次强制重连以重新尝试 WebSocket 升级。
    let pollFixTries = 0;
    const pollTimer = setInterval(() => {
      if (!socket.connected) return;
      if (socket.io.engine.transport.name === 'polling' && pollFixTries < 2) {
        pollFixTries++;
        console.warn('[latency] 当前为 polling，尝试重连以升级 WebSocket');
        socket.disconnect();
        socket.connect();
      }
    }, 12000);

    const pingTimer = setInterval(() => {
      if (!socket.connected) return;
      const t = performance.now();
      socket.emit('latency:ping', {}, (r: { ok?: boolean } | undefined) => {
        if (!r?.ok) return;
        const rtt = performance.now() - t;
        const arr = rttRef.current;
        arr.push(rtt);
        if (arr.length > 20) arr.shift();
        const sorted = [...arr].sort((a, b) => a - b);
        setLatency((l) => ({
          ...l,
          transport: socket.io.engine.transport.name,
          rttMs: Math.round(sorted[Math.floor(sorted.length / 2)] * 100) / 100,
          rttSamples: arr.length,
        }));
      });
    }, 3000);

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
      setLatency((l) => ({
        ...l,
        transport: socket.io.engine.transport.name,
        reconnects: l.reconnects + (l.stateVersion == null ? 0 : 1),
      }));
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
      lastStateAtRef.current = performance.now();
      // 旧版本/重复广播不覆盖新状态（SOCKET-012/013：WS 重连与多事件源下防回退）
      setState((prev) => (prev && p.state.revision < prev.revision ? prev : p.state));
      setLatency((l) => ({ ...l, lastStateAt: lastStateAtRef.current, stateVersion: p.state.revision }));
      // 双 rAF ≈ 下一次绘制；用于「事件到达→棋盘可见」客户端耗时
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          const at = lastStateAtRef.current;
          if (at != null) reportRender(performance.now() - at);
        });
      });
      if (p.reason === 'restart') setChat([]);
    });
    socket.on('chat:message', (m: ChatMessage) => {
      setChat((c) => [...c.slice(-99), m]);
    });
    socket.on('sg:state', (p: { view: SgClientView; reason: string }) => {
      // 个性化视图：取最新 revision（各 socket 同一计数器）
      if (!sgViewRef.current || p.view.revision >= sgViewRef.current.revision) {
        sgViewRef.current = p.view;
        setSgView(p.view);
      }
    });
    socket.on('uno:state', (p: { view: UnoClientView }) => {
      if (!unoViewRef.current || p.view.revision >= unoViewRef.current.revision) {
        unoViewRef.current = p.view;
        setUnoView(p.view);
      }
    });
    socket.on('chat:history', (p: { messages: ChatMessage[] }) => {
      // 加入/重连时一次性恢复历史（之后的新消息继续增量追加）
      setChat(p.messages.slice(-99));
    });

    return () => {
      clearInterval(pingTimer);
      clearInterval(pollTimer);
      socket.disconnect();
      socketRef.current = null;
    };
  }, [roomId, reportRender]);

  const showError = useCallback(
    (e: AppError | undefined, fallback: string) => {
      toast(e?.message ?? fallback, 'error');
    },
    [toast],
  );

  const unoCommand = useCallback(
    async (action: Record<string, unknown>) => {
      const socket = socketRef.current;
      if (!socket) return;
      const commandId = crypto.randomUUID();
      const ack = await emitWithAck<{ ok: boolean; error?: AppError; revision?: number; view?: UnoClientView }>(
        socket,
        'uno:command',
        { commandId, expectedRevision: unoViewRef.current?.revision ?? null, action },
      );
      if (ack.view) {
        unoViewRef.current = ack.view;
        setUnoView(ack.view);
      }
      if (!ack.ok) showError(ack.error, '操作无效');
    },
    [showError],
  );

  const sgCommand = useCallback(
    async (action: Record<string, unknown>) => {
      const socket = socketRef.current;
      if (!socket) return;
      const commandId = crypto.randomUUID();
      const ack = await emitWithAck<{ ok: boolean; error?: AppError; revision?: number; view?: SgClientView }>(
        socket,
        'sg:command',
        { commandId, expectedRevision: sgViewRef.current?.revision ?? null, action },
      );
      if (ack.ok && ack.view) {
        sgViewRef.current = ack.view;
        setSgView(ack.view);
      } else if (!ack.ok) {
        showError(ack.error, '操作无效');
      }
    },
    [showError],
  );


  const actions = useMemo<RoomActions>(
    () => ({
      async move(input) {
        const socket = socketRef.current;
        const current = stateRef.current;
        if (!socket || !current) return;
        const requestId = crypto.randomUUID();
        const sentAt = performance.now();
        moveSentRef.current.set(requestId, sentAt);
        const ack = await emitWithAck<MoveAck>(socket, 'game:move', {
          requestId,
          revision: current.revision,
          from: input.from,
          to: input.to,
          promotion: input.promotion,
          path: input.path,
        });
        const ackAt = performance.now();
        const timing = ack.serverTiming ?? null;
        setLatency((l) => ({
          ...l,
          timeouts: l.timeouts + (ackAt - sentAt > 7000 ? 1 : 0),
          lastMove: {
            requestId,
            sentAt,
            ackAt,
            ackMs: Math.round((ackAt - sentAt) * 100) / 100,
            serverTiming: timing,
            revision: ack.revision ?? null,
            ok: ack.ok,
            errorCode: ack.error?.code ?? null,
          },
        }));
        if (ack.ok) {
          if (ack.state) setState((prev) => (prev && ack.state!.revision < prev.revision ? prev : ack.state!));
        } else {
          // STALE_REVISION 自愈：同步最新局面（版本不低于本地才应用）
          if (ack.state) setState((prev) => (prev && ack.state!.revision < prev.revision ? prev : ack.state!));
          showError(ack.error, '走棋失败');
        }
      },
      async takeSeat(nextSeat) {
        const socket = socketRef.current;
        if (!socket) return;
        const ack = await emitWithAck<AckBase>(socket, 'room:take-seat', { seat: nextSeat });
        if (!ack.ok) showError(ack.error, '选座失败');
        else {
          if (ack.state) setState(ack.state);
          if (ack.seat) setSeat(ack.seat);
          toast('已选择阵营', 'success');
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

  return { conn, status, fatal, seat, state, chat, toasts, dismissToast, toast, actions, sgView, sgCommand, unoView, unoCommand, latency, reportRender };
}

/** 创建房间（首页使用）：独立短连接；seatCount 仅跳棋多人生效 */
export async function createRoomViaSocket(kind: GameKind, name?: string, seatCount?: number, boardSize?: number, seat?: Side): Promise<CreateAck> {
  const socket = io({ transports: ['websocket', 'polling'] });
  try {
    const ack = await emitWithAck<CreateAck>(socket, 'room:create', { kind, name, seatCount, boardSize, seat });
    if (ack.ok && ack.roomId && ack.token) {
      storeToken(ack.roomId, ack.token);
    }
    return ack;
  } finally {
    socket.disconnect();
  }
}
