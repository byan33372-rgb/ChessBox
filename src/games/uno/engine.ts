/**
 * UNO —— 服务端权威规则引擎（PHASE 2/3）。
 *
 * 状态机：select → playing（含 pendingAction 子窗口）→ roundEnd。
 * 服务端唯一权威：洗牌/匹配/罚牌/方向/UNO 处罚/队伍传牌/胜负。
 * 恢复 = 命令重放（与三国杀同一模式）。
 *
 * 模式：classic_ffa（个人混战）/ classic_teams_official（4 人 2v2）/ classic_teams_2v1_custom（3 人 2v1，平台自定义）。
 */
import {
  UNO_CARD_BY_ID, UNO_DECKS, unoCanPlay, UNO_CUSTOM_TEMPLATE,
  type UnoCard, type UnoColor, type UnoDeckProfileId, type UnoRuleProfileId,
} from './cards';

export type UnoSeat = 'a' | 'b' | 'c' | 'd';
export type UnoTeamId = 'A' | 'B';

export interface UnoPlayerState {
  id: UnoSeat;
  team: UnoTeamId | null;
  hand: string[];
  unoCalled: boolean;
  isOut: boolean;
  ready: boolean;
  teamLocked: boolean;
}

export type UnoPending =
  | { kind: 'choose-color'; playerId: UnoSeat; windowId: string; swapTarget?: UnoSeat }
  | { kind: 'challenge'; playerId: UnoSeat; windowId: string; challenger: UnoSeat; playedCardId: string }
  | { kind: 'team-pass'; windowId: string; picks: Partial<Record<UnoSeat, string>> }
  | { kind: 'swap-target'; playerId: UnoSeat; windowId: string; cardId: string };

export interface UnoState {
  deckProfile: UnoDeckProfileId;
  ruleProfile: UnoRuleProfileId;
  revision: number;
  phase: 'select' | 'playing' | 'roundEnd';
  players: UnoPlayerState[];
  order: UnoSeat[];
  drawPile: string[];
  discardPile: string[];
  currentColor: UnoColor;
  turn: UnoSeat;
  direction: 1 | -1;
  /** 已发生的行动牌强制抽牌数（下家必须先抽并跳过） */
  pendingDraw: number;
  turnNumber: number;
  winner: UnoSeat | null;
  winningTeam: UnoTeamId | null;
  roundScores: Partial<Record<UnoSeat, number>>;
  /** 本轮第一个出完牌者（积分用） */
  roundWinner: UnoSeat | null;
  /** UNO 漏喊抓罚窗口：最后打牌者与其出牌时的 UNO 状态 */
  lastActor: { seat: UnoSeat; calledUno: boolean } | null;
  /** 开局传牌是否完成 */
  teamPassDone: boolean;
  /** 当前挂起窗口（选色/质疑/传牌/换手目标） */
  pending?: { kind: string; playerId?: UnoSeat; windowId?: string; challenger?: UnoSeat; playedCardId?: string; swapTarget?: UnoSeat; picks?: Partial<Record<UnoSeat, string>> };
  /** +4 质疑窗口使用：出牌前的有效颜色 */
  colorBeforeChallenge?: UnoColor;
  /** Team Play：选色后跳转到的队友座位 */
  teamJumpTo?: UnoSeat;
  /** 选色后不推进回合（回合已被分支设置） */
  colorChooseNoAdvance?: boolean;
  log: Array<{ seq: number; rev: number; t: string; [k: string]: unknown }>;
  rng: { seed: number; counter: number };
  v: number;
}

export interface UnoAck {
  ok: boolean;
  error?: { code: string; message: string };
  revision: number;
}

const WIN_POINTS = 500;

export class UnoGame {
  st: UnoState;
  /** 命令历史（重放恢复） */
  history: Array<{ seat: UnoSeat; action: Record<string, unknown> }> = [];
  private rng: { seed: number; counter: number };
  private seenCmds = new Set<string>();
  private logSeq = 0;

  constructor(st: UnoState) {
    this.st = st;
    this.rng = { seed: st.rng.seed, counter: st.rng.counter };
  }

