/**
 * 移动端真实浏览器仿真（阶段十一）：3 种手机视口 + CPU 4x 降速 + 触摸点击。
 * 记录：首页/对局加载、横向溢出、点击→本机可见（乐观 UI）、ack、长任务、rAF 帧间隔。
 *
 * 用法：node scripts/mobile-latency.mjs --url http://127.0.0.1:3001
 * 说明：Playwright 设备仿真不等同真机；结果按「仿真」标注。
 */
import { chromium, devices } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, cur, i, arr) => {
    if (cur.startsWith('--')) acc.push([cur.slice(2), arr[i + 1] && !arr[i + 1].startsWith('--') ? arr[i + 1] : 'true']);
    return acc;
  }, []),
);
const BASE = (args.url || 'http://127.0.0.1:3001').replace(/\/$/, '');
const OUT = args.out || 'docs/latency/raw/mobile.json';
const MOVES = Number(args.moves || 6);
const CPU = Number(args.cpu || 4);
const DEVICES = [
  ['iPhone SE', devices['iPhone SE']],
  ['Pixel 7', devices['Pixel 7']],
  ['iPhone 13', devices['iPhone 13']],
];
const A_PTS = ['a1', 'b3', 'c5', 'd7', 'e9', 'f11'];
const B_PTS = ['a8', 'b10', 'c12', 'd14', 'e1', 'f3'];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function pctl(v, p) {
  const s = [...v].sort((a, b) => a - b);
  return s.length ? Math.round(s[Math.min(s.length - 1, Math.ceil((p / 100) * s.length) - 1)] * 100) / 100 : null;
}

async function arm(page) {
  await page.evaluate(() => {
    const w = window;
    w.__m = { clickAt: null, firstStoneAt: null, prev: document.querySelectorAll('.gk-stone').length };
    w.__long = [];
    w.__lt?.disconnect();
    try {
      w.__lt = new PerformanceObserver((list) => {
        for (const e of list.getEntries()) w.__long.push(Math.round(e.duration * 10) / 10);
      });
      w.__lt.observe({ entryTypes: ['longtask'] });
    } catch {}
    w.__obs?.disconnect();
    const svg = document.querySelector('.gk-board svg');
    if (!svg) return;
    w.__obs = new MutationObserver(() => {
      const n = document.querySelectorAll('.gk-stone').length;
      if (w.__m.firstStoneAt == null && n > w.__m.prev) w.__m.firstStoneAt = performance.timeOrigin + performance.now();
    });
    w.__obs.observe(svg, { childList: true, subtree: true });
    document.addEventListener('pointerdown', () => {
      if (w.__m.clickAt == null) w.__m.clickAt = performance.timeOrigin + performance.now();
    }, { capture: true, once: true });
  });
}

