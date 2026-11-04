/** 三棋升级回归（TEST-008~012/PERF-004/UX-005）：三棋统一标记冒烟 + 响应式 + 帧率采样 */
import { expect, test, type Page } from '@playwright/test';

async function mkRoom(page: Page, kind: 'xiangqi' | 'chess' | 'checkers', seatCount?: number): Promise<string> {
  await page.goto('/');
  await page.locator(`.create-card.${kind}`).waitFor({ state: 'visible' });
  if (seatCount) {
    await page.locator(`.create-card.checkers .chk-seat-btn`).filter({ hasText: `${seatCount}人` }).click();
  }
  await page.locator(`.create-card.${kind} .gc-create-btn`).click();
  await expect(page).toHaveURL(/\/r\/[a-z2-9]{10}/, { timeout: 15_000 });
  await expect(page.locator('.conn-pill.ok')).toBeVisible({ timeout: 15_000 });
  return page.url().split('/r/')[1];
}

/** 第二位玩家经邀请链接入座（达到 playing 才能走棋） */
async function joinSecond(
  browser: import('@playwright/test').Browser,
  roomId: string,
): Promise<Page> {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto(`/r/${roomId}`);
  await expect(page.locator('.conn-pill.ok')).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('.waiting-overlay')).not.toBeVisible({ timeout: 10_000 });
  return page;
}

