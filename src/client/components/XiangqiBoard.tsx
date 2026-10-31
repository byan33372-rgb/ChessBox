/** 中国象棋棋盘：SVG 传统线格（木纹/河界/九宫/位标/坐标）+ 绝对定位棋子与点击层 + FLIP 走棋动画层 */

import { useMemo } from 'react';
import type { CSSProperties } from 'react';
import { parseFen } from '../../games/xiangqi/engine';
import { pieceLabel } from '../../games/xiangqi/notation';
import type { BoardAnim } from './boardAnim';
import { useMoveFlight } from './useMoveFlight';

export type XqOrientation = 'red' | 'black';

export interface XqBoardProps {
  fen: string;
  orientation: XqOrientation;
  selected: string | null;
  targets: Map<string, boolean>; // to → 是否吃子
  lastMove: { from: string; to: string; extra?: Array<{ from: string; to: string }> } | null;
  checkSquare: string | null;
  onSquareClick(sq: string): void;
  /** 服务端确认后的走棋动画描述（null=无动画直同步） */
  anim?: BoardAnim | null;
}

const FILES = 'abcdefghi';
const CELL = 60;
const MARGIN = 30;
const W = 540;
const H = 600;

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

/** 动画层：恰好覆盖一个格子（角定位，格尺寸 = 棋盘的 1/9 × 1/10）。
 *  内联 translate(0,0) 抵消 .board-overlay > * 的居中位移（新层用角定位，不用中心定位） */
function cellLayerStyle(sq: string, orientation: XqOrientation): CSSProperties {
  const { x, y } = displayXY(sq, orientation);
  return {
    left: `${((x - CELL / 2) / W) * 100}%`,
    top: `${((y - CELL / 2) / H) * 100}%`,
    width: `${(CELL / W) * 100}%`,
    height: `${(CELL / H) * 100}%`,
    transform: 'translate(0, 0)',
  };
}

/** 飞行层：定位在目标格；未 started 时以内联 transform 携带起点偏移（相对本层=精确格距） */
function flyLayerStyle(sq: string, fromSq: string, orientation: XqOrientation, started: boolean): CSSProperties {
  const base = cellLayerStyle(sq, orientation);
  if (started) return base;
  const toXY = displayXY(sq, orientation);
  const fromXY = displayXY(fromSq, orientation);
  const dx = ((fromXY.x - toXY.x) / CELL) * 100;
  const dy = ((fromXY.y - toXY.y) / CELL) * 100;
  return { ...base, transform: `translate(${dx}%, ${dy}%)` };
}

function isRed(code: string): boolean {
  return code >= 'A' && code <= 'Z';
}

function PieceDisc({ code, extraClass }: { code: string; extraClass?: string }) {
  return (
    <span className={`xq-piece ${isRed(code) ? 'red' : 'black'} ${extraClass ?? ''}`}>
      <span className="xq-piece-disc">
        <span className="xq-piece-char">{pieceLabel(code)}</span>
      </span>
    </span>
  );
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
      <defs>
        <linearGradient id="xq-wood" x1="0" y1="0" x2="0.9" y2="1">
          <stop offset="0" stopColor="#eedaa9" />
          <stop offset="0.55" stopColor="#e5cd98" />
          <stop offset="1" stopColor="#d9ba82" />
        </linearGradient>
        <radialGradient id="xq-vignette" cx="0.5" cy="0.46" r="0.78">
          <stop offset="0.6" stopColor="#3a2508" stopOpacity="0" />
          <stop offset="1" stopColor="#3a2508" stopOpacity="0.16" />
        </radialGradient>
        <filter id="xq-grain" x="0" y="0" width="100%" height="100%">
          <feTurbulence type="fractalNoise" baseFrequency="0.011 0.11" numOctaves="3" seed="11" />
          <feColorMatrix
            type="matrix"
            values="0 0 0 0 0.32  0 0 0 0 0.21  0 0 0 0 0.07  0.22 0.22 0.22 0 0"
          />
        </filter>
      </defs>
      {/* 盘面：木底 + 细木纹 + 柔和暗角 */}
      <rect x="2" y="2" width={W - 4} height={H - 4} rx="12" fill="url(#xq-wood)" />
      <rect x="2" y="2" width={W - 4} height={H - 4} rx="12" filter="url(#xq-grain)" opacity="0.55" />
      <rect x="2" y="2" width={W - 4} height={H - 4} rx="12" fill="url(#xq-vignette)" />
      {/* 木框层次 */}
      <rect x="5.5" y="5.5" width={W - 11} height={H - 11} rx="9" fill="none" stroke="#7a5836" strokeWidth="3.2" opacity="0.85" />
      <rect x="10.5" y="10.5" width={W - 21} height={H - 21} rx="6" fill="none" stroke="var(--gold)" strokeWidth="1" opacity="0.4" />
      {lines.map((l, i) => (
        <line key={i} x1={l.x1} y1={l.y1} x2={l.x2} y2={l.y2} className="xq-line" />
      ))}
      {diag.map(([x1, y1, x2, y2], i) => (
        <line key={`d${i}`} x1={x1} y1={y1} x2={x2} y2={y2} className="xq-line thin" />
      ))}
      {marks.map((m, i) => (
        <path key={`m${i}`} d={markPath(m.x, m.y)} className="xq-line thin" fill="none" />
      ))}
      <text x={130} y={MARGIN + CELL * 4 + 36} className="xq-river-text">楚 河</text>
      <text x={410} y={MARGIN + CELL * 4 + 36} className="xq-river-text">漢 界</text>
    </svg>
  );
}

