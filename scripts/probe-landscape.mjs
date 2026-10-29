/** 横屏 667×375 房间截图证据（FIX-002 验证）。 */
import { chromium } from '@playwright/test';

const BASE = 'http://127.0.0.1:3001';
const browser = await chromium.launch({ channel: 'chrome' });
const ctxA = await browser.newContext({ viewport: { width: 667, height: 375 } });
const ctxB = await browser.newContext({ viewport: { width: 1280, height: 800 } });
const pA = await ctxA.newPage();
const pB = await ctxB.newPage();
await pA.goto(BASE + '/');
await pA.locator('.create-card.xiangqi .gc-create-btn').click();
await pA.waitForURL(/\/r\//);
const url = pA.url();
await pB.goto(url);
await pA.locator('.waiting-overlay').waitFor({ state: 'hidden', timeout: 15000 });
await pA.locator('.conn-pill.ok').waitFor({ timeout: 15000 });
await pA.waitForTimeout(400);
const size = await pA.evaluate(() => {
  const b = document.querySelector('.xq-board').getBoundingClientRect();
  const cell = document.querySelector('.board-hotspot').getBoundingClientRect();
  return { board: { w: +b.width.toFixed(0), h: +b.height.toFixed(0) }, cell: +cell.width.toFixed(1), overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth };
});
console.log('landscape 667x375:', JSON.stringify(size));
await pA.screenshot({ path: 'docs/acceptance/shots/xiangqi-landscape667x375.png', fullPage: true });
await browser.close();