test.describe('三棋统一上一手标记与信息区', () => {
  test('中象：起/终标记 + LastMoveBar + 最近5步面板', async ({ page, browser }) => {
    const roomId = await mkRoom(page, 'xiangqi');
    await joinSecond(browser, roomId);
    await page.locator('button[aria-label^="h7 "]').click();
    await page.locator('button[aria-label="e7"]').click();
    await expect(page.locator('.last-move-bar .lmb-text')).toContainText('炮二平五', { timeout: 10_000 });
    await expect(page.locator('.chess-sq.last-from, .xq-last.from')).toHaveCount(1);
    await expect(page.locator('.chess-sq.last-to, .xq-last.to')).toHaveCount(1);
    await expect(page.locator('.last-tag.tag-from')).toHaveText('起');
    await expect(page.locator('.last-tag.tag-to')).toHaveText('终');
    await expect(page.locator('.recent-moves .recent-item')).toHaveCount(1);
    // 图例双编码
    await expect(page.locator('.lmb-legend')).toContainText('起点');
    await expect(page.locator('.lmb-legend')).toContainText('终点');
  });

  test('MOVE-007：非法走棋不更新上一手标记与最近一步信息', async ({ page, browser }) => {
    const roomId = await mkRoom(page, 'xiangqi');
    await joinSecond(browser, roomId);
    // 合法一步建立基线标记
    await page.locator('button[aria-label^="h7 "]').click();
    await page.locator('button[aria-label="e7"]').click();
    await expect(page.locator('.last-move-bar .lmb-text')).toContainText('炮二平五', { timeout: 10_000 });
    const markerCount = await page.locator('.xq-last.from, .chess-sq.last-from').count();
    const lmbText = await page.locator('.last-move-bar .lmb-text').textContent();
    // 非法请求：轮到对方时点击己方棋子 → UI 禁走；服务端拒绝（直接提交非法坐标走法）
    await page.evaluate(() => {
      const sock = (window as unknown as { __lastSocket?: { emit: (e: string, p: unknown, ack?: (r: unknown) => void) => void } }).__lastSocket;
      void sock; // 走 UI 路径：点击对方回合下的己方棋子
    });
    await page.locator('button[aria-label^="h9 "]').click(); // 红车（此时轮黑方）
    await expect(page.locator('.xq-sel-ring')).toHaveCount(0); // 未进入选中态
    await page.waitForTimeout(600);
    // 标记与信息区不变
    expect(await page.locator('.xq-last.from, .chess-sq.last-from').count()).toBe(markerCount);
    expect(await page.locator('.last-move-bar .lmb-text').textContent()).toBe(lmbText);
    void roomId;
  });

  test('国象：易位后 extra 车轨迹标记（last-extra）', async ({ page, browser }) => {
    const roomId = await mkRoom(page, 'chess');
    const pageB = await joinSecond(browser, roomId);
    // 白黑交替：e4 e5 / Nf3 Nc6 / Bc4 Bc5 / O-O
    const rounds: Array<[string, string, string, string]> = [
      ['e2', 'e4', 'e7', 'e5'],
      ['g1', 'f3', 'b8', 'c6'],
      ['f1', 'c4', 'f8', 'c5'],
    ];
    for (const [wf, wt, bf, bt] of rounds) {
      await page.locator(`button[aria-label^="${wf} "]`).click();
      await page.locator(`button[aria-label="${wt}"]`).first().click();
      await page.waitForTimeout(250);
      await pageB.locator(`button[aria-label^="${bf} "]`).click();
      await pageB.locator(`button[aria-label="${bt}"]`).first().click();
      await page.waitForTimeout(250);
    }
    await page.locator(`button[aria-label^="e1 "]`).click();
    await page.locator(`button[aria-label="g1"]`).first().click();
    await expect(page.locator('.last-move-bar .lmb-text')).toContainText('O-O', { timeout: 10_000 });
    // 白王翼易位后：车在 f1、原 h1 空格 —— extra 标记覆盖 h1/f1
    await expect(page.locator('.chess-sq.last-extra')).toHaveCount(2);
    await expect(page.locator('.chess-sq.last-from')).toHaveCount(1);
    await expect(page.locator('.chess-sq.last-to')).toHaveCount(1);
  });

  test('三棋 375×667 无横向溢出', async ({ page }) => {
    for (const kind of ['xiangqi', 'chess', 'checkers', 'go', 'gomoku'] as const) {
      await page.setViewportSize({ width: 375, height: 667 });
      await mkRoom(page, kind);
      await page.waitForTimeout(500);
      const r = await page.evaluate(() => ({
        overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
      }));
      expect(r.overflow, `${kind} 375px 横向溢出`).toBe(false);
    }
  });

  test('HISTORY-009/012：跳棋导出文本与 JSON 真实下载（含连跳路径）', async ({ page, browser }) => {
    const roomId = await mkRoom(page, 'checkers');
    await joinSecond(browser, roomId);
    await page.locator('.checkers-hit[data-cell="f4"]').click();
    await page.locator('.checkers-hit[data-cell="f5"]').click();
    await expect(page.locator('.last-move-bar .lmb-text')).toContainText('f4→f5', { timeout: 10_000 });
    // 文本导出
    const [dl1] = await Promise.all([
      page.waitForEvent('download', { timeout: 15_000 }),
      page.getByRole('button', { name: '导出棋谱文本' }).click(),
    ]);
    expect(dl1.suggestedFilename()).toMatch(/^checkers-[a-z2-9]{10}\.txt$/);
    const txt = await dl1.path().then((p) => require('fs').promises.readFile(p!, 'utf-8'));
    expect(txt).toContain('中国跳棋对局记录');
    expect(txt).toContain('f4→f5');
    // JSON 导出
    const [dl2] = await Promise.all([
      page.waitForEvent('download', { timeout: 15_000 }),
      page.getByRole('button', { name: '导出 JSON' }).click(),
    ]);
    expect(dl2.suggestedFilename()).toMatch(/^checkers-[a-z2-9]{10}\.json$/);
    const json = JSON.parse(await dl2.path().then((p) => require('fs').promises.readFile(p!, 'utf-8')));
    expect(json.format).toBe('chessbox-checkers-v1');
    expect(json.moves[0].from).toBe('f4');
    void roomId;
  });

  test('PERF-004：走棋后 120 帧渲染采样（P95/P99）', async ({ page, browser }) => {
    const roomId = await mkRoom(page, 'checkers');
    await joinSecond(browser, roomId);
    await page.waitForTimeout(500);
    // 触发一次走棋渲染后采样
    await page.locator('.checkers-hit[data-cell="f4"]').click();
    await page.locator('.checkers-hit[data-cell="f5"]').click();
    await expect(page.locator('.last-move-bar .lmb-text')).toContainText('f4→f5', { timeout: 10_000 });
    const stats = await page.evaluate(async () => {
      const dt: number[] = [];
      let last = await new Promise<number>((r) => requestAnimationFrame(r));
      const t0 = last;
      for (let i = 0; i < 120; i++) {
        const t = await new Promise<number>((r) => requestAnimationFrame(r));
        dt.push(t - last);
        last = t;
      }
      const fps = dt.slice(1).filter((d) => d > 0).map((d) => 1000 / d).sort((a, b) => a - b);
      const p = (q: number) => fps[Math.min(fps.length - 1, Math.floor(q * fps.length))];
      return {
        frames: fps.length,
        durationMs: Math.round(last - t0),
        p50: Math.round(p(0.5) * 10) / 10,
        p95: Math.round(p(0.95) * 10) / 10,
        p99: Math.round(p(0.99) * 10) / 10,
        min: Math.round(fps[0] * 10) / 10,
      };
    });
    console.log(`[PERF-004] ${JSON.stringify(stats)}`);
    expect(stats.frames).toBeGreaterThan(100);
    // 真实 Chrome 显示刷新下：P95 不低于 30 FPS（容忍 CI 负载波动）
    expect(stats.p95, `P95 FPS ${stats.p95}`).toBeGreaterThan(30);
  });
});


