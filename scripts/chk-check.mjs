/** R8 CHK 验证：功能确认卡在生产页面真实渲染且与 checklist.ts 数据一致（含未验证项如实显示） */
import { chromium } from '@playwright/test';

const BASE = 'http://127.0.0.1:3001';
const browser = await chromium.launch({ channel: 'chrome' });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push(String(e)));

await page.goto(BASE + '/');
await page.waitForLoadState('networkidle');

const body = await page.locator('body').textContent();
const checks = [];
const t = (n, label, ok, detail = '') => {
  checks.push(ok);
  console.log(`${ok ? '✅' : '❌'} CHK-${String(n).padStart(2, '0')} ${ok ? 'PASS' : 'FAIL'}: ${label}${detail ? ' — ' + detail : ''}`);
};

t(1, '两张功能确认卡存在（中国/国际）', (body.match(/功能确认（中国象棋）/g) ?? []).length === 1 && (body.match(/功能确认（国际象棋）/g) ?? []).length === 1);
t(2, '确认卡明示“人工维护的验收记录（非实时自动化监控）”', body.includes('人工维护的验收记录（非实时自动化监控）'));
t(3, '国象规则项证据为 47 项（CH-004~CH-018）', await page.locator('.status-label[title*="CH-004~CH-018"][title*="47 项"]').count() === 1);
t(4, '中象规则项证据为 37 项（XI-003~XI-014）', await page.locator('.status-label[title*="XI-003~XI-014"][title*="37 项"]').count() === 1);
t(5, '响应式项如实显示“未验证”', body.includes('未验证'));
t(6, '无任何项目显示“未通过”（当前无失败项）', !body.includes('未通过'));
// 证据渲染于 .status-label 的 title 属性（悬停提示）；两棋种卡各一条 → 用存在性断言
t(7, '证据编号抽查（NET-006/REC-007/UX-004/NET-014 均渲染于 title 属性）', await page.locator('.status-label[title*="NET-006"]').count() >= 1 && await page.locator('.status-label[title*="REC-007"]').count() >= 1 && await page.locator('.status-label[title*="UX-004"]').count() >= 1 && await page.locator('.status-label[title*="NET-014"]').count() >= 1);
t(8, '列表项状态类与图标语义一致（pass=✓ / unverified=?）', await page.locator('li.pass .status-ico', { hasText: '✓' }).count() === 14 && await page.locator('li.unverified .status-ico').count() === 2);
await page.screenshot({ path: 'shots/r8-chk-cards.png', fullPage: true });

await browser.close();
const okAll = checks.every(Boolean);
console.log('────────────────────────────────');
console.log(`CHK 实测：${checks.filter(Boolean).length}/${checks.length} 项通过；控制台错误：${errors.length}`);
if (errors.length) for (const e of errors) console.log('  console:', e);
process.exit(okAll && !errors.length ? 0 : 1);
