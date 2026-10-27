import { useEffect, useRef } from 'react';
import type { GameKind, Side } from '../../games/types';
import type { PublicMove } from '../../shared/protocol';

export interface MoveListProps {
  moves: PublicMove[];
  kind: GameKind;
  /** 当前复盘查看的步数（null = 实时） */
  viewPly: number | null;
  onSelect(ply: number): void;
}

export function MoveList({ moves, kind, viewPly, onSelect }: MoveListProps) {
  const listRef = useRef<HTMLDivElement>(null);
  const total = moves.length;
  const currentPly = viewPly ?? total;

  useEffect(() => {
    if (viewPly === null && listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [total, viewPly]);

  const rows: Array<{ n: number; red?: PublicMove; black?: PublicMove }> = [];
  for (let i = 0; i < moves.length; i += 2) {
    rows.push({ n: i / 2 + 1, red: moves[i], black: moves[i + 1] });
  }

  return (
    <div className="card move-card">
      <h3>棋谱</h3>
      {total === 0 ? (
        <p className="hint">还没有走棋</p>
      ) : (
        <div className="move-list" ref={listRef} role="list">
          {rows.map((row) => {
            const redPly = row.red?.ply ?? 0;
            const blackPly = row.black?.ply ?? 0;
            return (
              <div key={row.n} className="move-row" role="listitem">
                <span className="move-no">{row.n}.</span>
                {row.red && (
                  <button
                    type="button"
                    className={`move-btn ${currentPly === redPly ? 'active' : ''} a`}
                    onClick={() => onSelect(redPly)}
                  >
                    {row.red.notation}
                    {row.red.check ? (kind === 'xiangqi' ? ' 将' : ' +') : ''}
                  </button>
                )}
                {row.black && (
                  <button
                    type="button"
                    className={`move-btn ${currentPly === blackPly ? 'active' : ''} b`}
                    onClick={() => onSelect(blackPly)}
                  >
                    {row.black.notation}
                    {row.black.check ? (kind === 'xiangqi' ? ' 将' : ' +') : ''}
                  </button>
                )}
              </div>
            );
          })}
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
      <p className="hint">复盘只改变本地视图，不影响线上对局。</p>
    </div>
  );
}

export type { Side };
