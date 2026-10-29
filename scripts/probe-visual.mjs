/** 视觉度量探针 v2：在首页试玩棋盘上测量（同组件、无遮罩）：坐标可见性/尺寸比/文字色对比。 */
import { chromium } from '@playwright/test';
import { writeFileSync } from 'node:fs';

const BASE = process.env.NET_BASE ?? 'http://127.0.0.1:3001';
const browser = await chromium.launch({ channel: 'chrome', headless: false, args: ['--disable-backgrounding-occluded-windows'] });
const out = {};

function srgb(c) { return c / 255 <= 0.03928 ? c / 255 / 12.92 : Math.pow((c / 255 + 0.055) / 1.055, 2.4); }
function lum(rgb) { return 0.2126 * srgb(rgb[0]) + 0.7152 * srgb(rgb[1]) + 0.0722 * srgb(rgb[2]); }
function contrast(a, b) { const l1 = lum(a), l2 = lum(b); const hi = Math.max(l1, l2), lo = Math.min(l1, l2); return +((hi + 0.05) / (lo + 0.05)).toFixed(2); }
function parseRgb(s) { const m = (s || '').match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/); return m ? [+m[1], +m[2], +m[3]] : null; }

async function measure(kind) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const p = await ctx.newPage();
  await p.goto(BASE + '/');
  await p.locator(`.practice-board[data-kind=${kind}]`).waitFor({ timeout: 20000 });
  await p.evaluate((k) => document.querySelector(`.practice-board[data-kind=${k}]`).scrollIntoView({ block: 'center' }), kind);
  await p.waitForTimeout(400);
  const res = await p.evaluate((kind) => {
    const root = document.querySelector(`.practice-board[data-kind=${kind}]`);
    const board = root.querySelector('.board');
    const br = board.getBoundingClientRect();
    const hotspots = [...root.querySelectorAll(kind === 'xiangqi' ? '.board-hotspot' : '.chess-sq')];
    const h0 = (hotspots[0] ?? board).getBoundingClientRect();
    const coordSel = kind === 'xiangqi' ? '.xq-coord, .xq-rank' : '.coord';
    const pieceEls = [...root.querySelectorAll(kind === 'xiangqi' ? '.xq-piece' : '.chess-piece-wrap')];
    const pieceRects = pieceEls.map((el) => { const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; });
    const overlaps = (a) => pieceRects.filter((b) => !(a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y)).length;
    const coords = [...root.querySelectorAll(coordSel)].map((el) => {
      const r = el.getBoundingClientRect();
      const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
      const hit = document.elementFromPoint(cx, cy);
      return {
        text: el.textContent,
        cls: (el.className || '').toString(),
        rect: { x: +r.x.toFixed(1), y: +r.y.toFixed(1), w: +r.width.toFixed(1), h: +r.height.toFixed(1) },
        insideBoard: r.left >= br.left - 0.5 && r.right <= br.right + 0.5 && r.top >= br.top - 0.5 && r.bottom <= br.bottom + 0.5,
        topmost: hit === el || el.contains(hit) || (hit && hit.contains(el)),
        pieceOverlaps: overlaps(r),
        hitCls: hit ? (hit.className || '').toString().slice(0, 30) : null,
      };
    });
    const piece = root.querySelector(kind === 'xiangqi' ? '.xq-piece' : '.chess-piece-wrap');
    const pr = piece?.getBoundingClientRect();
    const css = (sel) => { const el = root.querySelector(sel); if (!el) return null; const c = getComputedStyle(el); return { color: c.color, bg: c.backgroundColor, bgImage: c.backgroundImage.slice(0, 160), fontSize: c.fontSize, fontWeight: c.fontWeight }; };
    return {
      board: { w: +br.width.toFixed(1), h: +br.height.toFixed(1) },
      cell: +h0.width.toFixed(1),
      piece: pr ? { w: +pr.width.toFixed(1), h: +pr.height.toFixed(1) } : null,
      pieceRatio: pr ? +(pr.width / h0.width).toFixed(3) : null,
      redChar: kind === 'xiangqi' ? css('.xq-piece.red .xq-piece-char') : null,
      blackChar: kind === 'xiangqi' ? css('.xq-piece.black .xq-piece-char') : null,
      disc: kind === 'xiangqi' ? css('.xq-piece.red .xq-piece-disc') : null,
      coords,
      coordCount: coords.length,
      coordHidden: coords.filter((c) => !c.topmost).map((c) => c.text + ':' + c.hitCls),
      coordOutside: coords.filter((c) => !c.insideBoard).map((c) => c.text),
      coordFont: css(coordSel),
    };
  }, kind);
  await ctx.close();
  return res;
}

for (const kind of ['xiangqi', 'chess']) {
  const m = await measure(kind);
  out[kind === 'xiangqi' ? 'XQ' : 'CH'] = m;
  console.log(`== ${kind} == board=${m.board.w}x${m.board.h} cell=${m.cell} piece=${m.piece?.w}x${m.piece?.h} ratio=${m.pieceRatio}`);
  console.log(`coords=${m.coordCount} hidden=${JSON.stringify(m.coordHidden)} outside=${JSON.stringify(m.coordOutside)} font=${m.coordFont?.fontSize}/${m.coordFont?.color}`);
  console.log(`coordPieceOverlaps=${JSON.stringify(m.coords.filter((c) => c.pieceOverlaps > 0).map((c) => c.text + ':' + c.pieceOverlaps))}`);
  const ranks = m.coords.filter((c) => c.cls.includes('xq-rank'));
  if (ranks.length) console.log(`rank labels=${ranks.length} pieceOverlaps=${JSON.stringify(ranks.filter((c) => c.pieceOverlaps > 0).map((c) => c.text))} sampleRect=${JSON.stringify(ranks[0].rect)}`);
  if (m.redChar) {
    const rc = parseRgb(m.redChar.color);
    const bc = parseRgb(m.blackChar.color);
    const discBase = parseRgb(m.disc?.bg) ?? [243, 227, 190];
    const discGradFirst = parseRgb(m.disc?.bgImage) ?? discBase;
    console.log(`red char=${m.redChar.color} (${m.redChar.fontSize}/${m.redChar.fontWeight}) contrast(vs disc ${discGradFirst}) = ${contrast(rc, discGradFirst)}:1`);
    console.log(`black char=${m.blackChar.color} contrast = ${contrast(bc, discGradFirst)}:1`);
    console.log(`disc bg=${m.disc?.bg} bgImage=${m.disc?.bgImage?.slice(0, 100)}`);
  }
}
writeFileSync('docs/acceptance/visual-metrics.json', JSON.stringify(out, null, 2));
await browser.close();