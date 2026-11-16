/** UNO 数据层：三套牌组数量/构成/积分/唯一 ID/不混版。 */
import { describe, expect, it } from 'vitest';
import {
  UNO_CLASSIC_108, UNO_CLASSIC_112, UNO_TEAMS_112, UNO_CARD_BY_ID, unoCanPlay, UNO_CUSTOM_TEMPLATE,
  type UnoCard,
} from '../../src/games/uno/cards';

const byKind = (cards: UnoCard[], kind: string, color?: string) =>
  cards.filter((c) => c.kind === kind && (color == null || c.color === color)).length;

describe('UNO 牌组（三套独立）', () => {
  it('经典 108：数字 76 + 行动 24 + 万能 8', () => {
    expect(UNO_CLASSIC_108).toHaveLength(108);
    expect(byKind(UNO_CLASSIC_108, 'number')).toBe(76);
    expect(byKind(UNO_CLASSIC_108, 'draw2')).toBe(8);
    expect(byKind(UNO_CLASSIC_108, 'reverse')).toBe(8);
    expect(byKind(UNO_CLASSIC_108, 'skip')).toBe(8);
    expect(byKind(UNO_CLASSIC_108, 'wild')).toBe(4);
    expect(byKind(UNO_CLASSIC_108, 'wild_draw4')).toBe(4);
    // 每色：0×1 + 1-9×2 = 19 张
    for (const c of ['R', 'Y', 'G', 'B']) {
      expect(byKind(UNO_CLASSIC_108, 'number', c)).toBe(19);
    }
    // 数字 0 每色 1 张
    const zeros = UNO_CLASSIC_108.filter((c) => c.kind === 'number' && c.number === 0);
    expect(zeros).toHaveLength(4);
  });

  it('经典扩展 112 = 108 + 换手 1 + 自定义 3', () => {
    expect(UNO_CLASSIC_112).toHaveLength(112);
    expect(byKind(UNO_CLASSIC_112, 'wild_swap')).toBe(1);
    expect(byKind(UNO_CLASSIC_112, 'wild_custom')).toBe(3);
    expect(byKind(UNO_CLASSIC_112, 'number')).toBe(76);
    expect(byKind(UNO_CLASSIC_112, 'wild')).toBe(4);
    expect(byKind(UNO_CLASSIC_112, 'wild_draw4')).toBe(4);
  });

  it('Teams 112：无 0/普通+4/换手；Team Play 8、Team +4 4', () => {
    expect(UNO_TEAMS_112).toHaveLength(112);
    expect(byKind(UNO_TEAMS_112, 'number')).toBe(72);
    expect(byKind(UNO_TEAMS_112, 'draw2')).toBe(8);
    expect(byKind(UNO_TEAMS_112, 'reverse')).toBe(8);
    expect(byKind(UNO_TEAMS_112, 'skip')).toBe(8);
    expect(byKind(UNO_TEAMS_112, 'wild')).toBe(4);
    expect(byKind(UNO_TEAMS_112, 'wild_team_play')).toBe(8);
    expect(byKind(UNO_TEAMS_112, 'wild_team_draw4')).toBe(4);
    // 不含 Teams 禁牌
    expect(UNO_TEAMS_112.some((c) => c.number === 0)).toBe(false);
    expect(UNO_TEAMS_112.some((c) => c.kind === 'wild_draw4')).toBe(false);
    expect(UNO_TEAMS_112.some((c) => c.kind === 'wild_swap' || c.kind === 'wild_custom')).toBe(false);
    // Passing Symbol：平台标记（36 张 = 每色数字 1-9 的第二张；官方说明书未列精确分布，见 RULES_DECISIONS）
    const passing = UNO_TEAMS_112.filter((c) => c.hasPassingSymbol);
    expect(passing.length).toBe(36);
  });

  it('三套牌不混版：实例 ID 全局唯一、deck 字段互斥', () => {
    const all = [...UNO_CLASSIC_108, ...UNO_CLASSIC_112, ...UNO_TEAMS_112];
    const ids = new Set(all.map((c) => c.id));
    expect(ids.size).toBe(all.length);
    expect(UNO_CLASSIC_108.every((c) => c.deck === 'uno_classic_108')).toBe(true);
    expect(UNO_TEAMS_112.every((c) => c.deck === 'uno_teams_112')).toBe(true);
    // 积分
    expect(UNO_CLASSIC_108.filter((c) => c.kind === 'wild').every((c) => c.score === 50)).toBe(true);
    expect(UNO_CLASSIC_108.filter((c) => c.kind === 'draw2').every((c) => c.score === 20)).toBe(true);
  });

  it('匹配规则：颜色/数字/符号/wild 任意', () => {
    const top = UNO_CARD_BY_ID.get('u-001-numberR5') ?? UNO_CLASSIC_108.find((c) => c.kind === 'number' && c.number === 5 && c.color === 'R')!;
    const red6 = UNO_CLASSIC_108.find((c) => c.kind === 'number' && c.number === 6 && c.color === 'R')!;
    const blue5 = UNO_CLASSIC_108.find((c) => c.kind === 'number' && c.number === 5 && c.color === 'B')!;
    const blueDraw2 = UNO_CLASSIC_108.find((c) => c.kind === 'draw2' && c.color === 'B')!;
    const wild = UNO_CLASSIC_108.find((c) => c.kind === 'wild')!;
    expect(unoCanPlay(red6, top, 'R')).toBe(true);
    expect(unoCanPlay(blue5, top, 'B')).toBe(true);
    expect(unoCanPlay(blueDraw2, top, 'R')).toBe(false);
    expect(unoCanPlay(wild, top, 'R')).toBe(true);
    // 符号匹配：+2 压 +2（颜色不同也合法）
    const redDraw2 = UNO_CLASSIC_108.find((c) => c.kind === 'draw2' && c.color === 'R')!;
    expect(unoCanPlay(blueDraw2, redDraw2, 'R')).toBe(true);
    // 数字牌必须同色或同数字：蓝 6 压红 5 不合法
    const blue6 = UNO_CLASSIC_108.find((c) => c.kind === 'number' && c.number === 6 && c.color === 'B')!;
    expect(unoCanPlay(blue6, top, 'R')).toBe(false);
  });

  it('自定义牌为预置安全模板（无用户代码）', () => {
    expect(UNO_CUSTOM_TEMPLATE).toBe('next_player_draw3');
  });
});
