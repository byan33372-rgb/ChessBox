/** 国际象棋棋盘：经典浅深格 + 自绘 SVG 棋子 + 坐标 + FLIP 走棋动画层 */

import { useMemo } from 'react';
import type { CSSProperties } from 'react';
import { ChessPiece } from './ChessPieces';
import type { BoardAnim } from './boardAnim';
import { useMoveFlight } from './useMoveFlight';

export type ChessOrientation = 'white' | 'black';

export interface ChessBoardProps {
  fen: string;
  orientation: ChessOrientation;
  selected: string | null;
  targets: Map<string, boolean>;
  lastMove: { from: string; to: string } | null;
  checkSquare: string | null;
  onSquareClick(sq: string): void;
  /** 服务端确认后的走棋动画描述（null=无动画直同步） */
  anim?: BoardAnim | null;
}

const FILES = 'abcdefgh';
const PIECE_NAMES: Record<string, string> = {
  P: '兵',
  N: '马',
  B: '象',
  R: '车',
  Q: '后',
  K: '王',
};

function parsePlacement(fen: string): Map<string, string> {
  const map = new Map<string, string>();
  const rows = fen.split(/\s+/)[0].split('/');
  for (let i = 0; i < 8; i++) {
    const rank = 8 - i;
    let file = 0;
    for (const ch of rows[i] ?? '') {
      if (ch >= '1' && ch <= '8') {
        file += Number(ch);
      } else if (/[a-zA-Z]/.test(ch)) {
        map.set(FILES[file] + String(rank), ch);
        file++;
      }
    }
  }
  return map;
}

/** 逻辑格 → 视觉列/行（0..7，左上原点） */
function displayPos(sq: string, orientation: ChessOrientation): { col: number; row: number } {
  const file = FILES.indexOf(sq[0]);
  const rank = Number(sq[1]);
  return orientation === 'white'
    ? { col: file, row: 8 - rank }
    : { col: 7 - file, row: rank - 1 };
}

/** 动画层：恰好覆盖一个格子（角定位 12.5% × 12.5%）。内联 translate(0,0) 抵消 .board-overlay 系居中规则 */
function cellLayerStyle(sq: string, orientation: ChessOrientation): CSSProperties {
  const { col, row } = displayPos(sq, orientation);
  return {
    left: `${col * 12.5}%`,
    top: `${row * 12.5}%`,
    width: '12.5%',
    height: '12.5%',
    transform: 'translate(0, 0)',
  };
}

/** 飞行层：定位在目标格；未 started 时内联 transform 携带起点偏移（translate 百分比相对自身=精确一格） */
function flyLayerStyle(sq: string, fromSq: string, orientation: ChessOrientation, started: boolean): CSSProperties {
  const base = cellLayerStyle(sq, orientation);
  if (started) return base;
  const to = displayPos(sq, orientation);
  const from = displayPos(fromSq, orientation);
  return { ...base, transform: `translate(${(from.col - to.col) * 100}%, ${(from.row - to.row) * 100}%)` };
}

export function ChessBoard({ fen, orientation, selected, targets, lastMove, checkSquare, onSquareClick, anim }: ChessBoardProps) {
  const pieces = useMemo(() => parsePlacement(fen), [fen]);

  const squares = useMemo(() => {
    const out: Array<{ sq: string; light: boolean; rank: number; file: number }> = [];
    for (let row = 0; row < 8; row++) {
      for (let col = 0; col < 8; col++) {
        const rank = orientation === 'white' ? 8 - row : row + 1;
        const fileIdx = orientation === 'white' ? col : 7 - col;
        const sq = FILES[fileIdx] + String(rank);
        const light = (fileIdx + rank) % 2 === 1;
        out.push({ sq, light, rank: row, file: col });
      }
    }
    return out;
  }, [orientation]);

  const pieceName = (code: string): string => {
    const white = code >= 'A' && code <= 'Z';
    return `${white ? '白' : '黑'}${PIECE_NAMES[code.toUpperCase()] ?? ''}`;
  };

  // —— FLIP 飞行层（服务端确认后的前后局面过渡） ——
  const { flight, landSq, finish } = useMoveFlight(anim ?? null);
  const fly = flight?.anim ?? null;
  const started = flight?.started ?? false;
  const isFlyingTo = (sq: string): boolean =>
    !!fly && (fly.to === sq || (!!fly.rook && fly.rook.to === sq));

  return (
    <div className="board chess-board" role="grid" aria-label="国际象棋棋盘">
      <div className="chess-grid">
        {squares.map(({ sq, light, rank, file }) => {
          const piece = pieces.get(sq);
          const isSel = selected === sq;
          const isTarget = targets.has(sq);
          const isCapture = targets.get(sq) === true;
          const isLastFrom = lastMove?.from === sq;
          const isLastTo = lastMove?.to === sq;
          const isCheck = checkSquare === sq;
          const cls = [
            'chess-sq',
            light ? 'light' : 'dark',
            isSel ? 'selected' : '',
            isLastFrom ? 'last-from' : '',
            isLastTo ? 'last-to' : '',
            isCheck ? 'in-check' : '',
            landSq === sq ? 'just-landed' : '',
          ]
            .filter(Boolean)
            .join(' ');
          return (
            <button
              key={sq}
              type="button"
              className={cls}
              aria-label={piece ? `${sq} ${pieceName(piece)}` : sq}
              data-occ={piece ? '1' : undefined}
              onClick={() => onSquareClick(sq)}
            >
              {piece && (
                <span className={`chess-piece-wrap ${isSel ? 'selected' : ''} ${isFlyingTo(sq) ? 'hidden-flying' : ''}`}>
                  <ChessPiece code={piece} />
                </span>
              )}
              {isTarget && !isCapture && <span className="chess-dot" />}
              {isTarget && isCapture && <span className="chess-ring" />}
              {orientation === 'white' && rank === 7 && <span className={`coord coord-file ${light ? 'on-light' : 'on-dark'}`}>{sq[0]}</span>}
              {orientation === 'black' && rank === 7 && <span className={`coord coord-file ${light ? 'on-light' : 'on-dark'}`}>{sq[0]}</span>}
              {orientation === 'white' && file === 0 && <span className={`coord coord-rank ${light ? 'on-light' : 'on-dark'}`}>{sq[1]}</span>}
              {orientation === 'black' && file === 0 && <span className={`coord coord-rank ${light ? 'on-light' : 'on-dark'}`}>{sq[1]}</span>}
            </button>
          );
        })}
      </div>
      {/* FLIP 动画层：位于棋盘之上、不拦截点击（pointer-events:none） */}
      {fly && fly.capturedSq && fly.capturedCode && (
        <div key={`cap-${fly.key}`} className="chess-anim-captured" style={cellLayerStyle(fly.capturedSq, orientation)}>
          <ChessPiece code={fly.capturedCode} />
        </div>
      )}
      {fly && fly.rook && (
        <div
          key={`rk-${fly.key}`}
          className="chess-anim-fly"
          style={flyLayerStyle(fly.rook.to, fly.rook.from, orientation, started)}
          onTransitionEnd={(e) => {
            if (e.propertyName === 'transform') finish();
          }}
        >
          <ChessPiece code={fly.rook.code} />
        </div>
      )}
      {fly && (
        <div
          key={`mv-${fly.key}`}
          className="chess-anim-fly"
          style={flyLayerStyle(fly.to, fly.from, orientation, started)}
          onTransitionEnd={(e) => {
            if (e.propertyName === 'transform') finish();
          }}
        >
          <ChessPiece code={fly.moverCode} />
        </div>
      )}
    </div>
  );
}
