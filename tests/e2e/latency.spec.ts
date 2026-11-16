/** 延迟诊断面板（阶段二）：默认隐藏，?latency=1 显示；走棋后展示 transport/ack/服务端分项。 */
import { expect, test, type Page } from '@playwright/test';

async function mkGomoku(page: Page): Promise<string> {
  await page.goto('/');
  await page.locator('.create-card.gomoku .gc-create-btn').click();
  await expect(page).toHaveURL(/\/r\/[a-z2-9]{10}/, { timeout: 15_000 });
  await expect(page.locator('.conn-pill.ok')).toBeVisible({ timeout: 15_000 });
  return page.url().split('/r/')[1];
}

test.describe('延迟诊断面板', () => {
  test('默认对玩家隐藏；?latency=1 显示并可观察到 ack/服务端分项', async ({ page, browser }) => {
    const roomId = await mkGomoku(page);
    await expect(page.locator('[data-testid="latency-panel"]')).toHaveCount(0);

    await page.goto(`/r/${roomId}?latency=1`);
    await expect(page.locator('[data-testid="latency-panel"]')).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('.latency-panel')).toContainText('延迟诊断');
    expect(await page.locator('.latency-panel').evaluate((el) => getComputedStyle(el).position)).toBe('fixed');

    const ctxB = await browser.newContext();
    const pageB = await ctxB.newPage();
    await pageB.goto(`/r/${roomId}`);
    await expect(pageB.locator('.conn-pill.ok')).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('.waiting-overlay')).not.toBeVisible({ timeout: 10_000 });

    // 走一手后：面板应展示 websocket 与点击→ack（不是占位符）
    await page.evaluate(() => {
      const el = document.querySelector('.gk-board [data-pt="h8"]');
      el?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    });
    await expect(page.locator('.last-move-bar')).toContainText('h8', { timeout: 10_000 });
    // 乐观 UI 会先显示棋子；等 ack 回来后再断言服务端分项（避免读得过早）
    await page.waitForFunction(() => window.__dcLatency?.lastMove?.ackAt != null, null, { timeout: 10_000 });
    await expect(page.locator('.latency-panel')).toContainText('websocket');
    const ackRow = await page.locator('.latency-panel dl').innerText();
    expect(ackRow).toContain('点击→ack');
    expect(ackRow).not.toMatch(/点击→ack\s*—/);
    await ctxB.close();
  });
});

test.describe('席位文案回归（DEF-LAT-002）', () => {
  test('国象：a=白方先手、b=黑方；不把白方显示成黑方', async ({ page, browser }) => {
    await page.goto('/');
    await page.locator('.create-card.chess .gc-create-btn').click();
    await expect(page).toHaveURL(/\/r\/[a-z2-9]{10}/, { timeout: 15_000 });
    await expect(page.locator('.conn-pill.ok')).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('.my-seat')).toContainText('白方');
    const roomId = page.url().split('/r/')[1];
    const ctxB = await browser.newContext();
    const pageB = await ctxB.newPage();
    await pageB.goto(`/r/${roomId}`);
    await expect(pageB.locator('.conn-pill.ok')).toBeVisible({ timeout: 15_000 });
    await expect(pageB.locator('.my-seat')).toContainText('黑方');
    await expect(page.locator('.status-line')).toContainText('轮到你走棋');
    await expect(pageB.locator('.status-line')).toContainText('轮到白方走棋');
    // 白方先手：A 走 e2→e4，B 再走 e7→e5
    await page.locator('button[aria-label^="e2 "]').click();
    await page.locator('button[aria-label="e4"]').click();
    await expect(pageB.locator('.last-move-bar')).toContainText('e4', { timeout: 10_000 });
    await pageB.locator('button[aria-label^="e7 "]').click();
    await pageB.locator('button[aria-label="e5"]').click();
    await expect(pageB.locator('.my-seat')).toContainText('黑方');
    await expect(page.locator('.last-move-bar')).toContainText('e5', { timeout: 10_000 });
    await ctxB.close();
  });
});

