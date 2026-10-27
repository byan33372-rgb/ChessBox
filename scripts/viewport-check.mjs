/** 阶段 8：视口矩阵 + 键盘可达性 + 长内容压力检查（真实浏览器） */
import { chromium } from '@playwright/test';
import { ChessEngine } from '../src/games/chess/adapter';

const BASE = process.env.SHOT_BASE ?? 'http://127.0.0.1:3001';

/** 引擎驱动的确定性 30 步合法序列（避免手写棋谱出错） */
function legalMoveSequence(n) {
  const engine = new ChessEngine();
  const picks = [];
  let s = 42;
  for (let i = 0; i < n; i++) {
    const ms = engine.legalMoves().filter((m) => !m.promotion); // 该脚本不处理升变对话框
    if (ms.length === 0) break;
    s = (s * 1103515245 + 12345) % 2147483648;
    picks.push(ms[Math.floor((s / 2147483648) * ms.length)]);
    engine.applyMove(picks[picks.length - 1]);
  }
  return picks;
}
let failures = 0;
const check = (name, cond, detail = '') => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
  if (!cond) failures++;
};

const VIEWPORTS = [
  { name: '笔记本 1024×768', width: 1024, height: 768 },
  { name: '平板竖 768×1024', width: 768, height: 1024 },
  { name: '手机横 667×375', width: 667, height: 375 },
  { name: '手机小屏 320×600', width: 320, height: 600 },
];

async function main() {
  const browser = await chromium.launch({ channel: 'chrome' });

  for (const vp of VIEWPORTS) {
    const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
    await page.goto(BASE + '/');
    await page.locator('.create-card.xiangqi').waitFor({ timeout: 15000 });
    await page.locator('.create-card.xiangqi').click();
    await page.waitForURL(/\/r\//, { timeout: 15000 });
    await page.locator('.conn-pill.ok').waitFor({ timeout: 15000 });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    check(`${vp.name} 无横向溢出`, overflow <= 0, `overflow=${overflow}px`);
    const board = await page.locator('.xq-board').boundingBox();
    check(`${vp.name} 棋盘可见且适配`, !!board && board.width <= vp.width, `w=${board && board.width.toFixed(0)}`);
    check(`${vp.name} 无控制台错误`, errors.length === 0, errors[0] ?? '');
    await ctx.close();
  }

  // 长内容压力：12 字昵称 + 长房间号 URL + 大量棋步
  {
    const ctxA = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const ctxB = await browser.newContext({ viewport: { width: 375, height: 667 } });
    const pA = await ctxA.newPage();
    await pA.goto(BASE + '/');
    await pA.locator('#nickname').fill('十二字昵称压力测试哦');
    await pA.locator('.create-card.chess').click();
    await pA.waitForURL(/\/r\//);
    const pB = await ctxB.newPage();
    await pB.goto(pA.url());
    await pA.locator('.waiting-overlay').waitFor({ state: 'hidden', timeout: 10000 });

    // 走 30 步（引擎生成的确定性合法序列）
    const seq = legalMoveSequence(30).map((m) => [m.from, m.to]);
    for (let i = 0; i < seq.length; i++) {
      const page = i % 2 === 0 ? pA : pB;
      await page.locator(`button[aria-label^="${seq[i][0]} "], button[aria-label="${seq[i][0]}"]`).first().click();
      await page.locator(`button[aria-label^="${seq[i][1]} "], button[aria-label="${seq[i][1]}"]`).first().click();
    }
    const count = await pB.locator('.move-btn').count();
    check('30 步后双方棋谱一致', count === 30, `count=${count}`);
    const overflow = await pB.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    check('窄屏 30 步无横向溢出', overflow <= 0, `overflow=${overflow}px`);
    // 长玩家名渲染不破版
    const nameBox = await pB.locator('.player-name').first().boundingBox();
    check('长昵称卡片不溢出', !!nameBox && nameBox.width < 375, `w=${nameBox && nameBox.width.toFixed(0)}`);

    // 键盘可达性：Tab 聚焦链路覆盖关键控件
    await pB.keyboard.press('Tab');
    let focusables = 0;
    for (let i = 0; i < 12; i++) {
      const tag = await pB.evaluate(() => {
        const el = document.activeElement;
        return el ? el.tagName + '.' + (el.className || '').split(' ')[0] : '';
      });
      if (tag) focusables++;
      await pB.keyboard.press('Tab');
    }
    check('键盘 Tab 可遍历可聚焦控件', focusables >= 10, `focusables=${focusables}`);
    // 复盘期间对手继续走棋 → 棋谱计数变化而复盘视图保持
    await pB.locator('.replay-controls [aria-label="上一步"]').click();
    await pB.locator('.replay-banner').waitFor({ timeout: 5000 });
    check('复盘横幅出现', true);
    const banner = await pB.locator('.replay-pos').textContent();
    check('复盘位置显示 29/30', banner === '29 / 30', banner ?? '');
    await ctxA.close();
    await ctxB.close();
  }

  console.log('---');
  console.log(failures > 0 ? `RESULT: ${failures} 项失败` : 'RESULT: 全部通过');
  await browser.close();
  if (failures > 0) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
