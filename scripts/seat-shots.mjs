/** 阵营选择 + 更名截图验证 */
import { chromium } from 'playwright';
const b = await chromium.launch({ channel: 'chrome' });
const A = await (await b.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
await A.goto('http://127.0.0.1:3001/');
await A.locator('.create-card.xiangqi').waitFor();
await A.waitForTimeout(600);
await A.screenshot({ path: 'docs/acceptance/screenshots/seat-01-home-rename.png' });
// 选黑方建房
await A.locator('.create-card.xiangqi .seat-side-btn', { hasText: '黑方后手' }).click();
await A.locator('.create-card.xiangqi .gc-create-btn').click();
await A.waitForURL(/\/r\//);
await A.waitForTimeout(600);
const seat = await A.locator('.my-seat').textContent();
const title = await A.title();
await A.screenshot({ path: 'docs/acceptance/screenshots/seat-02-room-black-waiting.png' });
// 对手加入（红方）并走一步
const room = A.url().split('/r/')[1];
const B = await (await b.newContext()).newPage();
await B.goto('http://127.0.0.1:3001/r/' + room);
await B.locator('.conn-pill.ok').waitFor();
await A.waitForTimeout(500);
const seatB = await B.locator('.my-seat').textContent();
await B.locator('button[aria-label^="h7 "]').click();
await B.locator('button[aria-label="e7"]').click();
await A.waitForTimeout(700);
await A.screenshot({ path: 'docs/acceptance/screenshots/seat-03-room-black-playing.png' });
console.log(JSON.stringify({ title, creator: seat?.trim(), joiner: seatB?.trim() }));
await b.close();
process.exit(0);
