/** 探针：第三人（观战）进入房间后的身份标签与操作面板状态。 */
import { chromium } from '@playwright/test';

const BASE = 'http://127.0.0.1:3001';
const browser = await chromium.launch({ channel: 'chrome', headless: false });
async function newCtx() { return browser.newContext({ viewport: { width: 1280, height: 800 } }); }
const cA = await newCtx(); const cB = await newCtx(); const cC = await newCtx();
const pA = await cA.newPage(); const pB = await cB.newPage(); const pC = await cC.newPage();
await pA.goto(BASE + '/');
await pA.locator('.create-card.xiangqi .gc-create-btn').click();
await pA.waitForURL(/\/r\//);
const url = pA.url();
console.log('room url:', url, 'topbar:', await pA.locator('.room-code, .room-meta, header').first().textContent().catch(() => '?'));
await pB.goto(url);
await pA.locator('.waiting-overlay').waitFor({ state: 'hidden', timeout: 15000 });
await pB.locator('.conn-pill.ok').waitFor({ timeout: 15000 });
console.log('A topbar:', (await pA.locator('header').textContent()).slice(0, 60));
const namesA = await pA.evaluate(() => [...document.querySelectorAll('.player-card, .seat-card, .player')].map((e) => e.textContent.trim().slice(0, 30)));
console.log('A player panels:', JSON.stringify(namesA));
await pC.goto(url);
await pC.locator('.conn-pill.ok').waitFor({ timeout: 15000 });
await pC.waitForTimeout(1200);
const dump = async (p, tag) => {
  const d = await p.evaluate(() => {
    const seatText = document.querySelector('.my-seat')?.textContent?.trim() ?? null;
    const spectatorHint = !!document.body.textContent.match(/你正在观战/);
    const actionVisible = [...document.querySelectorAll('button')].some((b) => b.textContent.trim() === '认输' && b.offsetParent !== null);
    const actionDisabled = [...document.querySelectorAll('button')].filter((b) => b.textContent.trim() === '认输').map((b) => b.disabled);
    const panels = [...document.querySelectorAll('.player-card, .seat-card, .player')].map((e) => e.textContent.trim().slice(0, 30));
    return { seatText, spectatorHint, actionVisible, actionDisabled, panels };
  });
  console.log(tag, JSON.stringify(d));
};
await dump(pA, 'A:');
await dump(pC, 'C(third):');
console.log('C url:', pC.url());
await browser.close();