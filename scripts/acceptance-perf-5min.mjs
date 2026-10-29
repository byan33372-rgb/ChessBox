/**
 * 场景 O：连续对弈 5 分钟（PERF-004 O / PERF-016 内存趋势）。
 *
 * 试玩沙盒 4 手换边循环（红炮 h7↔e7、黑炮 h2↔e2，全程无吃子合法走法），
 * 每 2 轮（8 手）点「重开试玩」避免三次重复判和/60 回合判和把动画循环变成静止循环；
 * 每轮结束校验落点（h7 红炮 / h2 黑炮）计数有效动画轮次。
 * 持续 rAF 帧采样（整段 + 每 60s 分段），每 30s 采样 performance.memory 与 DOM 节点数。
 * 用法: node scripts/acceptance-perf-5min.mjs
 */
import { chromium } from '@playwright/test';
import { appendFileSync, writeFileSync } from 'node:fs';

const BASE = process.env.NET_BASE ?? 'http://127.0.0.1:3001';
const PROGRESS = 'docs/acceptance/logs/stage7-perf-5min-progress.txt';
writeFileSync(PROGRESS, '', 'utf8');
const plog = (m) => { const line = `[${((Date.now() - START) / 1000).toFixed(1)}s] ${m}`; console.log(line); appendFileSync(PROGRESS, line + '\n', 'utf8'); };
const START = Date.now();
const browser = await chromium.launch({
  channel: 'chrome',
  headless: false, // headed：rAF 跟随真实显示器 vsync
  args: [
    '--disable-backgrounding-occluded-windows',
    '--disable-renderer-backgrounding',
    '--disable-background-timer-throttling',
    '--disable-features=CalculateNativeWinOcclusion',
  ],
});
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
const p = await ctx.newPage();
await p.goto(BASE + '/');
await p.locator('.practice-board[data-kind=xiangqi]').waitFor({ timeout: 20000 });
await p.bringToFront();

const SELR = (sq) => `.practice-board[data-kind=xiangqi] button[aria-label^="${sq} "], .practice-board[data-kind=xiangqi] button[aria-label="${sq}"]`;
const clickSq = (sq) => p.evaluate((sel) => document.querySelector(sel)?.click(), SELR(sq));

const SAMPLER = `
  window.__frames = []; window.__lastT = 0; window.__rafOn = false;
  window.__rafTick = (t) => { if (window.__rafOn) { if (window.__lastT) window.__frames.push(t - window.__lastT); window.__lastT = t; requestAnimationFrame(window.__rafTick); } };
  window.startFrames = () => { window.__frames = []; window.__lastT = 0; window.__rafOn = true; requestAnimationFrame(window.__rafTick); };
  window.stopFrames = () => { window.__rafOn = false; return window.__frames; };
`;
await p.evaluate(SAMPLER);
await p.evaluate(() => window.startFrames());

const memSamples = [];
const segFrames = [];
const t0 = Date.now();
const DUR = Number(process.env.PERF_5MIN_MS ?? 5 * 60 * 1000);
plog(`start：duration=${Math.round(DUR / 1000)}s`);
let cycles = 0;
let verifiedMoves = 0;
let failedCycles = 0;
let nextSeg = 0;
let memAt = 0;
const cycleMoves = [['h7', 'e7'], ['h2', 'e2'], ['e7', 'h7'], ['e2', 'h2']];

while (Date.now() - t0 < DUR) {
  for (const [f, t] of cycleMoves) {
    await clickSq(f);
    await clickSq(t);
    await p.waitForTimeout(230);
  }
  cycles++;
  const ok = await p.evaluate(() => !!document.querySelector('.practice-board[data-kind=xiangqi] button[aria-label="h7 红炮"]') && !!document.querySelector('.practice-board[data-kind=xiangqi] button[aria-label="h2 黑炮"]'));
  if (ok) verifiedMoves += 4; else failedCycles++;
  if (cycles % 2 === 0) {
    await p.evaluate(() => document.querySelector('.practice-board[data-kind=xiangqi] .practice-reset')?.click());
    await p.waitForTimeout(150);
  }
  if (cycles % 10 === 0) plog(`cycles=${cycles} verified=${verifiedMoves} failed=${failedCycles} elapsed=${Math.round((Date.now() - t0) / 1000)}s`);
  const el = Date.now() - t0;
  if (el - nextSeg >= 60000) {
    nextSeg += 60000;
    segFrames.push(await p.evaluate(() => ({ f: window.__frames.splice(0) })));
  }
  if (el - memAt >= 30000) {
    memAt += 30000;
    memSamples.push(await p.evaluate((t0v) => ({
      t: Math.round((Date.now() - t0v) / 1000),
      heapMB: +((performance.memory?.usedJSHeapSize ?? 0) / 1048576).toFixed(1),
      domNodes: document.getElementsByTagName('*').length,
    }), t0));
  }
}

const allFrames = (await p.evaluate(() => window.stopFrames())).concat(...segFrames.map((s) => s.f));
const final = await p.evaluate(() => ({
  pieces: document.querySelectorAll('.practice-board[data-kind=xiangqi] .xq-piece').length,
  fly: document.querySelectorAll('.practice-board[data-kind=xiangqi] .xq-anim-fly').length,
  cap: document.querySelectorAll('.practice-board[data-kind=xiangqi] .xq-anim-captured').length,
  h7: document.querySelectorAll('.practice-board[data-kind=xiangqi] button[aria-label="h7 红炮"]').length,
  h2: document.querySelectorAll('.practice-board[data-kind=xiangqi] button[aria-label="h2 黑炮"]').length,
}));
const sorted = [...allFrames].sort((a, b) => a - b);
const sum = allFrames.reduce((a, b) => a + b, 0);
const result = {
  durationSec: Math.round((Date.now() - t0) / 1000),
  cycles,
  animationRuns: cycles * 4,
  verifiedMoves,
  failedCycles,
  frameSamples: allFrames.length,
  avgIntervalMs: +(sum / allFrames.length).toFixed(2),
  avgFps: +(1000 / (sum / allFrames.length)).toFixed(1),
  medianFrameMs: +sorted[Math.floor(sorted.length / 2)].toFixed(2),
  p95FrameMs: +sorted[Math.floor(sorted.length * 0.95)].toFixed(2),
  p99FrameMs: +sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.99))].toFixed(2),
  longFrames: allFrames.filter((d) => d > 33.4).length,
  over16_67ms: allFrames.filter((d) => d > 16.67).length,
  over8_33ms: allFrames.filter((d) => d > 8.33).length,
  memory: memSamples,
  heapGrowthMB: memSamples.length > 1 ? +(memSamples[memSamples.length - 1].heapMB - memSamples[0].heapMB).toFixed(1) : null,
  domNodeGrowth: memSamples.length > 1 ? memSamples[memSamples.length - 1].domNodes - memSamples[0].domNodes : null,
  finalIntegrity: final,
};
writeFileSync('docs/acceptance/perf-5min.json', JSON.stringify(result, null, 2));
console.log(`O 5min: cycles=${cycles} verified=${verifiedMoves} failedCycles=${failedCycles} frames=${allFrames.length} avg=${result.avgFps}fps p95=${result.p95FrameMs}ms p99=${result.p99FrameMs}ms heapΔ=${result.heapGrowthMB}MB domΔ=${result.domNodeGrowth} integrity=${JSON.stringify(final)}`);
await browser.close();