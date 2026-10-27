import { expect, test, type Page } from '@playwright/test';

/**
 * 端到端测试：真实浏览器 + 真实生产服务（node dist-server）。
 * 覆盖：双人创建/加入、走棋同步、轮次限制、复盘、断线重连、
 * 国际象棋流程与升变对话框、窄屏移动端视口。
 */

async function createRoom(page: Page, kind: 'xiangqi' | 'chess'): Promise<string> {
  await page.goto('/');
  await page.getByRole('button', { name: new RegExp(`创建房间`) }).first().waitFor({ state: 'visible' });
  if (kind === 'chess') {
    await page.locator('.create-card.chess').click();
  } else {
    await page.locator('.create-card.xiangqi').click();
  }
  await expect(page).toHaveURL(/\/r\/[a-z2-9]{10}/, { timeout: 15_000 });
  await expect(page.locator('.conn-pill.ok')).toBeVisible({ timeout: 15_000 });
  return page.url().split('/r/')[1];
}

async function joinRoom(page: Page, roomId: string): Promise<void> {
  await page.goto(`/r/${roomId}`);
  await expect(page.locator('.conn-pill.ok')).toBeVisible({ timeout: 15_000 });
}

async function clickSquare(page: Page, sq: string): Promise<void> {
  // 有子格 aria-label 形如 "e2 白兵"，空格 aria-label 恰为 "e2"
  await page.locator(`button[aria-label^="${sq} "], button[aria-label="${sq}"]`).first().click();
}

async function expectMoveCount(page: Page, n: number): Promise<void> {
  await expect(page.locator('.move-btn')).toHaveCount(n, { timeout: 10_000 });
}

test.describe('桌面端双人中国象棋对局', () => {
  test('创建 → 邀请 → 对弈 → 同步 → 复盘 → 重连', async ({ browser }) => {
    const ctxA = await browser.newContext();
    const ctxB = await browser.newContext();
    const pageA = await ctxA.newPage();
    const pageB = await ctxB.newPage();

    const roomId = await createRoom(pageA, 'xiangqi');
    await expect(pageA.locator('.waiting-overlay')).toBeVisible();
    await expect(pageA.locator('.status-line')).toContainText('等待对手');

    // B 通过邀请链接加入
    await joinRoom(pageB, roomId);
    await expect(pageB.locator('.waiting-overlay')).not.toBeVisible({ timeout: 10_000 });
    await expect(pageA.locator('.waiting-overlay')).not.toBeVisible({ timeout: 10_000 });
    await expect(pageA.locator('.status-line')).toContainText('轮到你走棋');

    // 红方走炮二平五（h7 → e7）
    await clickSquare(pageA, 'h7');
    await expect(pageA.locator('.xq-sel-ring')).toBeVisible();
    await clickSquare(pageA, 'e7');
    await expectMoveCount(pageA, 1);
    await expect(pageA.locator('.move-btn').first()).toHaveText(/炮二平五/);
    // 双方局面一致
    await expectMoveCount(pageB, 1);
    await expect(pageB.locator('.move-btn').first()).toHaveText(/炮二平五/);
    await expect(pageB.locator('.status-line')).toContainText('轮到你走棋');

    // 黑方非轮次时点红子无反应（服务端权威：UI 也不得产生走法）
    await clickSquare(pageA, 'h9'); // 现在轮黑方，红方 UI 禁用
    await expectMoveCount(pageA, 1);

    // 黑方走马 8 进 7（h0 → g2）
    await clickSquare(pageB, 'h0');
    await clickSquare(pageB, 'g2');
    await expectMoveCount(pageB, 2);
    await expect(pageB.locator('.move-btn').nth(1)).toHaveText(/马8进7/);
    await expectMoveCount(pageA, 2);

    // 复盘（本地视图，不影响线上）
    await pageB.locator('.replay-controls [aria-label="上一步"]').click();
    await expect(pageB.locator('.replay-banner')).toBeVisible();
    await expect(pageB.locator('.replay-pos')).toHaveText('1 / 2');
    await expectMoveCount(pageA, 2); // A 不受影响
    await pageB.locator('.replay-banner .btn').click(); // 回到当前
    await expect(pageB.locator('.replay-banner')).not.toBeVisible();

    // B 刷新页面（断线重连恢复）
    await pageB.reload();
    await expect(pageB.locator('.conn-pill.ok')).toBeVisible({ timeout: 15_000 });
    await expectMoveCount(pageB, 2);
    await expect(pageB.locator('.my-seat')).toContainText('黑方');

    // 聊天（先展开 A 的聊天面板，消息只在展开时渲染）
    await pageA.locator('.chat-toggle').click();
    await pageB.locator('.chat-toggle').click();
    await pageB.locator('.chat-input-row input').fill('该你了');
    await pageB.locator('.chat-input-row button').click();
    await expect(pageA.locator('.chat-msg .chat-text').last()).toHaveText('该你了', { timeout: 10_000 });

    await ctxA.close();
    await ctxB.close();
  });

  test('非法走棋请求不改变局面', async ({ browser }) => {
    const ctxA = await browser.newContext();
    const ctxB = await browser.newContext();
    const pageA = await ctxA.newPage();
    const pageB = await ctxB.newPage();
    const roomId = await createRoom(pageA, 'xiangqi');
    await joinRoom(pageB, roomId);
    await expect(pageA.locator('.status-line')).toContainText('轮到你走棋');

    // 红方选炮 h7，尝试点一个不合法目标（e5 不可达）→ 不产生走法
    await clickSquare(pageA, 'h7');
    await clickSquare(pageA, 'e5');
    await expectMoveCount(pageA, 0);
    // 取消选择后走合法着法
    await clickSquare(pageA, 'h7');
    await clickSquare(pageA, 'e7');
    await expectMoveCount(pageA, 1);
    await ctxA.close();
    await ctxB.close();
  });
});

