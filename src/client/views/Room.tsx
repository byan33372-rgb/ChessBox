import { useEffect, useMemo, useRef, useState } from 'react';
import { useRoom } from '../net/roomClient';
import { createEngine, START_FEN as XQ_START_FEN } from '../../games';
import { CHESS_START_FEN } from '../../games';
import { pieceLabel } from '../../games/xiangqi/notation';
import type { Side } from '../../games/types';
import type { RoomState } from '../../shared/protocol';
import { ChessBoard } from '../components/ChessBoard';
import { XiangqiBoard } from '../components/XiangqiBoard';
import { buildBoardAnim } from '../components/boardAnim';
import type { BoardAnim } from '../components/boardAnim';
import { useAnimPref } from '../components/animPref';
import { MoveList } from '../components/MoveList';
import { ChatPanel } from '../components/ChatPanel';
import { buildPgn, buildXiangqiJson, buildXiangqiText, copyText, downloadJson, downloadText } from '../export/exporters';

export interface RoomProps {
  roomId: string;
  onExit(): void;
}

const PROMO_CHOICES: Array<{ code: string; label: string }> = [
  { code: 'q', label: '后' },
  { code: 'r', label: '车' },
  { code: 'b', label: '象' },
  { code: 'n', label: '马' },
];

interface PendingPromotion {
  from: string;
  to: string;
}

