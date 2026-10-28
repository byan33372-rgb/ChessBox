/** 棋盘/棋子/动画专项：基线与回归截图（两个真实浏览器上下文对弈）。
 *  用法: node scripts/anim-baseline.mjs [baseline|after]  → shots/anim-<tag>-{xq,ch}-*.png */
import { chromium } from '@playwright/test';

const tag = process.argv[2] ?? 'baseline';
const BASE = process.env.SHOT_BASE ?? 'http://127.0.0.1:3001';

const browser = await chromium.launch({ channel: 'chrome' });

async function shoot(kind) {
  const ctxA = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const ctxB = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const pA = await ctxA.newPage();
  const pB = await ctxB.newPage();
  await pA.goto(BASE + '/');
  await pA.locator(`.create-card.${kind} .gc-create-btn`).click();
  await pA.waitForURL(/\/r\//);
  await pB.goto(pA.url());
  await pA.locator('.waiting-overlay').waitFor({ state: 'hidden', timeout: 10000 });
  const click = (p, sq) =>
    p.locator(`button[aria-label^="${sq} "], button[aria-label="${sq}"]`).first().click();

  if (kind === 'xiangqi') {
    await click(pA, 'h7'); await click(pA, 'e7'); // 炮二平五
    await click(pB, 'h0'); await click(pB, 'g2'); // 马8进7
  } else {
    await click(pA, 'e2'); await click(pA, 'e4');
    await click(pB, 'e7'); await click(pB, 'e5');
  }
  await pA.locator('.move-btn >> nth=1').waitFor({ timeout: 8000 });
  await pA.screenshot({ path: `shots/anim-${tag}-${kind}-a-playing.png`, fullPage: true });
  await pB.screenshot({ path: `shots/anim-${tag}-${kind}-b-playing.png`, fullPage: true });

  // 选中态 + 合法目标
  if (kind === 'xiangqi') await click(pA, 'b9'); else await click(pA, 'g1');
  await (kind === 'xiangqi' ? pA.locator('.xq-sel-ring') : pA.locator('.chess-sq.selected')).waitFor({ timeout: 5000 });
  await pA.screenshot({ path: `shots/anim-${tag}-${kind}-a-selected.png`, fullPage: false });
  await ctxA.close();
  await ctxB.close();
}

await shoot('xiangqi');
await shoot('chess');
await browser.close();
console.log(`DONE anim-${tag} screenshots`);
