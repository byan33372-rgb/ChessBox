/**
 * 阶段 7：帧率与交互性能验收（真实 rAF 采样，禁止伪造）。
 *
 * 方法（PERF-002/005/006，全部为被动旁观采样）：
 * - rAF 采样 = 页面内自停 Promise（探针 probe-raf.mjs 验证：本环境 rAF 与显示器 vsync
 *   锁定 165.0fps，无重复时间戳）。安装不阻塞（探针存 window，结束由 __endRaf 解析）。
 * - 刷新率检测：空闲 5s rAF 间隔众数。
 * - 动画窗口 = 点击目标格 → 飞行层 transitionend + 卸载（事件驱动，不猜时长）。
 * - 统计：平均 FPS（=1000/平均间隔=1000×(n-1)/首尾差）、中位/P95/P99 帧时间、
 *   超 16.67ms（60Hz）/8.33ms（120Hz）预算帧数、长帧（>33.4ms）、max。
 * - 落位耗时：click→transitionend（本端），fly 挂载→transitionend（纯动画段）。
 * - 输入响应：el.click() 同步派发→选中环出现（MutationObserver，本地路径不含网络）。
 * - 网络分段（PERF-015）：提交点击→本端棋谱出现（ack 路径）；→对方端棋谱出现（广播路径）。
 * - 后台标签（N）：CDP Page.setWebLifecycleState frozen→active（'hidden' 不被本 Chrome 接受）。
 * - CPU 4x 降速（P）：CDP Emulation.setCPUThrottlingRate。
 * - reduced-motion（Q）与 DPR2（R）复测。
 * 场景 O（5 分钟连续）独立脚本 acceptance-perf-5min.mjs。
 *
 * 防污染：批量循环每 N 手点「重开试玩」——中象 60 回合无吃子判和 / 国象三次重复判和
 * 会使后续点击无效（旧基线曾因此把静止帧误当动画帧），必须避免。
 *
 * 输出：docs/acceptance/perf-results.json；进度 logs/stage7-progress.txt；控制台报告 logs/stage7-perf.txt。
 * 用法: node scripts/acceptance-perf.mjs
 */
import { chromium } from '@playwright/test';
import { appendFileSync, writeFileSync } from 'node:fs';

const BASE = process.env.NET_BASE ?? 'http://127.0.0.1:3001';
const LOG = 'docs/acceptance/logs/stage7-progress.txt';
const START = Date.now();
writeFileSync(LOG, '', 'utf8');
const log = (m) => {
  const line = `[${((Date.now() - START) / 1000).toFixed(1)}s] ${m}`;
  console.log(line);
  appendFileSync(LOG, line + '\n', 'utf8');
  // 每场景即落盘，避免环境中断丢失已完成数据
  try { writeFileSync('docs/acceptance/perf-results.json', JSON.stringify(out, null, 2)); } catch {}
};

const out = { env: null, refreshHz: null, refreshDetail: null, scenarios: {}, inputLatency: null, netLatency: null, cpuThrottle: null, reducedMotion: null, notes: [] };

const browser = await chromium.launch({
  channel: 'chrome',
  headless: false, // headed：rAF 跟随真实显示器 vsync（headless 无垂直同步）
  args: [
    '--disable-backgrounding-occluded-windows',
    '--disable-renderer-backgrounding',
    '--disable-background-timer-throttling',
    '--disable-features=CalculateNativeWinOcclusion', // Windows 原生遮挡检测会把他窗口遮住的页面按不可见降频
  ],
});

const SEL = (sq, root = '') => `${root ? root + ' ' : ''}button[aria-label^="${sq} "], ${root ? root + ' ' : ''}button[aria-label="${sq}"]`;
const clickSq = (p, sq, root = '') => p.evaluate((sel) => document.querySelector(sel)?.click(), SEL(sq, root));

