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
const click = (p, sq) => p.locator(`button[aria-label^="${sq} "], button[aria-label="${sq}"]`).first().click();
await pA.goto(BASE + '/');
await pA.locator('.create-card.chess .gc-create-btn').click();
await pA.waitForURL(/\/r\//);
await pB.goto(pA.url());
await pA.locator('.waiting-overlay').waitFor({ state: 'hidden', timeout: 10000 });
await pA.locator('.conn-pill.ok').waitFor({ timeout: 15000 });
await pB.locator('.conn-pill.ok').waitFor({ timeout: 15000 });
const seq = [
  [pA, 'a2', 'a4'], [pB, 'b7', 'b5'],
  [pA, 'a4', 'b5'], [pB, 'a7', 'a6'],
  [pA, 'b5', 'a6'], [pB, 'g8', 'f6'],
  [pA, 'a6', 'a7'], [pB, 'h7', 'h6'],
];
for (const [p, from, to] of seq) {
  await click(p, from); await click(p, to);
  await p.waitForTimeout(300);
}
console.log('moves=', await pA.locator('.move-btn').count());
// a7 状态诊断
const d = await pA.evaluate(() => {
  const a7 = [...document.querySelectorAll('button[aria-label^="a7 "]')][0];
  const b8 = [...document.querySelectorAll('button[aria-label^="b8 "]')][0];
  return { a7: a7?.getAttribute('aria-label'), b8: b8?.getAttribute('aria-label'), turn: document.querySelector('.status-line')?.textContent };
});
console.log('diag=', JSON.stringify(d));
await click(pA, 'a7');
await pA.waitForTimeout(120);
console.log('after a7: sel=', await pA.locator('.chess-sq.selected').count());
await click(pA, 'b8');
await pA.waitForTimeout(120);
console.log('after b8: promo=', await pA.locator('.promo-card').count(), 'sel=', await pA.locator('.chess-sq.selected').count());
await browser.close();
