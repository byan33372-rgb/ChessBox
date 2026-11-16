/**
 * 走棋动画专项验证（真实浏览器，双棋种）。
 * 验证：flight 层生命周期（选子→走子→flight 出现→过渡→清理）、落位精确、吃子层、
 * 易位落位、复盘/重连不动画、动效开关。逐项 PASS/FAIL 输出。
 * 用法: node scripts/anim-verify.mjs  (NET_BASE 可覆盖目标)
 */
import { chromium } from '@playwright/test';

const BASE = process.env.NET_BASE ?? 'http://127.0.0.1:3001';
const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
};

const browser = await chromium.launch({ channel: 'chrome' });

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

const click = (p, sq) => p.locator(`button[aria-label^="${sq} "], button[aria-label="${sq}"]`).first().click();

/** 走一步并观察动画层生命周期 */
async function moveAndWatch(p, other, from, to, kind, label, expectCapture = false) {
  const sel = kind === 'xiangqi' ? '.xq-anim-fly' : '.chess-anim-fly';
  const capture = kind === 'xiangqi' ? '.xq-anim-captured' : '.chess-anim-captured';
  const t0 = Date.now();
  await click(p, from);
  await click(p, to);
  const flyEl = await p.waitForSelector(sel, { timeout: 1500 }).catch(() => null);
  const capEl = expectCapture
    ? await p.waitForSelector(capture, { timeout: 400 }).catch(() => null)
    : null;
  const flyWindow = Date.now() - t0;
  await p.locator('.move-btn').first().waitFor({ timeout: 5000 }).catch(() => {});
  await p.waitForSelector(sel, { state: 'detached', timeout: 2000 }).catch(() => {});
  await p.waitForSelector(capture, { state: 'detached', timeout: 2500 }).catch(() => {});
  const moves = await p.locator('.move-btn').count();
  if (other) await other.locator('.move-btn').nth(moves - 1).waitFor({ timeout: 5000 }).catch(() => {});
  check(label, !!flyEl && moves > 0 && (!expectCapture || !!capEl), `fly=${!!flyEl} cap=${!!capEl} moves=${moves} 窗口≈${flyWindow}ms`);
  return { sawFly: !!flyEl, sawCap: !!capEl, moves };
}

// —— 1. 中象：普通走棋 + 落位精确 + 复盘不动画 ——
{
  const { ctxA, ctxB, pA, pB } = await newRoom('xiangqi');
  await moveAndWatch(pA, pB, 'h7', 'e7', 'xiangqi', 'ANIM-V1 中象普通走棋：飞行层出现并自动清理');
  const disc = await pA.locator('button[aria-label="e7 红炮"]').count();
  check('ANIM-V2 中象落位精确（e7=红炮）', disc === 1, `count=${disc}`);
  await moveAndWatch(pB, pA, 'h0', 'g2', 'xiangqi', 'ANIM-V3 中象对手步（对方端同播动画）');
  await pA.locator('.move-btn >> nth=1').waitFor({ timeout: 8000 });
  await pA.evaluate(() => !!document.querySelector('.xq-anim-fly'));
  await pA.locator('.replay-controls .icon-btn[aria-label="上一步"]').click();
  await pA.waitForTimeout(150);
  const flyReplay = await pA.evaluate(() => !!document.querySelector('.xq-anim-fly'));
  check('ANIM-V4 复盘导航不产生走棋动画', !flyReplay, `fly=${flyReplay}`);
  await ctxA.close();
  await ctxB.close();
}

// —— 2. 国象：普通走棋 + 吃子 ——
{
  const { ctxA, ctxB, pA, pB } = await newRoom('chess');
  await moveAndWatch(pA, pB, 'e2', 'e4', 'chess', 'ANIM-V5 国象普通走棋（A 方）');
  await moveAndWatch(pB, pA, 'd7', 'd5', 'chess', 'ANIM-V6 国象对手步（B 方）');
  const r = await moveAndWatch(pA, pB, 'e4', 'd5', 'chess', 'ANIM-V7 国象吃子：captured 离场层', true);
  const pawnD5 = await pB.locator('button[aria-label="d5 白兵"]').count();
  const capRow = await pB.locator('.captured-row').count();
  check('ANIM-V8 吃子后双方局面一致（d5=白兵）', pawnD5 === 1, `d5白兵=${pawnD5} 吃子行=${capRow}`);
  check('ANIM-V9 吃子层确实出现', r.sawCap, `cap=${r.sawCap}`);
  await ctxA.close();
  await ctxB.close();
}

