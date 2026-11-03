/**
 * 围棋棋盘组件（GO-004~006 / MOBILE-008/012/014）：
 * - 交叉点布局（非格子）；星位/天元；落子点=最近交叉点吸附；
 * - 上一手落点圆环标记（形状+位置区分，MOVE-007）；提子点淡显一瞬由信息区承担；
 * - 数子阶段渲染死子标记（双方标记交集=半透明叉，单方预览标记=虚线圈由信息区列表展示）；
 * - 尺寸由容器宽度决定（CSS 100%），命中区域=整格半宽（19 路手机也可触控，MOBILE-012/014）。
 */
import { useMemo } from 'react';
import { starPoints, type GoSize } from '../../games/go/engine';

export interface GoBoardProps {
  size: GoSize;
  fen: string;
  lastMove: string | null;
  deadStones: string[];
  /** 数子阶段标记死子模式 */
  scoringMode: boolean;
  onPointClick(pt: string): void;
  interactive: boolean;
}

interface StoneMap {
  b: Set<string>;
  w: Set<string>;
}

function parseFen(fen: string): { stones: StoneMap; size: GoSize } {
  const parts = fen.split('|');
  const size = Number(parts[0].slice(2)) as GoSize;
  const stones: StoneMap = { b: new Set(), w: new Set() };
  for (const part of parts) {
    if (part.startsWith('b=')) for (const t of part.slice(2).split(',')) if (t) stones.b.add(t);
    if (part.startsWith('w=')) for (const t of part.slice(2).split(',')) if (t) stones.w.add(t);
  }
  return { stones, size };
}

const COLS = 'abcdefghijklmnopqrs';

export function GoBoard({ size, fen, lastMove, deadStones, scoringMode, onPointClick, interactive }: GoBoardProps) {
  const { stones } = useMemo(() => parseFen(fen), [fen]);
  const stars = useMemo(() => starPoints(size), [size]);
  const dead = useMemo(() => new Set(deadStones), [deadStones]);

  const W = 100; // viewBox 逻辑宽度
  const pad = 100 / (size + 1); // 边距 = 一格
  const cell = (W - pad * 2) / (size - 1);
  const px = (i: number) => pad + i * cell;
  const pt = (x: number, y: number) => COLS[x] + (y + 1);
  const hitR = cell * 0.52; // MOBILE-014：吸附半径略大于半格

  const lines = [];
  for (let i = 0; i < size; i++) {
    lines.push(<line key={`v${i}`} x1={px(i)} y1={px(0)} x2={px(i)} y2={px(size - 1)} className="go-line" />);
    lines.push(<line key={`h${i}`} x1={px(0)} y1={px(i)} x2={px(size - 1)} y2={px(i)} className="go-line" />);
  }

  const hits = [];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      hits.push(
        <circle
          key={`hit-${x}-${y}`}
          data-pt={pt(x, y)}
          cx={px(x)}
          cy={px(y)}
          r={hitR}
          fill="transparent"
          className={interactive ? 'go-hit' : 'go-hit disabled'}
          onClick={() => onPointClick(pt(x, y))}
        >
          <title>{pt(x, y).toUpperCase()}</title>
        </circle>,
      );
    }
  }

  const stoneEls: React.ReactNode[] = [];
  for (const p of stones.b) {
    const m = /^([a-s])(\d+)$/.exec(p)!;
    const x = m[1].charCodeAt(0) - 97;
    const y = Number(m[2]) - 1;
    stoneEls.push(
      <g key={`b-${p}`} className={dead.has(p) ? 'go-stone dead' : 'go-stone'}>
        <circle cx={px(x)} cy={px(y)} r={cell * 0.47} fill="#1c1a17" stroke="#000" strokeWidth={0.4} />
        <circle cx={px(x) - cell * 0.12} cy={px(y) - cell * 0.14} r={cell * 0.13} fill="rgba(255,255,255,0.28)" />
      </g>,
    );
  }
  for (const p of stones.w) {
    const m = /^([a-s])(\d+)$/.exec(p)!;
    const x = m[1].charCodeAt(0) - 97;
    const y = Number(m[2]) - 1;
    stoneEls.push(
      <g key={`w-${p}`} className={dead.has(p) ? 'go-stone dead' : 'go-stone'}>
        <circle cx={px(x)} cy={px(y)} r={cell * 0.47} fill="#e9e2d0" stroke="#8a7f6f" strokeWidth={0.4} />
        <circle cx={px(x) - cell * 0.12} cy={px(y) - cell * 0.14} r={cell * 0.13} fill="rgba(255,255,255,0.65)" />
      </g>,
    );
  }

  return (
    <div className="go-board" data-size={size}>
      <svg viewBox={`0 0 ${W} ${W}`} role="img" aria-label={`围棋 ${size}路棋盘`} className="go-svg">
        <rect x={0} y={0} width={W} height={W} className="go-wood" />
        {lines}
        {stars.map((p) => {
          const m = /^([a-s])(\d+)$/.exec(p)!;
          return <circle key={`s-${p}`} cx={px(m[1].charCodeAt(0) - 97)} cy={px(Number(m[2]) - 1)} r={cell * 0.09} className="go-star" />;
        })}
        {stoneEls}
        {/* 上一手落点：方形角标（与圆形棋子形状区分，MOVE-006/007） */}
        {lastMove && (() => {
          const m = /^([a-s])(\d+)$/.exec(lastMove);
          if (!m) return null;
          const x = m[1].charCodeAt(0) - 97;
          const y = Number(m[2]) - 1;
          const isLastStone = stones.b.has(lastMove) || stones.w.has(lastMove);
          return isLastStone ? (
            <rect
              x={px(x) - cell * 0.22}
              y={px(y) - cell * 0.22}
              width={cell * 0.44}
              height={cell * 0.44}
              fill="none"
              stroke="#2ec4b6"
              strokeWidth={1.2}
              className="go-last"
            />
          ) : (
            <circle cx={px(x)} cy={px(y)} r={cell * 0.3} fill="none" stroke="#2ec4b6" strokeWidth={1.2} className="go-last" />
          );
        })()}
        {/* 数子阶段：死子叉标 */}
        {scoringMode && [...dead].map((p) => {
          const m = /^([a-s])(\d+)$/.exec(p)!;
          const x = m[1].charCodeAt(0) - 97;
          const y = Number(m[2]) - 1;
          return (
            <g key={`d-${p}`} className="go-dead-mark">
              <line x1={px(x) - cell * 0.3} y1={px(y) - cell * 0.3} x2={px(x) + cell * 0.3} y2={px(y) + cell * 0.3} stroke="#d5543f" strokeWidth={0.9} />
              <line x1={px(x) - cell * 0.3} y1={px(y) + cell * 0.3} x2={px(x) + cell * 0.3} y2={px(y) - cell * 0.3} stroke="#d5543f" strokeWidth={0.9} />
            </g>
          );
        })}
        {hits}
      </svg>
    </div>
  );
}
