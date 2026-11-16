/**
 * 弱网模拟：TCP 延迟/抖动代理（阶段八 TEST-006/007/008）。
 * 每个方向对每个数据块施加固定延迟 + 随机抖动，保持块顺序；不修改内容。
 *
 * 用法：
 *   node scripts/latency-proxy.mjs --listen 3200 --target 3001 --delay 150 --jitter 30
 * 说明：这是「高 RTT + 抖动」近似，不等同于真实丢包；真实丢包会触发 TCP 重传，
 * 本代理无法在不破坏 TCP 的前提下模拟丢包（诚实标注）。
 */
import net from 'node:net';

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, cur, i, arr) => {
    if (cur.startsWith('--')) acc.push([cur.slice(2), arr[i + 1] && !arr[i + 1].startsWith('--') ? arr[i + 1] : 'true']);
    return acc;
  }, []),
);
const LISTEN = Number(args.listen || 3200);
const TARGET = Number(args.target || 3001);
const DELAY = Number(args.delay || 150);
const JITTER = Number(args.jitter || 0);

const server = net.createServer((client) => {
  const upstream = net.connect(TARGET, '127.0.0.1');
  const pipe = (from, to) => {
    let last = 0;
    from.on('data', (buf) => {
      const d = DELAY + Math.random() * JITTER;
      const at = Math.max(performance.now() + d, last + 0.5);
      last = at;
      const wait = Math.max(0, at - performance.now());
      setTimeout(() => {
        if (!to.destroyed) to.write(buf);
      }, wait);
    });
  };
  pipe(client, upstream);
  pipe(upstream, client);
  client.on('error', () => upstream.destroy());
  upstream.on('error', () => client.destroy());
  client.on('close', () => upstream.destroy());
  upstream.on('close', () => client.destroy());
});

server.listen(LISTEN, '127.0.0.1', () => {
  console.log(`[proxy] ${LISTEN} -> ${TARGET} delay=${DELAY}ms jitter=${JITTER}ms`);
});