export function Room({ roomId, onExit }: RoomProps) {
  const { conn, status, fatal, seat, state, chat, toasts, dismissToast, toast, actions } = useRoom(roomId);
  const [selected, setSelected] = useState<string | null>(null);
  const [flipped, setFlipped] = useState(false);
  const [viewPly, setViewPly] = useState<number | null>(null);
  const [pendingPromo, setPendingPromo] = useState<PendingPromotion | null>(null);
  const { enabled: animEnabled, userOn: animUserOn, toggle: toggleAnimPref } = useAnimPref();
  const [anim, setAnim] = useState<BoardAnim | null>(null);
  /** 动画闸门游标：上次见过的 moves.length 与 ply（服务端确认后 +1 判定 + 去重） */
  const lastMoveCountRef = useRef(0);
  const lastAnimPlyRef = useRef(-1);

  useEffect(() => {
    setSelected(null);
  }, [state?.fen]);

  // 新对局（重开/悔棋清空）时退出复盘视图；平时新着法不打断本地复盘
  useEffect(() => {
    if (state && state.moves.length === 0) setViewPly(null);
  }, [state?.moves.length]);

  // —— 走棋动画闸门（ANIM-001~013 核心） ——
  // 仅当 moves.length 恰好 +1（服务端确认的新着到达）、在线、直播复盘态、动效开启时构造 FLIP 描述；
  // 终局着（将死/困毙/逼和）随 phase='ended' 一起到达，同属服务端已接受的着法，同样播放；
  // 重连追赶（跳变>1）/悔棋/重开（length 不增）/复盘浏览（viewPly≠null）/被拒（state 不变）一律直同步不动画；
  // 同一 ply 只触发一次（ack 与 room:state 双路径 + 重复广播去重，ANIM-013）。
  useEffect(() => {
    if (!state) return;
    const moves = state.moves;
    const prevCount = lastMoveCountRef.current;
    lastMoveCountRef.current = moves.length;
    const last = moves.length > 0 ? moves[moves.length - 1] : null;
    const freshPly = last !== null && last.ply > lastAnimPlyRef.current;
    const canAnimate = animEnabled && conn === 'online' && viewPly === null && (state.phase === 'playing' || state.phase === 'ended');
    if (moves.length === prevCount + 1 && last && freshPly && canAnimate) {
      const next = buildBoardAnim(state.kind, last.fenBefore, last.fenAfter, last.from, last.to);
      if (next) setAnim(next);
    }
    lastAnimPlyRef.current = last ? Math.max(lastAnimPlyRef.current, last.ply) : -1;
  }, [state, animEnabled, conn, viewPly]);

  // 复盘态不残留动画（ANIM-020）：进入复盘时清掉在飞的层
  useEffect(() => {
    if (viewPly !== null) setAnim(null);
  }, [viewPly]);

  // 关闭动效时立即清掉在飞的层
  useEffect(() => {
    if (!animEnabled) setAnim(null);
  }, [animEnabled]);

  const initialFen = useMemo(() => {
    if (!state) return XQ_START_FEN;
    return state.moves.length > 0 ? state.moves[0].fenBefore : state.fen;
  }, [state]);

  // —— 复盘感知的展示局面 ——
  const display = useMemo(() => {
    if (!state) return null;
    const moves = state.moves;
    const ply = viewPly === null ? moves.length : Math.min(viewPly, moves.length);
    const fen = ply === 0 ? initialFen : moves[ply - 1].fenAfter;
    const lastMove = ply > 0 ? moves[ply - 1] : null;
    return { fen, lastMove, ply, viewing: viewPly !== null };
  }, [state, viewPly, initialFen]);

  // 本地引擎（仅用于 UI 合法着法提示；权威校验在服务端）
  const engine = useMemo(() => {
    if (!state || !display) return null;
    try {
      return createEngine(state.kind, display.fen);
    } catch {
      return null;
    }
  }, [state?.kind, display?.fen]);

  const checkSquare = useMemo(() => engine?.checkedKingSquare() ?? null, [engine]);

  /** 同步引用：点击处理器即时读取，避免快速连点命中过期闭包（丢步偶发缺陷修复） */
  const engineRef = useRef(engine);
  const selectedRef = useRef<string | null>(null);
  useEffect(() => {
    engineRef.current = engine;
  }, [engine]);
  useEffect(() => {
    selectedRef.current = selected;
  }, [selected]);

  /** 仅供渲染高亮；点击判定在 handler 内即时计算（见 handleSquareClick） */
  const targets = useMemo(() => {
    const map = new Map<string, boolean>();
    if (!engine || !selected) return map;
    for (const m of engine.legalMoves()) {
      if (m.from === selected) map.set(m.to, m.capture);
    }
    return map;
  }, [engine, selected]);

  const isLive = viewPly === null;
  const canMove =
    conn === 'online' &&
    seat !== null &&
    seat !== 'spectator' &&
    state?.phase === 'playing' &&
    state.turn === seat &&
    isLive &&
    engine !== null;

  const handleSquareClick = (sq: string) => {
    // 全部经由同步引用读取：不受 React 渲染时序影响
    const eng = engineRef.current;
    const sel = selectedRef.current;
    if (!eng || !state || !canMove) {
      selectedRef.current = null;
      setSelected(null);
      return;
    }
    const piece = eng.pieceAt(sq);
    const iAmFirst = seat === 'a';
    const isMine = piece !== null && (piece >= 'A' && piece <= 'Z') === iAmFirst;
    const myTargets = new Map<string, boolean>();
    if (sel) {
      for (const m of eng.legalMoves()) {
        if (m.from === sel) myTargets.set(m.to, m.capture);
      }
    }
    if (sel && myTargets.has(sq)) {
      const variants = eng.legalMoves().filter((m) => m.from === sel && m.to === sq);
      if (state.kind === 'chess' && variants.some((v) => v.promotion)) {
        setPendingPromo({ from: sel, to: sq });
        selectedRef.current = null;
        setSelected(null);
        return;
      }
      void actions.move({ from: sel, to: sq });
      selectedRef.current = null;
      setSelected(null);
      return;
    }
    if (isMine) {
      const next = sq === sel ? null : sq;
      selectedRef.current = next;
      setSelected(next);
    } else {
      selectedRef.current = null;
      setSelected(null);
    }
  };

  const finishPromotion = (code: string) => {
    if (pendingPromo) {
      void actions.move({ ...pendingPromo, promotion: code });
    }
    setPendingPromo(null);
  };

  // —— 视角 ——
  const xqOrientation = useMemo(() => {
    const base = seat === 'b' ? 'black' : 'red';
    return (flipped ? (base === 'red' ? 'black' : 'red') : base) as 'red' | 'black';
  }, [seat, flipped]);
  const chessOrientation = useMemo(() => {
    const base = seat === 'b' ? 'black' : 'white';
    return (flipped ? (base === 'white' ? 'black' : 'white') : base) as 'white' | 'black';
  }, [seat, flipped]);

  const inviteUrl = `${window.location.origin}/r/${roomId}`;

  const doCopyInvite = async () => {
    const ok = await copyText(inviteUrl);
    toast(ok ? '邀请链接已复制，发给朋友吧' : '复制失败，请手动复制链接', ok ? 'success' : 'error');
  };

  if (status === 'fatal') {
    return (
      <div className="room room-center">
        <div className="card fatal-card">
          <h2>无法进入房间</h2>
          <p>{fatal}</p>
          <div className="btn-row">
            <button type="button" className="btn primary" onClick={onExit}>
              返回首页
            </button>
            <button type="button" className="btn" onClick={() => window.location.reload()}>
              重试
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!state || !display) {
    return (
      <div className="room room-center">
        <div className="loading">
          <div className="spinner" aria-hidden="true" />
          <p>正在连接房间…</p>
        </div>
      </div>
    );
  }

  const sideName = (s: Side) => (state.kind === 'xiangqi' ? (s === 'a' ? '红方' : '黑方') : s === 'a' ? '白方' : '黑方');

  const board =
    state.kind === 'xiangqi' ? (
      <XiangqiBoard
        fen={display.fen}
        orientation={xqOrientation}
        selected={selected}
        targets={targets}
        lastMove={display.lastMove ? { from: display.lastMove.from, to: display.lastMove.to } : null}
        checkSquare={checkSquare}
        onSquareClick={handleSquareClick}
        anim={display.viewing ? null : anim}
      />
    ) : (
      <ChessBoard
        fen={display.fen}
        orientation={chessOrientation}
        selected={selected}
        targets={targets}
        lastMove={display.lastMove ? { from: display.lastMove.from, to: display.lastMove.to } : null}
        checkSquare={checkSquare}
        onSquareClick={handleSquareClick}
        anim={display.viewing ? null : anim}
      />
    );

  const mySideLabel = seat === 'spectator' ? '观战' : sideName(seat as Side);
  const turnLabel = state.turn === seat ? '轮到你走棋' : `轮到${sideName(state.turn)}走棋`;

  return (
    <div className={`room theme-${state.kind}`}>
      <header className="room-header">
        <button type="button" className="icon-btn" onClick={onExit} aria-label="返回首页">
          ←
        </button>
        <span className="room-kind-ico" aria-hidden="true">
          {state.kind === 'xiangqi' ? '帥' : '♞'}
        </span>
        <div className="room-title">
          <span className={`kind-badge ${state.kind}`}>{state.kind === 'xiangqi' ? '中国象棋' : '国际象棋'}</span>
          <span className="room-code" title="房间号">
            {roomId}
          </span>
        </div>
        <span className={`conn-pill ${conn === 'online' ? 'ok' : 'warn'}`} role="status">
          {conn === 'online' ? '已连接' : conn === 'reconnecting' ? '重连中…' : '连接中…'}
        </span>
      </header>

      <div className="room-body">
        <div className="board-col">
          <PlayerCard state={state} side={state.turn === 'a' ? 'b' : 'a'} seat={seat} turnLabel={turnLabel} isOpponentTop />
          <div className="board-wrap">
            {board}
            {display.viewing && (
              <div className="replay-banner" role="status">
                复盘中 · 第 {display.ply} / {state.moves.length} 步
                <button type="button" className="btn small" onClick={() => setViewPly(null)}>
                  回到当前
                </button>
              </div>
            )}
            {state.outcome && isLive && (
              <div className="game-over-banner" role="status">
                <span className="go-text">
                  {state.outcome.winner === null ? '和棋' : state.outcome.winner === 'a' ? '红方/白方获胜' : '黑方获胜'} · {state.outcome.reason}
                </span>
              </div>
            )}
            {state.phase === 'waiting' && (
              <div className="waiting-overlay">
                <div className="card waiting-card">
                  <h3>等待对手加入</h3>
                  <p>把邀请链接发给朋友，TA 打开即可对弈</p>
                  <div className="invite-row">
                    <input readOnly value={inviteUrl} aria-label="邀请链接" onFocus={(e) => e.target.select()} />
                    <button type="button" className="btn primary" onClick={doCopyInvite}>
                      复制链接
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
          <PlayerCard state={state} side={state.turn === 'a' ? 'a' : 'b'} seat={seat} turnLabel={turnLabel} />

          <div className="replay-controls" role="toolbar" aria-label="复盘控制">
            <button type="button" className="icon-btn" disabled={display.ply === 0} onClick={() => setViewPly(0)} aria-label="跳到开局">
              ⏮
            </button>
            <button
              type="button"
              className="icon-btn"
              disabled={display.ply === 0}
              onClick={() => setViewPly(Math.max(0, display.ply - 1))}
              aria-label="上一步"
            >
              ◀
            </button>
            <button
              type="button"
              className="icon-btn"
              disabled={display.ply >= state.moves.length}
              onClick={() => setViewPly(Math.min(state.moves.length, display.ply + 1))}
              aria-label="下一步"
            >
              ▶
            </button>
            <button
              type="button"
              className="icon-btn"
              disabled={display.ply >= state.moves.length}
              onClick={() => setViewPly(null)}
              aria-label="跳到当前"
            >
              ⏭
            </button>
            <span className="replay-pos">
              {display.ply} / {state.moves.length}
            </span>
            <button type="button" className="btn small ghost" onClick={() => setFlipped((f) => !f)}>
              翻转棋盘
            </button>
            <button
              type="button"
              className="btn small ghost"
              onClick={toggleAnimPref}
              aria-pressed={animUserOn}
              title="走棋动效开关（不影响规则）"
            >
              {animUserOn ? '动效 开' : '动效 关'}
            </button>
          </div>
        </div>

        <aside className="side-col">
          <StatusCard
            state={state}
            seat={seat}
            turnLabel={turnLabel}
            mySideLabel={mySideLabel}
            actions={actions}
            onRestartOffer={() => void actions.restartOffer()}
            inviteUrl={inviteUrl}
            onCopyInvite={doCopyInvite}
          />

          {seat !== 'spectator' && state.phase === 'playing' && (
            <div className="card actions-card">
              <div className="btn-grid">
                <button type="button" className="btn" onClick={() => void actions.drawOffer()}>
                  提和
                </button>
                <button type="button" className="btn" onClick={() => void actions.undoOffer()}>
                  悔棋
                </button>
                <button type="button" className="btn" onClick={() => void actions.restartOffer()}>
                  重开
                </button>
                <button type="button" className="btn danger" onClick={() => void actions.resign()}>
                  认输
                </button>
              </div>
              <button type="button" className="btn wide primary" onClick={doCopyInvite}>
                复制邀请链接
              </button>
            </div>
          )}

          {seat === 'spectator' && (
            <div className="card actions-card">
              <p className="hint">你正在观战，可自由复盘与导出棋谱。</p>
              <button type="button" className="btn wide" onClick={doCopyInvite}>
                复制邀请链接
              </button>
            </div>
          )}

          <MoveList
            moves={state.moves}
            kind={state.kind}
            viewPly={display.viewing ? display.ply : null}
            onSelect={(ply) => setViewPly(ply === state.moves.length ? null : ply)}
          />

          <div className="card export-card">
            <h3>导出</h3>
            <div className="btn-grid">
              <button
                type="button"
                className="btn"
                onClick={async () => {
                  const ok = await copyText(display.fen);
                  toast(ok ? 'FEN 已复制' : '复制失败', ok ? 'success' : 'error');
                }}
              >
                复制 FEN
              </button>
              {state.kind === 'chess' ? (
                <button
                  type="button"
                  className="btn"
                  onClick={() => {
                    downloadText(`chess-${roomId}.pgn`, buildPgn(state));
                    toast('PGN 已导出', 'success');
                  }}
                >
                  导出 PGN
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    className="btn"
                    onClick={() => {
                      downloadText(`xiangqi-${roomId}.txt`, buildXiangqiText(state));
                      toast('中文棋谱已导出', 'success');
                    }}
                  >
                    导出中文棋谱
                  </button>
                  <button
                    type="button"
                    className="btn"
                    onClick={() => {
                      downloadJson(`xiangqi-${roomId}.json`, buildXiangqiJson(state, initialFen));
                      toast('JSON 棋谱已导出', 'success');
                    }}
                  >
                    导出 JSON
                  </button>
                </>
              )}
            </div>
            {state.kind === 'xiangqi' && (
              <p className="hint">中文棋谱为纵线记谱；JSON 为本项目自定义格式（非通用标准 PGN）。</p>
            )}
          </div>

          <ChatPanel chat={chat} onSend={(t) => void actions.chat(t)} seat={seat} />
        </aside>
      </div>

      {pendingPromo && (
        <div className="modal-overlay" role="dialog" aria-modal="true" aria-label="选择升变棋子">
          <div className="card promo-card">
            <h3>选择升变棋子</h3>
            <div className="promo-row">
              {PROMO_CHOICES.map((p) => (
                <button key={p.code} type="button" className="promo-btn" onClick={() => finishPromotion(p.code)}>
                  <span className="promo-label">{p.label}</span>
                </button>
              ))}
            </div>
            <button type="button" className="btn ghost small" onClick={() => setPendingPromo(null)}>
              取消
            </button>
          </div>
        </div>
      )}

      <div className="toasts" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast ${t.kind}`} onClick={() => dismissToast(t.id)}>
            {t.text}
          </div>
        ))}
      </div>
    </div>
  );
}

function PlayerCard({
  state,
  side,
  seat,
  turnLabel,
  isOpponentTop,
}: {
  state: RoomState;
  side: Side;
  seat: 'a' | 'b' | 'spectator' | null;
  turnLabel: string;
  isOpponentTop?: boolean;
}) {
  const info = side === 'a' ? state.seats.a : state.seats.b;
  const kind = state.kind;
  const sideName = kind === 'xiangqi' ? (side === 'a' ? '红方' : '黑方') : side === 'a' ? '白方' : '黑方';
  const captured = state.moves
    .filter((m) => m.side === side && m.captured)
    .map((m) => m.captured as string);
  const isTurn = state.phase === 'playing' && state.turn === side;
  void turnLabel;
  void isOpponentTop;
  return (
    <div className={`player-card ${side} ${isTurn ? 'turn' : ''} ${info ? '' : 'empty'}`}>
      <span className={`seat-dot ${kind === 'xiangqi' ? (side === 'a' ? 'r' : 'k') : side === 'a' ? 'w' : 'b'}`} aria-hidden="true" />
      <div className="player-info">
        <span className="player-name">{info ? info.name : '等待加入'}</span>
        <span className="player-side">{sideName}</span>
      </div>
      {info && !info.connected && <span className="offline-badge">离线</span>}
      {isTurn && <span className="turn-badge">思考中</span>}
      {captured.length > 0 && (
        <div className="captured-row" aria-label="吃子">
          {captured.map((c, i) => (
            <span key={i} className={`captured-piece ${c >= 'A' && c <= 'Z' ? 'up' : 'low'}`}>
              {kind === 'xiangqi' ? pieceLabel(c) : c.toUpperCase()}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function StatusCard({
  state,
  seat,
  turnLabel,
  mySideLabel,
  actions,
  onRestartOffer,
  inviteUrl,
  onCopyInvite,
}: {
  state: RoomState;
  seat: 'a' | 'b' | 'spectator' | null;
  turnLabel: string;
  mySideLabel: string;
  actions: ReturnType<typeof useRoom>['actions'];
  onRestartOffer(): void;
  inviteUrl: string;
  onCopyInvite(): void;
}) {
  const offers = state.offers;
  const amPlayer = seat === 'a' || seat === 'b';
  return (
    <div className="card status-card">
      {state.outcome ? (
        <div className="game-over">
          <h3>
            {state.outcome.winner === null
              ? '和棋'
              : `${state.outcome.winner === 'a' ? (state.kind === 'xiangqi' ? '红方' : '白方') : '黑方'}获胜`}
          </h3>
          <p>{state.outcome.reason}</p>
          {amPlayer && (
            <button type="button" className="btn primary wide" onClick={onRestartOffer}>
              再来一局（需对方同意）
            </button>
          )}
        </div>
      ) : state.phase === 'waiting' ? (
        <>
          <p className="status-line">
            <span className="pulse-dot" aria-hidden="true" />
            等待对手加入…
          </p>
          <div className="invite-side">
            <input readOnly value={inviteUrl} aria-label="邀请链接" onFocus={(e) => e.target.select()} />
            <button type="button" className="btn small primary" onClick={onCopyInvite}>
              复制链接
            </button>
          </div>
        </>
      ) : (
        <p className={`status-line ${state.inCheck ? 'check' : ''}`}>{state.inCheck ? '将军！' : ''}{turnLabel}</p>
      )}
      <p className="my-seat">你的身份：{mySideLabel}</p>

      {amPlayer && offers.draw && offers.draw !== seat && !state.outcome && (
        <div className="offer-card">
          <p>对方提议和棋</p>
          <div className="btn-row">
            <button type="button" className="btn small primary" onClick={() => void actions.drawRespond(true)}>
              同意和棋
            </button>
            <button type="button" className="btn small" onClick={() => void actions.drawRespond(false)}>
              拒绝
            </button>
          </div>
        </div>
      )}
      {amPlayer && offers.undo && offers.undo.by !== seat && !state.outcome && (
        <div className="offer-card">
          <p>对方请求悔棋（回退 {offers.undo.plies} 步）</p>
          <div className="btn-row">
            <button type="button" className="btn small primary" onClick={() => void actions.undoRespond(true)}>
              同意
            </button>
            <button type="button" className="btn small" onClick={() => void actions.undoRespond(false)}>
              拒绝
            </button>
          </div>
        </div>
      )}
      {amPlayer && offers.restart && offers.restart !== seat && (
        <div className="offer-card">
          <p>对方请求重新开局</p>
          <div className="btn-row">
            <button type="button" className="btn small primary" onClick={() => void actions.restartRespond(true)}>
              同意
            </button>
            <button type="button" className="btn small" onClick={() => void actions.restartRespond(false)}>
              拒绝
            </button>
          </div>
        </div>
      )}
      {amPlayer && offers.draw === seat && <p className="pending-line">已提议和棋，等待对方回应…</p>}
      {amPlayer && offers.undo && offers.undo.by === seat && <p className="pending-line">已请求悔棋，等待对方回应…</p>}
      {amPlayer && offers.restart === seat && <p className="pending-line">已请求重开，等待对方回应…</p>}
    </div>
  );
}
