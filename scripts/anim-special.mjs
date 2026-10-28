/**
 * 特殊局面实测（TEST-011/012）：
 * 1) 中象马腿：炮进 h8 蹩住马 h9→g7 的腿（UI 无该目标、不发送），炮退回后马跳成功且动画正常；
 *    象眼/将帅照面由引擎单测覆盖（xiangqi-engine.test.ts 塞象眼/照面/帅九宫）。
 * 2) 国象将军指示：Qxe5+ 后 e8 黑王格出现 in-check，回吃后消失。
 * 3) 国象愚人杀：Qh4# 终局横幅出现，终局后不再接受走法。
 * 用法: node scripts/anim-special.mjs
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

async function newRoom(kind) {
  const ctxA = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const ctxB = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const pA = await ctxA.newPage();
  const pB = await ctxB.newPage();
  await pA.goto(BASE + '/');
  await pA.locator(`.create-card.${kind} .gc-create-btn`).click();
  await pA.waitForURL(/\/r\//);
  await pB.goto(pA.url());
  await pA.locator('.waiting-overlay').waitFor({ state: 'hidden', timeout: 10000 });
  await pA.locator('.conn-pill.ok').waitFor({ timeout: 15000 });
  await pB.locator('.conn-pill.ok').waitFor({ timeout: 15000 });
  return { ctxA, ctxB, pA, pB };
}

// —— 1. 中象马腿（真实对弈序列） ——
{
  const { ctxA, ctxB, pA, pB } = await newRoom('xiangqi');
  // 步1 A：炮 h7→h8（蹩住马 h9→g7 的腿点 h8）
  await click(pA, 'h7');
  await click(pA, 'h8');
  await pB.locator('.move-btn >> nth=0').waitFor({ timeout: 8000 });
  // 步2 B：马 h0→g2
  await click(pB, 'h0');
  await click(pB, 'g2');
  await pA.locator('.move-btn >> nth=1').waitFor({ timeout: 8000 });
  // 步3 A：点马 h9 再点 g7 → 腿被蹩，非合法目标 → 不发送、取消选中
  await click(pA, 'h9');
  const ringSel = await pA.locator('.xq-sel-ring').count();
  await click(pA, 'g7');
  await pA.waitForTimeout(400);
  const movesAfterBlock = await pA.locator('.move-btn').count();
  const flyAfterBlock = await pA.evaluate(() => !!document.querySelector('.xq-anim-fly'));
  check('SPEC-X1 马腿被蹩：g7 非目标、不发送、无动画', ringSel === 1 && movesAfterBlock === 2 && !flyAfterBlock,
    `ring=${ringSel} moves=${movesAfterBlock} fly=${flyAfterBlock}`);
  // 步3b A：炮 h8→h7 退回（让开腿点）
  await click(pA, 'h8');
  await click(pA, 'h7');
  await pB.locator('.move-btn >> nth=2').waitFor({ timeout: 8000 });
  // 步4 B：马 g2→e1（f0 为黑士不可入；e1 合法）
  await click(pB, 'g2');
  await click(pB, 'e1');
  await pA.locator('.move-btn >> nth=3').waitFor({ timeout: 8000 });
  // 步5 A：马 h9→g7（腿点已空）→ 合法 + 动画
  await click(pA, 'h9');
  await click(pA, 'g7');
  const fly = await pA.waitForSelector('.xq-anim-fly', { timeout: 1500 }).then(() => true).catch(() => false);
  await pA.locator('.move-btn >> nth=4').waitFor({ timeout: 8000 });
  await pA.waitForSelector('.xq-anim-fly', { state: 'detached', timeout: 2000 }).catch(() => {});
  const horseG7 = await pA.locator('button[aria-label="g7 红马"]').count();
  const h9Empty = await pA.locator('button[aria-label="h9"]').count();
  check('SPEC-X2 马腿让开后马跳成功：动画+落位 g7=红马', fly && horseG7 === 1 && h9Empty === 1,
    `fly=${fly} g7马=${horseG7} h9空=${h9Empty}`);
  await ctxA.close();
  await ctxB.close();
}

// —— 2. 国象将军指示 ——
{
  const { ctxA, ctxB, pA, pB } = await newRoom('chess');
  const seq = [
    [pA, 'e2', 'e4'], [pB, 'e7', 'e5'],
    [pA, 'd1', 'h5'], [pB, 'g8', 'f6'],
  ];
  for (const [p, from, to] of seq) {
    await click(p, from);
    await click(p, to);
    await p.waitForTimeout(300);
  }
  // 步5 A：后 h5→e5 吃兵将军（Qxe5+）
  await click(pA, 'h5');
  await click(pA, 'e5');
  await pA.locator('.move-btn >> nth=4').waitFor({ timeout: 8000 });
  await pA.waitForTimeout(250);
  const inCheckA = await pA.evaluate(() => {
    const el = [...document.querySelectorAll('.chess-sq.in-check')][0];
    return el ? el.getAttribute('aria-label') : null;
  });
  check('SPEC-C1 将军指示：e8 黑王格 in-check（Qxe5+ 服务端确认）', inCheckA === 'e8 黑王', `in-check=${inCheckA}`);
  // 步6 B：象 f8→e7 挡线解将（马不能斜吃 e5；挡将合法）
  await click(pB, 'f8');
  await click(pB, 'e7');
  await pA.locator('.move-btn >> nth=5').waitFor({ timeout: 8000 });
  await pA.waitForTimeout(250);
  const after = await pA.evaluate(() => ({
    check: document.querySelectorAll('.chess-sq.in-check').length,
    bishop: document.querySelectorAll('button[aria-label="e7 黑象"]').length,
  }));
  check('SPEC-C2 挡将解除将军：e7=黑象、无 in-check', after.check === 0 && after.bishop === 1,
    `check=${after.check} e7象=${after.bishop}`);
  await ctxA.close();
  await ctxB.close();
}

// —— 3. 国象愚人杀：终局横幅 + 终局锁 ——
{
  const { ctxA, ctxB, pA, pB } = await newRoom('chess');
  const seq = [
    [pA, 'f2', 'f3'], [pB, 'e7', 'e5'],
    [pA, 'g2', 'g4'], [pB, 'd8', 'h4'],
  ];
  let flyLast = false;
  for (const [p, from, to] of seq) {
    await click(p, from);
    await click(p, to);
    const f = await p.waitForSelector('.chess-anim-fly', { timeout: 1500 }).then(() => true).catch(() => false);
    if (p === pB) flyLast = f;
    await p.waitForTimeout(320);
  }
  await pA.locator('.game-over-banner').waitFor({ timeout: 8000 });
  const banner = (await pA.locator('.game-over-banner').textContent()) ?? '';
  const queenH4 = await pA.locator('button[aria-label="h4 黑后"]').count();
  // 终局后白方无可走：点 e2 再点 e4 不产生新棋谱
  await click(pA, 'e2');
  await click(pA, 'e4');
  await pA.waitForTimeout(300);
  const movesFinal = await pA.locator('.move-btn').count();
  check('SPEC-C3 愚人杀：Qh4# 动画+终局横幅（将死）+终局锁', flyLast && banner.includes('将死') && queenH4 === 1 && movesFinal === 4,
    `fly=${flyLast} banner=${banner.trim().slice(0, 24)} h4后=${queenH4} moves=${movesFinal}`);
  await ctxA.close();
  await ctxB.close();
}

// —— 4. 国象过路兵：capturedSq ≠ to（分类器专门分支真实对弈） ——
{
  const { ctxA, ctxB, pA, pB } = await newRoom('chess');
  const seq = [
    [pA, 'e2', 'e4'], [pB, 'g8', 'f6'],
    [pA, 'e4', 'e5'], [pB, 'd7', 'd5'],
  ];
  for (const [p, from, to] of seq) {
    await click(p, from);
    await click(p, to);
    await p.waitForTimeout(300);
  }
  // 步5 A：e5xd6 过路兵吃 d5 兵（落点 d6，被吃子格 d5）
  await click(pA, 'e5');
  await click(pA, 'd6');
  const capEl = await pA.waitForSelector('.chess-anim-captured', { timeout: 600 }).then(() => true).catch(() => false);
  await pA.locator('.move-btn >> nth=4').waitFor({ timeout: 8000 });
  await pA.waitForSelector('.chess-anim-captured', { state: 'detached', timeout: 2500 }).catch(() => {});
  const state = await pA.evaluate(() => ({
    pawnD6: document.querySelectorAll('button[aria-label="d6 白兵"]').length,
    d5Empty: document.querySelectorAll('button[aria-label="d5"]').length,
    moves: document.querySelectorAll('.move-btn').length,
  }));
  check('SPEC-C4 过路兵：captured 层出现、d6=白兵、d5 清空', capEl && state.pawnD6 === 1 && state.d5Empty === 1 && state.moves === 5,
    `cap=${capEl} d6兵=${state.pawnD6} d5空=${state.d5Empty} moves=${state.moves}`);
  await ctxA.close();
  await ctxB.close();
}

await browser.close();
const fails = results.filter((r) => !r.ok);
console.log(`\n== 特殊局面验证: ${results.length - fails.length}/${results.length} PASS ==`);
process.exit(fails.length ? 1 : 0);
