/**
 * 试玩沙盒棋盘（首页展示卡内）：使用与房间完全相同的真实规则引擎与棋盘组件，
 * 本地可交互（点击选子/落子，国象升变默认升后），不联机、不落库。
 * 与在线对局的区别在界面上明示（"试玩"徽标 + 结束后可重置），不冒充在线房间。
 */
import { useMemo, useRef, useState } from 'react';
import { createEngine, startFenOf } from '../../games';
import type { GameEngine } from '../../games/types';
import { XiangqiBoard } from './XiangqiBoard';
import { ChessBoard } from './ChessBoard';
import type { GameKind } from '../../games/types';

export function PracticeBoard({ kind }: { kind: GameKind }) {
  // 沙盒引擎：真实引擎实例；kind 变化或重置时重建
  const [resetKey, setResetKey] = useState(0);
  const engine = useMemo(() => createEngine(kind), [kind, resetKey]);
  const engineRef = useRef(engine);
  engineRef.current = engine;

  // fen 仅用于驱动重渲染（引擎原地变更）
  const [, setTick] = useState(0);
  const bump = () => setTick((t) => t + 1);

  const [selected, setSelected] = useState<string | null>(null);
  const selectedRef = useRef<string | null>(null);
  selectedRef.current = selected;

  const fen = engine.fen();
  const outcome = engine.outcome();
  const checkSquare = engine.checkedKingSquare();

  const targets = useMemo(() => {
    const map = new Map<string, boolean>();
    if (!selected) return map;
    for (const m of engine.legalMoves()) {
      if (m.from === selected) map.set(m.to, m.capture);
    }
    return map;
  }, [engine, selected]);

  const handleSquareClick = (sq: string) => {
    const eng = engineRef.current;
    const sel = selectedRef.current;
    if (!eng || eng.outcome()) {
      setSelected(null);
      return;
    }
    const myTargets = new Map<string, boolean>();
    if (sel) {
      for (const m of eng.legalMoves()) {
        if (m.from === sel) myTargets.set(m.to, m.capture);
      }
    }
    if (sel && myTargets.has(sq)) {
      // 国象升变：沙盒默认升后（界面上明示）
      const variants = eng.legalMoves().filter((m) => m.from === sel && m.to === sq);
      const needsPromo = eng.kind === 'chess' && variants.some((v) => v.promotion);
      const applied = eng.applyMove(needsPromo ? { from: sel, to: sq, promotion: 'q' } : { from: sel, to: sq });
      if (applied) {
        setSelected(null);
        bump();
      } else {
        setSelected(null);
      }
      return;
    }
    const piece = eng.pieceAt(sq);
    const mine = piece !== null && (piece >= 'A' && piece <= 'Z') === (eng.turn() === 'a');
    if (mine) {
      const next = sq === sel ? null : sq;
      selectedRef.current = next;
      setSelected(next);
    } else {
      selectedRef.current = null;
      setSelected(null);
    }
  };

  const turnLabel = engine.turn() === 'a' ? (kind === 'xiangqi' ? '红方行棋' : '白方行棋') : '黑方行棋';

  const board =
    kind === 'xiangqi' ? (
      <XiangqiBoard
        fen={fen}
        orientation="red"
        selected={selected}
        targets={targets}
        lastMove={null}
        checkSquare={checkSquare}
        onSquareClick={handleSquareClick}
      />
    ) : (
      <ChessBoard
        fen={fen}
        orientation="white"
        selected={selected}
        targets={targets}
        lastMove={null}
        checkSquare={checkSquare}
        onSquareClick={handleSquareClick}
      />
    );

  return (
    <div className="practice-board" data-kind={kind}>
      {board}
      <div className="practice-meta">
        {outcome ? (
          <span className="practice-outcome">试玩终局：{outcome.reason} · 点「重开试玩」再来</span>
        ) : (
          <span className="practice-turn">{turnLabel}（试玩）</span>
        )}
        <button
          type="button"
          className="btn small ghost practice-reset"
          onClick={() => {
            setResetKey((k) => k + 1);
            setSelected(null);
            bump();
          }}
        >
          重开试玩
        </button>
      </div>
    </div>
  );
}