export function XiangqiBoard({ fen, orientation, selected, targets, lastMove, checkSquare, onSquareClick, anim }: XqBoardProps) {
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

  // —— FLIP 飞行层（服务端确认后的前后局面过渡） ——
  const { flight, landSq, finish } = useMoveFlight(anim ?? null);
  const fly = flight?.anim ?? null;
  const started = flight?.started ?? false;
  const isFlyingTo = (sq: string): boolean =>
    !!fly && (fly.to === sq || (!!fly.rook && fly.rook.to === sq));

  return (
    <div className="xq-wrap">
      <div className="board xq-board" role="grid" aria-label="中国象棋棋盘">
        <BoardSvg />
        <div className="board-overlay">
        {lastMove && (
          <>
            {/* 统一上一手标记（MOVE-021/022）：起点琥珀虚线+「起」、终点青绿实线+「终」（形状+颜色双编码） */}
            {(lastMove.extra ?? []).map((e, i) => (
              <div key={`lxe-${i}`} className="xq-last extra" style={posStyle(e.from, orientation)} />
            ))}
            {(lastMove.extra ?? []).map((e, i) => (
              <div key={`lxe2-${i}`} className="xq-last extra" style={posStyle(e.to, orientation)} />
            ))}
            <div className="xq-last from" style={posStyle(lastMove.from, orientation)}>
              <span className="last-tag tag-from">起</span>
            </div>
            <div className="xq-last to" style={posStyle(lastMove.to, orientation)}>
              <span className="last-tag tag-to">终</span>
            </div>
          </>
        )}
        {pieces.map(({ sq, code }) => {
          const isSel = selected === sq;
          const isCheck = checkSquare === sq;
          const side = code >= 'A' && code <= 'Z' ? 'red' : 'black';
          const cls = [
            'xq-piece',
            side,
            isSel ? 'selected' : '',
            isCheck ? 'in-check' : '',
            isFlyingTo(sq) ? 'hidden-flying' : '',
            landSq === sq ? 'just-landed' : '',
          ]
            .filter(Boolean)
            .join(' ');
          return (
            <div key={sq} className={cls} style={posStyle(sq, orientation)} aria-hidden="true">
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
        {fly && fly.capturedSq && fly.capturedCode && (
          <div key={`cap-${fly.key}`} className="xq-anim-captured" style={cellLayerStyle(fly.capturedSq, orientation)}>
            <PieceDisc code={fly.capturedCode} />
          </div>
        )}
        {fly && fly.rook && (
          <div
            key={`rk-${fly.key}`}
            className="xq-anim-fly"
            style={flyLayerStyle(fly.rook.to, fly.rook.from, orientation, started)}
            onTransitionEnd={(e) => {
              if (e.propertyName === 'transform') finish();
            }}
          >
            <PieceDisc code={fly.rook.code} />
          </div>
        )}
        {fly && (
          <div
            key={`mv-${fly.key}`}
            className="xq-anim-fly"
            style={flyLayerStyle(fly.to, fly.from, orientation, started)}
            onTransitionEnd={(e) => {
              if (e.propertyName === 'transform') finish();
            }}
          >
            <PieceDisc code={fly.moverCode} />
          </div>
        )}
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
              data-occ={p ? '1' : undefined}
              onClick={() => onSquareClick(sq)}
            />
          );
        })}
        {/* 坐标标尺：底部列字母 + 右侧行号，均置于棋盘外侧（盘内会被边线棋子遮挡，CN-VIS-007） */}
      </div>
    </div>
      <div className="xq-ranks" aria-hidden="true">
        {Array.from({ length: 10 }, (_, r) => {
          const rightCol = orientation === 'red' ? 8 : 0;
          const { y } = displayXY(FILES[rightCol] + String(r), orientation);
          return (
            <span key={`rr-${r}`} className="xq-rank" style={{ top: `${(y / H) * 100}%` }}>
              {r}
            </span>
          );
        })}
      </div>
      <div className="xq-files" aria-hidden="true">
        {FILES.split('').map((f) => {
          const bottomRow = orientation === 'red' ? 9 : 0;
          const { x } = displayXY(f + String(bottomRow), orientation);
          return (
            <span key={`ff-${f}`} className="xq-file" style={{ left: `${(x / W) * 100}%` }}>
              {f}
            </span>
          );
        })}
      </div>
    </div>
  );
}
