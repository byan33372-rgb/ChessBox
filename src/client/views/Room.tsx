import { useEffect, useMemo, useRef, useState } from 'react';
import { useRoom } from '../net/roomClient';
import {
  createEngine,
  START_FEN as XQ_START_FEN,
  CheckersEngine,
  SEAT_CAMP_MAPS,
  CHECKERS_NAMES,
  CHECKERS_COLORS,
  GoEngine,
  GomokuEngine,
  GO_KOMI,
} from '../../games';
void SEAT_CAMP_MAPS;
void targetCamp;
import { CHESS_START_FEN } from '../../games';
import { targetCamp } from '../../games/checkers/board';
import { pieceLabel } from '../../games/xiangqi/notation';
import type { Side } from '../../games/types';
import type { PublicMove, RoomState } from '../../shared/protocol';
import { ChessBoard } from '../components/ChessBoard';
import { XiangqiBoard } from '../components/XiangqiBoard';
import { CheckersBoard } from '../components/CheckersBoard';
import { GoBoard } from '../components/GoBoard';
import { GomokuBoard } from '../components/GomokuBoard';
import type { CheckersFlight } from '../components/CheckersBoard';
import { buildBoardAnim } from '../components/boardAnim';
import type { BoardAnim } from '../components/boardAnim';
import { useAnimPref } from '../components/animPref';
import {
  checkersClick,
  nextChainTargets,
  parseCheckersFenPieces,
  stepTargetsFrom,
  type CheckersSim,
} from '../components/checkersUi';
import { MoveList, RecentMovesPanel } from '../components/MoveList';
import { LatencyPanel } from '../components/LatencyPanel';
import { SanguoshaTable } from '../components/SanguoshaTable';
import { UnoTable } from '../components/UnoTable';
import { ChatPanel } from '../components/ChatPanel';
import {
  buildCheckersJson,
  buildCheckersText,
  buildGoSgf,
  buildGomokuJson,
  buildGomokuText,
  buildPgn,
  buildXiangqiJson,
  buildXiangqiText,
  copyText,
  downloadJson,
  downloadText,
} from '../export/exporters';

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
  const { conn, status, fatal, seat, state, chat, toasts, dismissToast, toast, actions, sgView, sgCommand, unoView, unoCommand, latency } = useRoom(roomId);
  const [selected, setSelected] = useState<string | null>(null);
  const [flipped, setFlipped] = useState(false);
  const [viewPly, setViewPly] = useState<number | null>(null);
  const [pendingPromo, setPendingPromo] = useState<PendingPromotion | null>(null);
  const { enabled: animEnabled, mode: animMode, speedMs: animSpeed, userOn: animUserOn, toggle: toggleAnimPref } = useAnimPref();
  const [anim, setAnim] = useState<BoardAnim | null>(null);
  /** 跳棋连跳链（逐段选点进行中；[起点, ...落点]） */
  const [chain, setChain] = useState<string[] | null>(null);
  const chainRef = useRef<string[] | null>(null);
  chainRef.current = chain;
  /** 跳棋飞行动画层 */
  const [ckFlight, setCkFlight] = useState<CheckersFlight | null>(null);
  /** 动画闸门游标：上次见过的 moves.length 与 ply（服务端确认后 +1 判定 + 去重） */
  const lastMoveCountRef = useRef(0);
  const lastAnimPlyRef = useRef(-1);

  useEffect(() => {
    setSelected(null);
    setChain(null);
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

  // —— 对手走棋短暂提示（MOVE-031~033）：新着来自他人时 toast；同一 ply 只提示一次 ——
  const lastNotifiedPlyRef = useRef(0);
  useEffect(() => {
    if (!state || conn !== 'online') return;
    const last = state.moves[state.moves.length - 1];
    if (!last || last.ply <= lastNotifiedPlyRef.current) {
      if (last && last.ply > lastNotifiedPlyRef.current) lastNotifiedPlyRef.current = last.ply;
      return;
    }
    lastNotifiedPlyRef.current = last.ply;
    if (seat !== null && last.side !== seat) {
      const who = last.side;
      const name =
        state.kind === 'xiangqi'
          ? who === 'a'
            ? '红方'
            : '黑方'
          : state.kind === 'chess'
            ? who === 'a'
              ? '白方'
              : '黑方'
            : (CHECKERS_NAMES[who] ?? who);
      toast(`对方移动了：${name} ${last.notation}`, 'info');
    }
  }, [state, conn, seat, toast]);

  // —— 跳棋飞行动画闸门：与上面 FLIP 闸门同条件；单步/连跳都从 from 飞向 to ——
  useEffect(() => {
    if (!state) return;
    const moves = state.moves;
    const prevCount = lastMoveCountRef.current;
    const last = moves.length > 0 ? moves[moves.length - 1] : null;
    const freshPly = last !== null && last.ply > lastAnimPlyRef.current;
    const canAnimate = animEnabled && conn === 'online' && viewPly === null && (state.phase === 'playing' || state.phase === 'ended');
    if (state.kind === 'checkers' && moves.length === prevCount + 1 && last && freshPly && canAnimate) {
      setCkFlight({ seat: last.side, from: last.from, to: last.to, key: last.ply });
      const t = setTimeout(() => setCkFlight(null), animMode === 'fast' ? 120 : 240);
      return () => clearTimeout(t);
    }
    if (state.kind === 'checkers') setCkFlight(null);
  }, [state, animEnabled, animMode, conn, viewPly]);

  // 关闭动效时立即清掉在飞的层
  useEffect(() => {
    if (!animEnabled) setAnim(null);
  }, [animEnabled]);

  const initialFen = useMemo(() => {
    if (!state) return XQ_START_FEN;
    return state.moves.length > 0 ? state.moves[0].fenBefore : state.fen;
  }, [state]);

  // —— 乐观落子（FRONT-003/004）：本地先落、服务端拒绝则回滚 ——
  const [optimistic, setOptimistic] = useState<{
    baseRevision: number;
    fen: string;
    ply: number;
    move: PublicMove;
  } | null>(null);
  const optimisticPendingRef = useRef(false);
  useEffect(() => {
    if (optimistic && state && state.revision !== optimistic.baseRevision) setOptimistic(null);
  }, [state, optimistic]);

  // —— 复盘感知的展示局面（含乐观层） ——
  const display = useMemo(() => {
    if (!state) return null;
    if (optimistic && viewPly === null && optimistic.baseRevision === state.revision) {
      return { fen: optimistic.fen, lastMove: optimistic.move, ply: optimistic.ply, viewing: false };
    }
    const moves = state.moves;
    const ply = viewPly === null ? moves.length : Math.min(viewPly, moves.length);
    const fen = ply === 0 ? initialFen : moves[ply - 1].fenAfter;
    const lastMove = ply > 0 ? moves[ply - 1] : null;
    return { fen, lastMove, ply, viewing: viewPly !== null };
  }, [state, viewPly, initialFen, optimistic]);

  /** 提交走棋：先本地预览（同一规则引擎），服务端拒绝时回滚；特殊动作不进乐观层 */
  const submitMove = (input: { from: string; to: string; promotion?: string; path?: string[] }) => {
    if (!state || !display) return;
    const special = input.from === 'pass' || input.from.startsWith('mark:') || input.from.startsWith('score-');
    if (special || display.viewing || optimisticPendingRef.current) {
      void actions.move(input);
      return;
    }
    let preview: ReturnType<typeof createEngine> | null = null;
    let applied: ReturnType<ReturnType<typeof createEngine>['applyMove']> | null = null;
    try {
      preview = createEngine(state.kind, display.fen);
      applied = preview.applyMove(input);
    } catch {
      applied = null;
    }
    if (!preview || !applied) {
      void actions.move(input);
      return;
    }
    optimisticPendingRef.current = true;
    const move: PublicMove = {
      ply: state.moves.length + 1,
      side: seat && seat !== 'spectator' ? seat : state.turn,
      from: input.from,
      to: input.to,
      promotion: input.promotion,
      notation: applied.notation,
      fenBefore: applied.fenBefore,
      fenAfter: applied.fenAfter,
      captured: applied.captured,
      capturedSq: applied.capturedSq,
      path: applied.path,
      extra: applied.extra,
      check: applied.gaveCheck,
      ts: Date.now(),
    };
    setOptimistic({ baseRevision: state.revision, fen: preview.fen(), ply: move.ply, move });
    void actions.move(input).finally(() => {
      optimisticPendingRef.current = false;
      setOptimistic(null);
    });
  };

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

  // —— 跳棋：sim / 目标营地 / 连跳感知 targets ——
  const isCheckers = state?.kind === 'checkers' && engine instanceof CheckersEngine;
  const goEngineLike = isCheckers ? (engine as import('../../games/checkers/engine').CheckersEngine) : null;
  const ckSim = useMemo(
    () => (isCheckers && display ? parseCheckersFenPieces(display.fen) : null),
    [isCheckers, display?.fen],
  ) as CheckersSim | null;
  // 自由选座模式：营地映射以引擎（权威）为准，不再使用 SEAT_CAMP_MAPS（DEF-CK-002）
  const ckTargetCamp = useMemo(() => {
    if (!isCheckers || !seat || seat === 'spectator') return -1;
    return goEngineLike?.targetOfSeat(seat as never) ?? -1;
  }, [isCheckers, seat, goEngineLike]);
  // —— 围棋派生信息（数子/提子/死子 UI） ——
  const goEngine = state?.kind === 'go' && engine instanceof GoEngine ? engine : null;
  const goPhase = goEngine?.phaseOf() ?? 'playing';
  const goSize = (goEngine?.size ?? 19) as 9 | 13 | 19;
  const goDead = goEngine?.deadStones() ?? [];
  const goMyConfirm = goEngine ? goEngine.confirmedOf().includes(seat === 'spectator' ? 'a' : (seat as Side)) : false;

  /** 旁观视角：以当前轮次者的营地为准（引擎权威） */
  const viewTargetCamp = useMemo(() => {
    if (!isCheckers || !goEngineLike) return -1;
    const who = (seat && seat !== 'spectator' ? seat : state?.turn) as never;
    return goEngineLike.targetOfSeat(who) ?? -1;
  }, [isCheckers, goEngineLike, state?.turn, seat]);
  const viewOwnCamp = useMemo(() => {
    if (!isCheckers || !goEngineLike) return -1;
    const who = (seat && seat !== 'spectator' ? seat : state?.turn) as never;
    return goEngineLike.campOfSeat(who) ?? -1;
  }, [isCheckers, goEngineLike, state?.turn, seat]);
  const ckOwnCamp = useMemo(() => {
    if (!isCheckers || !seat || seat === 'spectator') return -1;
    return goEngineLike?.campOfSeat(seat as never) ?? -1;
  }, [isCheckers, seat, goEngineLike]);

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
    if (isCheckers && ckSim) {
      const base = chain ?? [selected];
      if (base.length === 1) {
        for (const t of stepTargetsFrom(ckSim, base[0], viewTargetCamp, viewOwnCamp)) map.set(t, false);
      }
      // 连跳延伸目标：排除链内已用格（防循环，与 checkersClick 同源）
      for (const t of nextChainTargets(ckSim, base, viewTargetCamp, viewOwnCamp)) map.set(t, false);
      return map;
    }
    for (const m of engine.legalMoves()) {
      if (m.from === selected) map.set(m.to, m.capture);
    }
    return map;
  }, [engine, selected, isCheckers, ckSim, viewTargetCamp, viewOwnCamp, chain, state?.turn]);

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
      setChain(null);
      return;
    }
    // —— 落子型分支（围棋/五子棋）：点击空点直接落子；围棋数子阶段点击棋子=标记死子 ——
    if (state.kind === 'go' && goEngine) {
      if (goPhase === 'scoring') {
        if (eng.pieceAt(sq) && !goMyConfirm) {
          void actions.move({ from: `mark:${sq}`, to: `mark:${sq}` });
        }
        return;
      }
      if (!eng.pieceAt(sq)) {
        submitMove({ from: sq, to: sq });
      }
      return;
    }
    if (state.kind === 'gomoku') {
      if (!eng.pieceAt(sq)) {
        submitMove({ from: sq, to: sq });
      }
      return;
    }
    // —— 跳棋分支：连跳逐段选点（与沙盒同一交互函数） ——
    if (state.kind === 'checkers' && ckSim && seat) { // canMove 已排除观战
      const result = checkersClick(ckSim, seat, ckTargetCamp, ckOwnCamp, sel, chainRef.current, sq);
      if (result.type === 'select') {
        selectedRef.current = result.cell;
        setSelected(result.cell);
        setChain(null);
        return;
      }
      if (result.type === 'extend') {
        setChain(result.chain);
        return;
      }
      if (result.type === 'commit') {
        submitMove({ from: result.from, to: result.to, path: result.path });
        selectedRef.current = null;
        setSelected(null);
        setChain(null);
        return;
      }
      selectedRef.current = null;
      setSelected(null);
      setChain(null);
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
      submitMove({ from: sel, to: sq });
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

  /** 连跳进行中：手动确认提交当前链（有后续跳跃时可用） */
  const commitChain = () => {
    const cur = chainRef.current;
    if (!cur || cur.length < 2) return;
    submitMove({ from: cur[0], to: cur[cur.length - 1], path: cur });
    selectedRef.current = null;
    setSelected(null);
    setChain(null);
  };

  const finishPromotion = (code: string) => {
    if (pendingPromo) {
      submitMove({ ...pendingPromo, promotion: code });
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

  const sideName = (s: Side) =>
    state.kind === 'xiangqi'
      ? s === 'a'
        ? '红方'
        : '黑方'
      : state.kind === 'chess'
        ? s === 'a'
          ? '白方'
          : '黑方'
        : state.kind === 'go' || state.kind === 'gomoku'
          ? s === 'a'
            ? '黑方'
            : '白方'
          : (CHECKERS_NAMES[s] ?? s);
  const kindName =
    state.kind === 'xiangqi'
      ? '中国象棋'
      : state.kind === 'chess'
        ? '国际象棋'
        : state.kind === 'checkers'
          ? '中国跳棋'
          : state.kind === 'go'
            ? '围棋'
            : '五子棋';
  const kindIcon =
    state.kind === 'xiangqi' ? '帥' : state.kind === 'checkers' ? '⬡' : state.kind === 'go' ? '碁' : state.kind === 'gomoku' ? '五' : '♞';

  const board =
    state.kind === 'xiangqi' ? (
      <XiangqiBoard
        fen={display.fen}
        orientation={xqOrientation}
        selected={selected}
        targets={targets}
        lastMove={
          display.lastMove
            ? { from: display.lastMove.from, to: display.lastMove.to, extra: display.lastMove.extra }
            : null
        }
        checkSquare={checkSquare}
        onSquareClick={handleSquareClick}
        anim={display.viewing ? null : anim}
      />
    ) : state.kind === 'checkers' ? (
      <CheckersBoard
        pieces={ckSim ?? new Map()}
        selected={selected}
        chain={chain}
        targets={targets}
        lastMove={display.lastMove ? { from: display.lastMove.from, to: display.lastMove.to, path: display.lastMove.path } : null}
        flipped={flipped || seat === 'b'}
        onSquareClick={handleSquareClick}
        flight={display.viewing ? null : ckFlight}
      />
    ) : state.kind === 'go' ? (
      <GoBoard
        size={goSize}
        fen={display.fen}
        lastMove={display.lastMove?.from ?? null}
        deadStones={goDead}
        scoringMode={goPhase === 'scoring' && isLive}
        onPointClick={handleSquareClick}
        interactive={isLive}
      />
    ) : state.kind === 'gomoku' ? (
      <GomokuBoard
        fen={display.fen}
        lastMove={display.lastMove?.from ?? null}
        winLine={state.outcome && display.lastMove?.extra ? display.lastMove.extra.map((x) => x.from) : []}
        onPointClick={handleSquareClick}
        interactive={isLive}
      />
    ) : (
      <ChessBoard
        fen={display.fen}
        orientation={chessOrientation}
        selected={selected}
        targets={targets}
        lastMove={
          display.lastMove
            ? { from: display.lastMove.from, to: display.lastMove.to, extra: display.lastMove.extra }
            : null
        }
        checkSquare={checkSquare}
        onSquareClick={handleSquareClick}
        anim={display.viewing ? null : anim}
      />
    );

  const mySideLabel = seat === 'spectator' ? '观战' : sideName(seat as Side);
  const turnLabel = state.turn === seat ? '轮到你走棋' : `轮到${sideName(state.turn)}走棋`;
  void GO_KOMI;

  return (
    <div
      className={`room theme-${state.kind}`}
      style={{ ['--anim-move-ms' as string]: `${animSpeed}ms` } as React.CSSProperties}
    >
      <header className="room-header">
        <button type="button" className="icon-btn" onClick={onExit} aria-label="返回首页">
          ←
        </button>
        <span className="room-kind-ico" aria-hidden="true">
          {kindIcon}
        </span>
        <div className="room-title">
          <span className={`kind-badge ${state.kind}`}>{kindName}</span>
          {state.kind === 'go' && <span className="go-komi-badge" title="中国规则：区域计分，贴目白方 7.5 目">中国规则 · 贴目 7.5</span>}
          <span className="room-code" title="房间号">
            {roomId}
          </span>
        </div>
        <span className={`conn-pill ${conn === 'online' ? 'ok' : 'warn'}`} role="status">
          {conn === 'online' ? '已连接' : conn === 'reconnecting' ? '重连中…' : '连接中…'}
        </span>
      </header>

      <LatencyPanel latency={latency} conn={conn} />

      <div className="room-body">
        {state.kind === 'sanguosha' || state.kind === 'uno' ? (
          state.kind === 'sanguosha' ? (
            <SanguoshaTable
              view={sgView}
              seat={seat}
              conn={conn}
              chat={chat}
              onSend={(t) => void actions.chat(t)}
              onCommand={(a) => void sgCommand(a as never)}
            />
          ) : (
            <UnoTable
              view={unoView}
              seat={seat}
              conn={conn}
              chat={chat}
              onSend={(t) => void actions.chat(t)}
              onCommand={(a) => void unoCommand(a)}
            />
          )
        ) : (
        <>
        <div className="board-col">
          {state.kind === 'checkers' && state.seatOrder.length > 2 ? (
            <div className="checkers-seats" aria-label="多座位状态">
              {state.seatOrder.map((s) => (
                <CheckersSeatCard
                  key={s}
                  state={state}
                  side={s}
                  mySeat={seat}
                  onPickSeat={state.phase === 'waiting' ? () => void actions.takeSeat(s) : undefined}
                />
              ))}
            </div>
          ) : (
            <PlayerCard
              state={state}
              side={seat === 'a' ? 'b' : 'a'}
              seat={seat}
              turnLabel={turnLabel}
              isOpponentTop
              onPickSeat={state.phase === 'waiting' ? () => void actions.takeSeat(seat === 'a' ? 'b' : 'a') : undefined}
            />
          )}
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
                  {state.outcome.winner === null ? '和棋' : `${sideName(state.outcome.winner)}获胜`} · {state.outcome.reason}
                </span>
              </div>
            )}
            {chain && chain.length >= 2 && canMove && (
              <div className="chain-banner" role="status">
                连跳进行中（已跳 {chain.length - 1} 段）
                <button type="button" className="btn small" onClick={commitChain}>
                  完成跳跃
                </button>
              </div>
            )}
            {state.phase === 'waiting' && (
              <div className="waiting-overlay">
                <div className="card waiting-card">
                  <h3>
                    {state.kind === 'checkers'
                      ? `等待玩家入座（${Object.keys(state.seats).length}/${state.seatCount}）`
                      : '等待对手加入'}
                  </h3>
                  <p>
                    {state.kind === 'checkers'
                      ? '把邀请链接发给朋友；在右侧「选择阵营」面板挑选六色阵营，满员自动开局'
                      : '把邀请链接发给朋友；点击空位或右侧「选择阵营」按钮选择职业'}
                  </p>
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
          {state.kind === 'checkers' && state.seatCount > 2 ? null : (
            <PlayerCard
              state={state}
              side={seat === 'b' ? 'b' : 'a'}
              seat={seat}
              turnLabel={turnLabel}
              onPickSeat={state.phase === 'waiting' ? () => void actions.takeSeat(seat === 'b' ? 'b' : 'a') : undefined}
            />
          )}

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
            {state.kind !== 'go' && state.kind !== 'gomoku' && (
              <button type="button" className="btn small ghost" onClick={() => setFlipped((f) => !f)}>
                翻转棋盘
              </button>
            )}
            <button
              type="button"
              className="btn small ghost"
              onClick={toggleAnimPref}
              aria-pressed={animUserOn}
              title="走棋动效开关（不影响规则）"
            >
              {animMode === 'normal' ? '动效 普通' : animMode === 'fast' ? '动效 快速' : '动效 关'}
            </button>
          </div>
        </div>

        <aside className="side-col">
          <SeatPanel state={state} seat={seat} onPick={(sx) => void actions.takeSeat(sx)} />
          <StatusCard
            state={state}
            seat={seat}
            turnLabel={turnLabel}
            goScoring={goPhase === 'scoring'}
            mySideLabel={mySideLabel}
            actions={actions}
            onRestartOffer={() => void actions.restartOffer()}
            inviteUrl={inviteUrl}
            onCopyInvite={doCopyInvite}
          />

          {seat !== 'spectator' && state.phase === 'playing' && (
            <div className="card actions-card">
              {(state.kind === 'go' || state.kind === 'checkers') && state.phase === 'playing' && (
                <button
                  type="button"
                  className="btn wide"
                  onClick={() => void actions.move({ from: 'pass', to: 'pass' })}
                  title={state.kind === 'checkers' ? '无合适着法时可停一手；双方连续停一手判和' : undefined}
                >
                  停一手
                </button>
              )}
              {state.kind === 'go' && goPhase === 'scoring' && (
                <div className="go-scoring-actions">
                  <p className="hint">数子阶段：点击对方死子标记/取消，然后双方确认（贴目 7.5）。</p>
                  <div className="btn-grid">
                    <button
                      type="button"
                      className="btn primary"
                      disabled={goMyConfirm}
                      onClick={() => void actions.move({ from: 'score-confirm', to: 'score-confirm' })}
                    >
                      {goMyConfirm ? '已确认，等对方' : '确认数子'}
                    </button>
                    <button
                      type="button"
                      className="btn"
                      onClick={() => void actions.move({ from: 'score-resume', to: 'score-resume' })}
                    >
                      意见不一，继续对弈
                    </button>
                  </div>
                </div>
              )}
              {!(state.kind === 'go' && goPhase === 'scoring') && (
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
              )}
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

          <RecentMovesPanel moves={state.moves} viewPly={display.viewing ? display.ply : null} onSelect={(ply) => setViewPly(ply === state.moves.length ? null : ply)} />

          <LastMoveBar lastMove={display.lastMove} kind={state.kind} />

          <MoveList
            moves={state.moves}
            kind={state.kind}
            seatOrder={state.seatOrder}
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
              ) : state.kind === 'go' ? (
                <button
                  type="button"
                  className="btn"
                  onClick={() => {
                    downloadText(`go-${roomId}.sgf`, buildGoSgf(state));
                    toast('SGF 棋谱已导出', 'success');
                  }}
                >
                  导出 SGF
                </button>
              ) : state.kind === 'gomoku' ? (
                <>
                  <button
                    type="button"
                    className="btn"
                    onClick={() => {
                      downloadText(`gomoku-${roomId}.txt`, buildGomokuText(state));
                      toast('五子棋棋谱已导出', 'success');
                    }}
                  >
                    导出棋谱文本
                  </button>
                  <button
                    type="button"
                    className="btn"
                    onClick={() => {
                      downloadJson(`gomoku-${roomId}.json`, buildGomokuJson(state, initialFen));
                      toast('JSON 棋谱已导出', 'success');
                    }}
                  >
                    导出 JSON
                  </button>
                </>
              ) : state.kind === 'checkers' ? (
                <>
                  <button
                    type="button"
                    className="btn"
                    onClick={() => {
                      downloadText(`checkers-${roomId}.txt`, buildCheckersText(state));
                      toast('跳棋棋谱已导出', 'success');
                    }}
                  >
                    导出棋谱文本
                  </button>
                  <button
                    type="button"
                    className="btn"
                    onClick={() => {
                      downloadJson(`checkers-${roomId}.json`, buildCheckersJson(state, initialFen));
                      toast('JSON 棋谱已导出', 'success');
                    }}
                  >
                    导出 JSON
                  </button>
                </>
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
        </>
        )}
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
  onPickSeat,
}: {
  state: RoomState;
  side: Side;
  seat: Side | 'spectator' | null;
  turnLabel: string;
  isOpponentTop?: boolean;
  /** 等待阶段空位点击选座 */
  onPickSeat?: () => void;
}) {
  const info = state.seats[side];
  const kind = state.kind;
  const sideName =
    kind === 'xiangqi'
      ? side === 'a'
        ? '红方'
        : '黑方'
      : kind === 'chess'
        ? side === 'a'
          ? '白方'
          : '黑方'
        : kind === 'go' || kind === 'gomoku'
          ? side === 'a'
            ? '黑方'
            : '白方'
          : (CHECKERS_NAMES[side] ?? side);
  const captured = state.moves
    .filter((m) => m.side === side && m.captured)
    .map((m) => m.captured as string);
  const isTurn = state.phase === 'playing' && state.turn === side;
  const pickable = !info && state.phase === 'waiting' && !!onPickSeat;
  const isMine = seat !== null && seat !== 'spectator' && seat === side;
  void turnLabel;
  void isOpponentTop;
  return (
    <div
      className={`player-card ${side} ${isTurn ? 'turn' : ''} ${info ? '' : 'empty'} ${pickable ? 'pickable' : ''} ${isMine ? 'mine' : ''}`}
      onClick={pickable ? onPickSeat : undefined}
      role={pickable ? 'button' : undefined}
      tabIndex={pickable ? 0 : undefined}
      onKeyDown={pickable ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onPickSeat?.(); } } : undefined}
      aria-label={pickable ? `选择${sideName}` : undefined}
    >
      <span
        className={`seat-dot ${kind === 'xiangqi' ? (side === 'a' ? 'r' : 'k') : kind === 'checkers' ? `ck-${side}` : side === 'a' ? 'w' : 'b'}`}
        aria-hidden="true"
      />
      <div className="player-info">
        <span className="player-name">{info ? info.name : pickable ? '点击选择此阵营' : '等待加入'}</span>
        <span className="player-side">{sideName}</span>
      </div>
      {info && !info.connected && <span className="offline-badge">离线</span>}
      {isMine && <span className="me-badge">我</span>}
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

/** 跳棋多座位条目（3/4/6 人）：紧凑显示每个座位的名字/在线/轮次 */
function CheckersSeatCard({
  state,
  side,
  mySeat,
  onPickSeat,
}: {
  state: RoomState;
  side: Side;
  mySeat: Side | 'spectator' | null;
  onPickSeat?: () => void;
}) {
  const info = state.seats[side];
  const isTurn = state.phase === 'playing' && state.turn === side;
  const isMe = mySeat === side;
  const pickable = !info && !!onPickSeat;
  return (
    <div
      className={`checkers-seat ${isTurn ? 'turn' : ''} ${info ? '' : 'empty'} ${isMe ? 'me' : ''} ${pickable ? 'pickable' : ''}`}
      onClick={pickable ? onPickSeat : undefined}
      role={pickable ? 'button' : undefined}
      tabIndex={pickable ? 0 : undefined}
      onKeyDown={pickable ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onPickSeat?.(); } } : undefined}
      aria-label={pickable ? `选择${CHECKERS_NAMES[side] ?? side}` : undefined}
    >
      <span className={`seat-dot ck-${side}`} aria-hidden="true" />
      <span className="seat-name">{info ? info.name : pickable ? '点击选座' : '等待加入'}</span>
      <span className="seat-side">{CHECKERS_NAMES[side] ?? side}</span>
      {isMe && <span className="me-badge">我</span>}
      {info && !info.connected && <span className="offline-badge">离线</span>}
      {isTurn && <span className="turn-badge">思考中</span>}
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
  goScoring,
}: {
  state: RoomState;
  seat: Side | 'spectator' | null;
  turnLabel: string;
  goScoring: boolean;
  mySideLabel: string;
  actions: ReturnType<typeof useRoom>['actions'];
  onRestartOffer(): void;
  inviteUrl: string;
  onCopyInvite(): void;
}) {
  const offers = state.offers;
  const amPlayer = seat !== null && seat !== 'spectator';
  const winnerName = (w: Side) =>
    state.kind === 'go' || state.kind === 'gomoku'
      ? w === 'a'
        ? '黑方'
        : '白方'
      : state.kind === 'xiangqi'
        ? w === 'a'
          ? '红方'
          : '黑方'
        : state.kind === 'chess'
          ? w === 'a'
            ? '白方'
            : '黑方'
          : (CHECKERS_NAMES[w] ?? w);
  return (
    <div className="card status-card">
      {state.outcome ? (
        <div className="game-over">
          <h3>{state.outcome.winner === null ? '和棋' : `${winnerName(state.outcome.winner)}获胜`}</h3>
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
      ) : state.kind === 'go' && goScoring && !state.outcome ? (
        <p className="status-line">数子阶段：标记死子后双方确认（贴目 {GO_KOMI}）</p>
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


/** 最近一步信息区（MOVE-025/026/027，三棋统一）：着法语义 + 起终点图例 */
function LastMoveBar({
  lastMove,
  kind,
}: {
  lastMove: { side: Side; from: string; to: string; notation: string; path?: string[]; extra?: Array<{ from: string; to: string }> } | null;
  kind: RoomState['kind'];
}) {
  if (!lastMove) {
    return (
      <div className="card last-move-bar empty" aria-label="最近一步">
        <p className="hint">还没有走棋——第一步由{'红方/白方/红方'}先走。</p>
      </div>
    );
  }
  const who =
    kind === 'xiangqi'
      ? lastMove.side === 'a'
        ? '红方'
        : '黑方'
      : kind === 'chess'
        ? lastMove.side === 'a'
          ? '白方'
          : '黑方'
        : kind === 'go' || kind === 'gomoku'
          ? lastMove.side === 'a'
            ? '黑方'
            : '白方'
          : (CHECKERS_NAMES[lastMove.side] ?? lastMove.side);
  // notation 已含「连跳×N」时不重复追加
  const trail =
    lastMove.path && lastMove.path.length > 2 && !lastMove.notation.includes('连跳')
      ? `（连跳 ${lastMove.path.length - 1} 段）`
      : '';
  return (
    <div className="card last-move-bar" aria-label="最近一步">
      <div className="lmb-main">
        <span className="lmb-label">上一手</span>
        <span className="lmb-text">
          {who} · {lastMove.notation}
          {trail}
        </span>
      </div>
      <div className="lmb-legend" aria-hidden="true">
        <span className="legend-dot from" />
        起点 {lastMove.from}
        <span className="legend-arrow">→</span>
        <span className="legend-dot to" />
        终点 {lastMove.to}
      </div>
    </div>
  );
}


/** 选择阵营面板（独立于座位卡；等待阶段可自由挑空位；五棋统一） */
function SeatPanel({
  state,
  seat,
  onPick,
}: {
  state: RoomState;
  seat: Side | 'spectator' | null;
  onPick(seat: Side): void;
}) {
  const waiting = state.phase === 'waiting';
  const labels2p: Record<string, { a: string; b: string }> = {
    xiangqi: { a: '红方（先手）', b: '黑方' },
    chess: { a: '白方（先手）', b: '黑方' },
    go: { a: '黑方（先手）', b: '白方' },
    gomoku: { a: '黑方（先手）', b: '白方' },
  };
  return (
    <div className="card seat-panel" aria-label="选择阵营">
      <h3>选择阵营</h3>
      {state.kind === 'checkers' ? (
        <div className="seat-panel-grid six">
          {state.seatOrder.map((sx) => {
            const info = state.seats[sx];
            const mine = seat === sx;
            const color = CHECKERS_COLORS[sx];
            return (
              <button
                key={sx}
                type="button"
                className={`seat-choice ${mine ? 'mine' : ''} ${info ? 'taken' : ''}`}
                style={{ ['--seat-color' as string]: color }}
                disabled={!waiting || (!!info && !mine)}
                aria-pressed={mine}
                onClick={() => !mine && onPick(sx)}
              >
                <span className="seat-choice-dot" style={{ background: color }} aria-hidden="true" />
                <span className="seat-choice-label">{CHECKERS_NAMES[sx] ?? sx}</span>
                <span className="seat-choice-sub">{mine ? '我的阵营' : info ? info.name : '空位'}</span>
              </button>
            );
          })}
        </div>
      ) : (
        <div className="seat-panel-grid">
          {(['a', 'b'] as const).map((sx) => {
            const info = state.seats[sx];
            const mine = seat === sx;
            return (
              <button
                key={sx}
                type="button"
                className={`seat-choice ${mine ? 'mine' : ''} ${info ? 'taken' : ''} seat-side-${sx}`}
                disabled={!waiting || (!!info && !mine)}
                aria-pressed={mine}
                onClick={() => !mine && onPick(sx)}
              >
                <span className="seat-choice-label">{(labels2p[state.kind] ?? { a: '先手方', b: '后手方' })[sx]}</span>
                <span className="seat-choice-sub">{mine ? '我的阵营' : info ? info.name : '空位'}</span>
              </button>
            );
          })}
        </div>
      )}
      <p className="hint">{waiting ? '点击空位选择/更换职业，就座满员后开局' : '对局进行中，阵营已锁定'}</p>
    </div>
  );
}
