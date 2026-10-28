/** 房间页截图工具：创建房间→B 加入→双方走棋→截图（验证主题与对弈布局）
 *  用法: node scripts/room-shot.mjs <xiangqi|chess> <outfile> */
import { chromium } from '@playwright/test';

const kind = process.argv[2] ?? 'xiangqi';
const out = process.argv[3] ?? `shots/room-${kind}.png`;
const BASE = 'http://127.0.0.1:3001';
const browser = await chromium.launch({ channel: 'chrome' });

const ctxA = await browser.newContext({ viewport: { width: 1280, height: 800 } });
const ctxB = await browser.newContext({ viewport: { width: 1280, height: 800 } });
const pA = await ctxA.newPage();
const pB = await ctxB.newPage();

await pA.goto(BASE + '/');
await pA.locator(`.create-card.${kind} .gc-create-btn`).click();
await pA.waitForURL(/\/r\//);
// 等待对手状态截图（棋盘可见 + 邀请链接可读）
await pA.locator('.waiting-overlay').waitFor({ state: 'visible', timeout: 10000 });
await pA.screenshot({ path: out.replace('.png', '-waiting.png') });

await pB.goto(pA.url());
await pA.locator('.waiting-overlay').waitFor({ state: 'hidden', timeout: 10000 });
await pB.locator('.conn-pill.ok').waitFor({ timeout: 10000 });

const seq = kind === 'xiangqi'
  ? [['h7', 'e7'], ['h0', 'g2'], ['b9', 'c7'], ['b0', 'c2']]
  : [['e2', 'e4'], ['e7', 'e5'], ['g1', 'f3'], ['b8', 'c6']];
for (let i = 0; i < seq.length; i++) {
  const p = i % 2 === 0 ? pA : pB;
  for (const sq of seq[i]) {
    await p.locator(`button[aria-label^="${sq} "], button[aria-label="${sq}"]`).first().click();
    await p.waitForTimeout(150);
  }
}
await pB.locator('.move-btn').nth(seq.length - 1).waitFor({ timeout: 10000 });
await pA.screenshot({ path: out, fullPage: true });
console.log('saved:', out, '| waiting:', out.replace('.png', '-waiting.png'));
await browser.close();
