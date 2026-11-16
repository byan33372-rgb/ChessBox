import { chromium } from '@playwright/test';
const b = await chromium.launch({ channel: 'chrome' });
const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
await p.goto('http://127.0.0.1:3001/', { waitUntil: 'networkidle' });
const src = await p.locator('.create-card.uno .sg-cover-img').getAttribute('src');
const loaded = await p.locator('.create-card.uno .sg-cover-img').evaluate(el => { try { return el.naturalWidth; } catch { return -1; } });
console.log('uno src:', src, 'loaded:', loaded);
// SVG 内容 fetch
if (src) {
  const resp = await p.request.get('http://127.0.0.1:3001' + src);
  console.log('fetch:', resp.status(), 'content-type:', resp.headers()['content-type']);
  const body = await resp.text();
  console.log('starts with svg:', body.trimStart().startsWith('<svg') || body.includes('<svg'));
  console.log('first 100:', body.slice(0, 100));
}
await b.close();
