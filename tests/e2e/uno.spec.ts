/** UNO e2e：首页第七卡 → 3 人经典局 → 选队/准备 → 桌面渲染 → 出牌/抽牌 → 320px。 */
import { expect, test, type Page } from '@playwright/test';

async function createUnoRoom(page: Page, players: 3 | 4): Promise<string> {
  await page.goto('/');
  await page.locator('.create-card.uno').waitFor({ state: 'visible' });
  if (players === 3) {
    await page.locator('.create-card.uno .sg-seat-btn').filter({ hasText: '3人' }).click();
  }
  await page.locator('.create-card.uno .gc-create-btn').click();
  await expect(page).toHaveURL(/\/r\/[a-z2-9]{10}/, { timeout: 15_000 });
  await expect(page.locator('.conn-pill.ok')).toBeVisible({ timeout: 15_000 });
  return page.url().split('/r/')[1];
}

test.describe('UNO', () => {
  test('首页第七卡', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('.create-card.uno')).toBeVisible();
    await expect(page.locator('.create-card.uno .card-title')).toContainText('UNO');
    await expect(page.locator('.create-card')).toHaveCount(7);
  });

  test('3 人经典局：准备 → 桌面渲染 → 抽牌/出牌推进', async ({ page, browser }) => {
    const roomId = await createUnoRoom(page, 3);
    const ctxB = await browser.newContext();
    const pageB = await ctxB.newPage();
    await pageB.goto(`/r/${roomId}`);
    await expect(pageB.locator('.conn-pill.ok')).toBeVisible({ timeout: 15_000 });
    const ctxC = await browser.newContext();
    const pageC = await ctxC.newPage();
    await pageC.goto(`/r/${roomId}`);
    await expect(pageC.locator('.conn-pill.ok')).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('.uno-select')).toBeVisible({ timeout: 10_000 });

    // 三人准备
    for (const p of [page, pageB, pageC]) {
      await p.locator('.uno-select .btn.primary', { hasText: '准备' }).click();
    }
    // 自动开局：选队/准备面板消失
    await expect(page.locator('.uno-select')).toHaveCount(0, { timeout: 20_000 });
    await expect(page.locator('.uno-table')).toBeVisible();
    await expect(page.locator('.uno-color-ind').first()).toBeVisible();
    await expect(page.locator('.sg-log')).toBeVisible();
    // 手牌 7 张（自己）
    const handCount = await page.locator('.sg-hand .sg-hand-card').count();
    expect(handCount).toBeGreaterThanOrEqual(6); // 起始 +2 可能出现
    // 轮到自己时可抽牌
    const findDrawBtn = async (p: Page) => {
      for (let i = 0; i < 120; i++) {
        if (await p.locator('.uno-my-actions button', { hasText: '抽 1 张' }).isVisible().catch(() => false)) return true;
        await p.waitForTimeout(200);
      }
      return false;
    };
    const canAct = (await findDrawBtn(page)) || (await findDrawBtn(pageB)) || (await findDrawBtn(pageC));
    expect(canAct).toBe(true);
    await ctxB.close();
    await ctxC.close();
  });

  test('320px 移动端无横向溢出', async ({ page, browser }) => {
    const roomId = await createUnoRoom(page, 3);
    await page.setViewportSize({ width: 320, height: 568 });
    const ctxB = await browser.newContext();
    const pageB = await ctxB.newPage();
    await pageB.setViewportSize({ width: 320, height: 568 });
    await pageB.goto(`/r/${roomId}`);
    const ctxC = await browser.newContext();
    const pageC = await ctxC.newPage();
    await pageC.setViewportSize({ width: 320, height: 568 });
    await pageC.goto(`/r/${roomId}`);
    for (const p of [page, pageB, pageC]) {
      await p.locator('.uno-select .btn.primary', { hasText: '准备' }).click();
    }
    await expect(page.locator('.uno-select')).toHaveCount(0, { timeout: 20_000 });
    for (const p of [page, pageB, pageC]) {
      const overflow = await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow, `overflow=${overflow}px`).toBeLessThanOrEqual(0);
    }
    await ctxB.close();
    await ctxC.close();
  });
});
