/** R5 NET 双客户端端到端实测：两个独立浏览器上下文（非单页模拟）
 *  15 步清单：创建/邀请/加入/就绪/走棋同步×2/一致/非轮次禁走/非法目标/复盘导航/
 *  聊天/刷新恢复/悔棋offer/离线徽章+防抢座/认输终局+锁定
 *  用法: node scripts/net-check.mjs [xiangqi|chess]（默认 xiangqi）
 *        R13 起 BASE 可用环境变量覆盖（如指向 Quick Tunnel 公网地址实测）。 */
import { chromium } from '@playwright/test';

const kind = process.argv[2] ?? 'xiangqi';
const BASE = process.env.NET_BASE ?? 'http://127.0.0.1:3001';

/** 按棋种参数化：首步/次步走法与记谱文本、选环选择器、回合文案 */
const CFG = kind === 'chess'
  ? {
      first: { a: ['e2', 'e4'], text: 'e4' },
      second: { b: ['e7', 'e5'], text: 'e5' },
      selRing: '.chess-sq.selected',
      waitingTurnText: '轮到白方走棋', // 非行棋方第三方视角
      notTurnClick: 'd2',   // 轮黑方时白方点己方兵 → 无反应
      illegal: { select: 'g8', target: 'g6' }, // 马点直行两格 → 非法
      afterEndClick: 'e2',
    }
  : {
      first: { a: ['h7', 'e7'], text: '炮二平五' },
      second: { b: ['h0', 'g2'], text: '马8进7' },
      selRing: '.xq-sel-ring',
      waitingTurnText: '轮到红方走棋',
      notTurnClick: 'h9',   // 轮黑方时红方点车 → 无反应
      illegal: { select: 'h0', target: 'h9' }, // 马点直线远格 → 非法
      afterEndClick: 'h7',
    };

const results = [];
const consoleErrors = { a: [], b: [], b2: [] };

const browser = await chromium.launch({ channel: 'chrome' });
const ctxA = await browser.newContext({ viewport: { width: 1280, height: 800 } });
const pageA = await ctxA.newPage();
pageA.on('console', (m) => { if (m.type() === 'error') consoleErrors.a.push(m.text()); });
pageA.on('pageerror', (e) => consoleErrors.a.push(String(e)));

let pageB = null;
let ctxB = null;
const getB = async () => {
  if (!ctxB) {
    ctxB = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    pageB = await ctxB.newPage();
    pageB.on('console', (m) => { if (m.type() === 'error') consoleErrors.b.push(m.text()); });
    pageB.on('pageerror', (e) => consoleErrors.b.push(String(e)));
  }
  return pageB;
};

async function step(n, label, fn) {
  try {
    await fn();
    results.push({ n, label, ok: true });
    console.log(`✅ 步骤${n} PASS: ${label}`);
  } catch (e) {
    results.push({ n, label, ok: false, err: String(e).split('\n')[0] });
    console.log(`❌ 步骤${n} FAIL: ${label} — ${String(e).split('\n')[0]}`);
    try { await pageA.screenshot({ path: `shots/r5-net-fail-step${n}.png`, fullPage: true }); } catch {}
  }
}

const clickSq = (page, sq) =>
  page.locator(`button[aria-label^="${sq} "], button[aria-label="${sq}"]`).first().click();

// ── 1. A 创建房间 ─────────────────────────────────────────────
await pageA.goto(BASE + '/');
let roomId = '';
await step(1, `A 创建${kind === 'chess' ? '国际象棋' : '中国象棋'}房间 → 进入 /r/<id> 且连接正常`, async () => {
  await pageA.locator(`.create-card.${kind} .gc-create-btn`).click();
  await pageA.waitForURL(/\/r\/[a-z2-9]{10}/, { timeout: 15000 });
  await pageA.locator('.conn-pill.ok').waitFor({ timeout: 15000 });
  roomId = pageA.url().split('/r/')[1];
  if (!/^[a-z2-9]{10}$/.test(roomId)) throw new Error(`房间号格式异常: ${roomId}`);
});

// ── 2. A 等待遮罩与邀请链接 ───────────────────────────────────
await step(2, 'A 显示“等待对手”遮罩且邀请链接可复制', async () => {
  await pageA.locator('.waiting-overlay').waitFor({ state: 'visible', timeout: 10000 });
  await pageA.locator('.invite-row input, input[readonly]').first().waitFor({ timeout: 10000 });
  await pageA.screenshot({ path: `shots/r5-net-${kind}-a-waiting.png`, fullPage: true });
});

