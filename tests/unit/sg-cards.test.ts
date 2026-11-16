/**
 * 三国杀·自由混战 —— 数据层测试：牌堆数量/唯一性/矩阵，27 名武将元数据。
 * 对应任务书 14.2 与 §6.4 硬性断言。
 */
import { describe, expect, it } from 'vitest';
import {
  ALL_CARDS, CARD_BY_ID, JUNZHENG_CARDS, STANDARD_CARDS, buildPile, countBy, countByName, isBlack, isRed,
} from '../../src/games/sanguosha/cards';
import { GENERALS, GENERAL_BY_ID, disabledSkillIds } from '../../src/games/sanguosha/generals';

describe('牌堆数量与类别（§6.4）', () => {
  it('标准 108 / 军争 52 / 合并 160', () => {
    expect(STANDARD_CARDS).toHaveLength(108);
    expect(JUNZHENG_CARDS).toHaveLength(52);
    expect(ALL_CARDS).toHaveLength(160);
    expect(buildPile('standard_only')).toHaveLength(108);
    expect(buildPile('standard_plus_military')).toHaveLength(160);
  });

  it('合并类别：基本 85 / 普通+延时锦囊 50 / 装备 25（延时独立子类 7）', () => {
    const c = countBy(ALL_CARDS);
    // 任务书 §6.4 的「锦囊 50」= 普通锦囊 43 + 延时锦囊 7；实现用独立 delayed 子类便于引擎区分
    expect(c.basic).toBe(85);
    expect(c.trick + c.delayed).toBe(50);
    expect(c.equip).toBe(25);
    expect(c.delayed).toBe(7);
  });

  it('延时锦囊 3 种（乐不思蜀3/闪电2/兵粮寸断2）cat=delayed，锦囊50=普通47+延时3？——以名称断言', () => {
    // 乐不思蜀 3 + 闪电 2 + 兵粮寸断 2 = 7 张延时牌
    const byName = countByName(ALL_CARDS);
    expect(byName.get('lebusishu')).toBe(3);
    expect(byName.get('shandian')).toBe(2);
    expect(byName.get('bingliangcunduan')).toBe(2);
  });

  it('标准版关键计数（§6.2）', () => {
    const m = countByName(STANDARD_CARDS);
    expect(m.get('sha')).toBe(30);
    expect(m.get('shan')).toBe(15);
    expect(m.get('tao')).toBe(8);
    expect(m.get('guohechaiqiao')).toBe(6);
    expect(m.get('shunshouqianyang')).toBe(5);
    expect(m.get('wuzhongshengyou')).toBe(4);
    expect(m.get('wuxiekeji')).toBe(4);
    expect(m.get('lebusishu')).toBe(3);
    expect(m.get('juedou')).toBe(3);
    expect(m.get('nanmanruqin')).toBe(3);
    expect(m.get('wugufengdeng')).toBe(2);
    expect(m.get('shandian')).toBe(2);
    expect(m.get('jiedaosharen')).toBe(2);
    expect(m.get('taoyuanjieyi')).toBe(1);
    expect(m.get('wanjianqifa')).toBe(1);
    expect(m.get('zhugelianyu')).toBe(2);
    expect(m.get('baguazhen')).toBe(2);
    const equips = STANDARD_CARDS.filter((c) => c.cat === 'equip');
    expect(equips).toHaveLength(19);
  });

  it('军争篇计数（附录 B 逐张 = §6.3：火杀5/雷杀9/闪9/桃4/酒5）', () => {
    const m = countByName(JUNZHENG_CARDS);
    expect(m.get('huosha')).toBe(5);
    expect(m.get('leisha')).toBe(9);
    expect(m.get('shan')).toBe(9);
    expect(m.get('tao')).toBe(4);
    expect(m.get('jiu')).toBe(5);
    expect(m.get('wuxiekeji')).toBe(3);
    expect(m.get('huogong')).toBe(3);
    expect(m.get('bingliangcunduan')).toBe(2);
    expect(m.get('tiesuolianhuan')).toBe(6);
    expect(m.get('tengjia')).toBe(2);
    expect(JUNZHENG_CARDS.filter((c) => c.cat === 'equip')).toHaveLength(6);
  });

  it('合并计数（§6.4 全表）', () => {
    const m = countByName(ALL_CARDS);
    const expectMap: Record<string, number> = {
      sha: 30, huosha: 5, leisha: 9, shan: 24, tao: 12, jiu: 5,
      guohechaiqiao: 6, shunshouqianyang: 5, wuzhongshengyou: 4, wuxiekeji: 7,
      lebusishu: 3, juedou: 3, nanmanruqin: 3, wugufengdeng: 2, shandian: 2,
      jiedaosharen: 2, taoyuanjieyi: 1, wanjianqifa: 1, huogong: 3, bingliangcunduan: 2,
      tiesuolianhuan: 6, zhugelianyu: 2, baguazhen: 2, tengjia: 2,
    };
    for (const [name, n] of Object.entries(expectMap)) expect(m.get(name), name).toBe(n);
    // 各 1 张的装备（藤甲除外）
    const singles = ['qilingong', 'chitu', 'zhaohuangfeidian', 'cixiongshuanggujian', 'hanbingjian',
      'qinglongyanyuedao', 'jueying', 'qinggangjian', 'zhangbashemao', 'dawan', 'guanshifu',
      'fangtianhuaji', 'zixing', 'renwangdun', 'dailu', 'gudingdao', 'baiyinshizi', 'zhuyueyushan', 'hualiu'];
    for (const name of singles) expect(m.get(name), name).toBe(1);
  });

  it('EX 牌恰好 4 张：寒冰剑/仁王盾/闪电/无懈可击', () => {
    const ex = ALL_CARDS.filter((c) => c.pack === 'ex');
    expect(ex).toHaveLength(4);
    expect(ex.map((c) => c.name).sort()).toEqual(['hanbingjian', 'renwangdun', 'shandian', 'wuxiekeji']);
  });

  it('物理牌 id 全局唯一，字段完整合法', () => {
    const ids = new Set(ALL_CARDS.map((c) => c.id));
    expect(ids.size).toBe(160);
    for (const c of ALL_CARDS) {
      expect(CARD_BY_ID.get(c.id)).toBe(c);
      expect(['basic', 'trick', 'equip', 'delayed']).toContain(c.cat);
      expect([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13]).toContain(c.rank);
      expect(['S', 'H', 'C', 'D']).toContain(c.suit);
      expect(['standard', 'ex', 'junzheng']).toContain(c.pack);
      if (c.cat === 'equip') expect(c.slot).toBeTruthy();
      if (c.slot === 'weapon') expect(c.range).toBeGreaterThanOrEqual(1);
    }
  });

  it('花色/点数矩阵抽查（附录 A/B 代表格）', () => {
    const has = (name: string, s: string, r: number) =>
      ALL_CARDS.some((c) => c.name === name && c.suit === s && c.rank === r);
    expect(has('shandian', 'S', 1)).toBe(true);       // ♠A 闪电
    expect(has('taoyuanjieyi', 'H', 1)).toBe(true);   // ♥A 桃园结义
    expect(has('zhugelianyu', 'C', 1)).toBe(true);    // ♣A 诸葛连弩
    expect(has('hanbingjian', 'S', 2)).toBe(true);    // ♠2 EX 寒冰剑
    expect(has('gudingdao', 'S', 1)).toBe(true);      // 军争 ♠A 古锭刀
    expect(has('baiyinshizi', 'C', 1)).toBe(true);    // 军争 ♣A 白银狮子
    expect(has('hualiu', 'D', 13)).toBe(true);        // 军争 ♦K 骅骝
    expect(has('tiesuolianhuan', 'C', 13)).toBe(true); // 军争 ♣K 铁索连环
    // 每花色 13 点数全部覆盖
    for (const s of ['S', 'H', 'C', 'D'] as const) {
      for (let r = 1; r <= 13; r++) {
        expect(ALL_CARDS.some((c) => c.suit === s && c.rank === r), `${s}${r}`).toBe(true);
      }
    }
  });

  it('坐骑方向：+1 防御马 / -1 进攻马', () => {
    const slot = (name: string) => ALL_CARDS.find((c) => c.name === name)?.slot;
    expect(slot('dailu')).toBe('horsePlus');
    expect(slot('jueying')).toBe('horsePlus');
    expect(slot('zhaohuangfeidian')).toBe('horsePlus');
    expect(slot('hualiu')).toBe('horsePlus');
    expect(slot('chitu')).toBe('horseMinus');
    expect(slot('dawan')).toBe('horseMinus');
    expect(slot('zixing')).toBe('horseMinus');
  });

  it('红黑判定', () => {
    expect(isRed('H') && isRed('D')).toBe(true);
    expect(isBlack('S') && isBlack('C')).toBe(true);
    expect(isRed('S')).toBe(false);
  });
});

