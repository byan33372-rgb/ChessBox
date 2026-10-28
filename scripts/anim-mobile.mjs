/** 移动端 375 + 高 DPI 证据截图（对弈态）。用法: node scripts/anim-mobile.mjs */
import { chromium } from '@playwright/test';

const BASE = 'http://127.0.0.1:3001';
const browser = await chromium.launch({ channel: 'chrome' });
const click = (p, sq) => p.locator(`button[aria-label^="${sq} "], button[aria-label="${sq}"]`).first().click();

async function shoot(kind, viewports, tag) {
  for (const vp of viewports) {
    const ctxA = await browser.newContext({ viewport: vp.size, deviceScaleFactor: vp.dpr ?? 1 });
    const ctxB = await browser.newContext({ viewport: vp.size, deviceScaleFactor: vp.dpr ?? 1 });
    const pA = await ctxA.newPage();
    const pB = await ctxB.newPage();
    await pA.goto(BASE + '/');
    await pA.locator(`.create-card.${kind} .gc-create-btn`).click();
    await pA.waitForURL(/\/r\//);
    await pB.goto(pA.url());
    await pA.locator('.waiting-overlay').waitFor({ state: 'hidden', timeout: 10000 });
    await pA.locator('.conn-pill.ok').waitFor({ timeout: 15000 });
    await pB.locator('.conn-pill.ok').waitFor({ timeout: 15000 });
    if (kind === 'xiangqi') {
      await click(pA, 'h7'); await click(pA, 'e7');
    } else {
      await click(pA, 'e2'); await click(pA, 'e4');
    }
    await pA.locator('.move-btn >> nth=0').waitFor({ timeout: 8000 });
    await pA.waitForTimeout(500);
    const name = `shots/anim-${tag}-${kind}-${vp.label}.png`;
    await pA.screenshot({ path: name, fullPage: true });
    await ctxA.close();
    await ctxB.close();
    console.log('saved', name);
  }
}

await shoot('xiangqi', [
  { label: 'm375', size: { width: 375, height: 667 } },
  { label: 'tablet768', size: { width: 768, height: 1024 } },
], 'mobile');
await shoot('chess', [
  { label: 'm375', size: { width: 375, height: 667 } },
  { label: 'hidpi2x', size: { width: 1280, height: 800 }, dpr: 2 },
], 'mobile');
await browser.close();
console.log('DONE mobile evidence');
