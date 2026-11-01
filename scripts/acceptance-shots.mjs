/** VIS-012：真实运行页面的验收截图（Playwright + 生产构建服务）。输出 docs/acceptance/screenshots/ */
import { chromium } from '@playwright/test';
import { mkdirSync } from 'fs';

const BASE = process.env.SHOT_BASE ?? 'http://127.0.0.1:3001';
const OUT = 'docs/acceptance/screenshots';
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ channel: 'chrome' });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
const page = await ctx.newPage();

async function shot(name) {
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: false });
  console.log(`shot: ${name}`);
}

// 1 首页
await page.goto(BASE);
await page.locator('.create-card.checkers').waitFor();
await page.waitForTimeout(600);
await shot('01-home-three-games');

// 2 中象对局 + 上一手标记
await page.locator('.create-card.xiangqi .gc-create-btn').click();
await page.waitForURL(/\/r\//);
const ctxB = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const pageB = await ctxB.newPage();
await pageB.goto(page.url());
await pageB.locator('.conn-pill.ok').waitFor();
await page.waitForTimeout(400);
await page.locator('button[aria-label^="h7 "]').click();
await page.locator('button[aria-label="e7"]').click();
await page.waitForTimeout(900);
await shot('02-xiangqi-lastmove-markers');

// 3 国象对局
await page.goto(`${BASE}/`);
await page.locator('.create-card.chess .gc-create-btn').click();
await page.waitForURL(/\/r\//);
await pageB.goto(page.url());
await pageB.locator('.conn-pill.ok').waitFor();
await page.waitForTimeout(400);
await page.locator('button[aria-label^="e2 "]').click();
await page.locator('button[aria-label="e4"]').first().click();
await page.waitForTimeout(900);
await shot('03-chess-lastmove-markers');

// 4 跳棋对局 + 连跳路径
await page.goto(`${BASE}/`);
await page.locator('.create-card.checkers .gc-create-btn').click();
await page.waitForURL(/\/r\//);
await pageB.goto(page.url());
await pageB.locator('.conn-pill.ok').waitFor();
await page.waitForTimeout(400);
await page.locator('.checkers-hit[data-cell="f4"]').click();
await page.locator('.checkers-hit[data-cell="f5"]').click();
await page.waitForTimeout(500);
await pageB.locator('.checkers-hit[data-cell="m14"]').click();
await pageB.locator('.checkers-hit[data-cell="m13"]').click();
await page.waitForTimeout(400);
await page.locator('.checkers-hit[data-cell="e3"]').click();
await page.locator('.checkers-hit[data-cell="e5"]').click();
await page.locator('.checkers-hit[data-cell="g5"]').click();
await page.waitForTimeout(900);
await shot('04-checkers-chain-path');

// 5 历史回放定位（跳棋 3 步后回看第 2 步）
await page.locator('.recent-item', { hasText: 'm14→m13' }).first().click();
await page.waitForTimeout(500);
await shot('05-replay-ply2');

// 6 移动端 375 视口（跳棋房）
await page.setViewportSize({ width: 375, height: 812 });
await page.locator('.replay-banner .btn').click();
await page.waitForTimeout(600);
await shot('06-mobile-375-checkers');

await browser.close();
console.log('done');
process.exit(0);