  static create(order: UnoSeat[], deckProfile: UnoDeckProfileId, ruleProfile: UnoRuleProfileId, seed: number, teams: Partial<Record<UnoSeat, UnoTeamId>> = {}): UnoGame {
    const players = order.map((id) => ({
      id,
      team: teams[id] ?? null,
      hand: [] as string[],
      unoCalled: false,
      isOut: false,
      ready: false,
      teamLocked: false,
    }));
    const st: UnoState = {
      deckProfile,
      ruleProfile,
      revision: 1,
      phase: 'select',
      players,
      order: [...order],
      drawPile: [],
      discardPile: [],
      currentColor: 'R',
      turn: order[0],
      direction: 1,
      pendingDraw: 0,
      turnNumber: 0,
      winner: null,
      winningTeam: null,
      roundScores: {},
      roundWinner: null,
      lastActor: null,
      teamPassDone: !ruleProfile.startsWith('classic_teams'),
      log: [],
      rng: { seed: seed >>> 0, counter: 0 },
      v: 1,
    };
    return new UnoGame(st);
  }

  serialize(): string {
    return JSON.stringify({ seed: this.st.rng.seed, order: this.st.order, deckProfile: this.st.deckProfile, ruleProfile: this.st.ruleProfile, teams: Object.fromEntries(this.st.players.map((p) => [p.id, p.team])), history: this.history });
  }

  static deserialize(json: string): UnoGame | null {
    try {
      const raw = JSON.parse(json) as { seed: number; order: UnoSeat[]; deckProfile: UnoDeckProfileId; ruleProfile: UnoRuleProfileId; teams: Partial<Record<UnoSeat, UnoTeamId>>; history: Array<{ seat: UnoSeat; action: Record<string, unknown> }> };
      const g = UnoGame.create(raw.order, raw.deckProfile, raw.ruleProfile, raw.seed, raw.teams);
      for (const h of raw.history) {
        const r = g.command(h.seat, h.action, null, `raw-${g.history.length}-${Math.random()}`);
        if (!r.ok) return null;
      }
      return g;
    } catch {
      return null;
    }
  }

