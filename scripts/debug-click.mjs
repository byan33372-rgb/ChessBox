import { chromium } from '@playwright/test';
const BASE = 'http://127.0.0.1:3001';
const browser = await chromium.launch({ channel: 'chrome' });
const ctxA = await browser.newContext({ viewport: { width: 1280, height: 800 } });
const ctxB = await browser.newContext({ viewport: { width: 1280, height: 800 } });
const pA = await ctxA.newPage();
const pB = await ctxB.newPage();
for (const p of [pA, pB]) {
  p.on('console', (m) => { if (m.type() === 'error') console.log('CONSOLE:', m.text().slice(0, 300)); });
  p.on('pageerror', (e) => console.log('PAGEERROR:', String(e).slice(0, 400)));
}
await pA.goto(BASE + '/');
await pA.locator('.create-card.xiangqi .gc-create-btn').click();
await pA.waitForURL(/\/r\//);
await pB.goto(pA.url());
await pA.locator('.waiting-overlay').waitFor({ state: 'hidden', timeout: 10000 });
await pA.locator('.conn-pill.ok').waitFor({ timeout: 15000 });
await pB.locator('.conn-pill.ok').waitFor({ timeout: 15000 });
console.log('both joined; status=', await pA.locator('.status-line').textContent());

await pA.locator('button[aria-label^="h7 "]').first().click({ timeout: 4000 });
console.log('after h7: selRing=', await pA.locator('.xq-sel-ring').count());
await pA.locator('button[aria-label="e7"]').first().click({ timeout: 4000 });
console.log('after e7: selRing=', await pA.locator('.xq-sel-ring').count(), 'moves=', await pA.locator('.move-btn').count());
await pA.waitForTimeout(900);
console.log('after 900ms: fly=', await pA.locator('.xq-anim-fly').count(), 'moves=', await pA.locator('.move-btn').count(), 'e7炮=', await pA.locator('button[aria-label="e7 红炮"]').count());
await browser.close();
