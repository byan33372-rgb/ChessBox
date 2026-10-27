/** 集成测试公共工具：临时服务器 + 客户端连接 + ack 发射 */
import { existsSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { io as ioClient, type Socket as ClientSocket } from 'socket.io-client';
import { createHttpApp } from '../../src/server/http';
import { RoomManager } from '../../src/server/rooms';
import { setupSocket } from '../../src/server/socket';
import { Store } from '../../src/server/store';
import type { AckBase, CreateAck, JoinAck, RoomState } from '../../src/shared/protocol';

export interface TestServer {
  httpServer: ReturnType<typeof createServer>;
  io: Server;
  rooms: RoomManager;
  store: Store;
  url: string;
}

export async function startServer(dbPath?: string): Promise<TestServer> {
  // 路径必须跨进程唯一：pid + 时间戳 + 随机后缀（多 worker 下同名会触发 database is locked）
  const unique = dbPath ?? join(tmpdir(), `dual-chess-tt-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.db`);
  const store = new Store(unique);
  const rooms = new RoomManager(store);
  rooms.loadPersisted();
  // 优先使用真实生产构建产物，让静态/SPA/安全头行为可被测试
  const distDir = join(process.cwd(), 'dist-client');
  const app = createHttpApp(existsSync(distDir) ? distDir : join(tmpdir(), 'dual-chess-no-dist'));
  const httpServer = createServer(app);
  const io = new Server(httpServer, { cors: { origin: false } });
  setupSocket(io, rooms);
  await new Promise<void>((resolve) => httpServer.listen(0, '127.0.0.1', resolve));
  const addr = httpServer.address();
  const port = typeof addr === 'object' && addr ? addr.port : 0;
  return { httpServer, io, rooms, store, url: `http://127.0.0.1:${port}` };
}

export function stopServer(s: TestServer): Promise<void> {
  return new Promise((resolve) => {
    s.io.close(() => {
      s.httpServer.close(() => {
        s.store.close();
        resolve();
      });
    });
    setTimeout(() => resolve(), 2000).unref?.();
  });
}

export function connect(url: string): ClientSocket {
  return ioClient(url, { transports: ['websocket'], forceNew: true });
}

export function emitAck<T>(socket: ClientSocket, event: string, payload: unknown): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`ack 超时: ${event}`)), 5000);
    socket.emit(event as never, payload as never, ((r: T) => {
      clearTimeout(timer);
      resolve(r);
    }) as never);
  });
}

export function collect(socket: ClientSocket): RoomState[] {
  const out: RoomState[] = [];
  socket.on('room:state', (p) => out.push(p.state));
  return out;
}

export function waitFor(cond: () => boolean, timeout = 5000): Promise<void> {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const tick = () => {
      if (cond()) return resolve();
      if (Date.now() - start > timeout) return reject(new Error('waitFor 条件超时'));
      setTimeout(tick, 20);
    };
    tick();
  });
}

export async function makeRoom(
  s: TestServer,
  kind: 'xiangqi' | 'chess',
): Promise<{ roomId: string; token: string; state: RoomState; playerA: ClientSocket }> {
  const playerA = connect(s.url);
  const ack = await emitAck<CreateAck>(playerA, 'room:create', { kind, name: '甲方' });
  if (!ack.ok) throw new Error(`建房失败: ${JSON.stringify(ack.error)}`);
  return { roomId: ack.roomId!, token: ack.token!, state: ack.state!, playerA };
}

export async function joinAs(s: TestServer, roomId: string, name: string): Promise<{ ack: JoinAck; socket: ClientSocket }> {
  const socket = connect(s.url);
  const ack = await emitAck<JoinAck>(socket, 'room:join', { roomId, name });
  return { ack, socket };
}

export type { AckBase };
