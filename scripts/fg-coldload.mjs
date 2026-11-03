/** LIGHT-016：首页冷加载资源请求数/传输量/时间（缓存禁用，3 次取样） */
import { chromium } from 'playwright';
const b = await chromium.launch({ channel: 'chrome' });
const runs = [];
for (let i = 0; i < 3; i++) {
  const ctx = await b.newContext({ bypassCSP: false, viewport: { width: 1280, height: 800 } });
  await ctx.route('**/*', (route) => route.continue({ headers: { ...route.request().headers(), 'Cache-Control': 'no-cache' } }));
  const p = await ctx.newPage();
  const requests = [];
  p.on('response', (r) => requests.push({ url: r.url(), size: r.headers()['content-length'] ?? null }));
  const t0 = Date.now();
  await p.goto('http://127.0.0.1:3500/', { waitUntil: 'networkidle' });
  const loadMs = Date.now() - t0;
  const jsKb = await p.evaluate(() =>
    performance.getEntriesByType('resource').filter((e) => e.name.endsWith('.js')).reduce((a, e) => a + e.transferSize, 0) / 1024
  );
  const cssKb = await p.evaluate(() =>
    performance.getEntriesByType('resource').filter((e) => e.name.endsWith('.css')).reduce((a, e) => a + e.transferSize, 0) / 1024
  );
  const totalReq = requests.length;
  runs.push({ run: i + 1, loadMs, requests: totalReq, jsTransferKb: Math.round(jsKb * 10) / 10, cssTransferKb: Math.round(cssKb * 10) / 10 });
  await ctx.close();
}
console.log(JSON.stringify(runs));
await b.close();
process.exit(0);
