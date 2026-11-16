/**
 * 三国杀·自由混战 —— 对局桌面（PHASE 5）。
 *
 * 信息分级：
 * - 我的手牌：仅本人可见（来自个性化视图 myHand）。
 * - 他人：武将/体力/装备/判定区/手牌数量；绝不显示手牌内容。
 * - 合法性：全部来自服务端 hints/legalCards/candidates —— 客户端不自行判定规则。
 * - 战报：服务端公开事件（不含私密信息）。
 */
import { useMemo, useRef, useState } from 'react';
import type { SgClientView } from '../../shared/protocol';
import type { SgAction } from '../../games/sanguosha/types';
import { CARD_NAMES, SUIT_LABEL, SUIT_NAME, rankLabel, type Suit } from '../../games/sanguosha/cards';
import { GENERAL_BY_ID, FACTION_NAMES } from '../../games/sanguosha/generals';
import { ChatPanel } from './ChatPanel';
import type { ChatMessage } from '../../shared/protocol';

export interface SanguoshaTableProps {
  view: SgClientView | null;
  seat: string | null; // 'a'..'d' | 'spectator' | null
  conn: string;
  chat: ChatMessage[];
  onSend(text: string): void;
  onCommand(action: SgAction): void;
}

const PHASE_NAMES: Record<string, string> = {
  select: '选择武将', prepare: '准备阶段', judge: '判定阶段', draw: '摸牌阶段',
  play: '出牌阶段', discard: '弃牌阶段', end: '结束阶段', ended: '对局结束',
};
const OPTION_LABELS: Record<string, string> = {
  yes: '是', no: '否', discard2: '弃置两张手牌', damage: '受到 1 点伤害',
  discard1: '弃置一张手牌', draw: '令其摸一张牌', use: '使用（横置/解除）', recast: '重铸（弃置并摸一张）',
  S: '♠ 黑桃', H: '♥ 红桃', C: '♣ 梅花', D: '♦ 方块',
};
const SUIT_COLOR: Record<Suit, string> = { S: 'sg-black', H: 'sg-red', C: 'sg-black', D: 'sg-red' };

function CardChip({ id, size = 'md' }: { id: string | null; size?: 'sm' | 'md' | 'lg' }) {
  if (!id) return null;
  // id 形如 sg-std-01-D7-shan —— 牌名在末段
  const name = id.split('-').slice(4).join('-');
  const m = /^sg-(?:std|jz)-\d+-([SHCD])(\d+|[AJQK])-(.+)$/.exec(id);
  const suit = (m?.[1] ?? 'S') as Suit;
  const rank = m?.[2] ?? '';
  const cn = CARD_NAMES[name] ?? name;
  const rankText = rank === '' ? '' : /^[AJQK]$/.test(rank) ? rank : String(Number(rank));
  return (
    <span className={`sg-card sg-card-${size} ${SUIT_COLOR[suit]}`} title={`${SUIT_NAME[suit]}${rankText} ${cn}`}>
      <span className="sg-card-corner">{SUIT_LABEL[suit]}{rankText}</span>
      <span className="sg-card-name">{cn}</span>
    </span>
  );
}

function HpDots({ hp, maxHp }: { hp: number; maxHp: number }) {
  return (
    <span className="sg-hp" aria-label={`体力 ${hp}/${maxHp}`}>
      {Array.from({ length: maxHp }, (_, i) => (
        <i key={i} className={i < hp ? 'on' : ''}>{i < hp ? '◕' : '○'}</i>
      ))}
    </span>
  );
}

function generalName(id: string | null): string {
  return id ? GENERAL_BY_ID.get(id)?.name ?? id : '未选将';
}

