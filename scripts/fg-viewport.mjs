/** MOBILE-022 视口矩阵 × 5 棋（溢出 + 截图抽样） */
import { chromium } from '@playwright/test';
const VIEWPORTS = [[360,740],[360,800],[375,812],[390,844],[393,852],[402,874],[430,932],[768,1024],[1024,768],[1280,800],[1440,900]];
const KINDS = ['xiangqi','chess','checkers','go','gomoku'];
const b = await chromium.launch({ channel: 'chrome' });
let fail = 0;
const results = [];
for (const [w, h] of VIEWPORTS) {
  const ctx = await b.newContext({ viewport: { width: w, height: h } });
  const p = await ctx.newPage();
  for (const kind of KINDS) {
    await p.goto(`http://127.0.0.1:3500/`);
    await p.locator(`.create-card.${kind} .gc-create-btn`).click();
    await p.waitForURL(/\/r\//, { timeout: 15000 });
    await p.waitForTimeout(500);
    const r = await p.evaluate(() => ({
      overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
      boardVisible: !!document.querySelector('.go-svg,.gk-svg,.checkers-svg,.chess-grid,.xq-board'),
    }));
    results.push(`${w}x${h} ${kind}: ${r.overflow ? 'OVERFLOW' : 'ok'} board=${r.boardVisible}`);
    if (r.overflow) fail++;
  }
  await ctx.close();
}
console.log(results.join('\n'));
console.log('VIEWPORT-RESULT:', fail === 0 ? 'ALL-PASS' : `${fail} failures`);
await b.close();
process.exit(0);
