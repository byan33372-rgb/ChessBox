/**
 * 归因实验：批量动画采样中的长帧是否来自「重开试玩」的触发方式。
 * 同一 4 手循环、每 8 手重开，两种重开方式各 80 手：
 *   V1 页面内即时点击（evaluate click）
 *   V2 Playwright 定位点击（locator.click，带滚动/可操作性检查）
 * 逐窗口记录最大帧间隔，观察是否每 8 手出现一次长帧。
 * 用法: node scripts/probe-resetlong.mjs
 */
import { chromium } from '@playwright/test';
import { writeFileSync } from 'node:fs';

const BASE = process.env.NET_BASE ?? 'http://127.0.0.1:3001';
const browser = await chromium.launch({
  channel: 'chrome',
  headless: false,
  args: ['--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding', '--disable-background-timer-throttling'],
});
const ROOT = '.practice-board[data-kind=xiangqi]';
const SEL = (sq) => `${ROOT} button[aria-label^="${sq} "], ${ROOT} button[aria-label="${sq}"]`;
const moves = [['h7', 'e7'], ['h2', 'e2'], ['e7', 'h7'], ['e2', 'h2']];

async function variant(mode) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const p = await ctx.newPage();
  await p.goto(BASE + '/');
  await p.locator(ROOT).waitFor({ timeout: 20000 });
  await p.bringToFront();
  const windows = [];
  let plies = 0;
  for (let c = 0; c < 20; c++) {
    for (const [f, t] of moves) {
      await p.evaluate((max) => {
        const ts = [];
        let done = false;
        window.__done = new Promise((res) => {
          const tick = (x) => { if (done) return; ts.push(x); if (ts.length >= max) { done = true; res(ts); return; } requestAnimationFrame(tick); };
          requestAnimationFrame(tick);
          window.__end = () => { if (!done) { done = true; res(ts); } };
        });
      }, 6000);
      await p.evaluate((sel) => document.querySelector(sel)?.click(), SEL(f));
      await p.evaluate((sel) => document.querySelector(sel)?.click(), SEL(t));
      await p.waitForFunction(() => !!document.querySelector('.xq-anim-fly'), null, { timeout: 3000, polling: 15 }).catch(() => {});
      await p.waitForFunction(() => !document.querySelector('.xq-anim-fly'), null, { timeout: 3000, polling: 15 }).catch(() => {});
      await p.evaluate(() => window.__end());
      const ts = await p.evaluate(() => window.__done);
      let max = 0;
      for (let i = 1; i < ts.length; i++) max = Math.max(max, ts[i] - ts[i - 1]);
      plies++;
      windows.push({ ply: plies, max: +max.toFixed(1), afterReset: plies % 8 === 0, mode });
      if (plies % 8 === 0) {
        if (mode === 'eval') {
          await p.evaluate((sel) => document.querySelector(sel)?.click(), `${ROOT} .practice-reset`);
        } else {
          await p.locator(`${ROOT} .practice-reset`).click();
        }
        await p.waitForTimeout(120);
      }
    }
  }
  await ctx.close();
  const longWins = windows.filter((w) => w.max > 33.4);
  return {
    mode,
    plies,
    windows: windows.length,
    longWindows: longWins.length,
    longAtResetBoundary: longWins.filter((w) => w.afterReset).length,
    longMaxes: longWins.map((w) => ({ ply: w.ply, max: w.max })),
    medianMax: +[...windows].sort((a, b) => a.max - b.max)[Math.floor(windows.length / 2)].max.toFixed(1),
  };
}
const v1 = await variant('eval');
const v2 = await variant('locator');
console.log('V1 eval-click reset:', JSON.stringify(v1));
console.log('V2 locator-click reset:', JSON.stringify(v2));
writeFileSync('docs/acceptance/perf-reset-attribution.json', JSON.stringify({ v1, v2 }, null, 2));
await browser.close();