const pctOf = (arr, p) => {
  if (!arr.length) return null;
  const s = [...arr].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))];
};
function statBlock(arr) {
  if (!arr.length) return null;
  return { samples: arr.length, medianMs: +pctOf(arr, 50).toFixed(1), p95Ms: +pctOf(arr, 95).toFixed(1), maxMs: +Math.max(...arr).toFixed(1) };
}
function frameStats(ts) {
  if (ts.length < 3) return null;
  const deltas = [];
  for (let i = 1; i < ts.length; i++) deltas.push(ts[i] - ts[i - 1]);
  const span = ts[ts.length - 1] - ts[0];
  const sorted = [...deltas].sort((a, b) => a - b);
  const over = (b) => deltas.filter((d) => d > b).length;
  return {
    frameSamples: deltas.length,
    windowMs: +span.toFixed(0),
    avgIntervalMs: +(span / deltas.length).toFixed(2),
    avgFps: +(1000 * deltas.length / span).toFixed(1),
    medianFrameMs: +sorted[Math.floor(sorted.length / 2)].toFixed(2),
    p95FrameMs: +sorted[Math.floor(sorted.length * 0.95)].toFixed(2),
    p99FrameMs: +sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.99))].toFixed(2),
    maxFrameMs: +sorted[sorted.length - 1].toFixed(2),
    longFrames: over(33.4),
    over16_67ms: over(16.67),
    over16_67Ratio: +(over(16.67) / deltas.length * 100).toFixed(2) + '%',
    over8_33ms: over(8.33),
    over8_33Ratio: +(over(8.33) / deltas.length * 100).toFixed(2) + '%',
  };
}

