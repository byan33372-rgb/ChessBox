import { chromium } from '@playwright/test';
const b = await chromium.launch({ channel: 'chrome' });
const p = await b.newPage();
await p.goto('https://promotes-suffering-diagnosis-importantly.trycloudflare.com/', { timeout: 30000 });
console.log('title:', await p.title());
console.log('cards:', await p.locator('.create-card').count());
console.log('sg card:', await p.locator('.create-card.sanguosha .card-title').textContent().catch(() => 'N/A'));
console.log('uno card:', await p.locator('.create-card.uno .card-title').textContent().catch(() => 'N/A'));
await b.close();
