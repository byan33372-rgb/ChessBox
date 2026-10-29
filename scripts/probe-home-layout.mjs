/** 首页试玩卡布局测量：预览容器/包裹层/棋盘/标尺 的矩形。 */
import { chromium } from '@playwright/test';
const browser = await chromium.launch({ channel: 'chrome' });
const p = await browser.newPage({ viewport: { width: 1280, height: 900 } });
await p.goto('http://127.0.0.1:3001/');
await p.locator('.practice-board[data-kind=xiangqi]').waitFor({ timeout: 15000 });
const m = await p.evaluate(() => {
  const r = (sel) => { const el = document.querySelector(sel); if (!el) return null; const b = el.getBoundingClientRect(); return { x: +b.x.toFixed(0), w: +b.width.toFixed(0), h: +b.height.toFixed(0) }; };
  return {
    previewXq: r('.create-card.xiangqi .gc-preview'),
    wrapXq: r('.create-card.xiangqi .xq-wrap'),
    boardXq: r('.create-card.xiangqi .xq-board'),
    ranksXq: r('.create-card.xiangqi .xq-ranks'),
    previewCh: r('.create-card.chess .gc-preview'),
    boardCh: r('.create-card.chess .chess-board'),
  };
});
console.log(JSON.stringify(m, null, 1));
await browser.close();