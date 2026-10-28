/** R7 UX 实测：邀请复制/剪贴板、toast 反馈、昵称链路、聊天（计数徽标/空消息禁用/限频）、
 *  提和与重开 offer 的拒绝流、认输终局 CTA。两个独立浏览器上下文。
 *  用法: node scripts/ux-check.mjs */
import { chromium } from '@playwright/test';

const BASE = 'http://127.0.0.1:3001';
const results = [];
const errs = { a: [], b: [] };

const browser = await chromium.launch({ channel: 'chrome' });
const mk = async (errsKey) => {
  const ctx = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    permissions: ['clipboard-read', 'clipboard-write'],
  });
  const page = await ctx.newPage();
  page.on('console', (m) => { if (m.type() === 'error') errs[errsKey].push(m.text()); });
  page.on('pageerror', (e) => errs[errsKey].push(String(e)));
  return { ctx, page };
};
const A = await mk('a');

async function step(n, label, fn) {
  try {
    await fn();
    results.push({ n, label, ok: true });
    console.log(`✅ UX-${String(n).padStart(2, '0')} PASS: ${label}`);
  } catch (e) {
    results.push({ n, label, ok: false, err: String(e).split('\n')[0] });
    console.log(`❌ UX-${String(n).padStart(2, '0')} FAIL: ${label} — ${String(e).split('\n')[0]}`);
  }
}

// ── 1. A 填昵称创建房间 ───────────────────────────────────────
await A.page.goto(BASE + '/');
let roomId = '';
await step(1, 'A 填昵称“阿甲”创建中国象棋房间，玩家卡显示昵称', async () => {
  await A.page.locator('#nickname').fill('阿甲');
  await A.page.locator('.create-card.xiangqi .gc-create-btn').click();
  await A.page.waitForURL(/\/r\/[a-z2-9]{10}/, { timeout: 15000 });
  await A.page.locator('.conn-pill.ok').waitFor({ timeout: 15000 });
  roomId = A.page.url().split('/r/')[1];
  const mine = A.page.locator('.player-card, .seat-card').filter({ hasText: '阿甲' });
  await mine.first().waitFor({ timeout: 5000 });
});

// ── 2. 复制邀请链接 → 剪贴板 + toast ──────────────────────────
await step(2, 'A 点“复制链接”→ 剪贴板为邀请 URL 且出现成功 toast', async () => {
  await A.page.locator('.btn', { hasText: '复制链接' }).first().click();
  const clip = await A.page.evaluate(() => navigator.clipboard.readText());
  if (clip !== `${BASE}/r/${roomId}`) throw new Error(`剪贴板内容异常: "${clip}"`);
  await A.page.locator('.toast.success').first().waitFor({ timeout: 5000 });
});

// ── 3. B 加入（无昵称 → 默认名非空）──────────────────────────
const B = await mk('b');
await step(3, 'B 打开链接加入黑方；其昵称非空（服务端默认名）', async () => {
  await B.page.goto(`${BASE}/r/${roomId}`);
  await B.page.locator('.conn-pill.ok').waitFor({ timeout: 15000 });
  await B.page.locator('.my-seat').filter({ hasText: '黑方' }).waitFor({ timeout: 10000 });
  const txt = await B.page.locator('.player-card, .seat-card').first().textContent();
  if (!txt.trim()) throw new Error('玩家卡名称为空');
});

// ── 4. 聊天：A 发消息 → B 未展开时计数徽标 → 展开可见 ──────────
await step(4, 'A 发“你好”；B 未展开时计数徽标+1，展开后消息含昵称', async () => {
  await A.page.locator('.chat-toggle').click();
  await A.page.locator('.chat-input-row input').fill('你好');
  await A.page.locator('.chat-input-row button').click();
  // B 未展开：toggle 显示条数徽标
  await B.page.locator('.chat-toggle').filter({ hasText: /1 条/ }).waitFor({ timeout: 8000 });
  await B.page.locator('.chat-toggle').click();
  const msg = await B.page.locator('.chat-msg').last().textContent();
  if (!msg.includes('阿甲') || !msg.includes('你好')) throw new Error(`消息渲染异常: ${msg}`);
});