describe('武将数据库（§5）', () => {
  it('恰好 27 名，id 唯一', () => {
    expect(GENERALS).toHaveLength(27);
    expect(new Set(GENERALS.map((g) => g.id)).size).toBe(27);
  });

  it('体力上限与 2013 标准版一致', () => {
    const hp: Record<string, number> = {
      caocao: 4, simayi: 3, xiahoumin: 4, zhangliao: 4, xuchu: 4, guojia: 3, zhenji: 3,
      liubei: 4, guanyu: 4, zhangfei: 4, zhugeliang: 3, zhaoyun: 4, machao: 4, huangyueying: 3,
      sunquan: 4, ganning: 4, lvmeng: 4, huanggai: 4, zhouyu: 3, daqiao: 3, luxun: 3, sunshangxiang: 3,
      huatuo: 3, lvbu: 4, diaochan: 3, huaxiong: 6, yuanshu: 4,
    };
    for (const g of GENERALS) expect(g.maxHp, g.id).toBe(hp[g.id]);
  });

  it('主公技在自由混战中禁用：护驾/激将/救援/妄尊', () => {
    expect(disabledSkillIds('caocao').has('hujia')).toBe(true);
    expect(disabledSkillIds('liubei').has('jijiang')).toBe(true);
    expect(disabledSkillIds('sunquan').has('jiuyuan')).toBe(true);
    expect(disabledSkillIds('yuanshu').has('wangzun')).toBe(true);
    // 非主公技不受影响
    expect(disabledSkillIds('caocao').has('jianxiong')).toBe(false);
    expect(disabledSkillIds('yuanshu').has('tongji')).toBe(false);
  });

  it('每名武将至少 1 个可用技能，字段完整', () => {
    for (const g of GENERALS) {
      expect(g.skills.length, g.id).toBeGreaterThanOrEqual(1);
      expect(['wei', 'shu', 'wu', 'qun']).toContain(g.faction);
      expect(['m', 'f']).toContain(g.gender);
      expect(g.version).toBe('std2013');
      for (const s of g.skills) {
        expect(s.desc.length, `${g.id}.${s.id}`).toBeGreaterThan(4);
        expect(['active', 'passive', 'locked', 'lord', 'limited']).toContain(s.kind);
      }
    }
  });

  it('性别数据（离间/结姻/雌雄双股剑依赖）', () => {
    const gender = (id: string) => GENERAL_BY_ID.get(id)?.gender;
    expect(gender('diaochan')).toBe('f');
    expect(gender('daqiao')).toBe('f');
    expect(gender('zhenji')).toBe('f');
    expect(gender('huangyueying')).toBe('f');
    expect(gender('sunshangxiang')).toBe('f');
    expect(gender('lvbu')).toBe('m');
    expect(gender('huatuo')).toBe('m');
  });
});
