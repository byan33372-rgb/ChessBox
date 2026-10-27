import { chromium } from '@playwright/test';
import { mkdirSync } from 'fs';
import { join } from 'path';

const outDir = join(process.cwd(), 'shots');
mkdirSync(outDir, { recursive: true });

const BASE = process.env.SHOT_BASE ?? 'http://127.0.0.1:3001';

async function clickSquare(page, sq) {
  await page.locator(`button[aria-label^="${sq} "], button[aria-label="${sq}"]`).first().click();
}

async function newPage(browser, ctxOpts = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, locale: 'zh-CN', ...ctxOpts });
  return ctx.newPage();
}

async function main() {
  const browser = await chromium.launch({ channel: 'chrome' });

  // 1. 首页
  const pHome = await newPage(browser);
  await pHome.goto(BASE + '/');
  await pHome.waitForTimeout(600);
  await pHome.screenshot({ path: join(outDir, '01-home-desktop.png'), fullPage: true });

  // 2. 中国象棋房间（双人 + 几步棋）
  const pA = await newPage(browser);
  await pA.goto(BASE + '/');
  await pA.locator('.create-card.xiangqi').click();
  await pA.waitForURL(/\/r\//);
  await pA.locator('.waiting-overlay').waitFor({ state: 'visible' });
  const roomUrl = pA.url();

  const pB = await newPage(browser);
  await pB.goto(roomUrl);
  await pA.locator('.waiting-overlay').waitFor({ state: 'hidden', timeout: 10000 });

  // 走四步：炮二平五 / 马8进7 / 马八进七 / 马2进3
  const moves = [
    [pA, 'h7', 'e7'],
    [pB, 'h0', 'g2'],
    [pA, 'b9', 'c7'],
    [pB, 'b0', 'c2'],
  ];
  for (const [page, from, to] of moves) {
    await clickSquare(page, from);
    await clickSquare(page, to);
    await page.waitForTimeout(250);
  }
  // 选中一个棋子展示合法点提示
  await clickSquare(pA, 'e7');
  await pA.waitForTimeout(300);
  await pA.screenshot({ path: join(outDir, '02-xiangqi-room-desktop.png'), fullPage: true });

  // 3. 国际象棋房间
  const pC = await newPage(browser);
  await pC.goto(BASE + '/');
  await pC.locator('.create-card.chess').click();
  await pC.waitForURL(/\/r\//);
  const chessUrl = pC.url();
  const pD = await newPage(browser);
  await pD.goto(chessUrl);
  await pC.locator('.waiting-overlay').waitFor({ state: 'hidden', timeout: 10000 });
  const chessMoves = [
    [pC, 'e2', 'e4'],
    [pD, 'e7', 'e5'],
    [pC, 'g1', 'f3'],
    [pD, 'b8', 'c6'],
    [pC, 'f1', 'c4'],
  ];
  for (const [page, from, to] of chessMoves) {
    await clickSquare(page, from);
    await clickSquare(page, to);
    await page.waitForTimeout(250);
  }
  await clickSquare(pD, 'g8');
  await pD.waitForTimeout(300);
  await pD.screenshot({ path: join(outDir, '03-chess-room-desktop.png'), fullPage: true });

  // 4. 移动端视口（375×667）
  const pMob = await newPage(browser, { viewport: { width: 375, height: 667 } });
  await pMob.goto(roomUrl);
  await pMob.locator('.conn-pill.ok').waitFor({ timeout: 10000 });
  await pMob.waitForTimeout(400);
  await pMob.screenshot({ path: join(outDir, '04-xiangqi-mobile.png'), fullPage: true });

  await pMob.locator('.replay-controls [aria-label="下一步"]').scrollIntoViewIfNeeded();
  await pMob.screenshot({ path: join(outDir, '05-xiangqi-mobile-scrolled.png'), fullPage: true });

  await browser.close();
  console.log('DONE ' + outDir);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
