import { chromium } from '@playwright/test';
const b = await chromium.launch({ channel: 'chrome' });
const p = await b.newPage();
await p.goto('file:///D:/projects/chessbox/src/client/assets/uno-theme.svg');
const errText = await p.evaluate(() => {
  const e = document.querySelector('parsererror');
  return e ? e.textContent.slice(0, 300) : 'none';
});
console.log('parser error:', errText);
await b.close();
