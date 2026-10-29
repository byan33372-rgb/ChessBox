/** 遮挡降频验证：窗口被另一窗口覆盖时，前台页面的 rAF 是否仍跟随 vsync。 */
import { chromium } from '@playwright/test';

const BASE = 'http://127.0.0.1:3001';
const browser = await chromium.launch({
  channel: 'chrome',
  headless: false,
  args: [
    '--disable-backgrounding-occluded-windows',
    '--disable-renderer-backgrounding',
    '--disable-background-timer-throttling',
    '--disable-features=CalculateNativeWinOcclusion',
  ],
});
const c1 = await browser.newContext({ viewport: { width: 1280, height: 800 } });
const p1 = await c1.newPage();
await p1.goto(BASE + '/');
await p1.locator('.practice-board[data-kind=xiangqi]').waitFor({ timeout: 20000 });
await p1.bringToFront();
// 第二个窗口覆盖第一个
const c2 = await browser.newContext({ viewport: { width: 1280, height: 800 } });
const p2 = await c2.newPage();
await p2.goto(BASE + '/r/aaaaaaaaaa');
await p2.bringToFront();
await p2.waitForTimeout(300);
// 采样被覆盖窗口的 rAF
const ts = await p1.evaluate(() => new Promise((resolve) => {
  const a = [];
  const tick = (t) => { a.push(t); if (a.length >= 400) resolve(a); else requestAnimationFrame(tick); };
  requestAnimationFrame(tick);
  setTimeout(() => { window.__done = true; resolve(a); }, 3000);
}));
const deltas = [];
for (let i = 1; i < ts.length; i++) deltas.push(ts[i] - ts[i - 1]);
const span = ts[ts.length - 1] - ts[0];
const sorted = [...deltas].sort((x, y) => x - y);
console.log('occluded-window rAF:', JSON.stringify({ n: deltas.length, fps: +(1000 * deltas.length / span).toFixed(1), median: +sorted[Math.floor(sorted.length / 2)].toFixed(2), p95: +sorted[Math.floor(sorted.length * 0.95)].toFixed(2), max: +sorted[sorted.length - 1].toFixed(1) }));
await browser.close();