/**
 * 浏览器端全链路延迟测量（阶段二/七/八共用）
 *
 * 两个真实浏览器上下文（同一 Chrome，不同 context）经 UI 建房/加入，
 * 五子棋逐手点击，记录：
 *  - 落子者：pointerdown → 棋盘出现该子（乐观 UI 生效时应 <50ms）
 *  - 对手：pointerdown（对方页面 epoch）→ 自己棋盘出现该子（网络 + 渲染）
 *  - 服务端 ack 分项（window.__dcLatency）
 *
 * 用法：
 *   node scripts/latency-browser.mjs --url http://127.0.0.1:3001 --moves 12 --label local
 *   node scripts/latency-browser.mjs --url https://xxx.trycloudflare.com --moves 12 --label tunnel
 */
import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, cur, i, arr) => {
    if (cur.startsWith('--')) acc.push([cur.slice(2), arr[i + 1] && !arr[i + 1].startsWith('--') ? arr[i + 1] : 'true']);
    return acc;
  }, []),
);
const BASE = (args.url || 'http://127.0.0.1:3001').replace(/\/$/, '');
const MOVES = Number(args.moves || 12);
const LABEL = args.label || 'local';
const OUT = args.out || `docs/latency/raw/browser-${LABEL}.json`;

const A_PTS = ['a1', 'b3', 'c5', 'd7', 'e9', 'f11', 'g13', 'h15', 'i2', 'j4', 'k6', 'l8'];
const B_PTS = ['a8', 'b10', 'c12', 'd14', 'e1', 'f3', 'g5', 'h7', 'i9', 'j11', 'k13', 'l15'];

function pctl(values, p) {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.ceil((p / 100) * s.length) - 1)];
}
function summarize(values) {
  const s = [...values].sort((a, b) => a - b);
  const bucket = (n) => values.filter((v) => v > n).length;
  return {
    n: values.length,
    p50: pctl(values, 50),
    p95: pctl(values, 95),
    p99: pctl(values, 99),
    max: s.at(-1) ?? null,
    mean: values.length ? Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 100) / 100 : null,
    gt300: bucket(300),
    gt500: bucket(500),
    gt1000: bucket(1000),
    gt2000: bucket(2000),
  };
}

/** 在页面里埋观察器：记录点击 epoch、棋盘石子数首次增加 epoch、广播到达→渲染 */
async function arm(page) {
  await page.evaluate(() => {
    const w = window;
    w.__m = { clickAt: null, firstStoneAt: null, prevCount: document.querySelectorAll('.gk-stone').length, reqStart: w.__dcLatency?.lastMove?.requestId ?? null };
    w.__obs?.disconnect();
    const svg = document.querySelector('.gk-board svg');
    if (!svg) return;
    w.__obs = new MutationObserver(() => {
      const n = document.querySelectorAll('.gk-stone').length;
      if (w.__m.firstStoneAt == null && n > w.__m.prevCount) {
        w.__m.firstStoneAt = performance.timeOrigin + performance.now();
      }
    });
    w.__obs.observe(svg, { childList: true, subtree: true });
    document.addEventListener(
      'pointerdown',
      () => {
        if (w.__m.clickAt == null) w.__m.clickAt = performance.timeOrigin + performance.now();
      },
      { capture: true, once: true },
    );
  });
}

