/**
 * 全交互界面截图（VIS 全量）：真实浏览器 + 生产构建服务。
 * 输出 docs/acceptance/screenshots/full/*.png
 */
import { chromium } from '@playwright/test';
import { mkdirSync } from 'fs';

const BASE = process.env.SHOT_BASE ?? 'http://127.0.0.1:3300';
const OUT = 'docs/acceptance/screenshots/full';
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ channel: 'chrome' });
const ctxA = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const ctxB = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const A = await ctxA.newPage();
const B = await ctxB.newPage();

const shot = async (page, name, fullPage = false) => {
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage });
  console.log(`shot: ${name}`);
};

const mkRoom = async (kind, seatCount) => {
  await A.goto(`${BASE}/`);
  await A.locator(`.create-card.${kind}`).waitFor();
  if (seatCount) await A.locator('.create-card.checkers .seat-count-btn').filter({ hasText: `${seatCount}人` }).click();
  await A.locator(`.create-card.${kind} .gc-create-btn`).click();
  await A.waitForURL(/\/r\/[a-z2-9]{10}/, { timeout: 15000 });
  return A.url().split('/r/')[1];
};
const join = async (page, roomId) => {
  await page.goto(`${BASE}/r/${roomId}`);
  await page.locator('.conn-pill.ok').waitFor({ timeout: 15000 });
};
const clickSq = (page, sq) => page.locator(`button[aria-label^="${sq} "], button[aria-label="${sq}"]`).first().click();
const clickCell = async (page, cell) => {
  await page.evaluate(`(() => {
    const el = document.querySelector('.checkers-hit[data-cell="${cell}"]');
    el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
  })()`);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ============ 首页 ============
await A.goto(`${BASE}/`);
await A.locator('.create-card.checkers').waitFor();
await shot(A, '01-home-full', true);
await A.locator('.join-card').scrollIntoViewIfNeeded();
await shot(A, '02-home-join-section');

// ============ 中国象棋 ============
const xqRoom = await mkRoom('xiangqi');
await shot(A, '03-xiangqi-waiting-overlay');
await join(B, xqRoom);
await sleep(600);
await clickSq(A, 'h7'); await clickSq(A, 'e7');
await sleep(700);
await clickSq(B, 'h0'); await clickSq(B, 'g2');
await sleep(900);
await shot(A, '04-xiangqi-playing-markers');
// 聊天
await A.locator('.chat-toggle').click();
await B.locator('.chat-toggle').click();
await B.locator('.chat-input-row input').fill('你好！这盘你先走。');
await B.locator('.chat-input-row button').click();
await sleep(600);
await A.locator('.chat-input-row input').fill('好的，多多指教');
await A.locator('.chat-input-row button').click();
await sleep(500);
await shot(A, '05-xiangqi-chat-open');
// 复盘
await B.locator('.replay-controls [aria-label="上一步"]').click();
await sleep(400);
await shot(B, '06-xiangqi-replay-mode');
await B.locator('.replay-banner .btn').click();
// 悔棋请求（B 视角的请求卡）
await A.locator('.actions-card button:has-text("悔棋")').click();
await sleep(500);
await shot(B, '07-xiangqi-undo-offer-card');
await B.locator('.offer-card button:has-text("拒绝")').click();
// 终局（A 认输）
await A.locator('.actions-card button:has-text("认输")').click();
await sleep(700);
await shot(A, '08-xiangqi-gameover');

// ============ 国际象棋 ============
const chRoom = await mkRoom('chess');
await join(B, chRoom);
await sleep(500);
const rounds = [['e2', 'e4', 'e7', 'e5'], ['g1', 'f3', 'b8', 'c6'], ['f1', 'c4', 'f8', 'c5']];
for (const [wf, wt, bf, bt] of rounds) {
  await clickSq(A, wf); await clickSq(A, wt); await sleep(300);
  await clickSq(B, bf); await clickSq(B, bt); await sleep(300);
}
await clickSq(A, 'e1'); await clickSq(A, 'g1');
await sleep(900);
await shot(A, '09-chess-castle-extra-markers');
// 升变对话框
const chRoom2 = await mkRoom('chess');
await join(B, chRoom2);
await sleep(500);
const promo = [['a2', 'a4', 'b7', 'b5'], ['a4', 'b5', 'a7', 'a6'], ['b5', 'a6', 'g8', 'f6'], ['a6', 'a7', 'h7', 'h6']];
for (const [wf, wt, bf, bt] of promo) {
  await clickSq(A, wf); await clickSq(A, wt); await sleep(250);
  await clickSq(B, bf); await clickSq(B, bt); await sleep(250);
}
await clickSq(A, 'a7'); await clickSq(A, 'b8'); // a7xb8 吃马触发升变（a8 有车，直进非法）
await A.locator('.promo-card').waitFor({ timeout: 5000 });
await shot(A, '10-chess-promotion-dialog');
await A.locator('.promo-btn').first().click();
await sleep(700);
await shot(A, '11-chess-promotion-done');

// ============ 中国跳棋 ============
const ckRoom = await mkRoom('checkers', 2);
await join(B, ckRoom);
await sleep(500);
await clickCell(A, 'f4'); await clickCell(A, 'f5');
await sleep(400);
await clickCell(B, 'm14'); await clickCell(B, 'm13');
await sleep(400);
await clickCell(A, 'e3'); await clickCell(A, 'e5');
await sleep(400);
await shot(A, '12-checkers-chain-banner');
await clickCell(A, 'g5');
await sleep(900);
await shot(A, '13-checkers-chain-path-markers');
await B.locator('.recent-item', { hasText: 'm14→m13' }).first().click();
await sleep(400);
await shot(B, '14-checkers-replay-ply2');
await B.locator('.replay-banner .btn').click();

// 3 人房座位条（每个加入者独立 context：同 context 共享 localStorage 会 rejoin 成同座位）
const ck3 = await mkRoom('checkers', 3);
const joinFresh = async (roomId) => {
  const c = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const p = await c.newPage();
  await join(p, roomId);
  return c;
};
const ck3ctx1 = await joinFresh(ck3);
const ck3ctx2 = await joinFresh(ck3);
await sleep(600);
await shot(A, '15-checkers-3p-seats');

// 6 人房座位条
const ck6 = await mkRoom('checkers', 6);
await join(B, ck6);
const ctxs6 = [];
for (let i = 0; i < 4; i++) ctxs6.push(await joinFresh(ck6));
await sleep(800);
await shot(A, '16-checkers-6p-seats');

// ============ 移动端 / 平板 ============
const m = await (await browser.newContext({ viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true })).newPage();
await m.goto(`${BASE}/`);
await m.locator('.create-card.checkers').waitFor();
await shot(m, '17-mobile-375-home', true);
await m.goto(`${BASE}/r/${xqRoom}`);
await m.locator('.conn-pill.ok').waitFor();
await sleep(700);
await shot(m, '18-mobile-375-xiangqi-spectator');
await m.goto(`${BASE}/r/${ckRoom}`);
await sleep(700);
await shot(m, '19-mobile-375-checkers');
const t = await (await browser.newContext({ viewport: { width: 768, height: 1024 }, hasTouch: true })).newPage();
await t.goto(`${BASE}/r/${ckRoom}`);
await t.locator('.conn-pill.ok').waitFor();
await sleep(700);
await shot(t, '20-tablet-768-checkers');

// ============ 异常态：不存在的房间 ============
await A.goto(`${BASE}/r/aaaaaaaaaa`);
await A.locator('.fatal-card').waitFor({ timeout: 8000 });
await shot(A, '21-room-not-found-fatal');

await browser.close();
console.log('ALL-SHOTS-DONE');
process.exit(0);