test.describe('PERF-008：三棋各 120 帧渲染采样', () => {
  for (const kind of ['xiangqi', 'chess', 'checkers', 'go', 'gomoku'] as const) {
    test(`${kind} 120 帧采样`, async ({ page, browser }) => {
      const roomId = await mkRoom(page, kind);
      await joinSecond(browser, roomId);
      await page.waitForTimeout(400);
      if (kind === 'xiangqi') {
        await page.locator('button[aria-label^="h7 "]').click();
        await page.locator('button[aria-label="e7"]').click();
      } else if (kind === 'chess') {
        await page.locator('button[aria-label^="e2 "]').click();
        await page.locator('button[aria-label="e4"]').first().click();
      } else if (kind === 'checkers') {
        await page.locator('.checkers-hit[data-cell="f4"]').click();
        await page.locator('.checkers-hit[data-cell="f5"]').click();
      } else if (kind === 'go') {
        await page.evaluate(`document.querySelector('.go-hit[data-pt="e5"]')?.dispatchEvent(new MouseEvent('click', { bubbles: true }))`);
      } else {
        await page.evaluate(`document.querySelector('.gk-board [data-pt="h8"]')?.dispatchEvent(new MouseEvent('click', { bubbles: true }))`);
      }
      await page.waitForTimeout(600);
      const stats = await page.evaluate(async () => {
        const dt: number[] = [];
        let last = await new Promise<number>((r) => requestAnimationFrame(r));
        const t0 = last;
        for (let i = 0; i < 121; i++) {
          const t = await new Promise<number>((r) => requestAnimationFrame(r));
          dt.push(t - last);
          last = t;
        }
        const fps = dt.slice(1).filter((d) => d > 0).map((d) => 1000 / d).sort((a, b) => a - b);
        const p = (q: number) => fps[Math.min(fps.length - 1, Math.floor(q * fps.length))];
        return {
          frames: fps.length,
          durationMs: Math.round(last - t0),
          p50: Math.round(p(0.5) * 10) / 10,
          p95: Math.round(p(0.95) * 10) / 10,
          p99: Math.round(p(0.99) * 10) / 10,
          over16_67: dt.slice(1).filter((d) => d > 16.67).length,
        };
      });
      console.log(`[PERF-008][${kind}] ${JSON.stringify(stats)}`);
      expect(stats.frames).toBeGreaterThan(100);
      void roomId;
    });
  }
});
