/** 房间内选座 + 六色跳棋沙盒 截图验证 */
import { chromium } from 'playwright';
const b = await chromium.launch({ channel: 'chrome' });
const A = await (await b.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
await A.goto('http://127.0.0.1:3001/');
await A.locator('.create-card').first().waitFor();
await A.waitForTimeout(800);
await A.screenshot({ path: 'docs/acceptance/screenshots/seat2-01-home-sixcolor-checkers.png' });
// 建中象房 → 等待阶段选黑方
await A.locator('.create-card.xiangqi .gc-create-btn').click();
await A.waitForURL(/\/r\//);
await A.waitForTimeout(800);
const pickCount = await A.locator('.player-card.pickable').count();
await A.screenshot({ path: 'docs/acceptance/screenshots/seat2-02-room-pick-seat.png' });
await A.locator('.player-card.pickable').click();
await A.waitForTimeout(600);
const seatA = await A.locator('.my-seat').textContent();
await A.screenshot({ path: 'docs/acceptance/screenshots/seat2-03-picked-black.png' });
// 朋友加入（自动红方）
const room = A.url().split('/r/')[1];
const B = await (await b.newContext()).newPage();
await B.goto('http://127.0.0.1:3001/r/' + room);
await B.locator('.conn-pill.ok').waitFor();
await A.waitForTimeout(700);
const seatB = await B.locator('.my-seat').textContent();
console.log(JSON.stringify({ pickable: pickCount, creator: seatA?.trim(), joiner: seatB?.trim() }));
await b.close();
process.exit(0);
