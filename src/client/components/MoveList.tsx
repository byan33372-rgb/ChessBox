/**
 * 棋谱列表（HISTORY-001~014）：
 * - 每步可点击 → 定位到该步之后的局面（起终点高亮跟随所选步，MOVE-028）；
 * - 长棋谱窗口化渲染（固定行高 + 滚动窗口，>200 行不逐行挂载）；
 * - 跳棋多人局（>2 人）单列记谱并带座位徽标；双人局保持红黑两列；
 * - 快速连点只改本地 viewPly（纯状态），不影响线上对局。
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import type { GameKind, Side } from '../../games/types';
import { CHECKERS_COLORS, CHECKERS_NAMES } from '../../games/checkers/engine';
import type { PublicMove } from '../../shared/protocol';

export interface MoveListProps {
  moves: PublicMove[];
  kind: GameKind;
  /** 跳棋多座位顺序（>2 人时单列记谱） */
  seatOrder?: Side[];
  /** 当前复盘查看的步数（null = 实时） */
  viewPly: number | null;
  onSelect(ply: number): void;
}

const ROW_H = 32;
const VIEW_H = 288;
const OVERSCAN = 8;

export function MoveList({ moves, kind, seatOrder, viewPly, onSelect }: MoveListProps) {
  const listRef = useRef<HTMLDivElement>(null);
  const total = moves.length;
  const currentPly = viewPly ?? total;
  const multiSeat = kind === 'checkers' && (seatOrder?.length ?? 2) > 2;

  // —— 窗口化：滚动位置驱动（HISTORY-013/014 长棋谱） ——
  const [scrollTop, setScrollTop] = useState(0);
  const rowCount = multiSeat ? total : Math.ceil(total / 2);
  const start = Math.max(0, Math.floor(scrollTop / ROW_H) - OVERSCAN);
  const end = Math.min(rowCount, start + Math.ceil(VIEW_H / ROW_H) + OVERSCAN * 2);

  // 实时态跟随最新；复盘态把当前行滚入视野
  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    if (viewPly === null) {
      el.scrollTop = rowCount * ROW_H;
      return;
    }
    const idx = multiSeat ? viewPly - 1 : Math.floor((viewPly - 1) / 2);
    const target = Math.max(0, idx * ROW_H - VIEW_H / 2);
    el.scrollTop = target;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewPly, rowCount, multiSeat]);

  const rows = useMemo<
    Array<{ n: number; solo?: PublicMove; first?: PublicMove; second?: PublicMove }>
  >(() => {
    if (multiSeat) {
      return moves.map((m) => ({ n: m.ply, solo: m }));
    }
    const out: Array<{ n: number; first?: PublicMove; second?: PublicMove }> = [];
    for (let i = 0; i < moves.length; i += 2) {
      out.push({ n: i / 2 + 1, first: moves[i], second: moves[i + 1] });
    }
    return out;
  }, [moves, multiSeat, total]);

  const windowed = rows.slice(start, end);

  const btn = (m: PublicMove, side: 'a' | 'b' | 'multi') => {
    const seatColor = side === 'multi' ? (CHECKERS_COLORS[m.side] ?? '#888') : null;
    return (
      <button
        type="button"
        className={`move-btn ${currentPly === m.ply ? 'active' : ''} ${side}`}
        style={side === 'multi' && seatColor ? { borderColor: seatColor } : undefined}
        onClick={() => onSelect(m.ply)}
        title={`定位到第 ${m.ply} 步`}
      >
        {side === 'multi' && (
          <span className="mv-seat-dot" style={{ background: seatColor ?? '#888' }} aria-hidden="true" />
        )}
        {m.notation}
        {m.check ? (kind === 'xiangqi' ? ' 将' : ' +') : ''}
      </button>
    );
  };

  return (
    <div className="card move-card">
      <h3>棋谱</h3>
      {total === 0 ? (
        <p className="hint">还没有走棋</p>
      ) : (
        <div
          className="move-list virtualized"
          ref={listRef}
          role="list"
          onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}
        >
          <div style={{ height: rowCount * ROW_H, position: 'relative' }}>
            <div style={{ position: 'absolute', top: start * ROW_H, left: 0, right: 0 }}>
              {multiSeat
                ? windowed.map((row) => (
                    <div key={row.n} className="move-row solo" role="listitem">
                      <span className="move-no">{row.n}.</span>
                      {row.solo && btn(row.solo, 'multi')}
                    </div>
                  ))
                : windowed.map((row) => (
                    <div key={row.n} className="move-row" role="listitem">
                      <span className="move-no">{row.n}.</span>
                      {row.first && btn(row.first, 'a')}
                      {row.second && btn(row.second, 'b')}
                    </div>
                  ))}
            </div>
          </div>
        </div>
      )}
      <div className="btn-row move-nav">
        <button type="button" className="btn small ghost" disabled={currentPly === 0} onClick={() => onSelect(0)}>
          开局
        </button>
        <button type="button" className="btn small ghost" disabled={currentPly === 0} onClick={() => onSelect(currentPly - 1)}>
          上一步
        </button>
        <button
          type="button"
          className="btn small ghost"
          disabled={currentPly >= total}
          onClick={() => onSelect(Math.min(total, currentPly + 1))}
        >
          下一步
        </button>
        <button type="button" className="btn small ghost" onClick={() => onSelect(total)}>
          当前
        </button>
      </div>
      <p className="hint">复盘只改变本地视图，不影响线上对局。点击任意一步可定位并高亮该步起终点。</p>
    </div>
  );
}

/** 最近 5 步面板（HISTORY-005~008）：可折叠、每步可点击定位 */
export function RecentMovesPanel({
  moves,
  viewPly,
  onSelect,
}: {
  moves: PublicMove[];
  viewPly: number | null;
  onSelect(ply: number): void;
}) {
  const [open, setOpen] = useState(true);
  const recent = moves.slice(-5).reverse(); // 最新在上
  if (recent.length === 0) return null;
  return (
    <div className="card recent-moves" aria-label="最近走棋">
      <button type="button" className="recent-head" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <span>最近 {recent.length} 步</span>
        <span className="recent-caret" aria-hidden="true">
          {open ? '▾' : '▸'}
        </span>
      </button>
      {open && (
        <div className="recent-list">
          {recent.map((m) => (
            <button
              key={m.ply}
              type="button"
              className={`recent-item ${(viewPly ?? moves.length) === m.ply ? 'active' : ''}`}
              onClick={() => onSelect(m.ply)}
            >
              <span className="recent-ply">{m.ply}</span>
              <span className="recent-side">{m.side.toUpperCase()}</span>
              <span className="recent-notation">{m.notation}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export type { Side };