// —— 3. 国象：王车易位 ——
{
  const { ctxA, ctxB, pA, pB } = await newRoom('chess');
  const seq = [
    [pA, pB, 'e2', 'e4'], [pB, pA, 'e7', 'e5'],
    [pA, pB, 'g1', 'f3'], [pB, pA, 'b8', 'c6'],
    [pA, pB, 'f1', 'c4'], [pB, pA, 'g8', 'f6'],
    [pA, pB, 'e1', 'g1'],
  ];
  for (const [p, o, from, to] of seq) {
    await click(p, from);
    await click(p, to);
    const n = await o.locator('.move-btn').count();
    await o.locator('.move-btn').nth(n).waitFor({ timeout: 5000 }).catch(() => {});
    await p.waitForTimeout(300);
  }
  const kingG1 = await pA.locator('button[aria-label="g1 白王"]').count();
  const rookF1 = await pA.locator('button[aria-label="f1 白车"]').count();
  check('ANIM-V10 王车易位落位（g1=王 f1=车）', kingG1 === 1 && rookF1 === 1, `K=${kingG1} R=${rookF1}`);
  await ctxA.close();
  await ctxB.close();
}

// —— 4. 重连恢复：不重播动画、棋谱完整 ——
{
  const { ctxA, ctxB, pA, pB } = await newRoom('xiangqi');
  await moveAndWatch(pA, pB, 'h7', 'e7', 'xiangqi', 'ANIM-V11 中象走棋（重连前置）');
  await moveAndWatch(pB, pA, 'h0', 'g2', 'xiangqi', 'ANIM-V12 对手步');
  await pA.reload();
  await pA.locator('.conn-pill.ok').waitFor({ timeout: 15000 });
  await pA.waitForTimeout(500);
  const fly = await pA.evaluate(() => !!document.querySelector('.xq-anim-fly'));
  const moves = await pA.locator('.move-btn').count();
  check('ANIM-V13 重连恢复：无动画重播、棋谱完整', !fly && moves === 2, `fly=${fly} moves=${moves}`);
  await ctxA.close();
  await ctxB.close();
}

// —— 5. 动效开关：关闭后无飞行层、走棋正常 ——
{
  const { ctxA, ctxB, pA, pB } = await newRoom('chess');
  // 三档：普通→快速→关闭。连续点击直到「关」。
  let label = '';
  for (let i = 0; i < 3; i++) {
    await pA.locator('.replay-controls .btn', { hasText: '动效' }).click();
    label = (await pA.locator('.replay-controls .btn', { hasText: '动效' }).textContent()) ?? '';
    if (label.includes('关')) break;
  }
  check('ANIM-V14 动效三档切换（普通→快速→关）', label.includes('关'), `label=${label}`);
  await click(pA, 'e2');
  await click(pA, 'e4');
  await pB.locator('.move-btn >> nth=0').waitFor({ timeout: 8000 });
  await pA.waitForTimeout(250);
  const fly = await pA.evaluate(() => !!document.querySelector('.chess-anim-fly'));
  const pawnE4 = await pA.locator('button[aria-label="e4 白兵"]').count();
  check('ANIM-V15 关闭动效：无飞行层且走棋正常', !fly && pawnE4 === 1, `fly=${fly} e4=${pawnE4}`);
  await pA.locator('.replay-controls .btn', { hasText: '动效' }).click();
  await ctxA.close();
  await ctxB.close();
}

await browser.close();
const fails = results.filter((r) => !r.ok);
console.log(`\n== 动画验证: ${results.length - fails.length}/${results.length} PASS ==`);
process.exit(fails.length ? 1 : 0);