// ── 3. B 独立上下文加入 ───────────────────────────────────────
await step(3, 'B 独立上下文打开邀请链接 → 加入为黑方', async () => {
  const pB = await getB();
  await pB.goto(`${BASE}/r/${roomId}`);
  await pB.locator('.conn-pill.ok').waitFor({ timeout: 15000 });
  await pB.locator('.my-seat').waitFor({ timeout: 10000 });
  const seat = await pB.locator('.my-seat').textContent();
  if (!seat.includes('黑方')) throw new Error(`B 席位异常: ${seat}`);
});

// ── 4. A 就绪 ────────────────────────────────────────────────
await step(4, 'A 遮罩消失并显示“轮到你走棋”', async () => {
  await pageA.locator('.waiting-overlay').waitFor({ state: 'hidden', timeout: 10000 });
  await pageA.locator('.status-line').filter({ hasText: '轮到你走棋' }).waitFor({ timeout: 5000 });
});

// ── 5. A 走第一步 ────────────────────────────────────────────
await step(5, `A 走 ${CFG.first.a.join('→')} → 双端记谱同步且文本一致`, async () => {
  await clickSq(pageA, CFG.first.a[0]);
  await pageA.locator(CFG.selRing).waitFor({ timeout: 3000 });
  await clickSq(pageA, CFG.first.a[1]);
  await pageA.locator('.move-btn').first().filter({ hasText: CFG.first.text }).waitFor({ timeout: 8000 });
  const pB = await getB();
  await pB.locator('.move-btn').first().filter({ hasText: CFG.first.text }).waitFor({ timeout: 8000 });
});

// ── 6. B 走第二步 ────────────────────────────────────────────
await step(6, `B 走 ${CFG.second.b.join('→')} → 双端各 2 步`, async () => {
  const pB = await getB();
  await clickSq(pB, CFG.second.b[0]);
  await clickSq(pB, CFG.second.b[1]);
  await pB.locator('.move-btn').nth(1).waitFor({ timeout: 8000 });
  await pageA.locator('.move-btn').nth(1).waitFor({ timeout: 8000 });
});

// ── 7. 双端状态一致 ──────────────────────────────────────────
await step(7, '双端记谱条数、文本与回合提示一致', async () => {
  const pB = await getB();
  const nA = await pageA.locator('.move-btn').count();
  const nB = await pB.locator('.move-btn').count();
  if (nA !== 2 || nB !== 2) throw new Error(`步数不一致 A=${nA} B=${nB}`);
  const tA = await pageA.locator('.move-btn').nth(1).textContent();
  const tB = await pB.locator('.move-btn').nth(1).textContent();
  if (tA !== tB) throw new Error(`记谱文本不一致: A="${tA}" B="${tB}"`);
  const turnA = await pageA.locator('.status-line').textContent();
  const turnB = await pB.locator('.status-line').textContent();
  if (!turnA.includes('轮到你走棋')) throw new Error(`A 回合提示异常: ${turnA}`);
  // 非行棋方显示第三方视角文案（Room.tsx 225 行）
  if (!turnB.includes(CFG.waitingTurnText)) throw new Error(`B 回合提示异常: ${turnB}`);
  await pageA.screenshot({ path: `shots/r5-net-${kind}-a-playing.png`, fullPage: true });
  await pB.screenshot({ path: `shots/r5-net-${kind}-b-playing.png`, fullPage: true });
});

// ── 8. 非轮次禁走 ────────────────────────────────────────────
await step(8, '轮对方时己方点击己子无反应（UI 权威禁走）', async () => {
  await clickSq(pageA, CFG.notTurnClick);
  await pageA.waitForTimeout(400);
  const n = await pageA.locator('.move-btn').count();
  if (n !== 2) throw new Error(`非轮次点击产生了走法? 当前 ${n} 步`);
});

// ── 9. 非法目标 ──────────────────────────────────────────────
await step(9, 'B 选子后点非法目标 → 不产生走法', async () => {
  const pB = await getB();
  await clickSq(pB, CFG.illegal.select);
  await clickSq(pB, CFG.illegal.target);
  await pB.waitForTimeout(400);
  const n = await pB.locator('.move-btn').count();
  if (n !== 2) throw new Error(`非法目标产生了走法? 当前 ${n} 步`);
});

// ── 10. 复盘导航 ─────────────────────────────────────────────
await step(10, 'B 复盘导航（上一步→回到当前）且不影响 A', async () => {
  const pB = await getB();
  await pB.locator('.replay-controls [aria-label="上一步"]').click();
  await pB.locator('.replay-banner').waitFor({ timeout: 5000 });
  const pos = await pB.locator('.replay-pos').textContent();
  if (!pos.includes('1 / 2')) throw new Error(`复盘位置异常: ${pos}`);
  const nA = await pageA.locator('.move-btn').count();
  if (nA !== 2) throw new Error('复盘影响了 A 端步数');
  await pB.locator('.replay-banner .btn').click();
  await pB.locator('.replay-banner').waitFor({ state: 'hidden', timeout: 5000 });
});

