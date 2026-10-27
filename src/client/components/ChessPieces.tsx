/**
 * 自绘国际象棋棋子 SVG（45×45 视口，扁平几何风格，无外部素材依赖）。
 * 白子：暖白填充 + 深描边；黑子：墨色填充 + 亮描边。
 */

import type { CSSProperties, ReactElement } from 'react';

interface PieceProps {
  code: string; // 大写=白 P N B R Q K；小写=黑
  size?: number | string;
}

const WHITE_FILL = '#f7f2e7';
const WHITE_STROKE = '#4a3f33';
const BLACK_FILL = '#2b2620';
const BLACK_STROKE = '#0f0c09';

function isWhite(code: string): boolean {
  return code >= 'A' && code <= 'Z';
}

const pieceStyle = (white: boolean): CSSProperties => ({
  fill: white ? WHITE_FILL : BLACK_FILL,
  stroke: white ? WHITE_STROKE : BLACK_STROKE,
  strokeWidth: 1.6,
  strokeLinejoin: 'round',
  strokeLinecap: 'round',
});

const detailStyle = (white: boolean): CSSProperties => ({
  fill: 'none',
  stroke: white ? WHITE_STROKE : '#c9bda9',
  strokeWidth: 1.6,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
});

function Pawn({ white }: { white: boolean }) {
  return (
    <svg viewBox="0 0 45 45" width="100%" height="100%" aria-hidden="true">
      <g style={pieceStyle(white)}>
        <circle cx="22.5" cy="14" r="6" />
        <path d="M17.8 21 h9.4 c1.2 5.4 2 9.6 2.3 13.9 H15.5 c.3 -4.3 1.1 -8.5 2.3 -13.9 z" />
        <rect x="11.5" y="36" width="22" height="5.5" rx="2.2" />
      </g>
    </svg>
  );
}

function Rook({ white }: { white: boolean }) {
  return (
    <svg viewBox="0 0 45 45" width="100%" height="100%" aria-hidden="true">
      <g style={pieceStyle(white)}>
        <path d="M12 11 h4.4 v3.6 h4 v-3.6 h4.2 v3.6 h4 v-3.6 h4.4 v8.2 h-3.4 l1 14.8 h3.6 v5.9 H10.4 v-5.9 h3.6 l1 -14.8 H12 z" />
      </g>
      <g style={detailStyle(white)}>
        <line x1="14.4" y1="24.5" x2="30.6" y2="24.5" />
      </g>
    </svg>
  );
}

function Knight({ white }: { white: boolean }) {
  return (
    <svg viewBox="0 0 45 45" width="100%" height="100%" aria-hidden="true">
      <g style={pieceStyle(white)}>
        <path d="M14.6 35.5 c.6 -7.4 3.4 -12.8 8.4 -16.4 c.8 -.6 1 -1.6 .8 -2.8 l-.8 -3.4 l3.4 2.4 c5.8 1.2 9.2 4.6 9.2 8.2 c0 2.2 -2.6 2.6 -4.8 1.4 l-2.6 -1.6 c-1.6 1.8 -3.4 2.8 -5 4.4 c2.6 .4 4.6 2.2 4.6 4.6 c0 1.4 -.6 2.4 -1.4 3.2 z" />
        <rect x="10.5" y="35" width="24" height="6" rx="2.4" />
      </g>
      <g style={detailStyle(white)}>
        <circle cx="20.5" cy="15.5" r="1.1" fill={white ? WHITE_STROKE : '#c9bda9'} stroke="none" />
      </g>
    </svg>
  );
}

function Bishop({ white }: { white: boolean }) {
  return (
    <svg viewBox="0 0 45 45" width="100%" height="100%" aria-hidden="true">
      <g style={pieceStyle(white)}>
        <circle cx="22.5" cy="9.5" r="2.6" />
        <path d="M22.5 13 c5.8 3.2 8 7.6 8 11.6 c0 4.2 -3.2 6.8 -8 6.8 c-4.8 0 -8 -2.6 -8 -6.8 c0 -4 2.2 -8.4 8 -11.6 z" />
        <rect x="14" y="32" width="17" height="4" rx="1.8" />
        <rect x="11.5" y="36" width="22" height="5.5" rx="2.2" />
      </g>
      <g style={detailStyle(white)}>
        <line x1="22.5" y1="17" x2="22.5" y2="26" />
      </g>
    </svg>
  );
}

function Queen({ white }: { white: boolean }) {
  return (
    <svg viewBox="0 0 45 45" width="100%" height="100%" aria-hidden="true">
      <g style={pieceStyle(white)}>
        <path d="M11 13 l3.8 11.4 h15.4 L34 13 l-5.8 6.4 L26 9.2 l-3.5 8 L19 9.2 l-2.2 10.2 z" />
        <path d="M15.4 26 h14.2 l1.4 6 h-17 z" />
        <rect x="11.5" y="33" width="22" height="4" rx="1.8" />
        <rect x="10" y="37.5" width="25" height="5" rx="2" />
      </g>
      <g style={pieceStyle(white)}>
        <circle cx="11" cy="11.5" r="2" />
        <circle cx="17" cy="8" r="2" />
        <circle cx="22.5" cy="6.8" r="2" />
        <circle cx="28" cy="8" r="2" />
        <circle cx="34" cy="11.5" r="2" />
      </g>
    </svg>
  );
}

function King({ white }: { white: boolean }) {
  return (
    <svg viewBox="0 0 45 45" width="100%" height="100%" aria-hidden="true">
      <g style={pieceStyle(white)}>
        <path d="M22.5 4 v6 M19.5 6.5 h6" strokeWidth="2.4" />
        <path d="M13 16 c1.6 -2.6 4 -3.6 6.4 -3.6 h6.2 c2.4 0 4.8 1 6.4 3.6 l-2.4 2.6 h-14.2 z" />
        <path d="M14 20 h17 l1.2 6 h-19.4 z" />
        <rect x="11" y="27" width="23" height="6" rx="2.2" />
        <rect x="10" y="34.5" width="25" height="5.5" rx="2.2" />
      </g>
    </svg>
  );
}

const MAP: Record<string, (p: { white: boolean }) => ReactElement> = {
  P: Pawn,
  N: Knight,
  B: Bishop,
  R: Rook,
  Q: Queen,
  K: King,
};

export function ChessPiece({ code, size = '100%' }: PieceProps) {
  const white = isWhite(code);
  const Comp = MAP[code.toUpperCase()];
  if (!Comp) return null;
  return (
    <span className="chess-piece" style={{ width: size, height: size, display: 'block' }}>
      <Comp white={white} />
    </span>
  );
}
