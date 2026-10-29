/** 快速探针：国象练习循环（限定棋盘 root）是否每步生效 + 落位耗时。 */
import { chromium } from '@playwright/test';

const BASE = process.env.NET_BASE ?? 'http://127.0.0.1:3001';
const browser = await chromium.launch({
  channel: 'chrome',
  headless: false,
  args: ['--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding', '--disable-background-timer-throttling'],
});
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
const p = await ctx.newPage();
await p.goto(BASE + '/');
await p.locator('.practice-board[data-kind=chess]').waitFor({ timeout: 20000 });
await p.bringToFront();
const ROOT = '.practice-board[data-kind=chess]';
const SEL = (sq) => `${ROOT} button[aria-label^="${sq} "], ${ROOT} button[aria-label="${sq}"]`;
const click = (sq) => p.evaluate((sel) => document.querySelector(sel)?.click(), SEL(sq));
await p.evaluate(() => {
  window.__sd = [];
  document.addEventListener('transitionend', (e) => {
    if (e.propertyName === 'transform' && e.target.closest && e.target.closest('.chess-anim-fly')) window.__sd.push(performance.now());
  }, true);
});
const cycle = [['g1', 'f3', 'f3 白马'], ['b8', 'c6', 'c6 黑马'], ['f3', 'g1', 'g1 白马'], ['c6', 'b8', 'b8 黑马']];
const t0 = Date.now();
for (let i = 0; i < 3; i++) {
  for (const [f, t, expect] of cycle) {
    const s = Date.now();
    await click(f);
    await click(t);
    const ok = await p.waitForFunction((root, lbl) => !!document.querySelector(`${root} button[aria-label="${lbl}"]`), [ROOT, expect], { timeout: 3000, polling: 20 }).then(() => true).catch(() => false);
    console.log(`ply: ${f}->${t} ok=${ok} dt=${Date.now() - s}ms`);
  }
}
console.log(`total=${Date.now() - t0}ms settleEvents=${await p.evaluate(() => window.__sd.length)}`);
await browser.close();