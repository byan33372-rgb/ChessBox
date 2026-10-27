/**
 * HTTP 服务：静态托管前端构建产物 + 健康检查。
 * 不暴露文件系统、原始查询、调试接口；生产模式前后端同端口，隧道只需暴露一个端口。
 */

import { existsSync } from 'fs';
import { join } from 'path';
import express, { type Request, type Response, type NextFunction } from 'express';

export function createHttpApp(distDir: string): express.Express {
  const app = express();
  app.disable('x-powered-by');

  // 安全响应头
  app.use((_req: Request, res: Response, next: NextFunction) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader(
      'Content-Security-Policy',
      "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self' ws: wss:; font-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'self'",
    );
    next();
  });

  app.get('/healthz', (_req, res) => {
    res.json({ ok: true, ts: Date.now() });
  });

  if (existsSync(distDir)) {
    app.use(
      express.static(distDir, {
        index: 'index.html',
        dotfiles: 'ignore',
        maxAge: '1h',
        setHeaders: (res, path) => {
          if (path.endsWith('index.html')) {
            res.setHeader('Cache-Control', 'no-cache');
          }
        },
      }),
    );
    // SPA 路由回退（/r/:roomId 等）
    app.use((req: Request, res: Response, next: NextFunction) => {
      if (req.method !== 'GET' && req.method !== 'HEAD') return next();
      if (req.path.startsWith('/socket.io/') || req.path.startsWith('/healthz') || req.path.startsWith('/api/')) {
        return next();
      }
      res.sendFile(join(distDir, 'index.html'));
    });
  } else {
    app.get('/', (_req, res) => {
      res.status(503).send('前端尚未构建：请先运行 npm run build');
    });
  }

  // 其余路径统一 404（JSON），不泄露服务器内部信息
  app.use((_req: Request, res: Response) => {
    res.status(404).json({ ok: false, error: 'not found' });
  });

  return app;
}