// —— 页面内探针（非阻塞安装；__endRaf 解析后自停） ——
const PROBE_INSTALL = (max) => {
  window.__rafTs = [];
  let done = false;
  const ts = [];
  window.__rafDonePromise = new Promise((resolve) => {
    const tick = (t) => {
      if (done) return;
      ts.push(t);
      if (ts.length >= max) { done = true; resolve(ts); return; }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    window.__endRaf = () => { if (!done) { done = true; resolve(ts); } };
  });
};
const startProbe = (p) => p.evaluate(PROBE_INSTALL, 6000);
const endProbe = (p) => p.evaluate(() => { window.__endRaf(); });
const readProbe = (p) => p.evaluate(() => window.__rafDonePromise);

// —— settle 监听（一次性绑定；读后清空） ——
async function settleInit(p) {
  await p.evaluate(() => {
    if (window.__settleBound) return;
    window.__settleBound = true;
    window.__settleClick = [];
    window.__settleAnim = [];
    window.__flyMountPerf = 0;
    window.__flyMountWall = 0;
    window.__tClick = 0;
    document.addEventListener('transitionend', (e) => {
      if (e.propertyName === 'transform' && e.target.closest && e.target.closest('.xq-anim-fly,.chess-anim-fly')) {
        const now = performance.now();
        if (window.__tClick) { window.__settleClick.push(now - window.__tClick); window.__tClick = 0; }
        if (window.__flyMountPerf) window.__settleAnim.push(now - window.__flyMountPerf);
      }
    }, true);
    new MutationObserver((muts) => {
      for (const m of muts) for (const n of m.addedNodes) {
        if (n.nodeType === 1 && n.classList && (n.classList.contains('xq-anim-fly') || n.classList.contains('chess-anim-fly'))) {
          window.__flyMountPerf = performance.now();
          window.__flyMountWall = Date.now();
        }
      }
    }).observe(document.body, { subtree: true, childList: true });
  });
}
const wait = (p, ms) => p.waitForTimeout(ms);
async function waitAnimDone(p) {
  await p.waitForFunction(() => (window.__settleClick.length + window.__settleAnim.length) > 0, null, { timeout: 4000, polling: 20 }).catch(() => {});
  await p.waitForFunction(() => !document.querySelector('.xq-anim-fly,.chess-anim-fly'), null, { timeout: 2000, polling: 20 }).catch(() => {});
}

// ================= 场景 0：环境 + 刷新率 + A 静止 =================
try {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const p = await ctx.newPage();
  await p.goto(BASE + '/');
  await p.locator('.create-card.xiangqi').waitFor({ timeout: 20000 });
  out.env = await p.evaluate(() => ({
    userAgent: navigator.userAgent,
    platform: navigator.platform,
    cores: navigator.hardwareConcurrency,
    dpr: devicePixelRatio,
    viewport: { w: innerWidth, h: innerHeight },
    reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
    screen: { w: screen.width, h: screen.height },
  }));
  await p.bringToFront();
  await startProbe(p);
  await wait(p, 5000);
  await endProbe(p);
  const ts = await readProbe(p);
  const deltas = [];
  for (let i = 1; i < ts.length; i++) deltas.push(ts[i] - ts[i - 1]);
  const counts = new Map();
  for (const d of deltas) { const k = Math.round(d * 2) / 2; counts.set(k, (counts.get(k) ?? 0) + 1); }
  const [mode, modeN] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
  out.refreshHz = Math.round(1000 / mode);
  out.refreshDetail = { modeIntervalMs: mode, modeCount: modeN, idleSamples: deltas.length, idleFps: +(1000 * deltas.length / (ts[ts.length - 1] - ts[0])).toFixed(1) };
  out.scenarios.A_idle = { ...frameStats(ts), note: '首页静止 5s 空闲采样' };
  log(`A 刷新率=${out.refreshHz}Hz（众数 ${mode}ms, ${modeN}/${deltas.length}） idle=${out.refreshDetail.idleFps}fps p95=${out.scenarios.A_idle.p95FrameMs}ms`);
  await ctx.close();
} catch (e) { log('SCENE A FAILED: ' + e.message); }

// ================= 场景 1：本地输入响应（沙盒，无网络） =================
try {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const p = await ctx.newPage();
  await p.goto(BASE + '/');
  await p.locator('.practice-board[data-kind=xiangqi]').waitFor({ timeout: 20000 });
  await p.bringToFront();
  await p.evaluate(() => {
    window.__selLat = [];
    window.__t0 = 0;
    new MutationObserver(() => {
      if (window.__t0 && document.querySelector('.xq-sel-ring')) { window.__selLat.push(performance.now() - window.__t0); window.__t0 = 0; }
    }).observe(document.body, { subtree: true, childList: true, attributes: true });
  });
  for (let i = 0; i < 60; i++) {
    await p.evaluate(() => { window.__t0 = performance.now(); document.querySelector('button[aria-label^="h9 "]')?.click(); });
    await wait(p, 45);
    await p.evaluate(() => document.querySelector('button[aria-label^="h9 "]')?.click());
    await wait(p, 45);
  }
  out.inputLatency = await p.evaluate(() => {
    const a = window.__selLat;
    if (!a.length) return { samples: 0 };
    const s = [...a].sort((x, y) => x - y);
    return { samples: a.length, medianMs: +s[Math.floor(s.length / 2)].toFixed(1), p95Ms: +s[Math.floor(s.length * 0.95)].toFixed(1), maxMs: +s[s.length - 1].toFixed(1) };
  });
  log(`输入响应（本地选中环）: ${JSON.stringify(out.inputLatency)}`);
  await ctx.close();
} catch (e) { log('SCENE INPUT FAILED: ' + e.message); }

// ================= 场景 2：批量普通动画（每棋种 ≥100 动画样本） =================
async function bulkSample(kind, moves, tag, { dpr = 1, rounds = 60, resetEvery = 10 } = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: dpr });
  const p = await ctx.newPage();
  await p.goto(BASE + '/');
  await p.locator(`.practice-board[data-kind=${kind}]`).waitFor({ timeout: 20000 });
  await p.bringToFront();
  await settleInit(p);
  await wait(p, 200);
  const allTs = []; const clickSettle = []; const animDur = [];
  let plies = 0;
  let failed = 0;
  const ROOT = `.practice-board[data-kind=${kind}]`;
  for (let i = 0; i < rounds; i++) {
    for (const [from, to] of moves) {
      await startProbe(p);
      await clickSq(p, from, ROOT);
      await p.evaluate((sel) => { window.__tClick = performance.now(); document.querySelector(sel)?.click(); }, SEL(to, ROOT));
      await waitAnimDone(p);
      const s = await p.evaluate(() => ({ c: window.__settleClick.splice(0), a: window.__settleAnim.splice(0) }));
      if (s.a.length === 0) failed++;
      clickSettle.push(...s.c); animDur.push(...s.a);
      await endProbe(p);
      allTs.push(...(await readProbe(p)));
      plies++;
      if (plies % resetEvery === 0) { await p.locator(`.practice-board[data-kind=${kind}] .practice-reset`).click(); await wait(p, 120); }
    }
  }
  const r = {
    ...frameStats(allTs),
    animationRuns: animDur.length,
    failedMoves: failed,
    clickToSettleMs: statBlock(clickSettle),
    animDurationMs: statBlock(animDur),
    dpr,
    tag,
  };
  await ctx.close();
  return r;
}
try {
  // 4 手换边循环（红炮 h7↔e7 / 黑炮 h2↔e2，全程无吃子；8 手内重开避免三次重复判和）
  out.scenarios.B_xq_normal = await bulkSample('xiangqi', [
    ['h7', 'e7'], ['h2', 'e2'], ['e7', 'h7'], ['e2', 'h2'],
  ], 'B', { resetEvery: 8 });
  log(`B 中象普通动画: ${JSON.stringify(out.scenarios.B_xq_normal)}`);
} catch (e) { log('SCENE B FAILED: ' + e.message); }
try {
  // 4 手换边循环（白马 g1↔f3 / 黑马 b8↔c6；8 手内重开避免三次重复判和）
  out.scenarios.C_chess_normal = await bulkSample('chess', [
    ['g1', 'f3'], ['b8', 'c6'], ['f3', 'g1'], ['c6', 'b8'],
  ], 'C', { resetEvery: 8 });
  log(`C 国象普通动画: ${JSON.stringify(out.scenarios.C_chess_normal)}`);
} catch (e) { log('SCENE C FAILED: ' + e.message); }
try {
  out.scenarios.R_chess_dpr2 = await bulkSample('chess', [
    ['g1', 'f3'], ['b8', 'c6'], ['f3', 'g1'], ['c6', 'b8'],
  ], 'R', { dpr: 2, rounds: 10, resetEvery: 8 });
  log(`R 国象 DPR2: ${JSON.stringify(out.scenarios.R_chess_dpr2)}`);
} catch (e) { log('SCENE R FAILED: ' + e.message); }

