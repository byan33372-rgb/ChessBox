/** 探针：复盘导航（开局→当前）后能否立即走棋 + 各步状态。 */
import { chromium } from '@playwright/test';

const BASE = 'http://127.0.0.1:3001';
const browser = await chromium.launch({ channel: 'chrome', headless: false });
const SEL = (sq) => `button[aria-label^="${sq} "], button[aria-label="${sq}"]`;
const click = (p, sq) => p.evaluate((sel) => document.querySelector(sel)?.click(), SEL(sq));
const label = (p, sq) => p.evaluate((s) => document.querySelector(`button[aria-label^="${s} "]`)?.getAttribute('aria-label') ?? null, sq);
async function move(p, f, t) {
  const c0 = await p.locator('.move-btn').count();
  await click(p, f); await click(p, t);
  const ok = await p.waitForFunction((c) => document.querySelectorAll('.move-btn').length > c, c0, { timeout: 6000, polling: 30 }).then(() => true).catch(() => false);
  console.log(`move ${f}->${t}: ${ok ? 'OK' : 'FAIL'}`);
  return ok;
}
const ctxA = await browser.newContext({ viewport: { width: 1280, height: 800 } });
const ctxB = await browser.newContext({ viewport: { width: 1280, height: 800 } });
const pA = await ctxA.newPage(); const pB = await ctxB.newPage();
await pA.goto(BASE + '/');
await pA.locator('.create-card.xiangqi .gc-create-btn').click();
await pA.waitForURL(/\/r\//);
await pB.goto(pA.url());
await pA.locator('.waiting-overlay').waitFor({ state: 'hidden', timeout: 15000 });
await pA.locator('.conn-pill.ok').waitFor({ timeout: 15000 });
await pB.locator('.conn-pill.ok').waitFor({ timeout: 15000 });
await move(pA, 'h7', 'e7'); await move(pB, 'h0', 'g2'); await move(pA, 'h9', 'g7'); await move(pB, 'b0', 'c2');

const btn = (t) => pA.locator('.move-nav button', { hasText: t });
await btn('开局').click(); await pA.waitForTimeout(400);
console.log('after 开局: e7=', await label(pA, 'e7'), 'h7=', await label(pA, 'h7'), 'banner=', await pA.evaluate(() => document.body.textContent.includes('正在复盘') || document.body.textContent.includes('回到实时')));
await btn('当前').click(); await pA.waitForTimeout(400);
console.log('after 当前: e7=', await label(pA, 'e7'), 'h7=', await label(pA, 'h7'), 'banner=', await pA.evaluate(() => document.body.textContent.includes('回到实时')));
const okMove = await move(pA, 'e7', 'e6');
console.log('after move: e6=', await label(pA, 'e6'), 'moves=', await pA.locator('.move-btn').count());
await browser.close();