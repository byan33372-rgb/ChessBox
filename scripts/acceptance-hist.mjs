/**
 * 阶段 3：棋谱、复盘、导出与持久化 UI 实测（HIST-001~012，真实双客户端 + 生产构建）。
 * 用法: node scripts/acceptance-hist.mjs
 */
import { chromium } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { Chess } from 'chess.js';

const BASE = process.env.NET_BASE ?? 'http://127.0.0.1:3001';
const results = [];
const ok = (id, name, pass, detail = '') => {
  results.push({ id, name, pass, detail });
  console.log(`${pass ? 'PASS' : 'FAIL'} ${id} ${name}${detail ? ' — ' + detail : ''}`);
};

const browser = await chromium.launch({
  channel: 'chrome',
  headless: false,
  args: ['--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding', '--disable-background-timer-throttling'],
});
const SEL = (sq) => `button[aria-label^="${sq} "], button[aria-label="${sq}"]`;
const click = (p, sq) => p.evaluate((sel) => document.querySelector(sel)?.click(), SEL(sq));
const labelAt = (p, sq) => p.evaluate((s) => document.querySelector(`button[aria-label^="${s} "]`)?.getAttribute('aria-label') ?? null, sq);
async function roomMove(p, from, to) {
  const c0 = await p.locator('.move-btn').count();
  await click(p, from);
  await click(p, to);
  await p.waitForFunction((c) => document.querySelectorAll('.move-btn').length > c, c0, { timeout: 12000, polling: 30 });
}
async function newRoom(kind, opts = {}) {
  const ctxA = await browser.newContext({ viewport: { width: 1280, height: 800 }, ...opts });
  const ctxB = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const pA = await ctxA.newPage();
  const pB = await ctxB.newPage();
  await pA.goto(BASE + '/');
  await pA.locator(`.create-card.${kind} .gc-create-btn`).click();
  await pA.waitForURL(/\/r\//);
  await pB.goto(pA.url());
  await pA.locator('.waiting-overlay').waitFor({ state: 'hidden', timeout: 15000 });
  await pA.locator('.conn-pill.ok').waitFor({ timeout: 15000 });
  await pB.locator('.conn-pill.ok').waitFor({ timeout: 15000 });
  return { ctxA, ctxB, pA, pB };
}
const moveTexts = (p) => p.evaluate(() => [...document.querySelectorAll('.move-btn')].map((b) => b.textContent.trim()));
const exportBtn = (p, text) => p.locator('.export-card .btn', { hasText: text });
async function copyFen(p) {
  await exportBtn(p, '复制 FEN').click();
  await p.locator('.toast').first().waitFor({ timeout: 5000 });
  const toast = (await p.locator('.toast').first().textContent())?.trim() ?? '';
  const clip = await p.evaluate(() => navigator.clipboard.readText().catch(() => ''));
  return { toast, clip };
}
async function download(p, btnText, filenameRe) {
  const [dl] = await Promise.all([p.waitForEvent('download', { timeout: 10000 }), exportBtn(p, btnText).click()]);
  const name = dl.suggestedFilename();
  const path = await dl.path();
  const content = path ? readFileSync(path, 'utf8') : '';
  return { name, content, nameOk: filenameRe.test(name) };
}

// ================= 中国象棋：HIST-002/004/005/006/007/009/011/012 =================
try {
  const { ctxA, ctxB, pA, pB } = await newRoom('xiangqi', { acceptDownloads: true, permissions: ['clipboard-read', 'clipboard-write'] });
  await roomMove(pA, 'h7', 'e7');
  await roomMove(pB, 'h0', 'g2');
  await roomMove(pA, 'h9', 'g7');
  await roomMove(pB, 'b0', 'c2');
  const listA = await moveTexts(pA);
  const listB = await moveTexts(pB);
  const rows = await pA.evaluate(() => [...document.querySelectorAll('.move-row')].map((r) => r.textContent.trim()));
  ok('HIST-001', '每步一条记录（4 手=4 条且双方一致）', listA.length === 4 && JSON.stringify(listA) === JSON.stringify(listB), JSON.stringify(listA));
  ok('HIST-002', '中象棋谱双列对齐（2 行，红先黑后）', rows.length === 2 && rows.every((r, i) => r.startsWith(`${i + 1}.`)), JSON.stringify(rows));

  // HIST-004 开局/上一步/下一步/当前
  const btn = (t) => pA.locator('.move-nav button', { hasText: t });
  await btn('开局').click();
  await pA.waitForTimeout(150);
  const startH7 = await labelAt(pA, 'h7');
  const startE7 = await labelAt(pA, 'e7');
  const prevDisabledAtStart = await btn('上一步').isDisabled();
  await btn('下一步').click();
  await pA.waitForTimeout(150);
  const ply1E7 = await labelAt(pA, 'e7');
  await btn('当前').click();
  await pA.waitForTimeout(150);
  const g7 = await labelAt(pA, 'g7');
  const g2 = await labelAt(pA, 'g2');
  const nextDisabledAtEnd = await btn('下一步').isDisabled();
  ok('HIST-004', '开局/上一步/下一步/当前导航位置正确', startH7 === 'h7 红炮' && startE7 === null && prevDisabledAtStart && ply1E7 === 'e7 红炮' && g7 === 'g7 红马' && g2 === 'g2 黑马' && nextDisabledAtEnd, `start=${startH7},ply1=${ply1E7},end=${g7}/${g2}`);

  // HIST-006 浏览历史不改变权威状态
  await btn('开局').click();
  await pA.waitForTimeout(120);
  const bCountWhileBrowsing = await pB.locator('.move-btn').count();
  ok('HIST-006', '浏览历史期间对方棋谱/局面不变', bCountWhileBrowsing === 4, `B moves=${bCountWhileBrowsing}`);

  // HIST-007 返回最新后可继续对弈（合法走法：红兵 e6→e5、黑卒 g3→g4）
  await btn('当前').click();
  await pA.waitForTimeout(120);
  await roomMove(pA, 'e6', 'e5');
  await roomMove(pB, 'g3', 'g4');
  const after6A = await moveTexts(pA);
  const after6B = await moveTexts(pB);
  ok('HIST-007', '返回当前后可继续对弈（6 手双端一致）', after6A.length === 6 && JSON.stringify(after6A) === JSON.stringify(after6B) && (await labelAt(pA, 'e5')) === 'e5 红兵', JSON.stringify(after6A.slice(-2)));

  // HIST-005 快速导航无残影
  await btn('开局').click();
  for (let i = 0; i < 5; i++) { await btn('下一步').click(); await pA.waitForTimeout(40); }
  for (let i = 0; i < 5; i++) { await btn('上一步').click(); await pA.waitForTimeout(40); }
  await btn('当前').click();
  await pA.waitForTimeout(250);
  const ghost = await pA.evaluate(() => ({ fly: document.querySelectorAll('.xq-anim-fly').length, pieces: document.querySelectorAll('.xq-piece').length }));
  ok('HIST-005', '快速连续导航后无飞行残影', ghost.fly === 0 && ghost.pieces === 32, JSON.stringify(ghost));

  // HIST-011 刷新后一致（复制 FEN 对比）
  const curFen = await copyFen(pA);
  ok('HIST-008u', 'FEN 复制成功并有 toast', curFen.toast.includes('FEN 已复制') && curFen.clip.length > 20, curFen.toast);
  await pA.reload();
  await pA.locator('.conn-pill.ok').waitFor({ timeout: 15000 });
  await pA.waitForFunction(() => document.querySelectorAll('.move-btn').length === 6, null, { timeout: 10000, polling: 50 }).catch(() => {});
  const afterReload = await moveTexts(pA);
  const reloadFen = await copyFen(pA);
  ok('HIST-011', '刷新后棋谱与 FEN 一致', JSON.stringify(afterReload) === JSON.stringify(after6A) && reloadFen.clip === curFen.clip, `${afterReload.length} moves, fenMatch=${reloadFen.clip === curFen.clip}`);

  // HIST-009 JSON 导出（自定义格式声明 + 终局一致）
  const j = await download(pA, '导出 JSON', /^xiangqi-.+\.json$/);
  let js = null;
  try { js = JSON.parse(j.content); } catch {}
  ok('HIST-009', '中象 JSON 明确自定义格式/非标准声明/终局一致',
    j.nameOk && !!js && js.format === 'chessbox-xiangqi-v1' && /非通用标准/.test(js.note) && js.moves.length === 6 && js.moves[5].fenAfter === curFen.clip && !!js.startFen && js.startFen !== js.moves[5].fenAfter,
    `file=${j.name}, format=${js?.format}, moves=${js?.moves?.length}, lastFenMatch=${js?.moves?.[5]?.fenAfter === curFen.clip}`);
  const txt = await download(pA, '导出中文棋谱', /^xiangqi-.+\.txt$/);
  ok('HIST-009b', '中文棋谱导出（纵线记谱、红黑分行）', txt.nameOk && txt.content.includes('中国象棋对局记录') && txt.content.split('\n').filter((l) => /^\d+\./.test(l)).length === 3, `lines=${txt.content.split('\n').length}`);
  await ctxA.close(); await ctxB.close();
} catch (e) {
  ok('HIST-XQ', '中国象棋棋谱套件', false, e.message);
}

// ================= 国际象棋：HIST-003/008/010 =================
try {
  const ctxA = await browser.newContext({ viewport: { width: 1280, height: 800 }, acceptDownloads: true, permissions: ['clipboard-read', 'clipboard-write'] });
  const ctxB = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const pA = await ctxA.newPage();
  const pB = await ctxB.newPage();
  await pA.goto(BASE + '/');
  await pA.locator('.create-card.chess .gc-create-btn').click();
  await pA.waitForURL(/\/r\//);
  await pB.goto(pA.url());
  await pA.locator('.waiting-overlay').waitFor({ state: 'hidden', timeout: 15000 });
  await pA.locator('.conn-pill.ok').waitFor({ timeout: 15000 });
  await pB.locator('.conn-pill.ok').waitFor({ timeout: 15000 });
  await roomMove(pA, 'e2', 'e4');
  await roomMove(pB, 'e7', 'e5');
  await roomMove(pA, 'g1', 'f3');

  const san = await moveTexts(pA);
  ok('HIST-003', '国象棋谱 SAN 记法（e4/e5/Nf3）', JSON.stringify(san) === JSON.stringify(['e4', 'e5', 'Nf3']), JSON.stringify(san));

  const expected = new Chess();
  expected.move('e4'); expected.move('e5'); expected.move('Nf3');
  const copied = await copyFen(pA);
  let fenOk = false;
  try { fenOk = new Chess(copied.clip).fen() === expected.fen(); } catch {}
  ok('HIST-008', 'FEN 导出可被 chess.js 解析且局面一致', copied.toast.includes('FEN 已复制') && fenOk, `fen=${copied.clip.slice(0, 40)}...`);

  const pgn = await download(pA, '导出 PGN', /^chess-.+\.pgn$/);
  let pgnOk = false;
  let pgnMoves = 0;
  try {
    const chk = new Chess();
    chk.loadPgn(pgn.content);
    pgnMoves = chk.history().length;
    pgnOk = pgnMoves === 3;
  } catch {}
  ok('HIST-008b', 'PGN 导出可回放/含对局信息', pgn.nameOk && /\[Event /.test(pgn.content) && /\[White /.test(pgn.content) && /1\. e4 e5 2\. Nf3/.test(pgn.content) && pgnOk, `file=${pgn.name}, replayed=${pgnMoves} moves`);

  // HIST-010 剪贴板拒绝 → 失败反馈（模拟权限拒绝 + execCommand 不可用）
  const ctxC = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  await ctxC.addInitScript(() => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: () => Promise.reject(new DOMException('denied', 'NotAllowedError')), readText: () => Promise.reject(new DOMException('denied', 'NotAllowedError')) },
    });
    document.execCommand = () => false;
  });
  const pC = await ctxC.newPage();
  await pC.goto(pA.url());
  await pC.locator('.conn-pill.ok').waitFor({ timeout: 15000 });
  await pC.locator('.export-card').waitFor({ timeout: 10000 });
  await exportBtn(pC, '复制 FEN').click();
  await pC.locator('.toast').first().waitFor({ timeout: 5000 });
  const denyToast = (await pC.locator('.toast').first().textContent())?.trim() ?? '';
  ok('HIST-010', '剪贴板权限被拒时有失败反馈且不崩溃', denyToast.includes('复制失败'), denyToast);
  await ctxC.close();
  await ctxA.close(); await ctxB.close();
} catch (e) {
  ok('HIST-CH', '国际象棋棋谱套件', false, e.message);
}

