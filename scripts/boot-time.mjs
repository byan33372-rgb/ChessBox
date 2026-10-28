/** R11 PERF：生产服务冷启动时间（spawn→/healthz 200）。
 *  前置：scripts/stop-server.ps1 已停掉旧服务（否则 EADDRINUSE）。
 *  stdio 直接挂文件句柄（fs.openSync）——不依赖父进程存活，父退出不会造成 EPIPE 崩溃
 *  （NET-029 事故根因即：console.log 向被回收的父 shell 管道写入抛 EPIPE）。 */
import { spawn } from 'child_process';
import { mkdirSync, openSync, writeFileSync } from 'fs';
import { resolve } from 'path';

const root = resolve(process.cwd());
mkdirSync(resolve(root, 'logs'), { recursive: true });

const outFd = openSync(resolve(root, 'logs/server.log'), 'a');
const errFd = openSync(resolve(root, 'logs/server-err.log'), 'a');

const child = spawn(process.execPath, ['dist-server/server/index.js'], {
  cwd: root,
  detached: true,
  stdio: ['ignore', outFd, errFd],
});
child.unref();

const t0 = Date.now();
let ready = false;
while (Date.now() - t0 < 10000) {
  try {
    const r = await fetch('http://127.0.0.1:3001/healthz');
    if (r.ok) { ready = true; break; }
  } catch {}
  await new Promise((res) => setTimeout(res, 25));
}
const bootMs = Date.now() - t0;
writeFileSync(resolve(root, 'logs/server.pid'), String(child.pid), 'ascii');
console.log(ready ? `冷启动到 /healthz 200：${bootMs}ms（PID ${child.pid}）` : '启动超时未就绪');
process.exit(ready ? 0 : 1);
