import { chromium } from '@playwright/test';
const b = await chromium.launch({ channel: 'chrome' });
const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
await p.goto('https://promotes-suffering-diagnosis-importantly.trycloudflare.com/', { waitUntil: 'networkidle', timeout: 30000 });
await p.screenshot({ path: 'docs/sanguosha/screenshots/tunnel-home.png' });
console.log('title:', await p.title());
console.log('cards:', await p.locator('.create-card').count());
await b.close();
