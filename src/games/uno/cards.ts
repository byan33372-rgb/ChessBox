/**
 * UNO —— 牌组与规则配置（三套互相独立，禁止混牌）。
 * 数量断言：classic_108 / classic_112 / teams_112（tests/unit/uno-cards.test.ts）。
 *
 * 来源：Mattel W2085（108）/ FFK04（112）/ UNO Teams HXT58（112）——见 docs/uno/RULES_DECISIONS.md。
 * Passing Symbol：官方说明书未列出精确分布，实现为独立布尔元数据，本构建以
 * 「Teams 牌组每个颜色每数字 2 张中的第 2 张」为平台标注（共 18 张），在 CARD_CATALOG 标注为平台标记。
 */

export type UnoColor = 'R' | 'Y' | 'G' | 'B';
export type UnoDeckProfileId = 'uno_classic_108' | 'uno_classic_112' | 'uno_teams_112';
export type UnoRuleProfileId = 'classic_ffa' | 'classic_teams_official' | 'classic_teams_2v1_custom';

export type UnoCardKind =
  | 'number' | 'draw2' | 'reverse' | 'skip'
  | 'wild' | 'wild_draw4'
  | 'wild_swap' | 'wild_custom'
  | 'wild_team_play' | 'wild_team_draw4';

export interface UnoCardDef {
  kind: UnoCardKind;
  color: UnoColor | null; // wild 类为 null
  number?: number; // 0-9
  score: number;
  deck: UnoDeckProfileId;
  hasPassingSymbol?: boolean;
}

export interface UnoCard extends UnoCardDef {
  id: string;
}

export const UNO_COLORS: readonly UnoColor[] = ['R', 'Y', 'G', 'B'];
export const UNO_COLOR_NAMES: Record<UnoColor, string> = { R: '红', Y: '黄', G: '绿', B: '蓝' };
export const UNO_KIND_NAMES: Record<UnoCardKind, string> = {
  number: '数字', draw2: '+2', reverse: '反转', skip: '跳过',
  wild: '万能', wild_draw4: '万能+4', wild_swap: '万能换手', wild_custom: '万能自定义',
  wild_team_play: '团队万能', wild_team_draw4: '团队+4',
};

function build(profile: UnoDeckProfileId): UnoCard[] {
  const out: UnoCard[] = [];
  let seq = 0;
  const prefix = profile === 'uno_classic_108' ? 'c108' : profile === 'uno_classic_112' ? 'c112' : 't112';
  const push = (def: Omit<UnoCard, 'id'>) => {
    seq += 1;
    out.push({ ...def, id: `u-${prefix}-${seq.toString(36).padStart(3, '0')}-${def.kind}${def.color ?? ''}${def.number ?? ''}` });
  };
  const numCards = profile === 'uno_teams_112' ? ([1, 2, 3, 4, 5, 6, 7, 8, 9] as const) : ([0, 1, 2, 3, 4, 5, 6, 7, 8, 9] as const);
  for (const color of UNO_COLORS) {
    for (const n of numCards) {
      const times = n === 0 ? 1 : 2;
      for (let t = 1; t <= times; t++) {
        push({ kind: 'number', color, number: n, score: n, deck: profile, hasPassingSymbol: profile === 'uno_teams_112' && t === 2 });
      }
    }
    for (const kind of ['draw2', 'reverse', 'skip'] as const) {
      for (let t = 1; t <= 2; t++) {
        push({ kind, color, score: 20, deck: profile });
      }
    }
  }
  if (profile === 'uno_classic_108' || profile === 'uno_classic_112') {
    for (let i = 0; i < 4; i++) push({ kind: 'wild', color: null, score: 50, deck: profile });
    for (let i = 0; i < 4; i++) push({ kind: 'wild_draw4', color: null, score: 50, deck: profile });
  }
  if (profile === 'uno_teams_112') {
    for (let i = 0; i < 4; i++) push({ kind: 'wild', color: null, score: 50, deck: profile });
    for (let i = 0; i < 8; i++) push({ kind: 'wild_team_play', color: null, score: 50, deck: profile });
    for (let i = 0; i < 4; i++) push({ kind: 'wild_team_draw4', color: null, score: 50, deck: profile });
  }
  if (profile === 'uno_classic_112') {
    push({ kind: 'wild_swap', color: null, score: 40, deck: profile });
    for (let i = 0; i < 3; i++) push({ kind: 'wild_custom', color: null, score: 40, deck: profile });
  }
  return out;
}

export const UNO_CLASSIC_108: UnoCard[] = build('uno_classic_108');
export const UNO_CLASSIC_112: UnoCard[] = build('uno_classic_112');
export const UNO_TEAMS_112: UnoCard[] = build('uno_teams_112');

export const UNO_DECKS: Record<UnoDeckProfileId, UnoCard[]> = {
  uno_classic_108: UNO_CLASSIC_108,
  uno_classic_112: UNO_CLASSIC_112,
  uno_teams_112: UNO_TEAMS_112,
};

export const UNO_CARD_BY_ID: ReadonlyMap<string, UnoCard> = new Map(UNO_CLASSIC_108.concat(UNO_CLASSIC_112, UNO_TEAMS_112).map((c) => [c.id, c]));

/** 自定义牌的安全预置模板（服务端实现；房主开局前向全员公示） */
export const UNO_CUSTOM_TEMPLATE = 'next_player_draw3';
export const UNO_CUSTOM_TEMPLATE_DESC = '自定义牌效果（预置模板）：下一名玩家摸 3 张并失去回合；出牌者选择后续颜色';

export function unoCanPlay(card: UnoCard, top: UnoCard, currentColor: UnoColor): boolean {
  if (card.kind === 'wild' || card.kind === 'wild_draw4' || card.kind === 'wild_swap' || card.kind === 'wild_custom' || card.kind === 'wild_team_play' || card.kind === 'wild_team_draw4') return true;
  if (card.color === currentColor) return true;
  if (card.kind === 'number' && top.kind === 'number' && card.number === top.number) return true;
  if (card.kind === top.kind && card.kind !== 'number') return true;
  return false;
}
