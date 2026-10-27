/** 中国象棋棋盘：SVG 传统线格（河界/九宫/位标）+ 绝对定位棋子与点击层 */

import { useMemo } from 'react';
import { parseFen } from '../../games/xiangqi/engine';
import { pieceLabel } from '../../games/xiangqi/notation';

export type XqOrientation = 'red' | 'black';

export interface XqBoardProps {
  fen: string;
  orientation: XqOrientation;
  selected: string | null;
  targets: Map<string, boolean>; // to → 是否吃子
  lastMove: { from: string; to: string } | null;
  checkSquare: string | null;
  onSquareClick(sq: string): void;
}

const FILES = 'abcdefghi';
const CELL = 60;
const MARGIN = 30;
const W = 540;
const H = 600;

function sqXY(sq: string): { x: number; y: number } {
  return { x: MARGIN + CELL * FILES.indexOf(sq[0]), y: MARGIN + CELL * Number(sq[1]) };
}

/** 依据视角翻转坐标 */
function displayXY(sq: string, orientation: XqOrientation): { x: number; y: number } {
  const c = FILES.indexOf(sq[0]);
  const r = Number(sq[1]);
  const cc = orientation === 'red' ? c : 8 - c;
  const rr = orientation === 'red' ? r : 9 - r;
  return { x: MARGIN + CELL * cc, y: MARGIN + CELL * rr };
}

function posStyle(sq: string, orientation: XqOrientation) {
  const { x, y } = displayXY(sq, orientation);
  return { left: `${(x / W) * 100}%`, top: `${(y / H) * 100}%` } as const;
}

function BoardSvg() {
  const lines: Array<{ x1: number; y1: number; x2: number; y2: number }> = [];
  // 横线 10 条
  for (let r = 0; r <= 9; r++) {
    lines.push({ x1: MARGIN, y1: MARGIN + CELL * r, x2: MARGIN + CELL * 8, y2: MARGIN + CELL * r });
  }
  // 竖线 9 条（中间 7 条在河界断开）
  for (let c = 0; c <= 8; c++) {
    const x = MARGIN + CELL * c;
    if (c === 0 || c === 8) {
      lines.push({ x1: x, y1: MARGIN, x2: x, y2: MARGIN + CELL * 9 });
    } else {
      lines.push({ x1: x, y1: MARGIN, x2: x, y2: MARGIN + CELL * 4 });
      lines.push({ x1: x, y1: MARGIN + CELL * 5, x2: x, y2: MARGIN + CELL * 9 });
    }
  }
  // 九宫斜线
  const diag: Array<[number, number, number, number]> = [
    [MARGIN + CELL * 3, MARGIN, MARGIN + CELL * 5, MARGIN + CELL * 2],
    [MARGIN + CELL * 5, MARGIN, MARGIN + CELL * 3, MARGIN + CELL * 2],
    [MARGIN + CELL * 3, MARGIN + CELL * 7, MARGIN + CELL * 5, MARGIN + CELL * 9],
    [MARGIN + CELL * 5, MARGIN + CELL * 7, MARGIN + CELL * 3, MARGIN + CELL * 9],
  ];
  // 炮位与兵位标记
  const marks: Array<{ x: number; y: number }> = [];
  const markSpots: Array<[number, number]> = [];
  for (const c of [1, 7]) {
    markSpots.push([c, 2], [c, 7]);
  }
  for (const c of [0, 2, 4, 6, 8]) {
    markSpots.push([c, 3], [c, 6]);
  }
  for (const [c, r] of markSpots) marks.push({ x: MARGIN + CELL * c, y: MARGIN + CELL * r });

  const markPath = (x: number, y: number): string => {
    const g = 5; // 伸出长度
    const o = 4; // 距交点偏移
    let d = '';
    if (x > MARGIN) {
      d += `M${x - o - g},${y - o} h${g} M${x - o - g},${y - o} v${g} `;
      d += `M${x - o - g},${y + o} h${g} M${x - o - g},${y + o} v-${g} `;
    }
    if (x < W - MARGIN) {
      d += `M${x + o},${y - o} h-${g} M${x + o},${y - o} v${g} `;
      d += `M${x + o},${y + o} h-${g} M${x + o},${y + o} v-${g} `;
    }
    return d;
  };

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="xq-svg" aria-hidden="true">
      <rect x={4} y={4} width={W - 8} height={H - 8} rx={10} fill="#efdcab" />
      {lines.map((l, i) => (
        <line key={i} x1={l.x1} y1={l.y1} x2={l.x2} y2={l.y2} stroke="#8a6d4a" strokeWidth={1.6} />
      ))}
      {diag.map(([x1, y1, x2, y2], i) => (
        <line key={`d${i}`} x1={x1} y1={y1} x2={x2} y2={y2} stroke="#8a6d4a" strokeWidth={1.4} />
      ))}
      {marks.map((m, i) => (
        <path key={`m${i}`} d={markPath(m.x, m.y)} stroke="#8a6d4a" strokeWidth={1.4} fill="none" />
      ))}
      <text x={130} y={MARGIN + CELL * 4 + 34} className="xq-river-text">楚 河</text>
      <text x={410} y={MARGIN + CELL * 4 + 34} className="xq-river-text">漢 界</text>
      <text x={130} y={MARGIN + CELL * 5 + 8} className="xq-river-text" transform={`rotate(180 130 ${MARGIN + CELL * 5 + 8})`}>界 漢</text>
      <text x={410} y={MARGIN + CELL * 5 + 8} className="xq-river-text" transform={`rotate(180 410 ${MARGIN + CELL * 5 + 8})`}>河 楚</text>
    </svg>
  );
}