test.describe('国际象棋端到端', () => {
  test('e4 e5 Nf3 双端同步，SAN 正确', async ({ browser }) => {
    const ctxA = await browser.newContext();
    const ctxB = await browser.newContext();
    const pageA = await ctxA.newPage();
    const pageB = await ctxB.newPage();
    const roomId = await createRoom(pageA, 'chess');
    await joinRoom(pageB, roomId);
    await expect(pageA.locator('.status-line')).toContainText('轮到你走棋');

    await clickSquare(pageA, 'e2');
    await clickSquare(pageA, 'e4');
    await expectMoveCount(pageA, 1);
    await expect(pageA.locator('.move-btn').first()).toHaveText('e4');

    await clickSquare(pageB, 'e7');
    await clickSquare(pageB, 'e5');
    await expectMoveCount(pageB, 2);
    await expect(pageB.locator('.move-btn').nth(1)).toHaveText('e5');

    await clickSquare(pageA, 'g1');
    await clickSquare(pageA, 'f3');
    await expectMoveCount(pageA, 3);
    await expect(pageA.locator('.move-btn').nth(2)).toHaveText('Nf3');
    await expectMoveCount(pageB, 3);

    await ctxA.close();
    await ctxB.close();
  });

  test('升变对话框：选择后完成升变', async ({ browser }) => {
    const ctxA = await browser.newContext();
    const ctxB = await browser.newContext();
    const pageA = await ctxA.newPage();
    const pageB = await ctxB.newPage();
    const roomId = await createRoom(pageA, 'chess');
    await joinRoom(pageB, roomId);

    const seq: Array<{ page: Page; from: string; to: string }> = [
      { page: pageA, from: 'a2', to: 'a4' },
      { page: pageB, from: 'b7', to: 'b5' },
      { page: pageA, from: 'a4', to: 'b5' },
      { page: pageB, from: 'a7', to: 'a6' },
      { page: pageA, from: 'b5', to: 'a6' },
      { page: pageB, from: 'g8', to: 'f6' },
      { page: pageA, from: 'a6', to: 'a7' },
      { page: pageB, from: 'h7', to: 'h6' },
    ];
    for (const m of seq) {
      await clickSquare(m.page, m.from);
      await clickSquare(m.page, m.to);
    }
    await expectMoveCount(pageA, 8);

    // a7xb8 触发升变对话框
    await clickSquare(pageA, 'a7');
    await clickSquare(pageA, 'b8');
    await expect(pageA.locator('.promo-card')).toBeVisible();
    await pageA.locator('.promo-btn', { hasText: '后' }).click();
    await expectMoveCount(pageA, 9);
    await expect(pageA.locator('.move-btn').last()).toHaveText('axb8=Q');
    await expectMoveCount(pageB, 9);

    await ctxA.close();
    await ctxB.close();
  });
});