// ── 5. 空消息禁用 ─────────────────────────────────────────────
await step(5, 'A 输入纯空格 → 发送按钮 disabled（客户端防呆）', async () => {
  await A.page.locator('.chat-input-row input').fill('   ');
  const disabled = await A.page.locator('.chat-input-row button').isDisabled();
  if (!disabled) throw new Error('空消息未禁用发送按钮');
  await A.page.locator('.chat-input-row input').fill('');
});

// ── 6. 限频反馈 ───────────────────────────────────────────────
await step(6, 'A 连发 7 条 → 第 7 条收到“过于频繁”错误 toast', async () => {
  for (let i = 0; i < 7; i++) {
    await A.page.locator('.chat-input-row input').fill(`刷屏测试 ${i}`);
    await A.page.locator('.chat-input-row button').click();
    await A.page.waitForTimeout(60);
  }
  await A.page.locator('.toast.error').first().waitFor({ timeout: 6000 });
  const t = await A.page.locator('.toast.error').first().textContent();
  if (!t.includes('频繁')) throw new Error(`错误 toast 文案异常: ${t}`);
  await A.page.screenshot({ path: 'shots/r7-ux-ratelimit.png', fullPage: true });
});

// ── 7. 提和 → B 拒绝 → 继续 ───────────────────────────────────
await step(7, 'A 提和 → B 卡片拒绝 → offer 清空、对局继续', async () => {
  await A.page.locator('.btn', { hasText: '提和' }).click();
  await A.page.locator('.toast', { hasText: '已发送和棋请求' }).waitFor({ timeout: 5000 });
  const card = B.page.locator('.offer-card').filter({ hasText: '对方提议和棋' });
  await card.waitFor({ timeout: 8000 });
  await card.locator('.btn', { hasText: '拒绝' }).click();
  await card.waitFor({ state: 'detached', timeout: 8000 });
  const pending = await A.page.locator('.pending-line').count();
  if (pending !== 0) throw new Error('拒绝后 A 的等待提示未清除');
  const moves = await A.page.locator('.move-btn').count();
  if (moves !== 0) throw new Error(`拒绝提和不应产生走法: ${moves}`);
});

// ── 8. 重开 → A 拒绝 → 继续 ───────────────────────────────────
await step(8, 'B 请求重开 → A 卡片拒绝 → offer 清空', async () => {
  await B.page.locator('.btn', { hasText: '重开' }).click();
  const card = A.page.locator('.offer-card').filter({ hasText: '对方请求重新开局' });
  await card.waitFor({ timeout: 8000 });
  await card.locator('.btn', { hasText: '拒绝' }).click();
  await card.waitFor({ state: 'detached', timeout: 8000 });
  const pending = await B.page.locator('.pending-line').count();
  if (pending !== 0) throw new Error('拒绝后 B 的等待提示未清除');
});

// ── 9. 认输 → 终局横幅 + 再来一局 CTA ─────────────────────────
await step(9, 'A 认输 → 双端终局横幅（黑方获胜）+ 再来一局按钮', async () => {
  await A.page.locator('.btn.danger', { hasText: '认输' }).click();
  const banner = A.page.locator('.game-over-banner');
  await banner.waitFor({ timeout: 8000 });
  const txt = await banner.textContent();
  if (!txt.includes('黑方获胜')) throw new Error(`横幅文案异常: ${txt}`);
  await B.page.locator('.game-over-banner').waitFor({ timeout: 8000 });
  await A.page.locator('.btn', { hasText: '再来一局' }).waitFor({ timeout: 5000 });
  await A.page.screenshot({ path: 'shots/r7-ux-ended.png', fullPage: true });
});

await A.ctx.close();
await B.ctx.close();
await browser.close();

// ── 汇总 ─────────────────────────────────────────────────────
const failed = results.filter((r) => !r.ok);
console.log('────────────────────────────────');
console.log(`UX 实测：${results.length - failed.length}/${results.length} 项通过`);
if (failed.length) {
  console.log('失败项：');
  for (const f of failed) console.log(`  UX-${f.n} ${f.label} → ${f.err}`);
}
const allErrs = [...errs.a, ...errs.b];
console.log(`控制台错误：${allErrs.length}`);
if (allErrs.length) for (const e of allErrs) console.log('  console:', e);
process.exit(failed.length ? 1 : 0);
