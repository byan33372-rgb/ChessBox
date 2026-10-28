/**
 * 动画补充场景验证：resize 中动画、prefers-reduced-motion、升变、快速连续走棋。
 * 用法: node scripts/anim-extra.mjs
 */
import { chromium } from '@playwright/test';

const BASE = 'http://127.0.0.1:3001';
const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
};

const browser = await chromium.launch({ channel: 'chrome' });
const click = (p, sq) => p.locator(`button[aria-label^="${sq} "], button[aria-label="${sq}"]`).first().click();

// —— 1. resize 中动画：动画进行时改视口，最终局面仍精确 ——
{
  const ctxA = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const ctxB = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const pA = await ctxA.newPage();
  const pB = await ctxB.newPage();
  await pA.goto(BASE + '/');
  await pA.locator('.create-card.xiangqi .gc-create-btn').click();
  await pA.waitForURL(/\/r\//);
  await pB.goto(pA.url());
  await pA.locator('.waiting-overlay').waitFor({ state: 'hidden', timeout: 10000 });
  await pA.locator('.conn-pill.ok').waitFor({ timeout: 15000 });
  await pB.locator('.conn-pill.ok').waitFor({ timeout: 15000 });
  await pA.locator('button[aria-label^="h7 "]').first().click();
  await pA.locator('button[aria-label="e7"]').first().click();
  // 动画进行中（<180ms 内）改视口
  await pA.setViewportSize({ width: 900, height: 700 });
  await pA.waitForTimeout(800);
  const e7 = await pA.locator('button[aria-label="e7 红炮"]').count();
  const fly = await pA.evaluate(() => !!document.querySelector('.xq-anim-fly'));
  // 棋子几何中心仍对准 e7 交叉点（收集全部红炮，取 e 列的那枚）
  const geo = await pA.evaluate(() => {
    const board = document.querySelector('.xq-board').getBoundingClientRect();
    return [...document.querySelectorAll('.xq-piece.red')]
      .filter((el) => el.textContent === '炮')
      .map((el) => {
        const r = el.getBoundingClientRect();
        return {
          relX: ((r.left + r.width / 2 - board.left) / board.width) * 540,
          relY: ((r.top + r.height / 2 - board.top) / board.height) * 600,
        };
      });
  });
  const onCross = geo.some((g) => Math.abs(g.relX - (30 + 60 * 4)) < 2.5 && Math.abs(g.relY - (30 + 60 * 7)) < 2.5);
  check('ANIM-X1 resize 中动画：最终局面精确对位', e7 === 1 && !fly && onCross, `e7=${e7} fly=${fly} 炮位=${geo.map((g) => `(${g.relX.toFixed(1)},${g.relY.toFixed(1)})`).join(' ')} 目标=(270,450)`);
  await ctxA.close();
  await ctxB.close();
}

// —— 2. prefers-reduced-motion：无长动画、走棋正常 ——
{
  const ctxA = await browser.newContext({ viewport: { width: 1280, height: 800 }, reducedMotion: 'reduce' });
  const ctxB = await browser.newContext({ viewport: { width: 1280, height: 800 }, reducedMotion: 'reduce' });
  const pA = await ctxA.newPage();
  const pB = await ctxB.newPage();
  await pA.goto(BASE + '/');
  await pA.locator('.create-card.chess .gc-create-btn').click();
  await pA.waitForURL(/\/r\//);
  await pB.goto(pA.url());
  await pA.locator('.waiting-overlay').waitFor({ state: 'hidden', timeout: 10000 });
  await pA.locator('.conn-pill.ok').waitFor({ timeout: 15000 });
  await pB.locator('.conn-pill.ok').waitFor({ timeout: 15000 });
  await pA.locator('button[aria-label^="e2 "]').first().click();
  await pA.locator('button[aria-label="e4"]').first().click();
  await pB.locator('.move-btn >> nth=0').waitFor({ timeout: 8000 });
  await pA.waitForTimeout(250);
  const fly = await pA.evaluate(() => !!document.querySelector('.chess-anim-fly'));
  const pawnE4 = await pA.locator('button[aria-label="e4 白兵"]').count();
  check('ANIM-X2 reduced-motion：跳过动画、走棋正常', !fly && pawnE4 === 1, `fly=${fly} e4=${pawnE4}`);
  await ctxA.close();
  await ctxB.close();
}

// —— 3. 国象升变：选择对话框 → 确认 → 落位为后 ——
{
  const ctxA = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const ctxB = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const pA = await ctxA.newPage();
  const pB = await ctxB.newPage();
  await pA.goto(BASE + '/');
  await pA.locator('.create-card.chess .gc-create-btn').click();
  await pA.waitForURL(/\/r\//);
  await pB.goto(pA.url());
  await pA.locator('.waiting-overlay').waitFor({ state: 'hidden', timeout: 10000 });
  await pA.locator('.conn-pill.ok').waitFor({ timeout: 15000 });
  await pB.locator('.conn-pill.ok').waitFor({ timeout: 15000 });
  // 白兵 a 线推进升变（复用 e2e 升变用例的合法序列：a2a4/b7b5/a4xb5/a7a6/b5xa6/g8f6/a6a7/h7h6/a7xb8=Q）
  const seq = [
    [pA, 'a2', 'a4'], [pB, 'b7', 'b5'],
    [pA, 'a4', 'b5'], [pB, 'a7', 'a6'],
    [pA, 'b5', 'a6'], [pB, 'g8', 'f6'],
    [pA, 'a6', 'a7'], [pB, 'h7', 'h6'],
    [pA, 'a7', 'b8', 'q'],
  ];
  for (let i = 0; i < seq.length; i++) {
    const [p, from, to, promo] = seq[i];
    await click(p, from);
    if (promo) {
      await click(p, to);
      await p.locator('.promo-card').waitFor({ timeout: 5000 });
      await p.locator('.promo-btn', { hasText: '后' }).click();
    } else {
      await click(p, to);
    }
    await p.waitForTimeout(350);
    console.log(`  step${i}: moves=${await pA.locator('.move-btn').count()} status=${(await pA.locator('.status-line').textContent())?.slice(0, 20)}`);
  }
  const queenB8 = await pA.locator('button[aria-label="b8 白后"]').count();
  check('ANIM-X3 升变：对话框确认后 b8=白后（ANIM-016 服务端确认后呈现）', queenB8 === 1, `b8白后=${queenB8}`);
  await ctxA.close();
  await ctxB.close();
}

// —— 4. 快速连续走棋：两次合法步背靠背，无残影 ——
{
  const ctxA = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const ctxB = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const pA = await ctxA.newPage();
  const pB = await ctxB.newPage();
  await pA.goto(BASE + '/');
  await pA.locator('.create-card.xiangqi .gc-create-btn').click();
  await pA.waitForURL(/\/r\//);
  await pB.goto(pA.url());
  await pA.locator('.waiting-overlay').waitFor({ state: 'hidden', timeout: 10000 });
  await pA.locator('.conn-pill.ok').waitFor({ timeout: 15000 });
  await pB.locator('.conn-pill.ok').waitFor({ timeout: 15000 });
  // A 步后不等动画结束立即走下一步（B 快速回应）
  await click(pA, 'h7'); await click(pA, 'e7');
  await click(pB, 'h0'); await click(pB, 'g2');
  await pA.locator('.move-btn >> nth=1').waitFor({ timeout: 8000 });
  await pA.waitForTimeout(900);
  const state = await pA.evaluate(() => ({
    fly: document.querySelectorAll('.xq-anim-fly').length,
    cap: document.querySelectorAll('.xq-anim-captured').length,
    pieces: document.querySelectorAll('.xq-piece').length,
    moves: document.querySelectorAll('.move-btn').length,
  }));
  check('ANIM-X4 快速连续走棋：无残影/无多余层/32 子完整', state.fly === 0 && state.cap === 0 && state.pieces === 32 && state.moves === 2, JSON.stringify(state));
  await ctxA.close();
  await ctxB.close();
}

await browser.close();
const fails = results.filter((r) => !r.ok);
console.log(`\n== 动画补充验证: ${results.length - fails.length}/${results.length} PASS ==`);
process.exit(fails.length ? 1 : 0);