test.describe('移动端窄屏', () => {
  test('375×667 视口可完成走棋，棋盘可操作', async ({ browser }) => {
    const ctxA = await browser.newContext({ viewport: { width: 375, height: 667 } });
    const ctxB = await browser.newContext({ viewport: { width: 375, height: 667 } });
    const pageA = await ctxA.newPage();
    const pageB = await ctxB.newPage();

    const roomId = await createRoom(pageA, 'xiangqi');
    await joinRoom(pageB, roomId);
    await expect(pageA.locator('.status-line')).toContainText('轮到你走棋');

    // 棋盘完整可见且无横向滚动
    const board = pageA.locator('.xq-board');
    await expect(board).toBeVisible();
    const hasHorizontalScroll = await pageA.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
    expect(hasHorizontalScroll).toBe(false);

    // 触点走棋
    await clickSquare(pageA, 'h7');
    await clickSquare(pageA, 'e7');
    await expectMoveCount(pageA, 1);
    await expectMoveCount(pageB, 1);

    // 侧栏在棋盘下方可达（滚动后可见操作按钮）
    await pageA.locator('.replay-controls [aria-label="上一步"]').scrollIntoViewIfNeeded();
    await expect(pageA.locator('.btn', { hasText: '提和' })).toBeVisible();

    await ctxA.close();
    await ctxB.close();
  });
});

test.describe('导出功能', () => {
  test('国际象棋导出 PGN 下载，内容含走法与结果', async ({ browser }) => {
    const ctxA = await browser.newContext({ acceptDownloads: true });
    const ctxB = await browser.newContext({ acceptDownloads: true });
    const pageA = await ctxA.newPage();
    const pageB = await ctxB.newPage();
    const roomId = await createRoom(pageA, 'chess');
    await joinRoom(pageB, roomId);

    for (const [page, from, to] of [
      [pageA, 'e2', 'e4'],
      [pageB, 'e7', 'e5'],
      [pageA, 'd1', 'h5'],
    ] as Array<[Page, string, string]>) {
      await clickSquare(page, from);
      await clickSquare(page, to);
    }
    await expectMoveCount(pageA, 3);

    const [download] = await Promise.all([
      pageA.waitForEvent('download'),
      pageA.locator('.export-card .btn', { hasText: '导出 PGN' }).click(),
    ]);
    expect(download.suggestedFilename()).toMatch(/chess-.+\.pgn$/);
    const path = await download.path();
    const { readFileSync } = await import('node:fs');
    const content = readFileSync(path, 'utf8');
    expect(content).toContain('[Event "双人对弈（本地服务）"]');
    expect(content).toContain('1. e4 e5');
    expect(content).toContain('2. Qh5');
    expect(content).toContain('[Result "*"]');
    await ctxA.close();
    await ctxB.close();
  });

  test('中国象棋导出中文棋谱与 JSON', async ({ browser }) => {
    const ctxA = await browser.newContext({ acceptDownloads: true });
    const ctxB = await browser.newContext({ acceptDownloads: true });
    const pageA = await ctxA.newPage();
    const pageB = await ctxB.newPage();
    const roomId = await createRoom(pageA, 'xiangqi');
    await joinRoom(pageB, roomId);

    await clickSquare(pageA, 'h7');
    await clickSquare(pageA, 'e7');
    await expectMoveCount(pageA, 1);
    await clickSquare(pageB, 'h0');
    await clickSquare(pageB, 'g2');
    await expectMoveCount(pageA, 2);

    const { readFileSync } = await import('node:fs');

    const [downloadTxt] = await Promise.all([
      pageA.waitForEvent('download'),
      pageA.locator('.export-card .btn', { hasText: '导出中文棋谱' }).click(),
    ]);
    expect(downloadTxt.suggestedFilename()).toMatch(/xiangqi-.+\.txt$/);
    const txt = readFileSync(await downloadTxt.path(), 'utf8');
    expect(txt).toContain('1. 炮二平五 马8进7');

    const [downloadJson] = await Promise.all([
      pageA.waitForEvent('download'),
      pageA.locator('.export-card .btn', { hasText: '导出 JSON' }).click(),
    ]);
    expect(downloadJson.suggestedFilename()).toMatch(/xiangqi-.+\.json$/);
    const json = JSON.parse(readFileSync(await downloadJson.path(), 'utf8'));
    expect(json.format).toBe('chessbox-xiangqi-v1');
    expect(json.moves.length).toBe(2);
    expect(json.moves[0].notation).toBe('炮二平五');
    await ctxA.close();
    await ctxB.close();
  });
});
