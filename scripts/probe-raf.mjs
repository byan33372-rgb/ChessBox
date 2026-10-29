/**
 * rAF 行为探针：弄清本环境 rAF 是否与显示器 vsync 同步。
 * 输出：间隔分布、重复时间戳检测、CDP screencast 出帧计数对照。
 * 用法: node scripts/probe-raf.mjs
 */
import { chromium } from '@playwright/test';

const BASE = 'http://127.0.0.1:3001';
const browser = await chromium.launch({
  channel: 'chrome',
  headless: false,
  args: ['--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding', '--disable-background-timer-throttling'],
});
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
const p = await ctx.newPage();
await p.goto(BASE + '/');
await p.locator('.practice-board[data-kind=xiangqi]').waitFor({ timeout: 15000 });

// 1. 纯 rAF 5 秒：间隔统计 + 重复时间戳检测
const raf = await p.evaluate(() => new Promise((resolve) => {
  const ts = [];
  let on = true;
  const tick = (t) => { ts.push(t); if (on && ts.length < 1200) requestAnimationFrame(tick); else resolve(ts); };
  requestAnimationFrame(tick);
  setTimeout(() => { on = false; }, 5200);
}));
const deltas = [];
const dups = raf.filter((t, i) => i > 0 && t === raf[i - 1]).length;
for (let i = 1; i < raf.length; i++) deltas.push(raf[i] - raf[i - 1]);
const hist = {};
for (const d of deltas) { const k = d < 1 ? '0' : d < 3 ? '1-3' : d < 6 ? '3-6' : d < 7 ? '6-7' : d < 9 ? '7-9' : d < 17 ? '9-17' : d < 34 ? '17-34' : '>34'; hist[k] = (hist[k] ?? 0) + 1; }
console.log(`rAF 5s: n=${raf.length} 重复时间戳=${dups} 间隔直方图=${JSON.stringify(hist)}`);
console.log(`rAF 首尾时间差: ${(raf[raf.length - 1] - raf[0]).toFixed(0)}ms → ${(1000 * (raf.length - 1) / (raf[raf.length - 1] - raf[0])).toFixed(1)} fps`);

// 2. CDP screencast：走一次动画，数合成器实际出的帧
const cdp = await ctx.newCDPSession(p);
const got = [];
cdp.on('Page.screencastFrame', (e) => { got.push({ t: Date.now(), ts: e.metadata.timestamp }); cdp.send('Page.screencastFrameAck', { sessionId: e.sessionId }).catch(() => {}); });
await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 40, everyNthFrame: 1 });
await p.waitForTimeout(800); // 静止基线 800ms
const baseFrames = got.length;
got.length = 0;
// 走一次动画
await p.evaluate(() => document.querySelector('button[aria-label^="h7 "]')?.click());
await p.evaluate(() => { window.__x = performance.now(); document.querySelector('button[aria-label="e7"]')?.click(); });
await p.waitForTimeout(500);
const animFrames = got.length;
const animDeltas = [];
for (let i = 1; i < got.length; i++) animDeltas.push((got[i].t - got[i - 1]));
const animHist = {};
for (const d of animDeltas) { const k = d <= 7 ? '<=7' : d <= 17 ? '8-17' : d <= 34 ? '18-34' : '>34'; animHist[k] = (animHist[k] ?? 0) + 1; }
await cdp.send('Page.stopScreencast');
console.log(`screencast 静止800ms出帧=${baseFrames}；动画500ms窗口出帧=${animFrames} 间隔=${JSON.stringify(animHist)}`);
console.log(`动画期间 fly 元素: ${await p.evaluate(() => document.querySelectorAll('.xq-anim-fly').length)}；e7炮: ${await p.evaluate(() => document.querySelectorAll('button[aria-label="e7 红炮"]').length)}`);
await browser.close();
