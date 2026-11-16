/**
 * UNO 对局桌面（PHASE 5）。
 * 信息分级：我的手牌仅本人可见；他人只有数量；合法性来自服务端 playableIds。
 */
import { useState } from 'react';
import type { UnoClientView } from '../../shared/protocol';
import type { UnoColor } from '../../games/uno/cards';
type UnoSeat = 'a' | 'b' | 'c' | 'd';
import { UNO_COLOR_NAMES } from '../../games/uno/cards';
import { ChatPanel } from './ChatPanel';
import type { ChatMessage } from '../../shared/protocol';

export interface UnoTableProps {
  view: UnoClientView | null;
  seat: string | null;
  conn: string;
  chat: ChatMessage[];
  onSend(text: string): void;
  onCommand(action: Record<string, unknown>): void;
}

const COLOR_CLASS: Record<UnoColor, string> = { R: 'uno-red', Y: 'uno-yellow', G: 'uno-green', B: 'uno-blue' };
const COLOR_LABEL: Record<UnoColor, string> = { R: '红', Y: '黄', G: '绿', B: '蓝' };

function kindLabel(id: string): string {
  // id 形如 u-c108-001-numberR0 —— 末段 kind+color+num
  const m = /^u-(?:c108|c112|t112)-\d+-([a-z_0-4]+?)(R|Y|G|B)?(\d*)$/.exec(id);
  if (!m) return '?';
  const kind = m[1];
  if (kind === 'number') return m[3] ?? '';
  if (kind === 'draw2') return '+2';
  if (kind === 'reverse') return '⟲';
  if (kind === 'skip') return '⊘';
  if (kind === 'wild') return 'W';
  if (kind === 'wild_draw4') return 'W+4';
  if (kind === 'wild_swap') return 'W⇄';
  if (kind === 'wild_custom') return 'W★';
  if (kind === 'wild_team_play') return 'W◎';
  if (kind === 'wild_team_draw4') return 'W+4◎';
  return '?';
}

function colorOf(id: string): UnoColor | null {
  const m = /(?:R|Y|G|B)(\d*)$/.exec(id);
  void m;
  const m2 = /^u-(?:c108|c112|t112)-\d+-[a-z_0-4]+?(R|Y|G|B)/.exec(id);
  return (m2?.[1] as UnoColor) ?? null;
}

function UnoCardChip({ id, size = 'md', dim = false }: { id: string; size?: 'sm' | 'md'; dim?: boolean }) {
  const color = colorOf(id);
  const cls = color ? COLOR_CLASS[color] : 'uno-wild';
  return (
    <span className={`uno-card uno-card-${size} ${cls} ${dim ? 'dim' : ''}`} data-card={id}>
      <span className="uno-card-label">{kindLabel(id)}</span>
    </span>
  );
}

const TEAM_LABEL: Record<string, string> = { A: 'A 队', B: 'B 队' };