function logText(e: { t: string; [k: string]: unknown }): string {
  const c = (x: unknown) => {
    const o = x as { name?: string; suit?: string; rank?: number } | null | undefined;
    if (!o?.name) return '';
    return `${SUIT_LABEL[o.suit as Suit] ?? ''}${typeof o.rank === 'number' ? rankLabel(o.rank) : ''}${CARD_NAMES[o.name] ?? o.name}`;
  };
  switch (e.t) {
    case 'TURN_START': return `── 第${e.turn}回合 · ${String(e.player).toUpperCase()} 行动 ──`;
    case 'PHASE': return `· ${PHASE_NAMES[String(e.phase)] ?? e.phase}`;
    case 'PHASE_SKIPPED': return `· 跳过${PHASE_NAMES[String(e.phase)] ?? e.phase}`;
    case 'CARD_USED': {
      const as = e.as ? `（视为【${CARD_NAMES[String(e.as)] ?? e.as}】）` : '';
      const tg = Array.isArray(e.targets) && e.targets.length ? ` → ${(e.targets as string[]).map((x) => x.toUpperCase()).join(',')}` : '';
      return `${String(e.by).toUpperCase()} 使用 ${c(e.card)}${as}${tg}`;
    }
    case 'CARD_RESPONDED': return `${String(e.by).toUpperCase()} 打出 ${c(e.card)}`;
    case 'CARD_NONE': return `· 对 ${String(e.target).toUpperCase()} 无效（仁王盾）`;
    case 'DAMAGE': return `💥 ${e.source ? String(e.source).toUpperCase() : '无来源'} 对 ${String(e.target).toUpperCase()} 造成 ${e.nature === 'fire' ? '火焰' : e.nature === 'thunder' ? '雷电' : ''}${e.amount} 点伤害`;
    case 'HEAL': return `✚ ${String(e.target).toUpperCase()} 回复 ${e.amount} 点体力`;
    case 'DYING': return `☠ ${String(e.player).toUpperCase()} 濒死！`;
    case 'SAVED': return `✚ ${String(e.by).toUpperCase()} 救回 ${String(e.target).toUpperCase()}`;
    case 'DEATH': return `☠ ${String(e.player).toUpperCase()} 阵亡`;
    case 'JUDGE_RESULT': return `🎲 ${String(e.who).toUpperCase()} 判定：${c(e.card)}（${e.reason}）`;
    case 'NULLIFY': return `⛔ ${String(e.by).toUpperCase()} 无懈可击`;
    case 'CHAIN_ON': return `⛓ ${String(e.player).toUpperCase()} 被横置（连环）`;
    case 'CHAIN_OFF': return `⛓ ${String(e.player).toUpperCase()} 解除连环`;
    case 'CHAIN_CONDUCT': return `⛓ 属性伤害传导：${String(e.from).toUpperCase()} → ${String(e.to).toUpperCase()}`;
    case 'SHUFFLE': return `♻ 弃牌堆重洗（${e.count} 张）`;
    case 'GENERAL_SELECTED': return `${String(e.player).toUpperCase()} 选择武将：${generalName(String(e.general))}`;
    case 'GAME_START': return `=== 对局开始 · 先手 ${String(e.first).toUpperCase()} ===`;
    case 'GAME_FINISHED': return `=== 对局结束 · ${e.winner === 'draw' ? '平局' : `${String(e.winner).toUpperCase()} 获胜`} ===`;
    case 'SKILL': return `✦ ${String(e.player).toUpperCase()} 发动技能【${e.skill}】`;
    case 'WINNER_SET': return '';
    default: return '';
  }
}