// ================= 场景 Q：prefers-reduced-motion =================
try {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, reducedMotion: 'reduce' });
  const p = await ctx.newPage();
  await p.goto(BASE + '/');
  await p.locator('.practice-board[data-kind=xiangqi]').waitFor({ timeout: 20000 });
  await p.bringToFront();
  const QROOT = '.practice-board[data-kind=xiangqi]';
  const c0 = await p.locator('.move-btn').count();
  await clickSq(p, 'h7', QROOT);
  await p.evaluate(() => { window.__t0 = performance.now(); });
  await clickSq(p, 'e7', QROOT);
  const flySeen = await p.evaluate(() => document.querySelectorAll('.xq-anim-fly').length);
  await p.waitForFunction(() => !!document.querySelector('.practice-board[data-kind=xiangqi] button[aria-label="e7 红炮"]'), null, { timeout: 8000, polling: 20 }).catch(() => {});
  const dt = await p.evaluate(() => performance.now() - window.__t0);
  const state = await p.evaluate(() => ({
    e7: document.querySelectorAll('.practice-board[data-kind=xiangqi] button[aria-label^="e7 "]').length,
    fly: document.querySelectorAll('.xq-anim-fly').length,
    reduced: matchMedia('(prefers-reduced-motion: reduce)').matches,
  }));
  out.reducedMotion = { applied: state.reduced, flySeenImmediately: flySeen, moveListLatencyMs: +dt.toFixed(1), finalState: state, note: '减少动效下不应有飞行动画（Room/PracticeBoard 跳过 anim 构造），状态即时正确' };
  log(`Q reduced-motion: ${JSON.stringify(out.reducedMotion)}`);
  await ctx.close();
} catch (e) { log('SCENE Q FAILED: ' + e.message); }