export function UnoTable({ view, seat, conn, chat, onSend, onCommand }: UnoTableProps) {
  const [colorPicker, setColorPicker] = useState(false);
  const [pendingCard, setPendingCard] = useState<string | null>(null);
  const mySeat = (seat && seat !== 'spectator' ? seat : null) as UnoSeat | null;
  const isSpectator = seat === 'spectator' || !seat;

  if (!view) {
    return <div className="uno-table"><p className="sg-hint">正在同步对局状态…（{conn}）</p></div>;
  }

  // —— 选队阶段 ——
  if (view.phase === 'select') {
    return (
      <div className="uno-table uno-select">
        <h3>UNO · 等待玩家（{view.players.filter((p) => p.ready).length}/{view.players.length} 已准备）</h3>
        {view.ruleProfile !== 'classic_ffa' && (
          <div className="uno-team-row" role="radiogroup" aria-label="选择队伍">
            {(['A', 'B'] as const).map((t) => (
              <button key={t} type="button" className="btn" onClick={() => void onCommand({ type: 'set-team', team: t })}>
                {TEAM_LABEL[t]}
              </button>
            ))}
          </div>
        )}
        {!isSpectator && (
          <button type="button" className="btn primary" onClick={() => void onCommand({ type: 'ready', ready: true })}>
            准备
          </button>
        )}
        <div className="uno-players-brief">
          {view.players.map((p) => (
            <span key={p.id} className={`sg-seat-chip ${p.ready ? 'ok' : ''}`}>
              {p.id.toUpperCase()} {p.team ? `· ${TEAM_LABEL[p.team]}` : ''} · {p.ready ? '已准备' : '未准备'}
            </span>
          ))}
        </div>
      </div>
    );
  }

  const me = view.players.find((p) => p.id === mySeat) ?? null;
  const myTurn = view.turn === mySeat && !isSpectator;
  const playable = new Set(view.playableIds ?? []);
  const others = view.players.filter((p) => p.id !== mySeat);
  const needsColor = pendingCard != null && /wild/.test(pendingCard);
  const teamPassMine = view.pending?.kind === 'team-pass' && mySeat != null && view.pending.picks?.[mySeat] == null;
  const challengeMine = false; // challenge 是服务端推给下家的 pending——本视图不直接暴露 playerId

  const doPlay = (id: string): void => {
    const isWild = /wild/.test(id);
    if (isWild && !/draw4/.test(id)) {
      // wild 系（team_play/swap/custom/wild）：先选色再出（UI 简化：弹出颜色选择）
      setPendingCard(id);
      setColorPicker(true);
      return;
    }
    void onCommand({ type: 'play-card', cardId: id });
  };
  const confirmColor = (c: UnoColor): void => {
    void onCommand({ type: 'play-card', cardId: pendingCard, chosenColor: c });
    setColorPicker(false);
    setPendingCard(null);
  };

  return (
    <div className="uno-table" data-phase={view.phase}>
      {/* 中央信息条 */}
      <div className="sg-centerbar">
        <span className={`uno-color-ind ${COLOR_CLASS[view.currentColor as UnoColor] ?? ''}`}>
          当前颜色：{COLOR_LABEL[view.currentColor as UnoColor] ?? view.currentColor}
        </span>
        <span className="sg-turn">轮到 {view.turn.toUpperCase()} {view.direction === -1 ? '⟲ 反向' : ''}</span>
        <span className="sg-pile">牌堆 {view.drawCount} · 弃牌 {view.discardCount}</span>
        {view.discardTop && <UnoCardChip id={view.discardTop} size="sm" />}
        {view.pendingDraw > 0 && <span className="sg-warn">罚抽 {view.pendingDraw} 张待执行</span>}
        {view.pending?.kind === 'team-pass' && <span className="sg-hint">开局传牌中…（已交 {Object.keys(view.pending.picks ?? {}).length}）</span>}
        {view.winner && (
          <span className="sg-winner-banner">
            {view.winningTeam ? `${TEAM_LABEL[view.winningTeam]} 获胜！` : `${String(view.winner).toUpperCase()} 获胜！`}
          </span>
        )}
      </div>

      {/* 对手区 */}
      <div className={`sg-opponents n${others.length}`}>
        {others.map((p) => (
          <div
            key={p.id}
            className={[
              'sg-player',
              p.isOut ? 'dead' : '',
              view.turn === p.id ? 'acting' : '',
            ].join(' ')}
          >
            <span className="sg-p-seat">{p.id.toUpperCase()}{p.team ? ` · ${TEAM_LABEL[p.team]}` : ''}</span>
            <span className="uno-hand-count" aria-label={`手牌 ${p.handCount} 张`}>手牌 {p.handCount}</span>
            {p.unoCalled && <span className="uno-call-badge">UNO!</span>}
            {p.isOut && <span className="sg-p-dead">已出完</span>}
          </div>
        ))}
      </div>

      {/* 我的区域 */}
      {me && !isSpectator && (
        <div className="sg-mine">
          <div className="sg-mine-info">
            <span className="sg-p-seat">{me.id.toUpperCase()}{me.team ? ` · ${TEAM_LABEL[me.team]}` : ''}</span>
            {me.isOut && <span className="sg-p-dead">已出完（等待队友）</span>}
            {view.myUnoCalled && <span className="uno-call-badge">已喊 UNO</span>}
          </div>
          <div className="sg-hand" role="listbox" aria-label="我的手牌">
            {view.myHand.map((id) => (
              <button
                key={id}
                type="button"
                role="option"
                aria-selected={false}
                className={`sg-hand-card ${myTurn && !playable.has(id) ? 'disabled' : ''} ${pendingCard === id ? 'sel' : ''}`}
                disabled={!myTurn || !playable.has(id)}
                title={!myTurn ? '还没轮到你' : !playable.has(id) ? '不匹配当前颜色/数字/符号' : '点击出牌'}
                onClick={() => doPlay(id)}
              >
                <UnoCardChip id={id} />
              </button>
            ))}
          </div>
          <div className="uno-my-actions">
            {myTurn && (
              <button type="button" className="btn" onClick={() => void onCommand({ type: 'draw' })} disabled={view.pendingDraw > 0}>
                抽 1 张
              </button>
            )}
            {(view.myHand.length === 2 || me.unoCalled) && (
              <button type="button" className="btn small primary" onClick={() => void onCommand({ type: 'call-uno' })}>
                UNO!
              </button>
            )}
          </div>
        </div>
      )}

      {/* 行动提示 */}
      <div className="sg-actions" role="status">
        {teamPassMine && <span className="sg-hint">开局传牌：点击手牌选择 1 张传给队友（双方同时秘密交换）</span>}
        {view.pending?.kind === 'team-pass' && view.pending.picks?.[mySeat ?? 'a' as UnoSeat] != null && (
          <span className="sg-hint">已选牌，等待队友…</span>
        )}
        {!view.pending && !view.winner && <span className="sg-hint">{myTurn ? '轮到你出牌' : `等待 ${view.turn.toUpperCase()}…`}</span>}
        {view.winner && (
          <span className="sg-hint">
            本轮结束：{view.winningTeam ? TEAM_LABEL[view.winningTeam] : String(view.winner).toUpperCase()} 获胜
            {view.roundWinner ? `（先出完：${String(view.roundWinner).toUpperCase()}）` : ''}
          </span>
        )}
      </div>

      {/* 选色弹窗 */}
      {colorPicker && (
        <div className="modal-overlay" role="dialog" aria-modal="true" aria-label="选择颜色">
          <div className="card promo-card">
            <h3>选择后续颜色</h3>
            <div className="uno-color-picker">
              {(['R', 'Y', 'G', 'B'] as UnoColor[]).map((c) => (
                <button key={c} type="button" className={`uno-color-btn ${COLOR_CLASS[c]}`} onClick={() => confirmColor(c)}>
                  {COLOR_LABEL[c]}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* 战报 + 聊天 */}
      <div className="sg-side">
        <div className="sg-log card" aria-label="战报">
          <h3>战报</h3>
          <div className="sg-log-list">
            {view.log.slice(-60).map((e) => (
              <p key={`${e.seq}`} className={e.t === 'ROUND_END' ? 'turn-head' : ''}>
                {unoLogText(e)}
              </p>
            ))}
          </div>
        </div>
        <ChatPanel chat={chat} seat={seat as never} onSend={onSend} />
      </div>
    </div>
  );
}

function unoLogText(e: { t: string; [k: string]: unknown }): string {
  const who = (x: unknown) => String(x).toUpperCase();
  switch (e.t) {
    case 'GAME_START': return '── 对局开始 ──';
    case 'CARD_PLAYED': return `${who(e.by)} 出牌${e.degraded ? '（退化）' : ''}`;
    case 'DRAW': return `${who(e.player)} 摸 ${e.count} 张`;
    case 'DRAW2': return `${who(e.by)} → ${who(e.target)} 罚抽 ${e.penalty} 张`;
    case 'SKIP': return `${who(e.by)} 跳过 ${who(e.skipped)}`;
    case 'REVERSE': return `${who(e.by)} 反转方向`;
    case 'FORCED_DRAW': return `${who(e.player)} 被罚抽 ${e.count} 张`;
    case 'COLOR_CHOSEN': return `${who(e.player)} 选${COLOR_LABEL[e.color as UnoColor] ?? e.color}色`;
    case 'WILD4_PLAYED': return `${who(e.by)} 打出万能+4（可质疑）`;
    case 'CHALLENGE_SUCCESS': return `${who(e.challenger)} 质疑成功！${who(e.vs)} 罚抽 ${e.penalty} 张`;
    case 'CHALLENGE_FAIL': return `${who(e.challenger)} 质疑失败，罚抽 ${e.penalty} 张`;
    case 'UNO_CALLED': return `${who(e.player)} 喊出 UNO！`;
    case 'UNO_CAUGHT': return `${who(e.by)} 抓住 ${who(e.target)} 漏喊！罚抽 ${e.penalty} 张`;
    case 'TEAM_PLAY': return `${who(e.by)} 团队跳转 → ${who(e.mate)}`;
    case 'TEAM_DRAW4': return `${who(e.by)} 团队+4 → ${who(e.target)} 抽 ${e.penalty}`;
    case 'TEAM_PASS_DONE': return `开局传牌完成（${e.pairs} 对）`;
    case 'OUT_RETURN': return `${who(e.finished)} 回归（${who(e.from)} 传 ${e.count} 张）`;
    case 'SHUFFLE': return `♻ 弃牌堆重洗 ${e.count} 张`;
    case 'ROUND_END': return e.teamWin ? `=== ${TEAM_LABEL[String(e.teamWin)]} 获胜 ===` : `=== ${who(e.winner)} 获胜 ===`;
    default: return '';
  }
}
