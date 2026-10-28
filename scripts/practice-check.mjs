/** 首页试玩沙盒交互测试：真实点击选子/落子，验证棋盘更新 */
import { chromium } from '@playwright/test';

const BASE = 'http://127.0.0.1:3001';
const browser = await chromium.launch({ channel: 'chrome' });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
page.on('pageerror', (e) => errors.push(String(e)));
await page.goto(BASE + '/');
await page.waitForTimeout(500);

// —— 中国象棋卡：点击红炮 h7（首页第一块棋盘）——
const xqCard = page.locator('.create-card.xiangqi');
const selBefore = await xqCard.locator('.xq-sel-ring').count();
await xqCard.locator('button[aria-label^="h7 "], button[aria-label="h7"]').first().click();
await page.waitForTimeout(200);
const selAfter = await xqCard.locator('.xq-sel-ring').count();
const dots = await xqCard.locator('.xq-target-dot, .xq-target-ring').count();
console.log(`选中环: before=${selBefore} after=${selAfter}, 合法落点=${dots}`);
await xqCard.locator('button[aria-label^="e7 "], button[aria-label="e7"]').first().click();
await page.waitForTimeout(300);
const turn = await xqCard.locator('.practice-turn').textContent();
console.log(`走子后轮次提示: ${turn}`);
await page.screenshot({ path: 'shots/r2-practice-xq-moved.png', fullPage: false });

// —— 国象卡：e2→e4 ——
const chCard = page.locator('.create-card.chess');
await chCard.locator('button[aria-label^="e2 "], button[aria-label="e2"]').first().click();
await page.waitForTimeout(200);
const chDots = await chCard.locator('.chess-dot').count();
console.log(`国象选中后合法点: ${chDots}`);
await chCard.locator('button[aria-label^="e4 "], button[aria-label="e4"]').first().click();
await page.waitForTimeout(300);
const chTurn = await chCard.locator('.practice-turn').textContent();
console.log(`国象走子后: ${chTurn}`);
await page.screenshot({ path: 'shots/r2-practice-chess-moved.png', fullPage: false });

// —— 验证创建房间按钮不受试玩影响 ——
await page.locator('.create-card.chess .gc-create-btn').click();
await page.waitForURL(/\/r\//, { timeout: 15000 });
console.log('创建房间成功:', page.url());

console.log('console errors:', JSON.stringify(errors));
await browser.close();