// ================= 真实对弈场景（双上下文） =================
async function newRoom(kind) {
  const ctxA = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const ctxB = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const pA = await ctxA.newPage();
  const pB = await ctxB.newPage();
  await pA.goto(BASE + '/');
  await pA.locator(`.create-card.${kind} .gc-create-btn`).click();
  await pA.waitForURL(/\/r\//);
  await pB.goto(pA.url());
  await pA.locator('.waiting-overlay').waitFor({ state: 'hidden', timeout: 15000 });
  await pA.locator('.conn-pill.ok').waitFor({ timeout: 15000 });
  await pB.locator('.conn-pill.ok').waitFor({ timeout: 15000 });
  await pA.bringToFront();
  return { ctxA, ctxB, pA, pB };
}
async function roomMove(p, from, to) {
  const c0 = await p.locator('.move-btn').count();
  await clickSq(p, from);
  await clickSq(p, to);
  await p.waitForFunction((c) => document.querySelectorAll('.move-btn').length > c, c0, { timeout: 12000, polling: 30 });
  await wait(p, 60);
}
async function sampledOwn(p, from, to) {
  await settleInit(p);
  await p.bringToFront();
  await p.evaluate(() => { window.__settleClick.splice(0); window.__settleAnim.splice(0); });
  const c0 = await p.locator('.move-btn').count();
  await startProbe(p);
  await clickSq(p, from);
  await p.evaluate((sel) => { window.__tClick = performance.now(); document.querySelector(sel)?.click(); }, SEL(to));
  await p.waitForFunction((c) => document.querySelectorAll('.move-btn').length > c, c0, { timeout: 12000, polling: 30 }).catch(() => {});
  await waitAnimDone(p);
  await endProbe(p);
  const ts = await readProbe(p);
  const s = await p.evaluate(() => ({ c: window.__settleClick.splice(0), a: window.__settleAnim.splice(0) }));
  return { ...frameStats(ts), clickToSettleMs: statBlock(s.c), animDurationMs: statBlock(s.a) };
}
async function sampledPeer(receiver, mover, from, to) {
  await settleInit(receiver);
  await receiver.bringToFront();
  await receiver.evaluate(() => { window.__settleClick.splice(0); window.__settleAnim.splice(0); window.__flyMountWall = 0; window.__tPeer = Date.now(); });
  const c0 = await receiver.locator('.move-btn').count();
  await startProbe(receiver);
  await clickSq(mover, from);
  await clickSq(mover, to);
  await receiver.waitForFunction((c) => document.querySelectorAll('.move-btn').length > c, c0, { timeout: 12000, polling: 30 }).catch(() => {});
  await waitAnimDone(receiver);
  await endProbe(receiver);
  const ts = await readProbe(receiver);
  const s = await receiver.evaluate(() => ({
    c: window.__settleClick.splice(0),
    a: window.__settleAnim.splice(0),
    peerVisualMs: window.__flyMountWall ? window.__flyMountWall - window.__tPeer : null,
  }));
  return { ...frameStats(ts), clickToSettleMs: statBlock(s.c), animDurationMs: statBlock(s.a), peerVisualMs: s.peerVisualMs };
}

// —— H 炮吃（中国象棋真实房） ——
try {
  const { ctxA, ctxB, pA, pB } = await newRoom('xiangqi');
  out.scenarios.H_xq_cannon_capture = await sampledOwn(pA, 'b7', 'b0');
  out.scenarios.H_xq_cannon_capture.integrity = await pA.evaluate(() => ({
    b0: document.querySelector('button[aria-label^="b0 "]')?.getAttribute('aria-label') ?? null,
    moves: document.querySelectorAll('.move-btn').length,
  }));
  log(`H 中象炮吃: ${JSON.stringify(out.scenarios.H_xq_cannon_capture)}`);
  await ctxA.close(); await ctxB.close();
} catch (e) { log('SCENE H FAILED: ' + e.message); }

// —— J 快速连续（A 首步确认后、动画未结束即由 B 应手）与 I 翻转 ——
try {
  const { ctxA, ctxB, pA, pB } = await newRoom('xiangqi');
  await settleInit(pA);
  await pA.bringToFront();
  await pA.evaluate(() => { window.__settleClick.splice(0); window.__settleAnim.splice(0); });
  await startProbe(pA);
  await clickSq(pA, 'h7');
  await pA.evaluate((sel) => { window.__tClick = performance.now(); document.querySelector(sel)?.click(); }, SEL('e7'));
  await pA.waitForFunction(() => document.querySelectorAll('.move-btn').length >= 1, null, { timeout: 12000, polling: 30 }).catch(() => {});
  // A 的飞行动画（约 196ms）尚未结束时，B 立即应手
  await clickSq(pB, 'h0');
  await clickSq(pB, 'g2');
  await pA.waitForFunction(() => document.querySelectorAll('.move-btn').length >= 2, null, { timeout: 12000, polling: 30 }).catch(() => {});
  await wait(pA, 700);
  await endProbe(pA);
  const tsJ = await readProbe(pA);
  out.scenarios.J_rapid_both = { ...frameStats(tsJ), ...(await pA.evaluate(() => ({
    clickSettle: window.__settleClick.splice(0), animDur: window.__settleAnim.splice(0),
  })).then((s) => ({ clickToSettleMs: statBlock(s.clickSettle), animDurationMs: statBlock(s.animDur) }))) };
  out.scenarios.J_rapid_both.integrity = {
    A: await pA.evaluate(() => ({ pieces: document.querySelectorAll('.xq-piece').length, fly: document.querySelectorAll('.xq-anim-fly').length, moves: document.querySelectorAll('.move-btn').length })),
    B: await pB.evaluate(() => ({ pieces: document.querySelectorAll('.xq-piece').length, fly: document.querySelectorAll('.xq-anim-fly').length, moves: document.querySelectorAll('.move-btn').length })),
  };
  log(`J 快速连续: ${JSON.stringify(out.scenarios.J_rapid_both)}`);

  // I 翻转（该房间已有 2 步）
  await pA.bringToFront();
  await startProbe(pA);
  await pA.locator('.replay-controls button', { hasText: '翻转棋盘' }).click();
  await wait(pA, 450);
  await endProbe(pA);
  out.scenarios.I_flip = frameStats(await readProbe(pA));
  out.scenarios.I_flip.a9Top = Math.round(await pA.evaluate(() => document.querySelector('button[aria-label^="a9 "]')?.getBoundingClientRect().top ?? -1));
  log(`I 翻转: ${JSON.stringify(out.scenarios.I_flip)}`);
  await ctxA.close(); await ctxB.close();
} catch (e) { log('SCENES J/I FAILED: ' + e.message); }

// —— D 吃子（本端）/ K 对手端回吃（接收端） ——
try {
  const { ctxA, ctxB, pA, pB } = await newRoom('chess');
  for (const [p, f, t] of [[pA, 'e2', 'e4'], [pB, 'e7', 'e5'], [pA, 'd1', 'h5'], [pB, 'b8', 'c6']]) await roomMove(p, f, t);
  out.scenarios.D_chess_capture = await sampledOwn(pA, 'h5', 'e5'); // Qxe5+ 吃兵
  log(`D 国象吃子: ${JSON.stringify(out.scenarios.D_chess_capture)}`);
  out.scenarios.K_peer_sync = await sampledPeer(pA, pB, 'c6', 'e5'); // 接收端 pA 采样对手回吃
  out.scenarios.K_peer_sync.integrity = {
    A: await pA.evaluate(() => ({ e5: document.querySelector('button[aria-label^="e5 "]')?.getAttribute('aria-label') ?? null, moves: document.querySelectorAll('.move-btn').length })),
    B: await pB.evaluate(() => ({ moves: document.querySelectorAll('.move-btn').length })),
  };
  log(`K 对手端回吃: ${JSON.stringify(out.scenarios.K_peer_sync)}`);
  await ctxA.close(); await ctxB.close();
} catch (e) { log('SCENES D/K FAILED: ' + e.message); }

// —— E 易位 ——
try {
  const { ctxA, ctxB, pA, pB } = await newRoom('chess');
  for (const [p, f, t] of [[pA, 'e2', 'e4'], [pB, 'e7', 'e5'], [pA, 'g1', 'f3'], [pB, 'b8', 'c6'], [pA, 'f1', 'c4'], [pB, 'g8', 'f6']]) await roomMove(p, f, t);
  out.scenarios.E_castle = await sampledOwn(pA, 'e1', 'g1');
  out.scenarios.E_castle.integrity = await pA.evaluate(() => ({
    king: document.querySelectorAll('button[aria-label="g1 白王"]').length,
    rook: document.querySelectorAll('button[aria-label="f1 白车"]').length,
  }));
  log(`E 易位: ${JSON.stringify(out.scenarios.E_castle)}`);
  await ctxA.close(); await ctxB.close();
} catch (e) { log('SCENE E FAILED: ' + e.message); }

// —— F 过路兵 ——
try {
  const { ctxA, ctxB, pA, pB } = await newRoom('chess');
  for (const [p, f, t] of [[pA, 'e2', 'e4'], [pB, 'g8', 'f6'], [pA, 'e4', 'e5'], [pB, 'd7', 'd5']]) await roomMove(p, f, t);
  out.scenarios.F_en_passant = await sampledOwn(pA, 'e5', 'd6');
  out.scenarios.F_en_passant.integrity = await pA.evaluate(() => ({
    d6: document.querySelectorAll('button[aria-label="d6 白兵"]').length,
    d5empty: document.querySelectorAll('button[aria-label="d5"]').length,
  }));
  log(`F 过路兵: ${JSON.stringify(out.scenarios.F_en_passant)}`);
  await ctxA.close(); await ctxB.close();
} catch (e) { log('SCENE F FAILED: ' + e.message); }

// —— G 升变 ——
try {
  const { ctxA, ctxB, pA, pB } = await newRoom('chess');
  for (const [p, f, t] of [[pA, 'a2', 'a4'], [pB, 'b7', 'b5'], [pA, 'a4', 'b5'], [pB, 'a7', 'a6'], [pA, 'b5', 'a6'], [pB, 'g8', 'f6'], [pA, 'a6', 'a7'], [pB, 'h7', 'h6']]) await roomMove(p, f, t);
  await settleInit(pA);
  await pA.bringToFront();
  await pA.evaluate(() => { window.__settleClick.splice(0); window.__settleAnim.splice(0); });
  const c0 = await pA.locator('.move-btn').count();
  await startProbe(pA);
  await clickSq(pA, 'a7');
  await pA.evaluate(() => { window.__tClick = performance.now(); });
  await clickSq(pA, 'b8');
  await pA.locator('.promo-card').waitFor({ timeout: 6000 });
  await pA.locator('.promo-btn', { hasText: '后' }).click();
  await pA.waitForFunction((c) => document.querySelectorAll('.move-btn').length > c, c0, { timeout: 12000, polling: 30 }).catch(() => {});
  await waitAnimDone(pA);
  await endProbe(pA);
  const tsG = await readProbe(pA);
  const sG = await pA.evaluate(() => ({ c: window.__settleClick.splice(0), a: window.__settleAnim.splice(0) }));
  out.scenarios.G_promotion = { ...frameStats(tsG), clickToSettleMs: statBlock(sG.c), animDurationMs: statBlock(sG.a) };
  out.scenarios.G_promotion.integrity = await pA.evaluate(() => ({ b8queen: document.querySelectorAll('button[aria-label="b8 白后"]').length }));
  log(`G 升变: ${JSON.stringify(out.scenarios.G_promotion)}`);
  await ctxA.close(); await ctxB.close();
} catch (e) { log('SCENE G FAILED: ' + e.message); }

// —— L 棋谱快速导航 / M resize ——
try {
  const { ctxA, ctxB, pA, pB } = await newRoom('xiangqi');
  for (const [p, f, t] of [[pA, 'h7', 'e7'], [pB, 'h0', 'g2'], [pA, 'h9', 'g7'], [pB, 'b0', 'c2']]) await roomMove(p, f, t);
  await pA.bringToFront();
  await startProbe(pA);
  for (let i = 0; i < 4; i++) { await pA.locator('.replay-controls .icon-btn[aria-label="上一步"]').click(); await wait(pA, 80); }
  for (let i = 0; i < 4; i++) { await pA.locator('.replay-controls .icon-btn[aria-label="下一步"]').click(); await wait(pA, 80); }
  await wait(pA, 300);
  await endProbe(pA);
  out.scenarios.L_replay_nav = frameStats(await readProbe(pA));
  out.scenarios.L_replay_nav.integrity = await pA.evaluate(() => ({
    fly: document.querySelectorAll('.xq-anim-fly').length,
    pieces: document.querySelectorAll('.xq-piece').length,
    moves: document.querySelectorAll('.move-btn').length,
  }));

  await startProbe(pA);
  await pA.setViewportSize({ width: 1000, height: 700 });
  await wait(pA, 250);
  await pA.setViewportSize({ width: 1280, height: 800 });
  await wait(pA, 250);
  await pA.setViewportSize({ width: 1100, height: 750 });
  await wait(pA, 350);
  await endProbe(pA);
  out.scenarios.M_resize = frameStats(await readProbe(pA));
  await pA.setViewportSize({ width: 1280, height: 800 });
  log(`L 导航: ${JSON.stringify(out.scenarios.L_replay_nav)}`);
  log(`M resize: ${JSON.stringify(out.scenarios.M_resize)}`);
  await ctxA.close(); await ctxB.close();
} catch (e) { log('SCENES L/M FAILED: ' + e.message); }

// —— N 后台冻结→恢复（DOM 完整性，无帧采样） ——
try {
  const { ctxA, ctxB, pA, pB } = await newRoom('chess');
  await roomMove(pA, 'e2', 'e4');
  const cdp = await ctxA.newCDPSession(pA);
  await cdp.send('Page.setWebLifecycleState', { state: 'frozen' });
  await wait(pA, 1200);
  await roomMove(pB, 'd7', 'd5');
  await cdp.send('Page.setWebLifecycleState', { state: 'active' });
  await wait(pA, 700);
  out.scenarios.N_background = await pA.evaluate(() => ({
    fly: document.querySelectorAll('.chess-anim-fly').length,
    pieces: document.querySelectorAll('.chess-piece-wrap').length,
    moves: document.querySelectorAll('.move-btn').length,
    d5: document.querySelectorAll('button[aria-label="d5 黑兵"]').length,
    note: 'frozen 期间对手走棋；恢复后应为 2 步、d5=黑兵、无卡半途飞行层',
  }));
  log(`N 后台恢复: ${JSON.stringify(out.scenarios.N_background)}`);
  await ctxA.close(); await ctxB.close();
} catch (e) { log('SCENE N FAILED: ' + e.message); }

// —— P CPU 4x 降速 ——
try {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const p = await ctx.newPage();
  const cdp = await ctx.newCDPSession(p);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  await p.goto(BASE + '/');
  await p.locator('.practice-board[data-kind=chess]').waitFor({ timeout: 30000 });
  await p.bringToFront();
  await settleInit(p);
  const PROOT = '.practice-board[data-kind=chess]';
  const allTs = []; const clickSettle = []; const animDur = [];
  let plies = 0;
  const cycle = [['g1', 'f3'], ['b8', 'c6'], ['f3', 'g1'], ['c6', 'b8']];
  for (let i = 0; i < 10; i++) {
    for (const [f, t] of cycle) {
      await startProbe(p);
      await clickSq(p, f, PROOT);
      await p.evaluate((sel) => { window.__tClick = performance.now(); document.querySelector(sel)?.click(); }, SEL(t, PROOT));
      await p.waitForFunction(() => (window.__settleClick.length + window.__settleAnim.length) > 0, null, { timeout: 8000, polling: 30 }).catch(() => {});
      await p.waitForFunction(() => !document.querySelector('.chess-anim-fly'), null, { timeout: 3000, polling: 30 }).catch(() => {});
      const s = await p.evaluate(() => ({ c: window.__settleClick.splice(0), a: window.__settleAnim.splice(0) }));
      clickSettle.push(...s.c); animDur.push(...s.a);
      await endProbe(p);
      allTs.push(...(await readProbe(p)));
      plies++;
      if (plies % 8 === 0) { await p.locator('.practice-board[data-kind=chess] .practice-reset').click(); await wait(p, 150); }
    }
  }
  out.cpuThrottle = { rate: 4, ...frameStats(allTs), animationRuns: animDur.length, clickToSettleMs: statBlock(clickSettle), animDurationMs: statBlock(animDur) };
  log(`P CPU4x: ${JSON.stringify(out.cpuThrottle)}`);
  await ctx.close();
} catch (e) { log('SCENE P FAILED: ' + e.message); }

// —— 网络分段（PERF-015） ——
try {
  const { ctxA, ctxB, pA, pB } = await newRoom('chess');
  const ackMs = []; const peerMs = [];
  const seq = [
    [pA, 'e2', 'e4'], [pB, 'e7', 'e5'],
    [pA, 'g1', 'f3'], [pB, 'b8', 'c6'],
    [pA, 'f1', 'c4'], [pB, 'g8', 'f6'],
    [pA, 'd2', 'd4'], [pB, 'e5', 'd4'],
    [pA, 'f3', 'd4'], [pB, 'f8', 'e7'],
    [pA, 'c2', 'c3'], [pB, 'd7', 'd6'],
  ];
  for (const [p, f, t] of seq) {
    const peer = p === pA ? pB : pA;
    const c0 = await p.locator('.move-btn').count();
    await clickSq(p, f);
    await peer.evaluate(() => { window.__tPeer = Date.now(); });
    await p.evaluate((sel) => { window.__perfClick = performance.now(); document.querySelector(sel)?.click(); }, SEL(t));
    const ack = await p.evaluate((c) => new Promise((res) => {
      const ch = () => { if (document.querySelectorAll('.move-btn').length > c) res(performance.now() - window.__perfClick); else setTimeout(ch, 8); };
      ch(); setTimeout(() => res(-1), 8000);
    }), c0);
    const dtPeer = await peer.evaluate((c) => new Promise((res) => {
      const ch = () => { if (document.querySelectorAll('.move-btn').length > c) res(Date.now() - window.__tPeer); else setTimeout(ch, 8); };
      ch(); setTimeout(() => res(-1), 8000);
    }), c0);
    if (ack > 0) ackMs.push(ack);
    if (dtPeer >= 0) peerMs.push(dtPeer);
    await wait(p, 120);
  }
  out.netLatency = {
    moves: seq.length,
    clickToOwnMoveList: statBlock(ackMs),
    clickToPeerMoveList: statBlock(peerMs),
    note: '本机回环（127.0.0.1）：ack=提交点击→本端棋谱出现（socket 往返+渲染）；peer=提交点击→对方端棋谱出现（+广播）。不含公网延迟。',
  };
  log(`网络分段: ${JSON.stringify(out.netLatency)}`);
  await ctxA.close(); await ctxB.close();
} catch (e) { log('NET SCENE FAILED: ' + e.message); }

out.totalDurationSec = Math.round((Date.now() - START) / 1000);
writeFileSync('docs/acceptance/perf-results.json', JSON.stringify(out, null, 2));
log('DONE perf（结果 docs/acceptance/perf-results.json）');
await browser.close();