  private rand(): number {
    let t = (this.rng.seed + 0x6d2b79f5 * ++this.rng.counter) >>> 0;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    this.st.rng.counter = this.rng.counter;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  private randInt(n: number): number {
    return Math.floor(this.rand() * n);
  }

  private log(t: string, fields: Record<string, unknown> = {}): void {
    this.st.revision += 1;
    this.st.log.push({ seq: ++this.logSeq, rev: this.st.revision, t, ...fields });
    if (this.st.log.length > 3000) this.st.log.splice(0, 800);
  }
  private touch(): void {
    this.st.revision += 1;
  }

  player(id: UnoSeat): UnoPlayerState {
    return this.st.players.find((p) => p.id === id)!;
  }
  card(id: string): UnoCard {
    return UNO_CARD_BY_ID.get(id)!;
  }
  private topCard(): UnoCard {
    return this.card(this.st.discardPile[this.st.discardPile.length - 1]);
  }
  activePlayers(): UnoPlayerState[] {
    return this.st.players.filter((p) => !p.isOut);
  }

  // ─── 选队/准备/开始 ─────────────────────────────────────────
  setTeam(seat: UnoSeat, team: UnoTeamId): UnoAck {
    const p = this.player(seat);
    if (p.teamLocked) return this.fail('INVALID_INPUT', '队伍已锁定');
    if (this.st.ruleProfile === 'classic_ffa') return this.fail('INVALID_INPUT', '个人混战无队伍');
    p.team = team;
    this.touch();
    this.log('TEAM_SET', { player: seat, team });
    return { ok: true, revision: this.st.revision };
  }

  lockTeams(): UnoAck {
    for (const p of this.st.players) p.teamLocked = true;
    return { ok: true, revision: this.st.revision };
  }

  allSelected(): boolean {
    return this.st.players.every((p) => p.ready);
  }

  setReady(seat: UnoSeat, ready: boolean): UnoAck {
    const p = this.player(seat);
    p.ready = ready;
    this.touch();
    this.log(ready ? 'READY' : 'UNREADY', { player: seat });
    if (this.allSelected() && this.st.phase === 'select') this.begin();
    return { ok: true, revision: this.st.revision };
  }

  private begin(): void {
    // 队伍校验
    if (this.st.ruleProfile === 'classic_teams_official') {
      const a = this.st.players.filter((p) => p.team === 'A').length;
      const b = this.st.players.filter((p) => p.team === 'B').length;
      if (a !== 2 || b !== 2) {
        this.log('TEAM_INVALID', { a, b });
        return; // 不开局（等待正确分队）
      }
    }
    this.st.phase = 'playing';
    this.st.turnNumber = 1;
    // 洗牌发 7 张
    const pile = UNO_DECKS[this.st.deckProfile].map((c) => c.id);
    for (let i = pile.length - 1; i > 0; i--) {
      const j = this.randInt(i + 1);
      [pile[i], pile[j]] = [pile[j], pile[i]];
    }
    this.st.drawPile = pile;
    for (const p of this.st.players) {
      for (let i = 0; i < 7; i++) {
        p.hand.push(this.st.drawPile.pop()!);
      }
    }
    // 翻起始牌（Teams 忽略行动牌继续翻；+4 放回重翻）
    let first = this.st.drawPile.pop()!;
    const isAction = (id: string) => {
      const k = this.card(id).kind;
      return k !== 'number';
    };
    if (this.st.ruleProfile.startsWith('classic_teams')) {
      while (isAction(first)) {
        this.st.drawPile.splice(this.randInt(this.st.drawPile.length), 0, first); // 插回牌堆
        first = this.st.drawPile.pop()!;
      }
    } else {
      let guard = 0;
      while (this.card(first).kind === 'wild_draw4' && guard++ < 200) {
        this.st.drawPile.splice(this.randInt(this.st.drawPile.length), 0, first);
        first = this.st.drawPile.pop()!;
      }
    }
    this.st.discardPile.push(first);
    const f = this.card(first);
    this.st.currentColor = f.color ?? 'R';
    // 起始牌效果（经典规则）
    if (!this.st.ruleProfile.startsWith('classic_teams')) {
      if (f.kind === 'draw2') {
        // 起始 +2：先手立即罚抽 2 并跳过（官方规则）
        const victim = this.player(this.st.turn);
        const pen = this.drawN(victim, 2);
        this.st.turn = this.nextSeat(this.st.turn);
        this.log('START_EFFECT', { card: first, effect: 'draw2', target: victim.id, penalty: pen });
      } else if (f.kind === 'reverse') {
        this.st.direction = -1;
        // 两人以上：庄家先行动等价于反转后下家——简化：保持庄家左侧（order[0]）先手
        this.log('START_EFFECT', { card: first, effect: 'reverse' });
      } else if (f.kind === 'skip') {
        this.st.turn = this.nextSeat(this.st.turn);
        this.log('START_EFFECT', { card: first, effect: 'skip' });
      } else if (f.kind === 'wild') {
        this.st.pending = undefined as never;
        // 起始 wild：庄家左侧第一位选色（简化：由先手玩家选色——记为 pending choose-color）
        this.st.discardPile.pop();
        this.st.discardPile.push(first);
        this.st.colorChooseNoAdvance = true;
        this.beginPendingColor(this.st.turn, null);
        this.log('START_EFFECT', { card: first, effect: 'wild-color' });
        this.log('GAME_START', { first });
        return;
      }
    }
    // Teams 开局传牌
    if (this.st.ruleProfile.startsWith('classic_teams')) {
      this.openTeamPass();
    }
    this.log('GAME_START', { first });
  }

  private beginPendingColor(seat: UnoSeat, swapTarget: UnoSeat | null): void {
    this.touch();
    this.st.pending = { kind: 'choose-color', playerId: seat, windowId: `w${this.st.revision}`, swapTarget: swapTarget ?? undefined } as never;
    void swapTarget;
  }

  // ─── 座次 ────────────────────────────────────────────────────
  private ring(): UnoSeat[] {
    return this.st.order.filter((id) => !this.player(id).isOut);
  }
  private nextSeat(from: UnoSeat): UnoSeat {
    const ring = this.ring();
    const i = ring.indexOf(from);
    return ring[(i + this.st.direction + ring.length) % ring.length];
  }

  // ─── 命令入口 ────────────────────────────────────────────────
  command(seat: UnoSeat, action: Record<string, unknown>, expectedRevision: number | null, commandId: string): UnoAck {
    if (this.seenCmds.has(commandId)) return { ok: true, revision: this.st.revision };
    if (expectedRevision !== null && expectedRevision !== this.st.revision) {
      return { ok: false, error: { code: 'STALE_REVISION', message: '局面版本不一致' }, revision: this.st.revision };
    }
    const p = this.player(seat);
    if (!p) return this.fail('INVALID_INPUT', '座位不存在');
    const type = String(action.type ?? '');
    if (this.st.phase === 'select') {
      if (type === 'set-team') {
        const r = this.setTeam(seat, action.team as UnoTeamId);
        if (r.ok) this.history.push({ seat, action });
        this.seenCmds.add(commandId);
        return r;
      }
      if (type === 'ready') {
        const r = this.setReady(seat, action.ready !== false);
        if (r.ok) this.history.push({ seat, action });
        this.seenCmds.add(commandId);
        return r;
      }
      return this.fail('INVALID_INPUT', '等待开始');
    }
    if (this.st.winner != null || this.st.phase === 'roundEnd') {
      return this.fail('GAME_ENDED', '本轮已结束');
    }
    const pend = this.st.pending as UnoPending | undefined;
    if (pend) {
      const r = this.handlePending(seat, pend, action);
      if (r === null) {
        this.history.push({ seat, action });
        this.seenCmds.add(commandId);
        return { ok: true, revision: this.st.revision };
      }
      return r;
    }
    if (type === 'play-card') {
      const r = this.playCard(seat, String(action.cardId ?? ''), action);
      if (r.ok) this.history.push({ seat, action });
      this.seenCmds.add(commandId);
      return r;
    }
    if (type === 'draw') {
      const r = this.drawCard(seat);
      if (r.ok) this.history.push({ seat, action });
      this.seenCmds.add(commandId);
      return r;
    }
    if (type === 'call-uno') {
      // 喊 UNO：仅当轮到相关或自己剩 2 张出牌前——实现：随时可喊（服务端校验剩余牌数）
      if (p.hand.length === 2 && !p.unoCalled) {
        p.unoCalled = true;
        this.log('UNO_CALLED', { player: seat });
        this.touch();
      }
      this.seenCmds.add(commandId);
      return { ok: true, revision: this.st.revision };
    }
    if (type === 'catch-uno') {
      // 抓漏喊：目标上一次出牌后剩 1 张且未喊 UNO，且现在轮到抓牌者
      const target = this.player(action.target as UnoSeat);
      const la = this.st.lastActor;
      if (!la || la.seat !== action.target || la.calledUno || target.hand.length !== 1) {
        return this.fail('INVALID_INPUT', '无可抓的漏喊');
      }
      const pen = this.drawN(target, 2);
      this.log('UNO_CAUGHT', { by: seat, target: target.id, penalty: pen });
      this.st.lastActor = null;
      this.touch();
      this.seenCmds.add(commandId);
      return { ok: true, revision: this.st.revision };
    }
    return this.fail('INVALID_INPUT', '未知命令');
  }

  private fail(code: string, message: string): UnoAck {
    return { ok: false, error: { code, message }, revision: this.st.revision };
  }

  private handlePending(seat: UnoSeat, pend: UnoPending, action: Record<string, unknown>): UnoAck | null {
    const p = this.player(seat);
    if (pend.kind === 'choose-color' && pend.playerId === seat) {
      const color = String(action.color ?? '') as UnoColor;
      if (!['R', 'Y', 'G', 'B'].includes(color)) return this.fail('INVALID_INPUT', '颜色不合法');
      this.st.currentColor = color;
      if (pend.swapTarget) {
        // 换手：与目标交换全部手牌
        const me = this.player(seat);
        const other = this.player(pend.swapTarget);
        [me.hand, other.hand] = [other.hand, me.hand];
        this.log('SWAP_HANDS', { a: seat, b: other.id, aCount: me.hand.length, bCount: other.hand.length });
      }
      this.log('COLOR_CHOSEN', { player: seat, color });
      this.st.pending = undefined as never;
      if (this.st.teamJumpTo) {
        // Team Play：跳转到队友回合（队友继续出牌，不再 advance）
        this.st.turn = this.st.teamJumpTo;
        this.st.teamJumpTo = undefined;
        this.st.colorChooseNoAdvance = false;
        this.touch();
        return null;
      }
      if (this.st.colorChooseNoAdvance) {
        this.st.colorChooseNoAdvance = false;
        this.touch();
        return null;
      }
      this.advance();
      return null;
    }
    if (pend.kind === 'challenge' && pend.playerId === seat) {
      const accept = action.challenge === true;
      const player4 = this.player(pend.challenger); // +4 出牌者
      const target = this.player(seat);
      if (accept) {
        const hasColor = player4.hand.some((id) => this.card(id).color === this.st.colorBeforeChallenge);
        if (hasColor) {
          // +4 非法：出牌者抽 4
          const pen = this.drawN(player4, 4);
          this.log('CHALLENGE_SUCCESS', { challenger: seat, vs: player4.id, penalty: pen });
        } else {
          // 质疑失败：质疑者抽 6
          const pen = this.drawN(target, 6);
          this.log('CHALLENGE_FAIL', { challenger: seat, penalty: pen });
        }
      } else {
        const pen = this.drawN(target, 4);
        this.log('CHALLENGE_SKIPPED', { challenger: seat, penalty: pen });
      }
      this.st.pending = undefined as never;
      this.advance();
      return null;
    }
    if (pend.kind === 'team-pass') {
      if (action.type !== 'team-pass' || typeof action.cardId !== 'string') return this.fail('INVALID_INPUT', '请提交传牌');
      const cardId = action.cardId;
      if (!p.hand.includes(cardId)) return this.fail('INVALID_INPUT', '牌不在手牌');
      pend.picks[seat] = cardId;
      // 全部到位 → 原子交换
      const seats = Object.keys(pend.picks) as UnoSeat[];
      if (seats.length === this.teamPassPairs() * 2) {
        for (const s of seats) {
          const pl = this.player(s);
          pl.hand.splice(pl.hand.indexOf(pend.picks[s]!), 1);
        }
        for (const s of seats) {
          const mate = this.mateOf(s);
          if (mate) this.player(mate).hand.push(pend.picks[s]!);
        }
        this.log('TEAM_PASS_DONE', { pairs: this.teamPassPairs() });
        this.st.teamPassDone = true;
        this.st.pending = undefined as never;
        this.touch();
      } else {
        this.log('TEAM_PASS_PICKED', { player: seat });
        this.touch();
      }
      return null;
    }
    if (pend.kind === 'swap-target' && pend.playerId === seat) {
      const target = String(action.target ?? '') as UnoSeat;
      const cands = this.activePlayers().filter((x) => x.id !== seat).map((x) => x.id);
      if (!cands.includes(target)) return this.fail('INVALID_INPUT', '目标不合法');
      this.st.pending = { kind: 'choose-color', playerId: seat, windowId: `w${this.st.revision}`, swapTarget: target } as never;
      return null;
    }
    return this.fail('INVALID_INPUT', '当前不接受该操作');
  }

  private teamPassPairs(): number {
    // 每个存活队伍一个传牌对（官方 2v2 = 2 对；2v1 = 1 对，单人队无传牌）
    let pairs = 0;
    const teams = new Map<string, number>();
    for (const p of this.activePlayers()) {
      const k = p.team ?? 'solo';
      teams.set(k, (teams.get(k) ?? 0) + 1);
    }
    for (const [, n] of teams) if (n >= 2) pairs += 1;
    return pairs;
  }

  private mateOf(seat: UnoSeat): UnoSeat | null {
    const me = this.player(seat);
    if (!me.team) return null;
    const mates = this.st.players.filter((x) => x.id !== seat && x.team === me.team && !x.isOut);
    return mates[0]?.id ?? null;
  }

  private openTeamPass(): void {
    if (this.teamPassPairs() === 0) {
      this.st.teamPassDone = true;
      return;
    }
    this.st.pending = { kind: 'team-pass', windowId: `w${this.st.revision}`, picks: {} } as never;
  }

  // ─── 出牌/抽牌 ───────────────────────────────────────────────
  private playCard(seat: UnoSeat, cardId: string, action: Record<string, unknown>): UnoAck {
    const p = this.player(seat);
    if (this.st.turn !== seat) return this.fail('NOT_YOUR_TURN', '还没轮到你');
    if (this.st.pendingDraw > 0) return this.fail('INVALID_INPUT', '必须先执行罚抽');
    if (this.st.ruleProfile.startsWith('classic_teams') && !this.st.teamPassDone) return this.fail('INVALID_INPUT', '等待队友传牌');
    if (!p.hand.includes(cardId)) return this.fail('INVALID_INPUT', '牌不在手牌');
    const card = this.card(cardId);
    // Teams 3 人 2v1：孤立玩家的团队牌退化为普通 wild
    const isSolo = this.st.ruleProfile === 'classic_teams_2v1_custom' && !p.team;
    if ((card.kind === 'wild_team_play' || card.kind === 'wild_team_draw4') && isSolo) {
      return this.playWildSolo(seat, cardId, action);
    }
    if (!unoCanPlay(card, this.topCard(), this.st.currentColor)) {
      return this.fail('ILLEGAL_MOVE', '该牌不匹配当前颜色/数字/符号');
    }
    if (card.kind === 'wild_draw4') {
      // 只有手中没有当前颜色牌才合法
      const hasColor = p.hand.some((id) => id !== cardId && this.card(id).color === this.st.currentColor);
      // 记录质疑窗口用的“出牌前颜色”
      this.st.colorBeforeChallenge = this.st.currentColor;
      if (hasColor) {
        // 允许打出但可被质疑（官方）：此处按官方——打出合法与否由质疑决定，直接允许
        this.log('WILD4_PLAYED', { by: seat, questionable: true });
      }
      p.hand.splice(p.hand.indexOf(cardId), 1);
      this.st.discardPile.push(cardId);
      this.log('CARD_PLAYED', { by: seat, card: cardId, kind: card.kind });
      this.st.lastActor = { seat, calledUno: false };
      // 质疑窗口：下家决定
      const next = this.nextSeat(seat);
      this.st.pending = { kind: 'challenge', playerId: next, windowId: `w${this.st.revision}`, challenger: seat, playedCardId: cardId } as never;
      return { ok: true, revision: this.st.revision };
    }
    // 从手牌移除
    p.hand.splice(p.hand.indexOf(cardId), 1);
    this.st.discardPile.push(cardId);
    this.log('CARD_PLAYED', { by: seat, card: cardId, kind: card.kind });
    // UNO 状态：出牌后剩 1 张 → 需要喊过 UNO
    this.st.lastActor = { seat, calledUno: p.unoCalled && p.hand.length === 1 };
    if (p.hand.length !== 1) p.unoCalled = false;

    switch (card.kind) {
      case 'reverse': {
        this.st.direction = (this.st.direction * -1) as 1 | -1;
        this.log('REVERSE', { by: seat });
        // 3 人以上正常反转后仍轮到下家（按新方向）
        this.advanceAfterAction(seat, false);
        break;
      }
      case 'skip': {
        this.log('SKIP', { by: seat, skipped: this.nextSeat(seat) });
        this.advanceAfterAction(seat, true);
        break;
      }
      case 'draw2': {
        const victim = this.player(this.nextSeat(seat));
        const pen = this.drawN(victim, 2);
        this.log('DRAW2', { by: seat, target: victim.id, penalty: pen });
        // 下家失去回合
        this.st.turn = this.nextSeat(victim.id);
        break;
      }
      case 'wild': {
        this.st.currentColor = (action.chosenColor as UnoColor) ?? this.st.currentColor;
        this.beginPendingColor(seat, null);
        break;
      }
      case 'wild_swap': {
        this.beginPendingColor(seat, null);
        // 先选目标再选色：两段 pending——swap-target → choose-color
        this.st.pending = { kind: 'swap-target', playerId: seat, windowId: `w${this.st.revision}`, cardId } as never;
        break;
      }
      case 'wild_custom': {
        // 预置模板：下家摸 3 并失去回合（服务端实现，无用户代码）；随后选色
        const victim = this.player(this.nextSeat(seat));
        const pen = this.drawN(victim, 3);
        this.log('CUSTOM_EFFECT', { by: seat, template: UNO_CUSTOM_TEMPLATE, target: victim.id, penalty: pen });
        this.st.turn = this.nextSeat(victim.id);
        this.st.colorChooseNoAdvance = true;
        this.beginPendingColor(seat, null);
        break;
      }
      case 'wild_team_play': {
        const mate = this.mateOf(seat);
        if (!mate) {
          // 无队友 → 退化为 wild（3 人 2v1 单人阵营）：选色后正常轮转
          this.st.colorChooseNoAdvance = false;
          this.beginPendingColor(seat, null);
          break;
        }
        this.log('TEAM_PLAY', { by: seat, mate });
        // 出牌者先选色；选色后跳转到队友回合
        this.st.teamJumpTo = mate;
        this.beginPendingColor(seat, null);
        break;
      }
      case 'wild_team_draw4': {
        const next = this.nextSeat(seat);
        const pen = this.drawN(this.player(next), 4);
        this.log('TEAM_DRAW4', { by: seat, target: next, penalty: pen });
        const mate = this.mateOf(next);
        if (mate) {
          const pen2 = this.drawN(this.player(mate), 2);
          this.log('TEAM_DRAW4_MATE', { mate, penalty: pen2 });
        }
        // 下家失去回合；出牌者选色后继续
        this.st.turn = this.nextSeat(next);
        this.st.colorChooseNoAdvance = true;
        this.beginPendingColor(seat, null);
        break;
      }
      default: {
        // number：Passing Symbol 传牌
        if (card.hasPassingSymbol) {
          const mate = this.mateOf(seat);
          if (mate) {
            const mine = p.hand[this.randInt(p.hand.length)];
            const theirs = this.player(mate).hand[this.randInt(this.player(mate).hand.length)];
            if (mine != null && theirs != null) {
              p.hand.splice(p.hand.indexOf(mine), 1);
              this.player(mate).hand.splice(this.player(mate).hand.indexOf(theirs), 1);
              p.hand.push(theirs);
              this.player(mate).hand.push(mine);
              this.log('PASSING_SYMBOL', { a: seat, b: mate });
            }
          }
        }
        this.advanceAfterAction(seat, false);
      }
    }
    this.checkRoundEnd(seat);
    return { ok: true, revision: this.st.revision };
  }

  private playWildSolo(seat: UnoSeat, cardId: string, action: Record<string, unknown>): UnoAck {
    // 3 人 2v1：团队牌退化为普通万能（Team Draw4 退化为下家抽 4）
    const p = this.player(seat);
    if (!p.hand.includes(cardId)) return this.fail('INVALID_INPUT', '牌不在手牌');
    p.hand.splice(p.hand.indexOf(cardId), 1);
    this.st.discardPile.push(cardId);
    this.log('CARD_PLAYED', { by: seat, card: cardId, kind: this.card(cardId).kind, degraded: true });
    if (this.card(cardId).kind === 'wild_team_draw4') {
      const next = this.nextSeat(seat);
      this.drawN(this.player(next), 4);
      this.advanceAfterAction(seat, true);
    } else {
      this.beginPendingColor(seat, null);
    }
    this.checkRoundEnd(seat);
    return { ok: true, revision: this.st.revision };
  }

  /** 出牌后的轮转：skip=true 跳过下家 */
  private advanceAfterAction(from: UnoSeat, skip: boolean): void {
    let next = this.nextSeat(from);
    if (skip) next = this.nextSeat(next);
    this.st.turn = next;
  }

  /** advance：处理 pendingDraw 罚抽 + 推进 */
  private advance(): void {
    if (this.st.winner != null) return;
    if (this.st.pendingDraw > 0) {
      const victim = this.player(this.st.turn);
      const pen = this.drawN(victim, this.st.pendingDraw);
      this.log('FORCED_DRAW', { player: victim.id, count: pen });
      this.st.pendingDraw = 0;
      // 被罚者失去回合
      this.st.turn = this.nextSeat(victim.id);
    } else {
      this.st.turn = this.nextSeat(this.st.turn);
    }
    this.touch();
  }

  private drawN(p: UnoPlayerState, n: number): number {
    let got = 0;
    for (let i = 0; i < n; i++) {
      this.reshuffle();
      const id = this.st.drawPile.pop();
      if (!id) break;
      p.hand.push(id);
      got += 1;
    }
    if (got) this.log('DRAW', { player: p.id, count: got });
    return got;
  }

  private reshuffle(): void {
    if (this.st.drawPile.length > 0) return;
    if (this.st.discardPile.length <= 1) return;
    const top = this.st.discardPile.pop()!;
    const rest = this.st.discardPile;
    this.st.discardPile = [top];
    for (let i = rest.length - 1; i > 0; i--) {
      const j = this.randInt(i + 1);
      [rest[i], rest[j]] = [rest[j], rest[i]];
    }
    this.st.drawPile = rest;
    this.log('SHUFFLE', { count: rest.length });
  }

  private drawCard(seat: UnoSeat): UnoAck {
    const p = this.player(seat);
    if (this.st.turn !== seat) return this.fail('NOT_YOUR_TURN', '还没轮到你');
    if (this.st.pendingDraw > 0) return this.fail('INVALID_INPUT', '罚抽由系统执行');
    // Teams：队友抽牌 → 出局者回归（半数传递）
    if (this.st.ruleProfile.startsWith('classic_teams')) {
      const outMate = this.st.players.find((x) => x.isOut && x.team === p.team && !p.isOut);
      if (outMate) {
        const give = Math.floor(p.hand.length / 2);
        if (give > 0) {
          const moved = p.hand.splice(0, give);
          outMate.hand.push(...moved);
          outMate.isOut = false;
          this.log('MATE_RETURN', { from: p.id, to: outMate.id, count: moved.length });
        }
      }
    }
    this.drawN(p, 1);
    this.log('TURN_DRAW', { player: seat });
    this.st.turn = this.nextSeat(seat);
    this.touch();
    return { ok: true, revision: this.st.revision };
  }

  /** 队友出完 → 我传半数手牌使其回归（官方：出完者保持出局，队友抽牌时回归） */
  private checkRoundEnd(lastSeat: UnoSeat): void {
    void lastSeat;
    const finished = this.st.players.find((p) => p.hand.length === 0 && !p.isOut);
    if (!finished) return;
    if (this.st.ruleProfile.startsWith('classic_teams')) {
      // Teams：队友 ≥2 张 → 传一半使出局者回归，本轮继续
      const mate = finished.team ? this.st.players.find((x) => x.id !== finished.id && x.team === finished.team) : null;
      if (mate && mate.hand.length >= 2) {
        const give = Math.floor(mate.hand.length / 2);
        const moved = mate.hand.splice(0, give);
        finished.hand.push(...moved);
        finished.isOut = false; // 回归：重新参与对局
        this.log('OUT_RETURN', { finished: finished.id, from: mate.id, count: moved.length });
        this.checkRoundEnd(lastSeat);
        return;
      }
      // 队友已无手牌（含出局者）→ 队伍获胜；否则出局者保持出局，对局继续
      if (mate && mate.hand.length === 0) {
        finished.isOut = true;
        this.st.winningTeam = finished.team;
        this.st.roundWinner = this.st.roundWinner ?? finished.id;
        this.st.phase = 'roundEnd';
        this.log('ROUND_END', { teamWin: finished.team });
        this.touch();
      } else {
        finished.isOut = true;
        this.st.roundWinner = this.st.roundWinner ?? finished.id;
        this.log('PLAYER_OUT', { player: finished.id });
        this.touch();
        // 若只剩最后一名有牌玩家且其手牌为 0 的对手已出局……继续由 b 单独进行
      }
      return;
    }
    // 个人混战：先清空者胜
    this.st.roundWinner = finished.id;
    this.st.winner = finished.id;
    this.st.phase = 'roundEnd';
    let pts = 0;
    for (const p of this.st.players) {
      if (p.id === finished.id) continue;
      for (const id of p.hand) pts += this.card(id).score;
    }
    this.st.roundScores[finished.id] = (this.st.roundScores[finished.id] ?? 0) + pts;
    this.log('ROUND_END', { winner: finished.id, points: pts });
  }

  // ─── 视图 ────────────────────────────────────────────────────
  view(forSeat: UnoSeat | null) {
    const me = forSeat ? this.player(forSeat) : null;
    const top = this.st.discardPile[this.st.discardPile.length - 1] ?? null;
    return {
      revision: this.st.revision,
      phase: this.st.phase,
      ruleProfile: this.st.ruleProfile,
      deckProfile: this.st.deckProfile,
      turnNumber: this.st.turnNumber,
      turn: this.st.turn,
      direction: this.st.direction,
      currentColor: this.st.currentColor,
      drawCount: this.st.drawPile.length,
      discardCount: this.st.discardPile.length,
      discardTop: top,
      myHand: me ? [...me.hand] : [],
      playableIds: forSeat && me && this.st.turn === forSeat && this.st.phase === 'playing' && !this.st.pending
        ? me.hand.filter((id) => unoCanPlay(this.card(id), this.topCard(), this.st.currentColor))
        : [],
      myUnoCalled: me?.unoCalled ?? false,
      winner: this.st.winner,
      winningTeam: this.st.winningTeam,
      roundWinner: this.st.roundWinner,
      teamPassDone: this.st.teamPassDone,
      pendingDraw: this.st.pendingDraw,
      lastActor: this.st.lastActor,
      players: this.st.order.map((id) => {
        const p = this.player(id);
        return {
          id: p.id,
          team: p.team,
          handCount: p.hand.length,
          unoCalled: p.unoCalled,
          isOut: p.isOut,
          ready: p.ready,
        };
      }),
      pending: this.st.pending
        ? {
            kind: this.st.pending.kind,
            playerId: this.st.pending.playerId,
            windowId: this.st.pending.windowId,
            picks: this.st.pending.picks ?? undefined,
          }
        : null,
      log: this.st.log.slice(-100),
    };
  }
}