test.describe('乐观落子回滚（FRONT-003/004）', () => {
  test('服务端拒绝时：先本机显示，ack 后回到权威局面并提示', async ({ page, browser }) => {
    // A 建房，B 加入
    await page.goto('/');
    await page.locator('.create-card.gomoku .gc-create-btn').click();
    await expect(page).toHaveURL(/\/r\/[a-z2-9]{10}/, { timeout: 15_000 });
    await expect(page.locator('.conn-pill.ok')).toBeVisible({ timeout: 15_000 });
    const roomId = page.url().split('/r/')[1];
    const ctxB = await browser.newContext();
    const pageB = await ctxB.newPage();
    await pageB.goto(`/r/${roomId}`);
    await expect(pageB.locator('.conn-pill.ok')).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('.waiting-overlay')).not.toBeVisible({ timeout: 10_000 });

    // C 用 A 的令牌加入同一座位，但拦截并丢弃 room:state 广播（保持陈旧局面），ack 延迟 350ms
    const token = await page.evaluate((rid) => localStorage.getItem(`dc:token:${rid}`), roomId);
    const ctxC = await browser.newContext();
    await ctxC.addInitScript(([rid, tok]) => localStorage.setItem(`dc:token:${rid}`, tok), [roomId, token]);
    const C = await ctxC.newPage();
    await C.routeWebSocket('**/socket.io/**', (ws) => {
      const server = ws.connectToServer();
      ws.onMessage((m) => server.send(m));
      server.onMessage((m) => {
        const s = typeof m === 'string' ? m : m.toString();
        if (s.startsWith('42') && s.includes('"room:state"')) return; // 丢弃广播
        if (s.startsWith('43')) {
          setTimeout(() => ws.send(m), 350);
          return;
        }
        ws.send(m);
      });
    });
    await C.goto(`/r/${roomId}`);
    await expect(C.locator('.conn-pill.ok')).toBeVisible({ timeout: 15_000 });
    await expect(C.locator('.my-seat')).toContainText('黑方', { timeout: 10_000 });
    const cdp = await ctxC.newCDPSession(C);
    const longTaskP = cdp.send('Performance.enable').catch(() => {});
    void longTaskP;

    // A 落 h8；C 因广播被丢弃仍是空盘/红方回合
    await page.locator('.gk-board [data-pt="h8"]').click({ force: true });
    await expect(pageB.locator('.gk-stone')).toHaveCount(1, { timeout: 10_000 });
    await expect(C.locator('.gk-stone')).toHaveCount(0);

    // C 点 a1：本地乐观显示（last-move 标记在 a1），但服务端会拒绝（未轮到）
    await C.locator('.gk-board [data-pt="a1"]').click({ force: true });
    const markerX = () => C.locator('.gk-board rect.go-last').getAttribute('x');
    await expect(C.locator('.gk-board rect.go-last')).toBeVisible({ timeout: 2000 });
    const optimisticX = await markerX();
    await expect(C.locator('.gk-stone')).toHaveCount(1); // 乐观层出现
    // ack 延迟 350ms 后：拒绝 → 回滚到权威局面（h8，而不是 a1）
    await C.waitForFunction(() => window.__dcLatency?.lastMove?.ok === false, null, { timeout: 10_000 });
    await expect(C.locator('.toast')).toContainText('还没轮到你走棋');
    await expect(C.locator('.gk-stone')).toHaveCount(1);
    await expect.poll(markerX, { timeout: 4000 }).not.toBe(optimisticX);
    // 权威落点 h8 的标记（x≈48.6）出现，a1 的乐观标记消失
    const afterX = await markerX();
    expect(Number(afterX)).toBeGreaterThan(40);
    await ctxC.close();
    await ctxB.close();
  });
});
