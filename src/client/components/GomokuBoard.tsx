/**
 * 五子棋棋盘组件（GOMOKU-002/014 / MOBILE-013/014）：
 * - 15×15 交叉点布局；上一手方形角标（与棋子圆形区分）；胜利线高亮（extra 五连点）；
 * - 命中吸附半径 = 半格以上（MOBILE-014）。
 */
import { useMemo } from 'react';

const COLS = 'abcdefghijklmno';

export interface GomokuBoardProps {
  fen: string;
  lastMove: string | null;
  /** 胜利连线（AppliedMove.extra 五连点） */
  winLine: string[];
  onPointClick(pt: string): void;
  interactive: boolean;
}

function parseFen(fen: string): { b: Set<string>; w: Set<string> } {
  const stones = { b: new Set<string>(), w: new Set<string>() };
  for (const part of fen.split('|')) {
    if (part.startsWith('b=')) for (const t of part.slice(2).split(',')) if (t) stones.b.add(t);
    if (part.startsWith('w=')) for (const t of part.slice(2).split(',')) if (t) stones.w.add(t);
  }
  return stones;
}

export function GomokuBoard({ fen, lastMove, winLine, onPointClick, interactive }: GomokuBoardProps) {
  const stones = useMemo(() => parseFen(fen), [fen]);
  const size = 15;
  const W = 100;
  const pad = 100 / (size + 1);
  const cell = (W - pad * 2) / (size - 1);
  const px = (i: number) => pad + i * cell;
  const pt = (x: number, y: number) => COLS[x] + (y + 1);

  const lines = [];
  for (let i = 0; i < size; i++) {
    lines.push(<line key={`v${i}`} x1={px(i)} y1={px(0)} x2={px(i)} y2={px(size - 1)} className="gk-line" />);
    lines.push(<line key={`h${i}`} x1={px(0)} y1={px(i)} x2={px(size - 1)} y2={px(i)} className="gk-line" />);
  }
  // 天元与四星（15 路标准星位）
  const stars = ['h8', 'd4', 'd12', 'l4', 'l12'];
  const winSet = useMemo(() => new Set(winLine), [winLine]);

  const stoneEls: React.ReactNode[] = [];
  const drawStone = (p: string, color: 'b' | 'w') => {
    const m = /^([a-o])(\d+)$/.exec(p)!;
    const x = m[1].charCodeAt(0) - 97;
    const y = Number(m[2]) - 1;
    const isWin = winSet.has(p);
    stoneEls.push(
      <g key={`${color}-${p}`} className={isWin ? 'gk-stone win' : 'gk-stone'}>
        <circle
          cx={px(x)}
          cy={px(y)}
          r={cell * 0.44}
          fill={color === 'b' ? '#1c1a17' : '#e9e2d0'}
          stroke={color === 'b' ? '#000' : '#8a7f6f'}
          strokeWidth={0.4}
        />
        {isWin && <circle cx={px(x)} cy={px(y)} r={cell * 0.3} fill="none" stroke="#d9a521" strokeWidth={1.1} />}
      </g>,
    );
  };
  for (const p of stones.b) drawStone(p, 'b');
  for (const p of stones.w) drawStone(p, 'w');

  const hits = [];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      hits.push(
        <circle
          key={`hit-${x}-${y}`}
          data-pt={pt(x, y)}
          cx={px(x)}
          cy={px(y)}
          r={cell * 0.52}
          fill="transparent"
          className={interactive ? 'go-hit' : 'go-hit disabled'}
          onClick={() => onPointClick(pt(x, y))}
        >
          <title>{pt(x, y).toUpperCase()}</title>
        </circle>,
      );
    }
  }

  return (
    <div className="gk-board">
      <svg viewBox={`0 0 ${W} ${W}`} role="img" aria-label="五子棋 15路棋盘" className="gk-svg">
        <rect x={0} y={0} width={W} height={W} className="gk-wood" />
        {lines}
        {stars.map((p) => {
          const m = /^([a-o])(\d+)$/.exec(p)!;
          return <circle key={`s-${p}`} cx={px(m[1].charCodeAt(0) - 97)} cy={px(Number(m[2]) - 1)} r={cell * 0.09} className="go-star" />;
        })}
        {stoneEls}
        {/* 上一手落点：方形角标（MOVE-006/007） */}
        {lastMove && (() => {
          const m = /^([a-o])(\d+)$/.exec(lastMove);
          if (!m) return null;
          const x = m[1].charCodeAt(0) - 97;
          const y = Number(m[2]) - 1;
          return (
            <rect
              x={px(x) - cell * 0.2}
              y={px(y) - cell * 0.2}
              width={cell * 0.4}
              height={cell * 0.4}
              fill="none"
              stroke="#2ec4b6"
              strokeWidth={1.1}
              className="go-last"
            />
          );
        })()}
        {hits}
      </svg>
    </div>
  );
}
