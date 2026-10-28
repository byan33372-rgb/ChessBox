/** 截图工具：node scripts/shot.mjs <url> <outfile> [width] [height] [fullPage=1] */
import { chromium } from '@playwright/test';

const [, , url, out, w, h, full] = process.argv;
if (!url || !out) {
  console.error('usage: node scripts/shot.mjs <url> <outfile> [width] [height] [fullPage=0|1]');
  process.exit(2);
}
const browser = await chromium.launch({ channel: 'chrome' });
const page = await browser.newPage({ viewport: { width: Number(w ?? 1440), height: Number(h ?? 900) } });
const errors = [];
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
page.on('pageerror', (e) => errors.push(String(e)));
await page.goto(url, { waitUntil: 'load' });
await page.waitForTimeout(700);
await page.screenshot({ path: out, fullPage: full !== '0' });
console.log('saved:', out);
console.log('console errors:', JSON.stringify(errors));
await browser.close();
