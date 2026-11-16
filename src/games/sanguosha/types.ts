/**
 * 三国杀·自由混战 —— 引擎共享类型（服务端权威状态）。
 */
import type { DeckConfig, Suit } from './cards';

export type SgPlayerId = 'a' | 'b' | 'c' | 'd';
export const SG_SEATS: SgPlayerId[] = ['a', 'b', 'c', 'd'];

export interface SgEquips {
  weapon: string | null;
  armor: string | null;
  horsePlus: string | null;
  horseMinus: string | null;
}

export interface SgPlayerFlags {
  /** 本回合已用杀次数（普通杀限制） */
  shaUsed: number;
  /** 本回合是否喝过酒（下一张杀伤害+1） */
  jiuActive: boolean;
  /** 裸衣激活（本回合杀/决斗伤害+1） */
  luyiActive: boolean;
  /** 各出牌阶段限一次技能是否已用 */
  zhihengUsed: boolean;
  fanjianUsed: boolean;
  qingnangUsed: boolean;
  jieyinUsed: boolean;
  lijianUsed: boolean;
  /** 仁德累计给出数 / 是否已触发回复 */
  rendeGiven: number;
  rendeHealed: boolean;
  /** 本回合是否受到过伤害（遗计按点结算） */
  yijiPending: number;
  /** 判定阶段结果：跳过摸牌/出牌（兵粮寸断/乐不思蜀） */
  skipDraw: boolean;
  skipPlay: boolean;
}

export interface SgPlayerState {
  id: SgPlayerId;
  generalId: string | null;
  hp: number;
  maxHp: number;
  alive: boolean;
  hand: string[];
  equips: SgEquips;
  /** 判定区：数组尾 = 最新放置（先判定） */
  judgments: string[];
  /** 铁索连环横置 */
  chained: boolean;
  /** 已选将 */
  selected: boolean;
  flags: SgPlayerFlags;
}

export type SgNature = 'normal' | 'fire' | 'thunder';

/** 等待中的响应窗口（对局内全部需要玩家输入的点） */
export type SgWait =
  | { kind: 'play'; windowId: string; playerId: SgPlayerId }
  | {
      kind: 'respond';
      windowId: string;
      playerId: SgPlayerId;
      /** 需要打出/使用的牌面 */
      need: 'shan' | 'sha' | 'nullify' | 'tao';
      count: number;
      /** 允许的转换（客户端据此高亮可出的牌） */
      converters?: string[];
      /** 濒死救援：目标玩家 */
      dyingId?: SgPlayerId;
      prompt: string;
    }
  | { kind: 'discard'; windowId: string; playerId: SgPlayerId; count: number; prompt: string }
  | { kind: 'choose'; windowId: string; playerId: SgPlayerId; promptId: string; options: string[]; prompt: string }
  | {
      kind: 'cards';
      windowId: string;
      playerId: SgPlayerId;
      min: number;
      max: number;
      zone: 'hand';
      prompt: string;
    }
  | {
      kind: 'targets';
      windowId: string;
      playerId: SgPlayerId;
      candidates: SgPlayerId[];
      min: number;
      max: number;
      prompt: string;
    }
  | { kind: 'guanxing'; windowId: string; playerId: SgPlayerId; cards: string[] };

/** 玩家命令（客户端 action） */
export type SgAction =
  | { type: 'select-general'; generalId: string }
  | { type: 'play-card'; cardId: string; targets?: SgPlayerId[]; as?: string }
  | { type: 'use-skill'; skillId: string; cards?: string[]; targets?: SgPlayerId[]; option?: string }
  | { type: 'end-play' }
  | { type: 'respond-pass' }
  | { type: 'respond-play'; cardId: string; as?: string }
  | { type: 'respond-skill'; skillId: string }
  | { type: 'discard'; cards: string[] }
  | { type: 'choose'; value: string }
  | { type: 'submit-cards'; cards: string[] }
  | { type: 'submit-targets'; targets: SgPlayerId[] }
  | { type: 'guanxing-top'; top: string[] };

export interface SgLogEvent {
  seq: number;
  rev: number;
  /** 事件类型（公开信息，绝不包含手牌明文/牌堆顺序） */
  t: string;
  [k: string]: unknown;
}

export type SgPhase = 'prepare' | 'judge' | 'draw' | 'play' | 'discard' | 'end';

export interface SgState {
  deckConfig: DeckConfig;
  rulesetVersion: string;
  revision: number;
  turnNumber: number;
  /** 当前回合玩家 */
  current: SgPlayerId;
  phase: SgPhase | 'select' | 'ended';
  players: SgPlayerState[];
  order: SgPlayerId[];
  drawPile: string[]; // 尾=牌堆顶
  discardPile: string[];
  processing: string[];
  /** 判定区牌的效果名（转换牌如国色方块闪 → lebusishu；物理名不变） */
  delayedAs: Record<string, string>;
  winner: SgPlayerId | 'draw' | null;
  log: SgLogEvent[];
  rng: { seed: number; counter: number };
  /** 引擎版本（状态兼容用） */
  v: number;
}

/** 深度保护：伤害/事件链上限 */
export const SG_MAX_DEPTH = 32;