async function readMarks(page) {
  return page.evaluate(() => {
    const m = window.__m;
    return {
      clickAt: m.clickAt,
      firstStoneAt: m.firstStoneAt,
      stones: document.querySelectorAll('.gk-stone').length,
      latency: window.__dcLatency ?? null,
    };
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const ctxA = await browser.newContext({ viewport: { width: 1280, height: 720 }, locale: 'zh-CN' });
  const ctxB = await browser.newContext({ viewport: { width: 1280, height: 720 }, locale: 'zh-CN' });
  const A = await ctxA.newPage();
  const B = await ctxB.newPage();
  A.on('console', (m) => { if (m.type() === 'error') console.error('[A]', m.text()); });
  B.on('console', (m) => { if (m.type() === 'error') console.error('[B]', m.text()); });

  await A.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
  await A.locator('.create-card.gomoku .gc-create-btn').click();
  await A.waitForURL(/\/r\/[a-z2-9]{10}/, { timeout: 30000 });
  const roomId = A.url().split('/r/')[1];
  await A.locator('.conn-pill.ok').waitFor({ timeout: 30000 });

  await B.goto(`${BASE}/r/${roomId}`, { waitUntil: 'domcontentloaded' });
  await B.locator('.conn-pill.ok').waitFor({ timeout: 30000 });
  await B.locator('.waiting-overlay').waitFor({ state: 'detached', timeout: 30000 }).catch(() => {});
  await sleep(800);

  const rows = [];
  const moverVisible = [];
  const peerVisible = [];
  for (let i = 0; i < MOVES; i++) {
    const mover = i % 2 === 0 ? A : B;
    const peer = i % 2 === 0 ? B : A;
    const pt = i % 2 === 0 ? A_PTS[Math.floor(i / 2)] : B_PTS[Math.floor(i / 2)];
    await arm(mover);
    await arm(peer);
    const before = await readMarks(mover);
    await mover.locator(`.gk-board [data-pt="${pt}"]`).click({ force: true });
    // 等 ack（lastMove.requestId 变化且 ackAt 非空）
    await mover.waitForFunction(
      (prev) => {
        const l = window.__dcLatency?.lastMove;
        return l && l.requestId !== prev && l.ackAt != null;
      },
      before.latency?.lastMove?.requestId ?? null,
      { timeout: 30000 },
    );
    await sleep(60);
    const mv = await readMarks(mover);
    const pv = await readMarks(peer);
    const mvMs = mv.firstStoneAt != null && mv.clickAt != null ? Math.round((mv.firstStoneAt - mv.clickAt) * 100) / 100 : null;
    const pvMs = pv.firstStoneAt != null && mv.clickAt != null ? Math.round((pv.firstStoneAt - mv.clickAt) * 100) / 100 : null;
    if (mvMs != null) moverVisible.push(mvMs);
    if (pvMs != null) peerVisible.push(pvMs);
    rows.push({
      i,
      pt,
      mover: i % 2 === 0 ? 'A' : 'B',
      moverVisibleMs: mvMs,
      peerVisibleMs: pvMs,
      ackMs: mv.latency?.lastMove?.ackMs ?? null,
      rttMs: mv.latency?.rttMs ?? null,
      transport: mv.latency?.transport ?? null,
      serverTotalMs: mv.latency?.lastMove?.serverTiming?.totalMs ?? null,
      serverPersistMs: mv.latency?.lastMove?.serverTiming?.persistMs ?? null,
      renderMs: mv.latency?.renderMs ?? null,
      ok: mv.latency?.lastMove?.ok ?? null,
    });
    // 等对端画面追上，避免下一手 revision 过期
    await peer.waitForFunction((n) => document.querySelectorAll('.gk-stone').length >= n, mv.stones, { timeout: 30000 });
    await sleep(40);
  }

  const result = {
    label: LABEL,
    url: BASE,
    roomId,
    moves: MOVES,
    transport: rows[0]?.transport ?? null,
    rttMedian: rows.map((r) => r.rttMs).filter((v) => v != null).sort((a, b) => a - b)[Math.floor(rows.filter((r) => r.rttMs != null).length / 2)] ?? null,
    moverVisible: summarize(moverVisible),
    peerVisible: summarize(peerVisible),
    ack: summarize(rows.map((r) => r.ackMs).filter((v) => v != null)),
    rows,
    ranAt: new Date().toISOString(),
  };
  console.log(JSON.stringify(result, null, 2));
  mkdirSync(OUT.replace(/[\\/][^\\/]+$/, ''), { recursive: true });
  writeFileSync(OUT, JSON.stringify(result, null, 2));
  await browser.close();
}

main().catch((e) => {
  console.error('BROWSER LATENCY FAILED:', e?.stack || e);
  process.exit(1);
});
