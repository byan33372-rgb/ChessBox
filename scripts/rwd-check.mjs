/** R9 RWD 实测：真实视口矩阵（首页/双棋种房间·对局中）无横向溢出 + 翻转棋盘按钮真实验证（棋子纵向位置互换）
 *  aria-label 实证（scripts/tmp-labels-diag）：中象红帅="e9 红帅"，国象白王="e1 白王"，空格="e5"。
 *  用法: node scripts/rwd-check.mjs */
import { chromium } from '@playwright/test';

const BASE = 'http://127.0.0.1:3001';
const results = [];
const errors = [];
const browser = await chromium.launch({ channel: 'chrome' });

async function step(n, label, fn) {
  try {
    await fn();
    results.push(true);
    console.log(`✅ RWD-${String(n).padStart(2, '0')} PASS: ${label}`);
  } catch (e) {
    results.push(false);
    console.log(`❌ RWD-${String(n).padStart(2, '0')} FAIL: ${label} — ${String(e).split('\n')[0]}`);
  }
}

async function noHOverflow(page) {
  return page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1);
}

// ── 首页视口矩阵（单上下文，RWD-01~06）─────────────────────────
const page = await browser.newPage();
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push(String(e)));

const homeWidths = [
  [1440, 900],
  [1280, 800],
  [1024, 800],
  [820, 900],
  [414, 800],
  [375, 667],
];
for (let i = 0; i < homeWidths.length; i++) {
  const [w, h] = homeWidths[i];
  await step(i + 1, `首页视口 ${w}×${h} 无横向溢出且可截图`, async () => {
    await page.setViewportSize({ width: w, height: h });
    await page.goto(BASE + '/');
    await page.locator('.showcase-grid').waitFor({ timeout: 10000 });
    if (!(await noHOverflow(page))) throw new Error('出现横向滚动');
    await page.screenshot({ path: `shots/r9-home-${w}.png`, fullPage: true });
  });
}
await page.close();

// ── 房间页双棋种 × 双视口 + 翻转（对局中，双上下文）───────────
for (const kind of ['xiangqi', 'chess']) {
  const base = kind === 'xiangqi' ? 7 : 10;
  const ctxA = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const ctxB = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const pA = await ctxA.newPage();
  const pB = await ctxB.newPage();
  pA.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  pA.on('pageerror', (e) => errors.push(String(e)));

  await pA.goto(BASE + '/');
  await pA.locator(`.create-card.${kind} .gc-create-btn`).click();
  await pA.waitForURL(/\/r\//, { timeout: 15000 });
  await pB.goto(pA.url());
  await pA.locator('.conn-pill.ok').waitFor({ timeout: 15000 });
  await pA.locator('.waiting-overlay').waitFor({ state: 'hidden', timeout: 10000 });

  await step(base, `${kind} 房间（对局中）1280×800 无横向溢出`, async () => {
    if (!(await noHOverflow(pA))) throw new Error('出现横向滚动');
  });

  await step(base + 1, `${kind} 房间 375×667 无横向溢出、提和/翻转按钮可达`, async () => {
    await pA.setViewportSize({ width: 375, height: 667 });
    await pA.waitForTimeout(400);
    if (!(await noHOverflow(pA))) throw new Error('出现横向滚动');
    await pA.locator('.btn', { hasText: '提和' }).scrollIntoViewIfNeeded();
    await pA.locator('.btn', { hasText: '提和' }).isVisible();
    await pA.locator('.btn.small.ghost', { hasText: '翻转' }).isVisible();
    await pA.screenshot({ path: `shots/r9-room-${kind}-375.png`, fullPage: true });
  });

  await step(base + 2, `${kind === 'xiangqi' ? '中象红帅(e9 红帅)' : '国象白王(e1 白王)'}「翻转棋盘」真实生效：纵向位置互换`, async () => {
    await pA.setViewportSize({ width: 1280, height: 800 });
    await pA.waitForTimeout(300);
    const label = kind === 'xiangqi' ? 'e9 红帅' : 'e1 白王';
    const boardSel = kind === 'xiangqi' ? '.xq-board' : '.chess-grid';
    const king = pA.locator(`button[aria-label="${label}"]`);
    await king.waitFor({ timeout: 8000 });
    const bb = await pA.locator(boardSel).boundingBox();
    const kb = await king.boundingBox();
    const mid = bb.y + bb.height / 2;
    const beforeBottom = kb.y > mid;
    await pA.locator('.btn.small.ghost', { hasText: '翻转' }).click();
    await pA.waitForTimeout(300);
    const kb2 = await pA.locator(`button[aria-label="${label}"]`).boundingBox();
    const afterBottom = kb2.y > mid;
    if (beforeBottom === afterBottom) throw new Error(`翻转后纵向位置未互换`);
    await pA.locator('.btn.small.ghost', { hasText: '翻转' }).click(); // 还原
    await pA.waitForTimeout(200);
    await pA.screenshot({ path: `shots/r9-${kind === 'xiangqi' ? 'xq' : 'ch'}-flip.png`, fullPage: true });
  });

  await ctxA.close();
  await ctxB.close();
}
await browser.close();

// ── 汇总 ─────────────────────────────────────────────────────
const passed = results.filter(Boolean).length;
console.log('────────────────────────────────');
console.log(`RWD 实测：${passed}/12 项通过；控制台错误：${errors.length}`);
if (passed < results.length) console.log(`存在 ${results.length - passed} 个失败项（见上方 ❌ 明细）`);
if (errors.length) for (const e of errors) console.log('  console:', e);
process.exit(results.every(Boolean) && !errors.length ? 0 : 1);
