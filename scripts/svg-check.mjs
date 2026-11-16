import { chromium } from '@playwright/test';
const b = await chromium.launch({ channel: 'chrome' });
const p = await b.newPage();
// 直接打开 SVG 文件看浏览器是否渲染
await p.goto('file:///D:/projects/chessbox/src/client/assets/uno-theme.svg');
await p.waitForTimeout(500);
const hasError = await p.evaluate(() => document.querySelector('parsererror') !== null);
console.log('parser error:', hasError);
const svgEl = await p.evaluate(() => {
  const s = document.querySelector('svg');
  return s ? { w: s.viewBox.baseVal.width, h: s.viewBox.baseVal.height } : null;
});
console.log('svg element:', svgEl);
await p.screenshot({ path: 'docs/uno/screenshots/uno-svg-direct.png' });
await b.close();
