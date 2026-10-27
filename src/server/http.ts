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
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
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
    // SPA 路由回退（/r/:roomId 等）。
    // 仅对"无扩展名的页面路径"回退 index.html；带扩展名或点开头的路径
    // （如 /package.json、/.env、/app.db）一律交给 404，避免敏感探测拿到 200。
    // 另维护已知敏感目录的显式拒绝清单（目录名无扩展名，否则会落入 SPA 回退）。
    const SENSITIVE_PREFIXES = [
      '/node_modules',
      '/data',
      '/src',
      '/tests',
      '/tools',
      '/docs',
      '/scripts',
      '/dist-server',
      '/.git',
    ];
    app.use((req: Request, res: Response, next: NextFunction) => {
      if (req.method !== 'GET' && req.method !== 'HEAD') return next();
      if (req.path.startsWith('/socket.io/') || req.path.startsWith('/healthz') || req.path.startsWith('/api/')) {
        return next();
      }
      if (SENSITIVE_PREFIXES.some((p) => req.path === p || req.path.startsWith(`${p}/`))) {
        return next();
      }
      const last = req.path.split('/').pop() ?? '';
      const hasExtension = last.includes('.') || req.path.includes('/.');
      if (hasExtension) return next();
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