export function SanguoshaTable({ view, seat, conn, chat, onSend, onCommand }: SanguoshaTableProps) {
  const [selectedCard, setSelectedCard] = useState<string | null>(null);
  const [selectedAs, setSelectedAs] = useState<string | undefined>(undefined);
  const [pickedTargets, setPickedTargets] = useState<string[]>([]);
  const [multiSel, setMultiSel] = useState<string[]>([]);
  const [skillMode, setSkillMode] = useState<{ skillId: string; cards: string[]; targets: string[] } | null>(null);
  const [exportDone, setExportDone] = useState(false);
  const isSpectator = seat === 'spectator' || seat === null;
  const mySeat = (seat && seat !== 'spectator' ? seat : null) as string | null;

  const pending = view?.pending ?? null;
  const myPlay = pending?.kind === 'play' && pending.playerId === mySeat;
  const myRespond = pending?.kind === 'respond' && pending.playerId === mySeat;
  const myDiscard = pending?.kind === 'discard' && pending.playerId === mySeat;
  const myChoose = pending?.kind === 'choose' && pending.playerId === mySeat;
  const myCards = pending?.kind === 'cards' && pending.playerId === mySeat;
  const myTargets = pending?.kind === 'targets' && pending.playerId === mySeat;
  const myGuanxing = pending?.kind === 'guanxing' && pending.playerId === mySeat;

  const me = view?.players.find((p) => p.id === mySeat) ?? null;
  const othersList = useMemo(
    () => (view ? view.players.filter((p) => p.id !== mySeat) : []),
    [view, mySeat],
  );

  const hintsFor = (cardId: string) => (view?.hints ?? []).filter((h) => h.cardId === cardId);
  const activeHint = useMemo(() => {
    if (!selectedCard || !view) return null;
    return view.hints.find((h) => h.cardId === selectedCard && (selectedAs ? h.as === selectedAs : !h.as)) ?? null;
  }, [view, selectedCard, selectedAs]);

  // —— 选将阶段 ——
  if (view && view.phase === 'select') {
    const taken = new Set(view.players.filter((p) => p.selected).map((p) => p.general));
    return (
      <div className="sg-table sg-select">
        <h3>选择武将（满员且全员选将后自动开局）</h3>
        <div className="sg-seat-brief">
          {view.players.map((p) => (
            <span key={p.id} className={`sg-seat-chip ${p.selected ? 'ok' : ''}`}>
              {p.id.toUpperCase()} · {p.selected ? generalName(p.general) : '选择中…'}
            </span>
          ))}
        </div>
        {!isSpectator && !view.players.find((p) => p.id === mySeat)?.selected && (
          <div className="sg-general-grid" role="listbox" aria-label="武将列表">
            {[...GENERAL_BY_ID.values()].map((g) => {
              const disabled = taken.has(g.id);
              return (
                <button
                  key={g.id}
                  type="button"
                  role="option"
                  aria-selected={false}
                  className={`sg-general ${disabled ? 'taken' : ''}`}
                  disabled={disabled}
                  title={disabled ? '已被选择' : g.skills.map((s) => `${s.name}：${s.desc}`).join('\n')}
                  onClick={() => void onCommand({ type: 'select-general', generalId: g.id })}
                >
                  <span className="sg-g-name">{g.name}</span>
                  <span className="sg-g-faction">{FACTION_NAMES[g.faction]} · {g.maxHp}体力</span>
                  <span className="sg-g-skills">{g.skills.map((s) => s.name + (s.disabledInMode ? '（禁用）' : '')).join(' / ')}</span>
                </button>
              );
            })}
          </div>
        )}
        {isSpectator && <p className="sg-hint">观战中：等待玩家选将。</p>}
        <LogPanel view={view} />
      </div>
    );
  }

  if (!view) {
    return <div className="sg-table"><p className="sg-hint">正在同步对局状态…（{conn}）</p></div>;
  }

  // —— 导出 ——
  const doExport = (kind: 'json' | 'txt') => {
    const lines = view.log.map((e) => logText(e)).filter(Boolean);
    let content: string;
    if (kind === 'json') {
      content = JSON.stringify({
        schemaVersion: 'sg-ffa-export-1',
        rulesetVersion: view.rulesetVersion,
        deckConfig: view.deckConfig,
        players: view.players,
        winner: view.winner,
        events: view.log,
      }, null, 2);
    } else {
      content = [
        `三国杀·自由混战 战报`,
        `规则：${view.rulesetVersion} · 牌堆：${view.deckConfig}`,
        `结果：${view.winner === 'draw' ? '平局' : `${String(view.winner).toUpperCase()} 获胜`}`,
        '',
        ...lines,
      ].join('\n');
    }
    const blob = new Blob([content], { type: kind === 'json' ? 'application/json' : 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `sanguosha-${view.turnNumber}turns.${kind}`;
    a.click();
    URL.revokeObjectURL(url);
    setExportDone(true);
    setTimeout(() => setExportDone(false), 2000);
  };

  // —— 目标点击 ——
  const toggleTarget = (tid: string): void => {
    if (!activeHint && !skillMode) return;
    if (skillMode) {
      setSkillMode({ ...skillMode, targets: toggleIn(skillMode.targets, tid) });
      return;
    }
    if (activeHint!.multi) {
      setPickedTargets((xs) => {
        if (xs.includes(tid)) return xs.filter((x) => x !== tid);
        return xs.length < activeHint!.maxTargets ? [...xs, tid] : xs;
      });
      return;
    }
    setPickedTargets([tid]);
  };

  const submitPlay = (): void => {
    if (!selectedCard) return;
    void onCommand({ type: 'play-card', cardId: selectedCard, as: selectedAs, targets: pickedTargets } as never);
    resetSel();
  };
  const resetSel = (): void => {
    setSelectedCard(null);
    setSelectedAs(undefined);
    setPickedTargets([]);
    setSkillMode(null);
    setMultiSel([]);
  };
  const toggleIn = (xs: string[], x: string): string[] => (xs.includes(x) ? xs.filter((y) => y !== x) : [...xs, x]);

  const submitSkill = (): void => {
    if (!skillMode) return;
    void onCommand({ type: 'use-skill', skillId: skillMode.skillId, cards: skillMode.cards, targets: skillMode.targets } as never);
    resetSel();
  };

  const mySkills = (GENERAL_BY_ID.get(me?.general ?? '')?.skills ?? []).filter((s) => !s.disabledInMode && s.kind === 'active');

  return (
    <div className="sg-table" data-phase={view.phase}>
      {/* 中央信息条 */}
      <div className="sg-centerbar">
        <span className="sg-phase">{PHASE_NAMES[view.phase] ?? view.phase}</span>
        <span className="sg-turn">第 {view.turnNumber} 回合 · {view.current.toUpperCase()} 行动</span>
        <span className="sg-pile">牌堆 {view.drawCount} · 弃牌 {view.discardCount}</span>
        <CardChip id={view.discardTop?.id ?? null} size="sm" />
        {view.winner && (
          <span className="sg-winner-banner">
            {view.winner === 'draw' ? '平局' : `${generalName(view.players.find((p) => p.id === view.winner)?.general ?? null)}（${String(view.winner).toUpperCase()}）获胜`}
          </span>
        )}
      </div>

      {/* 对手区 */}
      <div className={`sg-opponents n${othersList.length}`}>
        {othersList.map((p) => (
          <button
            key={p.id}
            type="button"
            className={[
              'sg-player',
              p.alive ? '' : 'dead',
              view.current === p.id ? 'acting' : '',
              pending && pending.playerId === p.id ? 'awaiting' : '',
              isTargetable(p.id) ? 'targetable' : '',
              pickedTargets.includes(p.id) || skillMode?.targets.includes(p.id) ? 'picked' : '',
            ].join(' ')}
            disabled={!isTargetable(p.id)}
            onClick={() => toggleTarget(p.id)}
            aria-pressed={pickedTargets.includes(p.id)}
          >
            <span className="sg-p-seat">{p.id.toUpperCase()}</span>
            <span className="sg-p-general">{generalName(p.general)}</span>
            <HpDots hp={p.hp} maxHp={p.maxHp} />
            <span className="sg-p-hand">手牌 {p.handCount}</span>
            {p.chained && <span className="sg-p-chain" title="铁索连环（横置）">⛓</span>}
            {!p.alive && <span className="sg-p-dead">阵亡</span>}
            <span className="sg-p-equips">
              {(['weapon', 'armor', 'horsePlus', 'horseMinus'] as const).map((s) =>
                p.equips[s] ? <CardChip key={s} id={p.equips[s]} size="sm" /> : null,
              )}
            </span>
            {p.judgments.length > 0 && (
              <span className="sg-p-judgments">{p.judgments.map((j) => <CardChip key={j} id={j} size="sm" />)}</span>
            )}
          </button>
        ))}
      </div>

      {/* 我的区域 */}
      {me && (
        <div className={`sg-mine ${me.alive ? '' : 'dead'}`}>
          <div className="sg-mine-info">
            <span className="sg-p-seat">{me.id.toUpperCase()}</span>
            <span className="sg-p-general">{generalName(me.general)}</span>
            <HpDots hp={me.hp} maxHp={me.maxHp} />
            {me.chained && <span title="铁索连环（横置）">⛓</span>}
            {!me.alive && <span className="sg-p-dead">你已阵亡（观战至终局）</span>}
            <span className="sg-p-equips">
              {(['weapon', 'armor', 'horsePlus', 'horseMinus'] as const).map((s) =>
                me.equips[s] ? <CardChip key={s} id={me.equips[s]} size="sm" /> : null,
              )}
            </span>
            {me.judgments.length > 0 && (
              <span className="sg-p-judgments">{me.judgments.map((j) => <CardChip key={j} id={j} size="sm" />)}</span>
            )}
          </div>
          {/* 手牌（仅本人可见） */}
          <div className="sg-hand" role="listbox" aria-label="我的手牌">
            {view.myHand.map((id) => {
              const hint = hintsFor(id).find((h) => h.ok);
              const disabled = !(myPlay && hint) && !(myCards) && !myDiscard;
              return (
                <button
                  key={id}
                  type="button"
                  role="option"
                  aria-selected={selectedCard === id || multiSel.includes(id) || skillMode?.cards.includes(id)}
                  className={[
                    'sg-hand-card',
                    selectedCard === id ? 'sel' : '',
                    multiSel.includes(id) || skillMode?.cards.includes(id) ? 'sel' : '',
                    disabled ? 'disabled' : '',
                  ].join(' ')}
                  disabled={disabled}
                  onClick={() => onHandClick(id)}
                >
                  <CardChip id={id} />
                </button>
              );
            })}
          </div>
          {/* 技能按钮 */}
          {myPlay && mySkills.length > 0 && (
            <div className="sg-skills">
              {mySkills.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  className={`btn small ${skillMode?.skillId === s.id ? 'primary' : ''}`}
                  title={s.desc}
                  onClick={() => setSkillMode(skillMode?.skillId === s.id ? null : { skillId: s.id, cards: [], targets: [] })}
                >
                  {s.name}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 行动面板 */}
      <div className="sg-actions" role="status">
        {myPlay && (
          <>
            {activeHint && !activeHint.ok && <span className="sg-warn">{activeHint.reason}</span>}
            {selectedCard && (
              <>
                <span className="sg-hint">
                  {activeHint?.multi
                    ? '群体牌：将对全部其他存活角色结算'
                    : activeHint && activeHint.targets.length > 0
                      ? `选择目标（${activeHint.minTargets === 0 ? '可选' : '必选'}）`
                      : '确认使用'}
                </span>
                {activeHint?.as && (
                  <span className="sg-hint">
                    视为【{CARD_NAMES[activeHint.as] ?? activeHint.as}】
                    {hintsFor(selectedCard).filter((h) => h.ok).length > 1 && (
                      <select
                        value={selectedAs ?? ''}
                        onChange={(e) => setSelectedAs(e.target.value || undefined)}
                        aria-label="选择牌面"
                      >
                        {hintsFor(selectedCard).filter((h) => h.ok).map((h) => (
                          <option key={h.as ?? 'self'} value={h.as ?? ''}>
                            {h.as ? CARD_NAMES[h.as] : '原牌面'}
                          </option>
                        ))}
                      </select>
                    )}
                  </span>
                )}
                <button type="button" className="btn primary" onClick={submitPlay} disabled={!!activeHint && !activeHint.ok}>
                  确认
                </button>
                <button type="button" className="btn" onClick={resetSel}>取消</button>
              </>
            )}
            {!selectedCard && <span className="sg-hint">点击一张手牌使用；技能按钮在下方</span>}
            {skillMode && (
              <>
                <span className="sg-hint">
                  技能【{mySkills.find((s) => s.id === skillMode.skillId)?.name}】：
                  {skillNeeds(skillMode.skillId).cards === 0 ? '' : `选 ${skillNeeds(skillMode.skillId).cards === -1 ? '任意张（≥1）' : `${skillNeeds(skillMode.skillId).cards} 张`}手牌`}
                  {skillNeeds(skillMode.skillId).targets > 0 && ` · 选 ${skillNeeds(skillMode.skillId).targets} 个目标`}
                </span>
                <button type="button" className="btn primary" onClick={submitSkill} disabled={!skillReady(skillMode, view)}>
                  发动
                </button>
                <button type="button" className="btn" onClick={resetSel}>取消</button>
              </>
            )}
            {!skillMode && (
              <button type="button" className="btn" onClick={() => { void onCommand({ type: 'end-play' }); resetSel(); }}>
                结束出牌
              </button>
            )}
          </>
        )}
        {myRespond && (
          <>
            <span className="sg-hint">{pending!.prompt}</span>
            {(pending!.legalCards ?? []).map((id) => (
              <button key={id} type="button" className="btn small" onClick={() => void onCommand({ type: 'respond-play', cardId: id })}>
                <CardChip id={id} size="sm" />
              </button>
            ))}
            {pending!.need === 'shan' && me?.equips.armor && view.discardTop && (pending!.converters ?? []).includes('bagua') && (
              <button type="button" className="btn small" onClick={() => void onCommand({ type: 'respond-skill', skillId: 'baguazhen' })}>
                八卦阵判定
              </button>
            )}
            <button type="button" className="btn" onClick={() => void onCommand({ type: 'respond-pass' })}>放弃</button>
          </>
        )}
        {myDiscard && (
          <>
            <span className="sg-hint">{pending!.prompt}（已选 {multiSel.length}/{pending!.count}）</span>
            <button
              type="button"
              className="btn primary"
              disabled={multiSel.length !== pending!.count}
              onClick={() => { void onCommand({ type: 'discard', cards: multiSel }); setMultiSel([]); }}
            >
              确认弃牌
            </button>
          </>
        )}
        {myChoose && (
          <>
            <span className="sg-hint">{pending!.prompt}</span>
            {(pending!.options ?? []).map((opt) => (
              <button key={opt} type="button" className="btn small" onClick={() => void onCommand({ type: 'choose', value: opt })}>
                {pending!.promptId === 'wugu' ? <CardChip id={opt} size="sm" /> : OPTION_LABELS[opt] ?? opt}
              </button>
            ))}
          </>
        )}
        {myCards && (
          <>
            <span className="sg-hint">{pending!.prompt}（已选 {multiSel.length}，需 {pending!.min}{pending!.max !== pending!.min ? `~${pending!.max}` : ''} 张）</span>
            <button
              type="button"
              className="btn primary"
              disabled={multiSel.length < (pending!.min ?? 0) || multiSel.length > (pending!.max ?? 99)}
              onClick={() => { void onCommand({ type: 'submit-cards', cards: multiSel }); setMultiSel([]); }}
            >
              确认
            </button>
          </>
        )}
        {myTargets && (
          <>
            <span className="sg-hint">{pending!.prompt}（已选 {pickedTargets.length}）</span>
            <button
              type="button"
              className="btn primary"
              disabled={pickedTargets.length < (pending!.min ?? 1)}
              onClick={() => { void onCommand({ type: 'submit-targets', targets: pickedTargets } as never); setPickedTargets([]); }}
            >
              确认
            </button>
          </>
        )}
        {myGuanxing && <GuanxingModal view={view} onCommand={onCommand} />}
        {!pending && !view.winner && <span className="sg-hint">等待对局推进…</span>}
        {!myPlay && pending && !isSpectator && (
          <span className="sg-hint">等待 {String(pending.playerId ?? '').toUpperCase()} {pending.prompt ?? '…'}</span>
        )}
        {view.winner && (
          <>
            <button type="button" className="btn small" onClick={() => doExport('json')}>{exportDone ? '已导出 ✓' : '导出 JSON'}</button>
            <button type="button" className="btn small" onClick={() => doExport('txt')}>导出战报 TXT</button>
          </>
        )}
      </div>

      {/* 战报 + 聊天 */}
      <div className="sg-side">
        <LogPanel view={view} />
        <ChatPanel chat={chat} seat={seat as never} onSend={onSend} />
      </div>
    </div>
  );

  // —— 内部函数 ——
  function isTargetable(pid: string): boolean {
    if (skillMode) return true; // 技能目标合法性由服务端校验
    if (myTargets && (pending!.candidates ?? []).includes(pid)) return true;
    if (myPlay && activeHint && (activeHint.multi || activeHint.targets.includes(pid))) return true;
    return false;
  }
  function onHandClick(id: string): void {
    if (myDiscard || myCards) {
      const max = myDiscard ? (pending!.count ?? 0) : (pending!.max ?? 99);
      const min = myDiscard ? (pending!.count ?? 0) : (pending!.min ?? 0);
      setMultiSel((xs) => {
        if (xs.includes(id)) return xs.filter((x) => x !== id);
        return xs.length < max ? [...xs, id] : xs;
      });
      void min;
      return;
    }
    if (!myPlay) return;
    const hs = hintsFor(id).filter((h) => h.ok);
    if (hs.length === 0) return;
    if (selectedCard === id) {
      resetSel();
      return;
    }
    setSelectedCard(id);
    setSelectedAs(hs.length === 1 && hs[0].as ? hs[0].as : undefined);
    setPickedTargets(hs[0].multi ? [] : hs[0].minTargets === 1 && hs[0].targets.length === 1 ? [hs[0].targets[0]] : []);
  }
  function skillNeeds(skillId: string): { cards: number; targets: number } {
    switch (skillId) {
      case 'zhiheng': return { cards: -1, targets: 0 };
      case 'kurou': return { cards: 0, targets: 0 };
      case 'qingnang': return { cards: 1, targets: 1 };
      case 'fanjian': return { cards: 1, targets: 1 };
      case 'lijian': return { cards: 1, targets: 2 };
      case 'jieyin': return { cards: 2, targets: 1 };
      case 'rende': return { cards: -1, targets: 1 };
      case 'zhangbashemao': return { cards: 2, targets: 1 };
      default: return { cards: 0, targets: 0 };
    }
  }
  function skillReady(m: { skillId: string; cards: string[]; targets: string[] }, v: SgClientView): boolean {
    const need = skillNeeds(m.skillId);
    if (need.cards === -1 && m.cards.length < 1) return false;
    if (need.cards > 0 && m.cards.length !== need.cards) return false;
    if (need.targets > 0 && m.targets.length !== need.targets) return false;
    void v;
    return true;
  }
}

function LogPanel({ view }: { view: SgClientView }) {
  const ref = useRef<HTMLDivElement>(null);
  const entries = view.log.map((e, i) => ({ ...e, text: logText(e), i })).filter((e) => e.text);
  return (
    <div className="sg-log card" ref={ref} aria-label="战报">
      <h3>战报</h3>
      <div className="sg-log-list">
        {entries.map((e) => (
          <p key={`${e.seq}-${e.i}`} className={e.t === 'TURN_START' ? 'turn-head' : ''}>{e.text}</p>
        ))}
      </div>
    </div>
  );
}

function GuanxingModal({ view, onCommand }: { view: SgClientView; onCommand(a: SgAction): void }) {
  const [order, setOrder] = useState<string[]>([]);
  const cards = (view.pending?.cards ?? []) as string[];
  const remaining = cards.filter((c) => !order.includes(c));
  return (
    <div className="sg-guanxing" role="dialog" aria-label="观星">
      <h4>观星：按顺序点击要放在牌堆顶的牌（其余置底）</h4>
      <div className="sg-guanxing-picked">
        {order.map((c, i) => (
          <button key={c} type="button" className="btn small" onClick={() => setOrder(order.filter((x) => x !== c))}>
            {i + 1}. <CardChip id={c} size="sm" />
          </button>
        ))}
      </div>
      <div>{remaining.map((c) => (
        <button key={c} type="button" className="sg-hand-card" onClick={() => setOrder([...order, c])}>
          <CardChip id={c} />
        </button>
      ))}</div>
      <button type="button" className="btn primary" onClick={() => { void onCommand({ type: 'guanxing-top', top: order }); setOrder([]); }}>
        确认观星
      </button>
    </div>
  );
}