async function measureDevice(browser, name, descriptor) {
  const ctxA = await browser.newContext({ ...descriptor, locale: 'zh-CN' });
  const ctxB = await browser.newContext({ ...descriptor, locale: 'zh-CN' });
  const A = await ctxA.newPage();
  const B = await ctxB.newPage();
  const longTasks = [];
  for (const p of [A, B]) {
    p.on('console', (m) => { if (m.type() === 'error') console.error(`[${name}]`, m.text()); });
  }
  const cdp = await ctxA.newCDPSession(A);
  if (CPU > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: CPU });

  const t0 = Date.now();
  await A.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
  await A.locator('.create-card.gomoku .gc-create-btn').waitFor({ timeout: 30000 });
  const homeReadyMs = Date.now() - t0;
  const home = await A.evaluate(() => ({
    scrollW: document.documentElement.scrollWidth,
    clientW: document.documentElement.clientWidth,
    dpr: devicePixelRatio,
    cards: document.querySelectorAll('.create-card').length,
    nav: performance.getEntriesByType('navigation')[0] ? {
      dcl: Math.round(performance.getEntriesByType('navigation')[0].domContentLoadedEventEnd),
      load: Math.round(performance.getEntriesByType('navigation')[0].loadEventEnd),
      transfer: Math.round(performance.getEntriesByType('resource').reduce((a, e) => a + (e.transferSize ?? 0), 0) / 1024),
    } : null,
  }));

  const t1 = Date.now();
  await A.locator('.create-card.gomoku .gc-create-btn').click();
  await A.waitForURL(/\/r\/[a-z2-9]{10}/, { timeout: 30000 });
  const roomId = A.url().split('/r/')[1];
  await A.locator('.conn-pill.ok').waitFor({ timeout: 30000 });
  await B.goto(`${BASE}/r/${roomId}`, { waitUntil: 'domcontentloaded' });
  await B.locator('.conn-pill.ok').waitFor({ timeout: 30000 });
  await sleep(600);
  const roomReadyMs = Date.now() - t1;
  const room = await A.evaluate(() => ({
    scrollW: document.documentElement.scrollWidth,
    clientW: document.documentElement.clientWidth,
    boardW: document.querySelector('.gk-board')?.getBoundingClientRect().width ?? null,
  }));

  const moverMs = [];
  const ackMs = [];
  for (let i = 0; i < MOVES; i++) {
    const mover = i % 2 === 0 ? A : B;
    const peer = i % 2 === 0 ? B : A;
    const pt = i % 2 === 0 ? A_PTS[Math.floor(i / 2)] : B_PTS[Math.floor(i / 2)];
    await arm(mover);
    const prevReq = await mover.evaluate(() => window.__dcLatency?.lastMove?.requestId ?? null);
    await mover.locator(`.gk-board [data-pt="${pt}"]`).tap({ force: true });
    await mover.waitForFunction(
      (prev) => {
        const l = window.__dcLatency?.lastMove;
        return l && l.requestId !== prev && l.ackAt != null;
      },
      prevReq,
      { timeout: 30000 },
    );
    const m = await mover.evaluate(() => {
      const w = window;
      return {
        clickAt: w.__m.clickAt,
        firstStoneAt: w.__m.firstStoneAt,
        ackMs: w.__dcLatency?.lastMove?.ackMs ?? null,
        long: w.__long ?? [],
      };
    });
    if (m.clickAt != null && m.firstStoneAt != null) moverMs.push(m.firstStoneAt - m.clickAt);
    if (m.ackMs != null) ackMs.push(m.ackMs);
    longTasks.push(...m.long);
    await peer
      .waitForFunction((n) => document.querySelectorAll('.gk-stone').length >= n, i + 1, { timeout: 15000 })
      .catch(() => {});
    await sleep(120);
  }

  const frames = await A.evaluate(
    () =>
      new Promise((resolve) => {
        const arr = [];
        let last = performance.now();
        const t = performance.now();
        const tick = (now) => {
          arr.push(now - last);
          last = now;
          if (now - t < 1000) requestAnimationFrame(tick);
          else resolve(arr.slice(1));
        };
        requestAnimationFrame(tick);
      }),
  );
  const fps = frames.length ? Math.round(1000 / (frames.reduce((a, b) => a + b, 0) / frames.length)) : null;

  await ctxA.close();
  await ctxB.close();
  return {
    device: name,
    viewport: descriptor.viewport,
    dpr: descriptor.deviceScaleFactor,
    cpuThrottle: CPU,
    homeReadyMs,
    roomReadyMs,
    home,
    room,
    moverVisibleMs: { n: moverMs.length, p50: pctl(moverMs, 50), p95: pctl(moverMs, 95), max: moverMs.length ? Math.max(...moverMs) : null },
    ackMs: { n: ackMs.length, p50: pctl(ackMs, 50), p95: pctl(ackMs, 95) },
    longTasks: { count: longTasks.length, max: longTasks.length ? Math.max(...longTasks) : null, list: longTasks.slice(0, 10) },
    fps: { fps, frames: frames.length, over33: frames.filter((x) => x > 33.4).length },
    overflowX: home.scrollW > home.clientW || room.scrollW > room.clientW,
  };
}

async function main() {
  const browser = await chromium.launch({
    channel: 'chrome',
    headless: true,
    args: ['--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'],
  });
  const results = [];
  for (const [name, desc] of DEVICES) {
    try {
      const r = await measureDevice(browser, name, desc);
      results.push(r);
      console.log(`[${name}] load=${r.homeReadyMs}ms room=${r.roomReadyMs}ms moverP95=${r.moverVisibleMs.p95} ackP50=${r.ackMs.p50} fps=${r.fps.fps} long=${r.longTasks.count} overflow=${r.overflowX}`);
    } catch (e) {
      results.push({ device: name, error: e.message });
      console.log(`[${name}] FAILED: ${e.message}`);
    }
  }
  const out = { url: BASE, moves: MOVES, cpuThrottle: CPU, results, ranAt: new Date().toISOString() };
  mkdirSync(OUT.replace(/[\\/][^\\/]+$/, ''), { recursive: true });
  writeFileSync(OUT, JSON.stringify(out, null, 2));
  await browser.close();
  console.log('saved', OUT);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
