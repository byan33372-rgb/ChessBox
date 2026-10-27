/** 国际象棋棋盘：经典浅深格 + 自绘 SVG 棋子 + 坐标 */

import { useMemo } from 'react';
import { ChessPiece } from './ChessPieces';

export type ChessOrientation = 'white' | 'black';

export interface ChessBoardProps {
  fen: string;
  orientation: ChessOrientation;
  selected: string | null;
  targets: Map<string, boolean>;
  lastMove: { from: string; to: string } | null;
  checkSquare: string | null;
  onSquareClick(sq: string): void;
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

export function ChessBoard({ fen, orientation, selected, targets, lastMove, checkSquare, onSquareClick }: ChessBoardProps) {
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
          ]
            .filter(Boolean)
            .join(' ');
          return (
            <button
              key={sq}
              type="button"
              className={cls}
              aria-label={piece ? `${sq} ${pieceName(piece)}` : sq}
              onClick={() => onSquareClick(sq)}
            >
              {piece && (
                <span className="chess-piece-wrap">
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
    </div>
  );
}
