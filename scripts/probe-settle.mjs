/** 诊断：一次沙盒走棋中飞行层的 transitionend / 挂载卸载时间线 / reduced-motion 与 CSS 变量。 */
import { chromium } from '@playwright/test';

const BASE = process.env.NET_BASE ?? 'http://127.0.0.1:3001';
const browser = await chromium.launch({
  channel: 'chrome',
  headless: false,
  args: ['--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding', '--disable-background-timer-throttling'],
});
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
const p = await ctx.newPage();
await p.goto(BASE + '/');
await p.locator('.practice-board[data-kind=xiangqi]').waitFor({ timeout: 15000 });
await p.waitForTimeout(300);

console.log('reducedMotion =', await p.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches));

await p.evaluate(() => {
  window.__ev = [];
  const t = () => +performance.now().toFixed(1);
  document.addEventListener('transitionend', (e) => {
    const el = e.target;
    window.__ev.push({ t: t(), type: 'transitionend', prop: e.propertyName, cls: (el.className || '').toString().slice(0, 60), inFly: !!(el.closest && el.closest('.xq-anim-fly')) });
  }, true);
  const mo = new MutationObserver((muts) => {
    for (const m of muts) {
      for (const n of m.addedNodes) if (n.nodeType === 1 && (n.classList?.contains('xq-anim-fly'))) window.__ev.push({ t: t(), type: 'fly-mounted', cls: n.className });
      for (const n of m.removedNodes) if (n.nodeType === 1 && (n.classList?.contains('xq-anim-fly'))) window.__ev.push({ t: t(), type: 'fly-removed', cls: n.className });
    }
  });
  mo.observe(document.querySelector('.practice-board'), { subtree: true, childList: true });
});
await p.evaluate(() => { window.__t0 = performance.now(); });
await p.evaluate(() => document.querySelector('button[aria-label^="h7 "]')?.click());
await p.evaluate(() => document.querySelector('button[aria-label="e7"]')?.click());
await p.waitForTimeout(900);
const ev = await p.evaluate(() => ({ ev: window.__ev, t0: window.__t0 }));
const t0 = ev.t0;
console.log(JSON.stringify(ev.ev.map((e) => ({ ...e, dt: +(e.t - t0).toFixed(1) })), null, 1));
console.log('fly css =', await p.evaluate(() => {
  const el = document.querySelector('.xq-anim-fly');
  if (!el) return 'no fly element now';
  const cs = getComputedStyle(el);
  return { transitionProperty: cs.transitionProperty, duration: cs.transitionDuration, easing: cs.transitionTimingFunction, moveMsVar: getComputedStyle(document.documentElement).getPropertyValue('--anim-move-ms') };
}));
await browser.close();