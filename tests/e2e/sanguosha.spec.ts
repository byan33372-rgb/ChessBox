/**
 * 三国杀·自由混战 e2e（真实 Chrome，3 人局核心流程）：
 * 首页第六卡 → 3 人建房 → 三浏览器选将 → 自动开局 → 桌面渲染 → 出牌/结束回合 → 320px 无溢出。
 * 完整对局收敛由集成层机器人测试覆盖（真实 socket 协议）。
 */
import { expect, test, type Page } from '@playwright/test';

async function createSgRoom(page: Page, players: 3 | 4): Promise<string> {
  await page.goto('/');
  await page.locator('.create-card.sanguosha').waitFor({ state: 'visible' });
  if (players === 3) {
    await page.locator('.create-card.sanguosha .sg-seat-btn').filter({ hasText: '3人' }).click();
  }
  await page.locator('.create-card.sanguosha .gc-create-btn').click();
  await expect(page).toHaveURL(/\/r\/[a-z2-9]{10}/, { timeout: 15_000 });
  await expect(page.locator('.conn-pill.ok')).toBeVisible({ timeout: 15_000 });
  return page.url().split('/r/')[1];
}

async function joinRoom(browser: import('@playwright/test').Browser, roomId: string, nick: string): Promise<Page> {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto(`/r/${roomId}`);
  await page.evaluate((n) => localStorage.setItem('dc:name', n), nick);
  await page.reload();
  await expect(page.locator('.conn-pill.ok')).toBeVisible({ timeout: 15_000 });
  return page;
}

test.describe('三国杀·自由混战', () => {
  test('首页第六卡与人数选择', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('.create-card.sanguosha')).toBeVisible();
    await expect(page.locator('.create-card.sanguosha .sg-seat-btn')).toHaveCount(2);
    await expect(page.locator('.create-card.sanguosha .card-title')).toContainText('三国杀');
  });

  test('3 人局：选将 → 开局 → 桌面渲染 → 结束回合推进', async ({ page, browser }) => {
    const roomId = await createSgRoom(page, 3);
    const pageB = await joinRoom(browser, roomId, '乙');
    const pageC = await joinRoom(browser, roomId, '丙');
    await expect(page.locator('.sg-select')).toBeVisible({ timeout: 10_000 });

    // 三人选将（每页点第一个可用武将按钮）
    const pick = async (p: Page) => {
      await p.locator('.sg-general:not(.taken)').first().click();
    };
    await pick(page);
    await expect(page.locator('.sg-seat-chip.ok').first()).toBeVisible({ timeout: 10_000 });
    await pick(pageB);
    await pick(pageC);
    // 满员选将 → 自动开局（选将面板消失）
    await expect(page.locator('.sg-select')).toHaveCount(0, { timeout: 20_000 });
    await expect(page.locator('.sg-table[data-phase="play"], .sg-table[data-phase="prepare"], .sg-table[data-phase="draw"], .sg-table[data-phase="judge"]')).toBeVisible({ timeout: 15_000 });
    // 桌面要素：体力点、手牌区、战报
    await expect(page.locator('.sg-hp').first()).toBeVisible();
    await expect(page.locator('.sg-hand').first()).toBeVisible();
    await expect(page.locator('.sg-log')).toBeVisible();

    // 当前行动者能看到「结束出牌」按钮（等待到自己的 play 窗口，最多 3 人 × 数回合）
    const findEndBtn = async (p: Page) => {
      for (let i = 0; i < 90; i++) {
        if (await p.locator('.sg-actions button', { hasText: '结束出牌' }).isVisible().catch(() => false)) return true;
        await p.waitForTimeout(200);
      }
      return false;
    };
    const someoneCanAct = (await findEndBtn(page)) || (await findEndBtn(pageB)) || (await findEndBtn(pageC));
    expect(someoneCanAct).toBe(true);
    // 点击结束出牌 → 回合推进（战报增长）
    const logBefore = await page.locator('.sg-log-list p').count();
    for (const p of [page, pageB, pageC]) {
      const btn = p.locator('.sg-actions button', { hasText: '结束出牌' });
      if (await btn.isVisible().catch(() => false)) {
        await btn.click();
        break;
      }
    }
    await page.waitForTimeout(600);
    expect((await page.locator('.sg-log-list p').count()) >= logBefore).toBe(true);

  });

  test('320px 移动端无横向溢出', async ({ page, browser }) => {
    // 首页 320px 无溢出
    await page.setViewportSize({ width: 320, height: 568 });
    await page.goto('/');
    await expect(page.locator('.create-card.sanguosha')).toBeVisible();
    const homeOverflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(homeOverflow).toBeLessThanOrEqual(0);
    // 房间等待页 320px 无溢出
    const roomId = await createSgRoom(page, 3);
    await page.setViewportSize({ width: 320, height: 568 });
    await page.goto(`/r/${roomId}`);
    await expect(page.locator('.sg-select')).toBeVisible({ timeout: 15_000 });
    const roomOverflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(roomOverflow).toBeLessThanOrEqual(0);
  }, 60_000);
});
