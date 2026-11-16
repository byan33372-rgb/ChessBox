/**
 * 断线重连测试（阶段八 TEST-008/010）：真实浏览器 + TCP 延迟代理。
 * 流程：建房/加入 → 走一手 → 杀掉代理（断网）→ 2.5s 后恢复 → 等自动重连/重进房 → 再走一手并校验双方一致。
 *
 * 用法：node scripts/latency-reconnect.mjs --url http://127.0.0.1:3202 --delay 80
 */
import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, cur, i, arr) => {
    if (cur.startsWith('--')) acc.push([cur.slice(2), arr[i + 1] && !arr[i + 1].startsWith('--') ? arr[i + 1] : 'true']);
    return acc;
  }, []),
);
const BASE = (args.url || 'http://127.0.0.1:3202').replace(/\/$/, '');
const PORT = Number(new URL(BASE).port || 3202);
const TARGET = Number(args.target || 3001);
const DELAY = Number(args.delay || 80);
const OUT = args.out || 'docs/latency/raw/reconnect.json';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let proxy = null;
function startProxy() {
  proxy = spawn(process.execPath, ['scripts/latency-proxy.mjs', '--listen', String(PORT), '--target', String(TARGET), '--delay', String(DELAY), '--jitter', '10'], {
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  proxy.stdout.on('data', (d) => process.stdout.write(`[proxy] ${d}`));
}
async function stopProxy() {
  if (!proxy) return;
  proxy.kill('SIGKILL');
  proxy = null;
  await sleep(400);
}

async function main() {
  startProxy();
  await sleep(700);
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const ctxA = await browser.newContext({ viewport: { width: 1280, height: 720 }, locale: 'zh-CN' });
  const ctxB = await browser.newContext({ viewport: { width: 1280, height: 720 }, locale: 'zh-CN' });
  const A = await ctxA.newPage();
  const B = await ctxB.newPage();
  const errors = [];
  for (const [name, p] of [['A', A], ['B', B]]) {
    p.on('console', (m) => { if (m.type() === 'error') errors.push(`${name}: ${m.text()}`); });
    p.on('pageerror', (e) => errors.push(`${name}: ${e.message}`));
  }

  await A.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
  await A.locator('.create-card.gomoku .gc-create-btn').click();
  await A.waitForURL(/\/r\/[a-z2-9]{10}/, { timeout: 30000 });
  const roomId = A.url().split('/r/')[1];
  await A.locator('.conn-pill.ok').waitFor({ timeout: 30000 });
  await B.goto(`${BASE}/r/${roomId}`, { waitUntil: 'domcontentloaded' });
  await B.locator('.conn-pill.ok').waitFor({ timeout: 30000 });
  await sleep(800);

  const stones = (p) => p.locator('.gk-stone').count();
  await A.locator('.gk-board [data-pt="a1"]').click({ force: true });
  await B.waitForFunction(() => document.querySelectorAll('.gk-stone').length >= 1, null, { timeout: 30000 });
  const before = { a: await stones(A), b: await stones(B) };

  // 断网
  const tDown = Date.now();
  await stopProxy();
  await sleep(2500);
  // 恢复
  startProxy();
  await sleep(500);
  const tUp = Date.now();

  // 等两端回到已连接且重进房（conn-pill.ok 在重连中会消失/变 warn）
  await A.locator('.conn-pill.ok').waitFor({ timeout: 40000 });
  await B.locator('.conn-pill.ok').waitFor({ timeout: 40000 });
  const tReconnected = Date.now();
  // 等状态恢复（棋子数不丢）
  await A.waitForFunction((n) => document.querySelectorAll('.gk-stone').length === n, before.a, { timeout: 30000 });
  await B.waitForFunction((n) => document.querySelectorAll('.gk-stone').length === n, before.b, { timeout: 30000 });

  // 恢复后继续走一手（a1 后轮次在 b）
  const turnOk = await B.evaluate(() => !!document.querySelector('.status-line'));
  await B.locator('.gk-board [data-pt="a15"]').click({ force: true });
  await A.waitForFunction(() => document.querySelectorAll('.gk-stone').length >= 2, null, { timeout: 30000 });
  const after = { a: await stones(A), b: await stones(B) };

  // 断网期间的 ERR_CONNECTION_REFUSED 是预期现象；其它错误才算失败
  const expected = errors.filter((e) => /ERR_CONNECTION_REFUSED/.test(e));
  const unexpected = errors.filter((e) => !/ERR_CONNECTION_REFUSED/.test(e));
  const result = {
    roomId,
    proxy: { port: PORT, delayMs: DELAY },
    offlineMs: tUp - tDown,
    reconnectMs: tReconnected - tUp,
    before,
    after,
    turnOk,
    expectedNetworkErrors: expected.length,
    consoleErrors: unexpected,
    ok: after.a === 2 && after.b === 2 && unexpected.length === 0,
    ranAt: new Date().toISOString(),
  };
  console.log(JSON.stringify(result, null, 2));
  mkdirSync(OUT.replace(/[\\/][^\\/]+$/, ''), { recursive: true });
  writeFileSync(OUT, JSON.stringify(result, null, 2));
  await browser.close();
  await stopProxy();
  process.exit(result.ok ? 0 : 1);
}
main().catch(async (e) => {
  console.error('RECONNECT FAILED:', e?.stack || e);
  await stopProxy();
  process.exit(1);
});
