/**
 * 服务入口。
 * 环境变量：
 *   PORT     监听端口（默认 3001）
 *   HOST     监听地址（默认 127.0.0.1；局域网联机可设 0.0.0.0）
 *   DB_PATH  SQLite 路径（默认 data/app.db）
 */

import { createServer } from 'http';
import { appendFileSync, existsSync, mkdirSync } from 'fs';
import { join, resolve } from 'path';
import { Server } from 'socket.io';
import type { ClientToServerEvents, ServerToClientEvents } from '../shared/protocol';
import { createHttpApp } from './http';
import { RoomManager } from './rooms';
import { Store } from './store';
import { setupSocket, type AppServer } from './socket';

/** 崩溃留痕：进程级异常写入 logs/server-error.log（Node 24 默认会静默退出，无此则死因不可查） */
function logCrash(kind: string, err: unknown): void {
  const msg = `[${new Date().toISOString()}] ${kind}: ${err instanceof Error ? (err.stack ?? err.message) : String(err)}\n`;
  try {
    mkdirSync(join(process.cwd(), 'logs'), { recursive: true });
    appendFileSync(join(process.cwd(), 'logs', 'server-error.log'), msg, 'utf8');
  } catch {
    // 日志写失败不掩盖原始错误
  }
  console.error(msg);
}

process.on('uncaughtException', (err) => {
  logCrash('uncaughtException', err);
  process.exit(1);
});
process.on('unhandledRejection', (reason) => {
  logCrash('unhandledRejection', reason);
  process.exit(1);
});

function main(): void {
  const port = Number(process.env.PORT ?? 3001);
  const host = process.env.HOST ?? '127.0.0.1';
  const dbPath = resolve(process.env.DB_PATH ?? join(process.cwd(), 'data', 'app.db'));
  const distDir = resolve(process.cwd(), 'dist-client');

  mkdirSync(join(dbPath, '..'), { recursive: true });
  const store = new Store(dbPath);
  const rooms = new RoomManager(store);

  const restored = rooms.loadPersisted();
  if (restored > 0) {
    console.log(`[boot] 从数据库恢复 ${restored} 个房间（玩家可凭原会话令牌重连）`);
  }
  if (!existsSync(distDir)) {
    console.warn('[boot] 提示：dist-client 不存在，请先 npm run build（开发模式请用 npm run dev）');
  }

  const app = createHttpApp(distDir);
  const httpServer = createServer(app);
  const io: AppServer = new Server<ClientToServerEvents, ServerToClientEvents>(httpServer, {
    // 同源访问；跨站 Origin 由连接中间件拒绝
    cors: { origin: false, credentials: false },
    maxHttpBufferSize: 64 * 1024, // 事件负载上限 64KB
    pingInterval: 20000,
    pingTimeout: 25000,
  });

  setupSocket(io, rooms);

  // 定期清理过期房间与限流桶
  const cleanupTimer = setInterval(() => {
    try {
      rooms.cleanupStale();
    } catch (e) {
      console.error('[cleanup] 清理失败:', (e as Error).message);
    }
  }, 10 * 60 * 1000);
  cleanupTimer.unref?.();

  httpServer.listen(port, host, () => {
    console.log(`[boot] 服务已启动: http://${host}:${port}`);
    console.log(`[boot] 数据库: ${dbPath}`);
    console.log('[boot] 默认仅监听本机；公网访问请运行 npm run tunnel（cloudflared Quick Tunnel）');
  });

  const shutdown = (signal: string) => {
    console.log(`\n[exit] 收到 ${signal}，正在关闭…`);
    cleanupTimer.unref?.();
    io.close(() => {
      store.close();
      httpServer.close(() => {
        process.exit(0);
      });
    });
    // 兜底：3 秒后强制退出
    setTimeout(() => process.exit(0), 3000).unref?.();
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

main();
