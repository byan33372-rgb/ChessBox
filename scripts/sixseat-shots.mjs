/** 六阵营面板 + 房间内选座 截图验证 */
import { chromium } from 'playwright';
const b = await chromium.launch({ channel: 'chrome' });
const A = await (await b.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
await A.goto('http://127.0.0.1:3001/');
await A.locator('.create-card.checkers').waitFor();
await A.waitForTimeout(500);
await A.screenshot({ path: 'docs/acceptance/screenshots/six-01-home-seat-hint.png' });
// 跳棋 2 人容量房 → 六阵营面板
await A.locator('.create-card.checkers .gc-create-btn').click();
await A.waitForURL(/\/r\//);
await A.waitForTimeout(700);
const choices = await A.locator('.seat-panel .seat-choice').count();
await A.screenshot({ path: 'docs/acceptance/screenshots/six-02-room-six-seat-panel.png' });
// 选红方
await A.locator('.seat-panel .seat-choice', { hasText: '红方' }).first().click();
await A.waitForTimeout(500);
const seatA = await A.locator('.my-seat').textContent();
await A.screenshot({ path: 'docs/acceptance/screenshots/six-03-picked-red.png' });
// 第二人（独立上下文）选蓝方
const room = A.url().split('/r/')[1];
const B = await (await b.newContext()).newPage();
await B.goto('http://127.0.0.1:3001/r/' + room);
await B.locator('.conn-pill.ok').waitFor();
await B.waitForTimeout(400);
await B.locator('.seat-panel .seat-choice', { hasText: '蓝方' }).first().click();
await A.waitForTimeout(700);
const seatB = await B.locator('.my-seat').textContent();
const overlay = await A.locator('.waiting-overlay').count();
await A.screenshot({ path: 'docs/acceptance/screenshots/six-04-two-seated-playing.png' });
console.log(JSON.stringify({ choices, creator: seatA?.trim(), joiner: seatB?.trim(), waitingOverlay: overlay }));
await b.close();
process.exit(0);
