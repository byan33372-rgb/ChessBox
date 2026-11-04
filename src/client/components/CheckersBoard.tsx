/**
 * 中国跳棋六角星棋盘（Sternhalma，121 孔位）。
 * 几何全部来自 games/checkers/board.ts（行模型 + 像素换算），不做网格猜测。
 * 标记体系（MOVE-021/022/027）：上一手起点琥珀虚线环 + 终点青绿实线环（形状+颜色双编码，色觉无障碍）；
 * 连跳完整路径以青绿虚线折线展示（CHECKERS-027）。
 */
import { useMemo } from 'react';
import {
  ALL_CELLS,
  cellPixel,
  campOf,
} from '../../games/checkers/board';
import { CHECKERS_COLORS } from '../../games/checkers/engine';
import type { CheckersSim } from './checkersUi';

export interface CheckersLastMove {
  from: string;
  to: string;
  path?: string[];
}

export interface CheckersFlight {
  /** 飞行棋子座位 */
  seat: string;
  from: string;
  to: string;
  key: number;
}

const SPACING = 40;
const HOLE_R = 13.5;
const PIECE_R = 12;
const HIT_R = 19;

/** 营地底色（比棋子色淡、可辨识，供 2-6 人识别座位区） */
const CAMP_TINT: Record<number, string> = {
  0: 'rgba(196,62,47,0.30)',
  1: 'rgba(47,111,176,0.30)',
  2: 'rgba(63,143,79,0.30)',
  3: 'rgba(217,165,33,0.32)',
  4: 'rgba(90,80,66,0.34)',
  5: 'rgba(125,91,181,0.30)',
};
const CAMP_STROKE: Record<number, string> = {
  0: 'rgba(196,62,47,0.75)',
  1: 'rgba(47,111,176,0.75)',
  2: 'rgba(63,143,79,0.75)',
  3: 'rgba(217,165,33,0.8)',
  4: 'rgba(150,134,110,0.8)',
  5: 'rgba(125,91,181,0.75)',
};

export function checkersViewBox(): string {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const cell of ALL_CELLS) {
    const p = cellPixel(cell.id, SPACING);
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  const pad = 26;
  return `${minX - pad} ${minY - pad} ${maxX - minX + pad * 2} ${maxY - minY + pad * 2}`;
}

export interface CheckersBoardProps {
  pieces: CheckersSim;
  selected: string | null;
  /** 连跳进行中的链（含起点）；渲染为待确认路径 */
  chain?: string[] | null;
  /** 当前可选落点 */
  targets: Map<string, boolean>;
  lastMove: CheckersLastMove | null;
  /** 2 人局 b 方上下翻转 */
  flipped?: boolean;
  onSquareClick(id: string): void;
  flight?: CheckersFlight | null;
}

