/** 隔离复现：练习板 8 手 + 可见性/焦点/rAF 状态。 */
import { chromium } from '@playwright/test';

const BASE = 'http://127.0.0.1:3001';
const browser = await chromium.launch({
  channel: 'chrome',
  headless: false,
  args: ['--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding', '--disable-background-timer-throttling', '--disable-features=CalculateNativeWinOcclusion'],
});
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
const p = await ctx.newPage();
await p.goto(BASE + '/');
await p.locator('.practice-board[data-kind=xiangqi]').waitFor({ timeout: 20000 });
await p.bringToFront();
console.log('state:', JSON.stringify(await p.evaluate(() => ({ vis: document.visibilityState, focus: document.hasFocus() }))));
const fps = await p.evaluate(() => new Promise((res) => { const a = []; const tick = (t) => { a.push(t); if (a.length >= 120) res(a); else requestAnimationFrame(tick); }; requestAnimationFrame(tick); }));
const d = []; for (let i = 1; i < fps.length; i++) d.push(fps[i] - fps[i - 1]);
console.log('idle rAF fps:', +(1000 * d.length / (fps[fps.length - 1] - fps[0])).toFixed(1), 'max gap:', +Math.max(...d).toFixed(1));
const ROOT = '.practice-board[data-kind=xiangqi]';
const SEL = (sq) => `${ROOT} button[aria-label^="${sq} "], ${ROOT} button[aria-label="${sq}"]`;
await p.evaluate(() => {
  window.__sd = [];
  document.addEventListener('transitionend', (e) => { if (e.propertyName === 'transform' && e.target.closest && e.target.closest('.xq-anim-fly')) window.__sd.push(performance.now()); }, true);
});
const moves = [['h7', 'e7'], ['h2', 'e2'], ['e7', 'h7'], ['e2', 'h2']];
for (let i = 0; i < 2; i++) {
  for (const [f, t] of moves) {
    const s = Date.now();
    await p.evaluate((sel) => document.querySelector(sel)?.click(), SEL(f));
    await p.evaluate((sel) => document.querySelector(sel)?.click(), SEL(t));
    const ok = await p.waitForFunction(() => document.querySelectorAll('.xq-anim-fly').length > 0, null, { timeout: 3000, polling: 15 }).then(() => true).catch(() => false);
    const gone = await p.waitForFunction(() => document.querySelectorAll('.xq-anim-fly').length === 0, null, { timeout: 3000, polling: 15 }).then(() => true).catch(() => false);
    console.log(`ply ${f}->${t}: fly=${ok} gone=${gone} dt=${Date.now() - s}ms settleEvents=${await p.evaluate(() => window.__sd.length)}`);
  }
}
console.log('state end:', JSON.stringify(await p.evaluate(() => ({ vis: document.visibilityState, focus: document.hasFocus() }))));
await browser.close();