export function XiangqiBoard({ fen, orientation, selected, targets, lastMove, checkSquare, onSquareClick }: XqBoardProps) {
  const grid = useMemo(() => {
    try {
      return parseFen(fen).board;
    } catch {
      return null;
    }
  }, [fen]);

  const pieces = useMemo(() => {
    if (!grid) return [];
    const out: Array<{ sq: string; code: string }> = [];
    for (let r = 0; r <= 9; r++) {
      for (let c = 0; c <= 8; c++) {
        const p = grid[r][c];
        if (p) out.push({ sq: FILES[c] + String(r), code: p });
      }
    }
    return out;
  }, [grid]);

  const allSquares = useMemo(() => {
    const out: string[] = [];
    for (let r = 0; r <= 9; r++) for (let c = 0; c <= 8; c++) out.push(FILES[c] + String(r));
    return out;
  }, []);

  const pieceAt = (sq: string): string | null => {
    if (!grid) return null;
    return grid[Number(sq[1])][FILES.indexOf(sq[0])] ?? null;
  };

  return (
    <div className="board xq-board" role="grid" aria-label="中国象棋棋盘">
      <BoardSvg />
      <div className="board-overlay">
        {lastMove && (
          <>
            <div className="xq-last" style={posStyle(lastMove.from, orientation)} />
            <div className="xq-last" style={posStyle(lastMove.to, orientation)} />
          </>
        )}
        {pieces.map(({ sq, code }) => {
          const isRed = code >= 'A' && code <= 'Z';
          const isSel = selected === sq;
          const isCheck = checkSquare === sq;
          return (
            <div
              key={sq}
              className={`xq-piece ${isRed ? 'red' : 'black'} ${isSel ? 'selected' : ''} ${isCheck ? 'in-check' : ''}`}
              style={posStyle(sq, orientation)}
              aria-hidden="true"
            >
              <span className="xq-piece-disc">
                <span className="xq-piece-char">{pieceLabel(code)}</span>
              </span>
            </div>
          );
        })}
        {selected && <div className="xq-sel-ring" style={posStyle(selected, orientation)} />}
        {[...targets.entries()].map(([to, capture]) => (
          <div key={to} className={capture ? 'xq-target-ring' : 'xq-target-dot'} style={posStyle(to, orientation)} />
        ))}
        {allSquares.map((sq) => {
          const p = pieceAt(sq);
          const label = p ? `${sq} ${p >= 'A' && p <= 'Z' ? '红' : '黑'}${pieceLabel(p)}` : sq;
          return (
            <button
              key={sq}
              type="button"
              className="board-hotspot"
              style={posStyle(sq, orientation)}
              aria-label={label}
              onClick={() => onSquareClick(sq)}
            />
          );
        })}
      </div>
    </div>
  );
}