export function CheckersBoard({
  pieces,
  selected,
  chain,
  targets,
  lastMove,
  flipped = false,
  onSquareClick,
  flight,
}: CheckersBoardProps) {
  const viewBox = useMemo(checkersViewBox, []);
  const center = useMemo(() => {
    const vb = viewBox.split(' ').map(Number);
    return { x: vb[0] + vb[2] / 2, y: vb[1] + vb[3] / 2 };
  }, [viewBox]);

  const pos = (id: string) => cellPixel(id, SPACING);
  const chainPts = chain && chain.length > 1 ? chain.map(pos) : null;
  const lastPathPts =
    lastMove?.path && lastMove.path.length > 2
      ? lastMove.path.map(pos)
      : lastMove
        ? [pos(lastMove.from), pos(lastMove.to)]
        : null;

  return (
    <div className={`checkers-board ${flipped ? 'flipped' : ''}`}>
      <svg viewBox={viewBox} role="img" aria-label="中国跳棋棋盘" className="checkers-svg">
        {/* 星形底板：六营地淡色三角 + 中心区 */}
        <g transform={flipped ? `rotate(180 ${center.x} ${center.y})` : undefined}>
          {ALL_CELLS.map((cell) => {
            const p = pos(cell.id);
            const camp = campOf(cell.id);
            return (
              <circle
                key={`bg-${cell.id}`}
                cx={p.x}
                cy={p.y}
                r={HOLE_R}
                fill={camp >= 0 ? CAMP_TINT[camp] : 'rgba(255,255,255,0.05)'}
                stroke={camp >= 0 ? CAMP_STROKE[camp] : 'rgba(0,0,0,0.25)'}
                strokeWidth={camp >= 0 ? 1.2 : 1}
              />
            );
          })}

          {/* 上一手连跳路径（终点标记之前画，避免遮挡） */}
          {lastPathPts && (
            <polyline
              points={lastPathPts.map((q) => `${q.x},${q.y}`).join(' ')}
              fill="none"
              stroke="rgba(46,196,182,0.65)"
              strokeWidth={3}
              strokeDasharray="7 5"
              strokeLinecap="round"
            />
          )}
          {/* 连跳待确认路径（比上一手路径更亮） */}
          {chainPts && (
            <polyline
              points={chainPts.map((q) => `${q.x},${q.y}`).join(' ')}
              fill="none"
              stroke="rgba(46,196,182,0.95)"
              strokeWidth={3.5}
              strokeDasharray="4 4"
              strokeLinecap="round"
            />
          )}

          {/* 上一手标记：起点琥珀虚线环（MOVE-021），终点青绿实线环 + 中心点（MOVE-022） */}
          {lastMove && (
            <>
              <circle
                className="ck-mark-from"
                cx={pos(lastMove.from).x}
                cy={pos(lastMove.from).y}
                r={HOLE_R + 4}
                fill="none"
                stroke="#d9a521"
                strokeWidth={2.5}
                strokeDasharray="5 4"
              />
              <text
                x={pos(lastMove.from).x}
                y={pos(lastMove.from).y - HOLE_R - 8}
                textAnchor="middle"
                fontSize={11}
                fill="#d9a521"
                className="mark-label"
              >
                起
              </text>
              <circle
                className="ck-mark-to"
                cx={pos(lastMove.to).x}
                cy={pos(lastMove.to).y}
                r={HOLE_R + 4}
                fill="none"
                stroke="#2ec4b6"
                strokeWidth={3}
              />
              <circle cx={pos(lastMove.to).x} cy={pos(lastMove.to).y} r={3} fill="#2ec4b6" />
              <text
                x={pos(lastMove.to).x}
                y={pos(lastMove.to).y - HOLE_R - 8}
                textAnchor="middle"
                fontSize={11}
                fill="#2ec4b6"
                className="mark-label"
              >
                终
              </text>
            </>
          )}

          {/* 棋子 */}
          {[...pieces.entries()].map(([id, seat]) => {
            const p = pos(id);
            const color = CHECKERS_COLORS[seat] ?? '#888';
            const isSel = id === selected;
            return (
              <g key={`pc-${id}`}>
                {isSel && (
                  <circle cx={p.x} cy={p.y} r={PIECE_R + 4} fill="none" stroke="#ffffff" strokeWidth={2.5} opacity={0.9} />
                )}
                <circle cx={p.x} cy={p.y} r={PIECE_R} fill={color} stroke="rgba(0,0,0,0.45)" strokeWidth={1.5}>
                  <title>{`玩家 ${seat.toUpperCase()} 的棋子`}</title>
                </circle>
                <circle cx={p.x - 3.5} cy={p.y - 4} r={3.2} fill="rgba(255,255,255,0.35)" />
              </g>
            );
          })}

          {/* 可选落点提示 */}
          {[...targets.keys()].map((id) => {
            const p = pos(id);
            return (
              <circle
                key={`tg-${id}`}
                cx={p.x}
                cy={p.y}
                r={7}
                fill="rgba(255,255,255,0.55)"
                stroke="rgba(255,255,255,0.9)"
                strokeWidth={1.5}
                className="target-dot"
              />
            );
          })}

          {/* 飞行动画层（连跳/单步共用）：从 from 向 to 平移的棋子 */}
          {flight && (
            <circle
              key={flight.key}
              className="checkers-flight"
              cx={pos(flight.from).x}
              cy={pos(flight.from).y}
              r={PIECE_R}
              fill={CHECKERS_COLORS[flight.seat] ?? '#888'}
              stroke="rgba(0,0,0,0.45)"
              strokeWidth={1.5}
              style={{
                ['--flight-dx' as string]: `${pos(flight.to).x - pos(flight.from).x}px`,
                ['--flight-dy' as string]: `${pos(flight.to).y - pos(flight.from).y}px`,
              }}
            />
          )}

          {/* 命中层：始终最后渲染，覆盖全部交互（UX-003 大命中区域） */}
          {ALL_CELLS.map((cell) => {
            const p = pos(cell.id);
            return (
              <circle
                key={`hit-${cell.id}`}
                data-cell={cell.id}
                cx={p.x}
                cy={p.y}
                r={HIT_R}
                fill="transparent"
                className="checkers-hit"
                onClick={() => onSquareClick(cell.id)}
              >
                <title>{cell.id}</title>
              </circle>
            );
          })}
        </g>
      </svg>
    </div>
  );
}
