import { chromium } from '@playwright/test';
import { join } from 'path';

const BASE = process.env.SHOT_BASE ?? 'http://127.0.0.1:3001';
let failures = 0;

function check(name, cond, detail = '') {
  const ok = Boolean(cond);
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
  if (!ok) failures++;
}

async function clickSquare(page, sq) {
  await page.locator(`button[aria-label^="${sq} "], button[aria-label="${sq}"]`).first().click();
}

function watchConsole(page, sink) {
  page.on('console', (msg) => {
    if (msg.type() === 'error') sink.push(msg.text());
  });
  page.on('pageerror', (err) => sink.push(String(err)));
}

async function main() {
  const browser = await chromium.launch({ channel: 'chrome' });
  const errors = [];

  // —— 首页 桌面 ——
  {
    const page = await browser.newContext({ viewport: { width: 1280, height: 800 } }).then((c) => c.newPage());
    watchConsole(page, errors);
    await page.goto(BASE + '/');
    await page.waitForTimeout(500);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    check('首页桌面无横向溢出', overflow <= 0, `overflow=${overflow}px`);
    const cards = await page.locator('.create-card').count();
    check('首页七张创建卡片（五棋+三国杀+UNO）', cards === 7);
    check('跳棋卡含人数选择 4 档', (await page.locator('.create-card.checkers .chk-seat-btn').count()) === 4);
    const cardBox = await page.locator('.create-card.xiangqi').boundingBox();
    check('创建卡片宽度合理', cardBox && cardBox.width > 200 && cardBox.height > 150, JSON.stringify(cardBox));
    const btn = await page.locator('.join-row .btn').evaluate((el) => getComputedStyle(el).minHeight);
    check('加入按钮高度达标', parseFloat(btn) >= 40, `minHeight=${btn}`);
    await page.context().close();
  }

  // —— 象棋房间 桌面 ——
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const ctxB = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const pA = await ctx.newPage();
    watchConsole(pA, errors);
    await pA.goto(BASE + '/');
    await pA.locator('.create-card.xiangqi .gc-create-btn').click();
    await pA.waitForURL(/\/r\//);
    const pB = await ctxB.newPage();
    await pB.goto(pA.url());
    await pA.locator('.waiting-overlay').waitFor({ state: 'hidden', timeout: 10000 });
    await pB.waitForTimeout(400);
    for (const [p, f, t] of [
      [pA, 'h7', 'e7'],
      [pB, 'h0', 'g2'],
      [pA, 'b9', 'c7'],
    ]) {
      await clickSquare(p, f);
      await clickSquare(p, t);
      await p.waitForTimeout(200);
    }
    const overflow = await pA.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    check('象棋房间桌面无横向溢出', overflow <= 0, `overflow=${overflow}px`);
    const board = await pA.locator('.xq-board').boundingBox();
    check('象棋棋盘存在且比例≈0.9', board && Math.abs(board.width / board.height - 0.9) < 0.02, `w/h=${board && (board.width / board.height).toFixed(3)}`);
    const pieces = await pA.locator('.board-overlay > .xq-piece').count();
    check('象棋 32 枚棋子渲染', pieces === 32, `count=${pieces}`);
    // 棋子与热点中心对齐（抽查 5 枚）
    const aligned = await pA.evaluate(() => {
      const pieces = [...document.querySelectorAll('.xq-piece')].slice(0, 5);
      return pieces.every((el) => {
        const r = el.getBoundingClientRect();
        const cx = r.left + r.width / 2;
        const cy = r.top + r.height / 2;
        const board = document.querySelector('.xq-board').getBoundingClientRect();
        const stepX = board.width / 9;
        const stepY = board.height / 10;
        // 中心应落在交叉点网格上（相对 margin 30/540 与 30/600）
        const relX = ((cx - board.left) / board.width) * 540;
        const relY = ((cy - board.top) / board.height) * 600;
        const near = (v, target) => Math.abs(v - target) < 4;
        const gx = (relX - 30) / 60;
        const gy = (relY - 30) / 60;
        return near(gx, Math.round(gx)) && near(gy, Math.round(gy));
      });
    });
    check('象棋棋子对齐交叉点', aligned);
    const sidePanel = await pA.locator('.side-col').boundingBox();
    check('侧栏位于棋盘右侧', sidePanel && board && sidePanel.x >= board.x + board.width - 4, `panel.x=${sidePanel && sidePanel.x}`);
    const moveBtns = await pA.locator('.move-btn').count();
    check('棋谱显示 3 步', moveBtns === 3, `count=${moveBtns}`);
    // 选中显示合法点（此时轮到黑方，由 pB 选黑马）
    await clickSquare(pB, 'g2');
    await pB.waitForTimeout(200);
    const dots = await pB.locator('.xq-target-dot, .xq-target-ring').count();
    check('选中显示合法落点', dots > 0, `dots=${dots}`);
    await ctx.close();
    await ctxB.close();
  }

  // —— 国际象棋房间 桌面 ——
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const ctxD = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const pC = await ctx.newPage();
    watchConsole(pC, errors);
    await pC.goto(BASE + '/');
    await pC.locator('.create-card.chess .gc-create-btn').click();
    await pC.waitForURL(/\/r\//);
    const pD = await ctxD.newPage();
    await pD.goto(pC.url());
    await pC.locator('.waiting-overlay').waitFor({ state: 'hidden', timeout: 10000 });
    for (const [p, f, t] of [
      [pC, 'e2', 'e4'],
      [pD, 'e7', 'e5'],
      [pC, 'g1', 'f3'],
      [pD, 'b8', 'c6'],
    ]) {
      await clickSquare(p, f);
      await clickSquare(p, t);
      await p.waitForTimeout(200);
    }
    const squares = await pC.locator('.chess-sq').count();
    check('国象 64 格', squares === 64, `count=${squares}`);
    const pieces = await pC.locator('.chess-sq .chess-piece').count();
    check('国象 32 枚棋子渲染', pieces === 32, `count=${pieces}`);
    const board = await pC.locator('.chess-board').boundingBox();
    check('国象棋盘为正方形', board && Math.abs(board.width / board.height - 1) < 0.02, `w/h=${board && (board.width / board.height).toFixed(3)}`);
    // 棋子是否在格子内（抽查）
    const inside = await pC.evaluate(() => {
      const pieces = [...document.querySelectorAll('.chess-piece-wrap')].slice(0, 6);
      return pieces.every((el) => {
        const r = el.getBoundingClientRect();
        const sq = el.closest('.chess-sq').getBoundingClientRect();
        return r.left >= sq.left - 1 && r.right <= sq.right + 1 && r.top >= sq.top - 1 && r.bottom <= sq.bottom + 1;
      });
    });
    check('国象棋子位于格子内', inside);
    const coords = await pC.locator('.coord').count();
    check('国象坐标标注存在', coords >= 16, `count=${coords}`);
    await ctx.close();
    await ctxD.close();
  }

  // —— 移动端 375×667 ——
  {
    const ctx = await browser.newContext({ viewport: { width: 375, height: 667 } });
    const ctx2 = await browser.newContext({ viewport: { width: 375, height: 667 } });
    const page = await ctx.newPage();
    watchConsole(page, errors);
    await page.goto(BASE + '/');
    await page.locator('.create-card.xiangqi .gc-create-btn').click();
    await page.waitForURL(/\/r\//);
    await page.locator('.conn-pill.ok').waitFor({ timeout: 10000 });
    const page2 = await ctx2.newPage();
    await page2.goto(page.url());
    await page.locator('.waiting-overlay').waitFor({ state: 'hidden', timeout: 10000 });
    await page2.close();
    await ctx2.close();
    await page.waitForTimeout(300);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    check('移动端无横向溢出', overflow <= 0, `overflow=${overflow}px`);
    const board = await page.locator('.xq-board').boundingBox();
    check('移动端棋盘宽度自适应', board && board.width <= 375 && board.width > 300, `w=${board && board.width.toFixed(0)}`);
    await page.locator('.actions-card').scrollIntoViewIfNeeded();
    const btnHeights = await page.evaluate(() => {
      const els = [...document.querySelectorAll('.actions-card .btn')];
      return els.map((el) => el.getBoundingClientRect().height);
    });
    check('移动端操作按钮触控高度≥40px', btnHeights.length > 0 && btnHeights.every((h) => h >= 40), `heights=${btnHeights.join(',')}`);
    const hotspots = await page.evaluate(() => {
      const el = document.querySelector('.board-hotspot');
      return el ? el.getBoundingClientRect().width : 0;
    });
    check('移动端点击热区≥30px', hotspots >= 30, `size=${hotspots.toFixed(0)}`);
    await ctx.close();
  }

  console.log('---');
  check('无控制台错误', errors.length === 0, errors.slice(0, 3).join(' | '));
  await browser.close();
  if (failures > 0) {
    console.log(`RESULT: ${failures} 项失败`);
    process.exit(1);
  }
  console.log('RESULT: 全部通过');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
