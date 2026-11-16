import { chromium } from '@playwright/test';
const b = await chromium.launch({ channel: 'chrome' });
const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
await p.goto('http://127.0.0.1:3001/', { waitUntil: 'networkidle' });
// 验证 img src 是否加载成功
const sgSrc = await p.locator('.create-card.sanguosha .sg-cover-img').getAttribute('src');
console.log('sg src:', sgSrc);
const sgLoaded = await p.locator('.create-card.sanguosha .sg-cover-img').evaluate(el => el.naturalWidth > 0);
console.log('sg loaded:', sgLoaded);
await p.locator('.create-card.sanguosha').screenshot({ path: 'docs/sanguosha/screenshots/sg-cover.png' });
await p.locator('.create-card.uno').screenshot({ path: 'docs/uno/screenshots/uno-cover.png' });
await p.screenshot({ path: 'docs/sanguosha/screenshots/home-covers.png', fullPage: false });
console.log('done');
await b.close();