// ================= 空棋谱 / 异常数据（HIST-012） =================
try {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, acceptDownloads: true });
  const p = await ctx.newPage();
  await p.goto(BASE + '/');
  await p.locator('.create-card.xiangqi .gc-create-btn').click();
  await p.waitForURL(/\/r\//);
  await p.locator('.conn-pill.ok').waitFor({ timeout: 15000 });
  const btn = (t) => p.locator('.move-nav button', { hasText: t });
  const emptyState = {
    firstDisabled: await btn('开局').isDisabled(),
    prevDisabled: await btn('上一步').isDisabled(),
    nextDisabled: await btn('下一步').isDisabled(),
    rows: await p.locator('.move-row').count(),
  };
  const j = await download(p, '导出 JSON', /^xiangqi-.+\.json$/);
  let js = null;
  try { js = JSON.parse(j.content); } catch {}
  ok('HIST-012', '空棋谱导航禁用且导出安全（moves=[]）', emptyState.firstDisabled && emptyState.prevDisabled && emptyState.nextDisabled && emptyState.rows === 0 && !!js && Array.isArray(js.moves) && js.moves.length === 0, JSON.stringify(emptyState));
  await ctx.close();
} catch (e) {
  ok('HIST-012b', '空棋谱/异常数据套件', false, e.message);
}

await browser.close();
const failed = results.filter((r) => !r.pass);
console.log(`\nSUMMARY: ${results.length - failed.length}/${results.length} PASS`);
process.exitCode = failed.length ? 1 : 0;