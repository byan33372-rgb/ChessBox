/**
 * 自绘国际象棋棋子 SVG（45×45 视口，统一 Staunton 风格轮廓，无外部素材依赖）。
 * 白子：象牙白渐变 + 深描边；黑子：乌木渐变 + 近黑描边 + 浅色细节线。
 * 渐变 id 在所有实例中内容完全一致（重复定义安全，浏览器取首个文档定义）。
 * 形状即棋种语义（王/后/车/象/马/兵轮廓区分，不只靠颜色——PIECE-014）。
 * 统一左上光源：各件共用同一渐变方向与投影 token（PIECE-006）。
 */

import type { CSSProperties, ReactElement } from 'react';

interface PieceProps {
  code: string; // 大写=白 P N B R Q K；小写=黑
  size?: number | string;
}

const W_BODY: Array<[string, string]> = [
  ['0', '#fdfaf1'],
  ['0.55', '#f3ead4'],
  ['1', '#dccfae'],
];
const B_BODY: Array<[string, string]> = [
  ['0', '#6b553b'],
  ['0.55', '#4a3823'],
  ['1', '#2c2113'],
];

function isWhite(code: string): boolean {
  return code >= 'A' && code <= 'Z';
}

function Defs({ uid, stops }: { uid: string; stops: Array<[string, string]> }) {
  return (
    <defs>
      <linearGradient id={`${uid}-body`} x1="0" y1="0" x2="0.35" y2="1">
        {stops.map(([off, color]) => (
          <stop key={off} offset={off} stopColor={color} />
        ))}
      </linearGradient>
    </defs>
  );
}

function pieceProps(white: boolean, uid: string): CSSProperties {
  return {
    fill: `url(#${uid}-body)`,
    stroke: white ? '#463a2c' : '#120d07',
    strokeWidth: 1.5,
    strokeLinejoin: 'round',
    strokeLinecap: 'round',
  };
}

function detailProps(white: boolean): CSSProperties {
  return {
    fill: 'none',
    stroke: white ? '#96866a' : '#c8b391',
    strokeWidth: 1.3,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    opacity: 0.9,
  };
}

function Base({ white, style }: { white: boolean; style?: CSSProperties }) {
  return (
    <g style={{ ...pieceProps(white, ''), ...style }}>
      {/* 双层底座：领圈 + 基板（统一所有棋子的落地感） */}
      <rect x="12.2" y="31.6" width="20.6" height="4" rx="2" />
      <rect x="10.6" y="36" width="23.8" height="5.6" rx="2.7" />
    </g>
  );
}

function Pawn({ white }: { white: boolean }) {
  const uid = white ? 'pw' : 'pb';
  return (
    <svg viewBox="0 0 45 45" width="100%" height="100%" aria-hidden="true">
      <Defs uid={uid} stops={white ? W_BODY : B_BODY} />
      <g style={pieceProps(white, uid)}>
        <circle cx="22.5" cy="13.4" r="5.4" />
        <path d="M19,22 h7 c.3,4.6 1.1,8.7 2.5,12.5 h-12 c1.4-3.8 2.2-7.9 2.5-12.5 z" />
      </g>
      <g style={detailProps(white)}>
        <path d="M17.6,19.8 c1.5,1 3.1,1.5 4.9,1.5 s3.4-.5 4.9-1.5" />
      </g>
      <Base white={white} style={pieceProps(white, uid)} />
    </svg>
  );
}

function Rook({ white }: { white: boolean }) {
  const uid = white ? 'pw' : 'pb';
  return (
    <svg viewBox="0 0 45 45" width="100%" height="100%" aria-hidden="true">
      <Defs uid={uid} stops={white ? W_BODY : B_BODY} />
      <g style={pieceProps(white, uid)}>
        <path d="M12.6,8.2 h5.2 v3.4 h2.7 V8.2 h4.6 v3.4 h2.7 V8.2 h5.2 v8.6 h-2.4 l1.3,14.4 h3.6 v4.6 H10.2 v-4.6 h3.6 l1.3,-14.4 h-2.4 z" />
      </g>
      <g style={detailProps(white)}>
        <path d="M14.6,23.6 h15.8" />
        <path d="M15.6,31.2 h13.8" />
        <path d="M13.4,12.4 h4 M21.3,12.4 h2.6 M27.4,12.4 h4" opacity="0.6" />
      </g>
      <Base white={white} style={pieceProps(white, uid)} />
    </svg>
  );
}