// ── 11. 聊天 ─────────────────────────────────────────────────
await step(11, 'B 发送聊天“该你了” → A 实时收到', async () => {
  const pB = await getB();
  await pB.locator('.chat-toggle').click();
  await pageA.locator('.chat-toggle').click();
  await pB.locator('.chat-input-row input').fill('该你了');
  await pB.locator('.chat-input-row button').click();
  await pageA.locator('.chat-msg .chat-text').last().filter({ hasText: '该你了' }).waitFor({ timeout: 10000 });
});

// ── 12. B 刷新恢复 ───────────────────────────────────────────
await step(12, 'B 刷新页面 → 凭本地会话恢复黑方席位与 2 步棋谱', async () => {
  const pB = await getB();
  await pB.reload();
  await pB.locator('.conn-pill.ok').waitFor({ timeout: 15000 });
  await pB.locator('.my-seat').filter({ hasText: '黑方' }).waitFor({ timeout: 10000 });
  const n = await pB.locator('.move-btn').count();
  if (n !== 2) throw new Error(`恢复后步数异常: ${n}`);
});

// ── 13. 悔棋 offer ───────────────────────────────────────────
await step(13, 'A 请求悔棋 → B 卡片同意 → 双端回到 0 步', async () => {
  const pB = await getB();
  await pageA.locator('.btn', { hasText: '悔棋' }).click();
  const card = pB.locator('.offer-card').filter({ hasText: '对方请求悔棋' });
  await card.waitFor({ timeout: 8000 });
  await card.locator('.btn', { hasText: '同意' }).click();
  await pageA.locator('.move-btn').nth(0).waitFor({ state: 'detached', timeout: 8000 }).catch(() => {});
  // 广播到达 B 可能比 A 的 ack 晚几毫秒：等 B 也回到 0 步再断言（避免测试竞态）
  await pB
    .waitForFunction(() => document.querySelectorAll('.move-btn').length === 0, null, { timeout: 8000 })
    .catch(() => {});
  const nA = await pageA.locator('.move-btn').count();
  const nB = await pB.locator('.move-btn').count();
  if (nA !== 0 || nB !== 0) throw new Error(`悔棋后步数异常: A=${nA} B=${nB}`);
});

// ── 14. 断线 + 防抢座 ────────────────────────────────────────
await step(14, 'B 断开 → A 显示离线徽章；新上下文打开链接不抢座（观战）', async () => {
  await ctxB.close();
  ctxB = null; pageB = null;
  await pageA.locator('.offline-badge').first().waitFor({ timeout: 8000 });
  // 陌生人用全新上下文打开同一链接：席位已被占用 → 应为观战，不能走棋
  const ctxS = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const pS = await ctxS.newPage();
  await pS.goto(`${BASE}/r/${roomId}`);
  await pS.locator('.conn-pill.ok').waitFor({ timeout: 15000 });
  await pS.locator('.my-seat').waitFor({ timeout: 10000 });
  const seat = await pS.locator('.my-seat').textContent();
  if (!seat.includes('观战')) throw new Error(`新上下文未判为观战: ${seat}`);
  await pS.screenshot({ path: `shots/r5-net-${kind}-spectator.png`, fullPage: true });
  await ctxS.close();
});

// ── 15. 认输终局 + 锁定 ──────────────────────────────────────
await step(15, 'A 认输 → 双端终局横幅；终局后棋盘点击不产生走法', async () => {
  await pageA.locator('.btn.danger', { hasText: '认输' }).click();
  await pageA.locator('.game-over-banner').waitFor({ timeout: 8000 });
  await clickSq(pageA, CFG.afterEndClick);
  await pageA.waitForTimeout(400);
  const n = await pageA.locator('.move-btn').count();
  if (n !== 0) throw new Error(`终局后仍可产生走法? 当前 ${n} 步`);
  await pageA.screenshot({ path: `shots/r5-net-${kind}-ended.png`, fullPage: true });
});

await browser.close();

// ── 汇总 ─────────────────────────────────────────────────────
const failed = results.filter((r) => !r.ok);
console.log('────────────────────────────────');
console.log(`NET 双客户端实测：${results.length - failed.length}/${results.length} 步通过（${kind}）`);
if (failed.length) {
  console.log('失败步骤：');
  for (const f of failed) console.log(`  步骤${f.n} ${f.label} → ${f.err}`);
}
const allErrs = [...consoleErrors.a, ...consoleErrors.b];
console.log(`控制台错误：${allErrs.length}`);
if (allErrs.length) for (const e of allErrs) console.log('  console:', e);
process.exit(failed.length ? 1 : 0);