function Knight({ white }: { white: boolean }) {
  const uid = white ? 'pw' : 'pb';
  return (
    <svg viewBox="0 0 45 45" width="100%" height="100%" aria-hidden="true">
      <Defs uid={uid} stops={white ? W_BODY : B_BODY} />
      <g style={pieceProps(white, uid)}>
        {/* 马头颈侧影：双耳 + 额段 + 鼻梁 + 嘴部回收 + 下颚 + 颈背弧（朝左） */}
        <path d="M13.8,37 C14,33 14.6,29 15.2,26 C15.8,23.6 16.6,21.6 17.6,20 L15.2,19.8 C13.6,19.4 12.9,18.2 13.3,16.6 C14.2,13.6 16.4,11.4 19.4,10.6 L20.8,6.9 L22.9,9.6 L25.3,7.2 L25.9,10.4 C28.6,10.9 30.6,13.2 30.7,16.2 C30.8,18.6 29.7,20.4 27.6,21.2 C29.8,25 31.3,30 31.4,37 L13.8,37 Z" />
      </g>
      <g style={detailProps(white)}>
        <circle cx="18.6" cy="15.6" r="1.15" fill={white ? '#463a2c' : '#c8b391'} stroke="none" />
        <path d="M14.2,18 l2.2,0.7" />
        <path d="M27,34.5 C26.8,27 25.4,22.5 22.4,19.6" opacity="0.55" />
      </g>
      <Base white={white} style={pieceProps(white, uid)} />
    </svg>
  );
}

function Bishop({ white }: { white: boolean }) {
  const uid = white ? 'pw' : 'pb';
  return (
    <svg viewBox="0 0 45 45" width="100%" height="100%" aria-hidden="true">
      <Defs uid={uid} stops={white ? W_BODY : B_BODY} />
      <g style={pieceProps(white, uid)}>
        <circle cx="22.5" cy="7.8" r="2.5" />
        <path d="M22.5,11.4 c5.6,2.9 8.3,6.7 8.3,10.6 c0,4.2 -3.3,6.8 -8.3,6.8 s-8.3,-2.6 -8.3,-6.8 c0,-3.9 2.7,-7.7 8.3,-10.6 z" />
        <rect x="16" y="29.4" width="13" height="2.6" rx="1.3" />
      </g>
      {/* 主教帽斜切口（两侧平行线段示意，PIECE-003 辨识特征） */}
      <g style={detailProps(white)}>
        <path d="M18.6,15.8 l6.2,5.6" strokeWidth="1.9" />
        <path d="M17.6,19.6 c.9,1.5 2.3,2.5 4.1,2.8" />
      </g>
      <Base white={white} style={pieceProps(white, uid)} />
    </svg>
  );
}

function Queen({ white }: { white: boolean }) {
  const uid = white ? 'pw' : 'pb';
  return (
    <svg viewBox="0 0 45 45" width="100%" height="100%" aria-hidden="true">
      <Defs uid={uid} stops={white ? W_BODY : B_BODY} />
      <g style={pieceProps(white, uid)}>
        <path d="M11,23.2 l2.7,-10 3.9,6.7 4.9,-8.6 4.9,8.6 3.9,-6.7 2.7,10 l-1.3,2.4 h-19.4 z" />
        <circle cx="10.8" cy="11.6" r="1.9" />
        <circle cx="16.6" cy="8.6" r="1.9" />
        <circle cx="22.5" cy="7.6" r="1.9" />
        <circle cx="28.4" cy="8.6" r="1.9" />
        <circle cx="34.2" cy="11.6" r="1.9" />
        <path d="M13.4,27.6 h18.2 l1.6,4.4 h-21.4 z" />
      </g>
      <g style={detailProps(white)}>
        <path d="M12.3,25.4 h20.4" />
      </g>
      <g style={pieceProps(white, uid)}>
        <rect x="12.6" y="31.6" width="19.8" height="2.4" rx="1.2" />
      </g>
      <Base white={white} style={pieceProps(white, uid)} />
    </svg>
  );
}

function King({ white }: { white: boolean }) {
  const uid = white ? 'pw' : 'pb';
  return (
    <svg viewBox="0 0 45 45" width="100%" height="100%" aria-hidden="true">
      <Defs uid={uid} stops={white ? W_BODY : B_BODY} />
      <g style={pieceProps(white, uid)}>
        <path d="M22.5,2.6 v7.8 M18.6,6 h7.8" strokeWidth="3" fill="none" />
        <path d="M13.7,16.7 c1.4,-3 4,-4.7 7.3,-4.7 h3 c3.3,0 5.9,1.7 7.3,4.7 l-1.7,2.7 h-14.2 z" />
        <path d="M13.1,21.8 h18.8 l1.5,5.6 h-21.8 z" />
      </g>
      <g style={detailProps(white)}>
        <path d="M13.4,24.6 h18.2" />
      </g>
      <g style={pieceProps(white, uid)}>
        <rect x="12.4" y="27.6" width="20.2" height="2.8" rx="1.4" />
      </g>
      <Base white={white} style={pieceProps(white, uid)} />
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
