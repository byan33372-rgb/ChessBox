/**
 * 三国杀·自由混战 —— 游戏牌数据库与牌堆构建。
 *
 * 数据来源（逐张转录，来源见 docs/sanguosha/RULES_DECISIONS.md）：
 * - 标准版 108 张（含 4 张 EX）：四花色 × 13 点数 × 每格 2 张 = 104 + EX 4。
 * - 军争篇 52 张：四花色 × 13 点数 × 每格 1 张。
 *
 * 硬性断言（tests/unit/sg-cards.test.ts）：
 * - standard=108 / junzheng=52 / merged=160；基本 85 / 锦囊 50 / 装备 25。
 * - 物理牌实例 id 全局唯一；每张牌类别/花色/点数/来源包合法。
 */

export type Suit = 'S' | 'H' | 'C' | 'D';
export type CardCategory = 'basic' | 'trick' | 'equip' | 'delayed';
export type EquipSlot = 'weapon' | 'armor' | 'horsePlus' | 'horseMinus';
export type DeckConfig = 'standard_only' | 'standard_plus_military';
export type PackId = 'standard' | 'ex' | 'junzheng';

/** 卡牌效果处理器 ID（与 skills/engine 中绑定的实现一一对应） */
export type EffectId =
  | 'sha' | 'sha_fire' | 'sha_thunder' | 'shan' | 'tao' | 'jiu'
  | 'guohechaiqiao' | 'shunshouqianyang' | 'wuzhongshengyou' | 'wuxiekeji'
  | 'juedou' | 'nanmanruqin' | 'wanjianqifa' | 'taoyuanjieyi' | 'wugufengdeng'
  | 'jiedaosharen' | 'huogong' | 'tiesuolianhuan'
  | 'lebusishu' | 'shandian' | 'bingliangcunduan'
  | 'equip_weapon' | 'equip_armor' | 'equip_horse';

export interface CardDef {
  /** 类别名 id（卡牌逻辑名，如 sha/闪用拼音） */
  name: string;
  suit: Suit;
  rank: number; // A=1 … K=13
  cat: CardCategory;
  effect: EffectId;
  /** 装备子类 */
  slot?: EquipSlot;
  /** 武器攻击范围 */
  range?: number;
  pack: PackId;
}

/** 物理牌实例：def + 全局唯一 id */
export interface SgCard extends CardDef {
  id: string;
}

export const SUITS: readonly Suit[] = ['S', 'H', 'C', 'D'];
export const RANK_LABEL: Record<number, string> = { 1: 'A', 11: 'J', 12: 'Q', 13: 'K' };
export const SUIT_LABEL: Record<Suit, string> = { S: '♠', H: '♥', C: '♣', D: '♦' };
export const SUIT_NAME: Record<Suit, string> = { S: '黑桃', H: '红桃', C: '梅花', D: '方块' };

export function isRed(s: Suit): boolean {
  return s === 'H' || s === 'D';
}
export function isBlack(s: Suit): boolean {
  return s === 'S' || s === 'C';
}
export function rankLabel(rank: number): string {
  return RANK_LABEL[rank] ?? String(rank);
}

// ─── 标准版 108 张逐张矩阵（附录 A）─────────────────────────────
// [花色, 点数, 名称, 是否EX]
const STD_ROWS: Array<[Suit, number, string, boolean?]> = [
  // 黑桃
  ['S', 1, 'shandian'], ['S', 1, 'juedou'],
  ['S', 2, 'baguazhen'], ['S', 2, 'cixiongshuanggujian'],
  ['S', 3, 'guohechaiqiao'], ['S', 3, 'shunshouqianyang'],
  ['S', 4, 'guohechaiqiao'], ['S', 4, 'shunshouqianyang'],
  ['S', 5, 'qinglongyanyuedao'], ['S', 5, 'jueying'],
  ['S', 6, 'lebusishu'], ['S', 6, 'qinggangjian'],
  ['S', 7, 'nanmanruqin'], ['S', 7, 'sha'],
  ['S', 8, 'sha'], ['S', 8, 'sha'],
  ['S', 9, 'sha'], ['S', 9, 'sha'],
  ['S', 10, 'sha'], ['S', 10, 'sha'],
  ['S', 11, 'wuxiekeji'], ['S', 11, 'shunshouqianyang'],
  ['S', 12, 'zhangbashemao'], ['S', 12, 'guohechaiqiao'],
  ['S', 13, 'dawan'], ['S', 13, 'nanmanruqin'],
  ['S', 2, 'hanbingjian', true], // EX
  // 红桃
  ['H', 1, 'taoyuanjieyi'], ['H', 1, 'wanjianqifa'],
  ['H', 2, 'shan'], ['H', 2, 'shan'],
  ['H', 3, 'tao'], ['H', 3, 'wugufengdeng'],
  ['H', 4, 'tao'], ['H', 4, 'wugufengdeng'],
  ['H', 5, 'qilingong'], ['H', 5, 'chitu'],
  ['H', 6, 'tao'], ['H', 6, 'lebusishu'],
  ['H', 7, 'tao'], ['H', 7, 'wuzhongshengyou'],
  ['H', 8, 'tao'], ['H', 8, 'wuzhongshengyou'],
  ['H', 9, 'tao'], ['H', 9, 'wuzhongshengyou'],
  ['H', 10, 'sha'], ['H', 10, 'sha'],
  ['H', 11, 'sha'], ['H', 11, 'wuzhongshengyou'],
  ['H', 12, 'tao'], ['H', 12, 'guohechaiqiao'],
  ['H', 13, 'zhaohuangfeidian'], ['H', 13, 'shan'],
  ['H', 12, 'shandian', true], // EX
  // 梅花
  ['C', 1, 'zhugelianyu'], ['C', 1, 'juedou'],
  ['C', 2, 'baguazhen'], ['C', 2, 'sha'],
  ['C', 3, 'guohechaiqiao'], ['C', 3, 'sha'],
  ['C', 4, 'guohechaiqiao'], ['C', 4, 'sha'],
  ['C', 5, 'dailu'], ['C', 5, 'sha'],
  ['C', 6, 'lebusishu'], ['C', 6, 'sha'],
  ['C', 7, 'nanmanruqin'], ['C', 7, 'sha'],
  ['C', 8, 'sha'], ['C', 8, 'sha'],
  ['C', 9, 'sha'], ['C', 9, 'sha'],
  ['C', 10, 'sha'], ['C', 10, 'sha'],
  ['C', 11, 'sha'], ['C', 11, 'sha'],
  ['C', 12, 'jiedaosharen'], ['C', 12, 'wuxiekeji'],
  ['C', 13, 'jiedaosharen'], ['C', 13, 'wuxiekeji'],
  ['C', 2, 'renwangdun', true], // EX
  // 方块
  ['D', 1, 'zhugelianyu'], ['D', 1, 'juedou'],
  ['D', 2, 'shan'], ['D', 2, 'shan'],
  ['D', 3, 'shan'], ['D', 3, 'shunshouqianyang'],
  ['D', 4, 'shan'], ['D', 4, 'shunshouqianyang'],
  ['D', 5, 'shan'], ['D', 5, 'guanshifu'],
  ['D', 6, 'shan'], ['D', 6, 'sha'],
  ['D', 7, 'shan'], ['D', 7, 'sha'],
  ['D', 8, 'shan'], ['D', 8, 'sha'],
  ['D', 9, 'shan'], ['D', 9, 'sha'],
  ['D', 10, 'shan'], ['D', 10, 'sha'],
  ['D', 11, 'shan'], ['D', 11, 'shan'],
  ['D', 12, 'tao'], ['D', 12, 'fangtianhuaji'],
  ['D', 13, 'sha'], ['D', 13, 'zixing'],
  ['D', 12, 'wuxiekeji', true], // EX
];

// ─── 军争篇 52 张逐张矩阵（附录 B）─────────────────────────────
const JZ_ROWS: Array<[Suit, number, string]> = [
  ['S', 1, 'gudingdao'], ['H', 1, 'wuxiekeji'], ['C', 1, 'baiyinshizi'], ['D', 1, 'zhuyueyushan'],
  ['S', 2, 'tengjia'], ['H', 2, 'huogong'], ['C', 2, 'tengjia'], ['D', 2, 'tao'],
  ['S', 3, 'jiu'], ['H', 3, 'huogong'], ['C', 3, 'jiu'], ['D', 3, 'tao'],
  ['S', 4, 'leisha'], ['H', 4, 'huosha'], ['C', 4, 'bingliangcunduan'], ['D', 4, 'huosha'],
  ['S', 5, 'leisha'], ['H', 5, 'tao'], ['C', 5, 'leisha'], ['D', 5, 'huosha'],
  ['S', 6, 'leisha'], ['H', 6, 'tao'], ['C', 6, 'leisha'], ['D', 6, 'shan'],
  ['S', 7, 'leisha'], ['H', 7, 'huosha'], ['C', 7, 'leisha'], ['D', 7, 'shan'],
  ['S', 8, 'leisha'], ['H', 8, 'shan'], ['C', 8, 'leisha'], ['D', 8, 'shan'],
  ['S', 9, 'jiu'], ['H', 9, 'shan'], ['C', 9, 'jiu'], ['D', 9, 'jiu'],
  ['S', 10, 'bingliangcunduan'], ['H', 10, 'huosha'], ['C', 10, 'tiesuolianhuan'], ['D', 10, 'shan'],
  ['S', 11, 'tiesuolianhuan'], ['H', 11, 'shan'], ['C', 11, 'tiesuolianhuan'], ['D', 11, 'shan'],
  ['S', 12, 'tiesuolianhuan'], ['H', 12, 'shan'], ['C', 12, 'tiesuolianhuan'], ['D', 12, 'huogong'],
  ['S', 13, 'wuxiekeji'], ['H', 13, 'wuxiekeji'], ['C', 13, 'tiesuolianhuan'], ['D', 13, 'hualiu'],
];

/** 名称 → 类别/效果/装备槽与攻击范围 */
export const CARD_DEFS: Record<string, Omit<CardDef, 'suit' | 'rank' | 'pack'>> = {
  // 基本牌
  sha: { name: 'sha', cat: 'basic', effect: 'sha' },
  huosha: { name: 'huosha', cat: 'basic', effect: 'sha_fire' },
  leisha: { name: 'leisha', cat: 'basic', effect: 'sha_thunder' },
  shan: { name: 'shan', cat: 'basic', effect: 'shan' },
  tao: { name: 'tao', cat: 'basic', effect: 'tao' },
  jiu: { name: 'jiu', cat: 'basic', effect: 'jiu' },
  // 普通锦囊
  guohechaiqiao: { name: 'guohechaiqiao', cat: 'trick', effect: 'guohechaiqiao' },
  shunshouqianyang: { name: 'shunshouqianyang', cat: 'trick', effect: 'shunshouqianyang' },
  wuzhongshengyou: { name: 'wuzhongshengyou', cat: 'trick', effect: 'wuzhongshengyou' },
  wuxiekeji: { name: 'wuxiekeji', cat: 'trick', effect: 'wuxiekeji' },
  juedou: { name: 'juedou', cat: 'trick', effect: 'juedou' },
  nanmanruqin: { name: 'nanmanruqin', cat: 'trick', effect: 'nanmanruqin' },
  wanjianqifa: { name: 'wanjianqifa', cat: 'trick', effect: 'wanjianqifa' },
  taoyuanjieyi: { name: 'taoyuanjieyi', cat: 'trick', effect: 'taoyuanjieyi' },
  wugufengdeng: { name: 'wugufengdeng', cat: 'trick', effect: 'wugufengdeng' },
  jiedaosharen: { name: 'jiedaosharen', cat: 'trick', effect: 'jiedaosharen' },
  huogong: { name: 'huogong', cat: 'trick', effect: 'huogong' },
  tiesuolianhuan: { name: 'tiesuolianhuan', cat: 'trick', effect: 'tiesuolianhuan' },
  // 延时锦囊
  lebusishu: { name: 'lebusishu', cat: 'delayed', effect: 'lebusishu' },
  shandian: { name: 'shandian', cat: 'delayed', effect: 'shandian' },
  bingliangcunduan: { name: 'bingliangcunduan', cat: 'delayed', effect: 'bingliangcunduan' },
  // 武器
  zhugelianyu: { name: 'zhugelianyu', cat: 'equip', effect: 'equip_weapon', slot: 'weapon', range: 1 },
  cixiongshuanggujian: { name: 'cixiongshuanggujian', cat: 'equip', effect: 'equip_weapon', slot: 'weapon', range: 2 },
  hanbingjian: { name: 'hanbingjian', cat: 'equip', effect: 'equip_weapon', slot: 'weapon', range: 2 },
  qinglongyanyuedao: { name: 'qinglongyanyuedao', cat: 'equip', effect: 'equip_weapon', slot: 'weapon', range: 3 },
  qinggangjian: { name: 'qinggangjian', cat: 'equip', effect: 'equip_weapon', slot: 'weapon', range: 2 },
  zhangbashemao: { name: 'zhangbashemao', cat: 'equip', effect: 'equip_weapon', slot: 'weapon', range: 3 },
  guanshifu: { name: 'guanshifu', cat: 'equip', effect: 'equip_weapon', slot: 'weapon', range: 3 },
  fangtianhuaji: { name: 'fangtianhuaji', cat: 'equip', effect: 'equip_weapon', slot: 'weapon', range: 4 },
  qilingong: { name: 'qilingong', cat: 'equip', effect: 'equip_weapon', slot: 'weapon', range: 5 },
  gudingdao: { name: 'gudingdao', cat: 'equip', effect: 'equip_weapon', slot: 'weapon', range: 2 },
  zhuyueyushan: { name: 'zhuyueyushan', cat: 'equip', effect: 'equip_weapon', slot: 'weapon', range: 4 },
  // 防具
  baguazhen: { name: 'baguazhen', cat: 'equip', effect: 'equip_armor', slot: 'armor' },
  renwangdun: { name: 'renwangdun', cat: 'equip', effect: 'equip_armor', slot: 'armor' },
  tengjia: { name: 'tengjia', cat: 'equip', effect: 'equip_armor', slot: 'armor' },
  baiyinshizi: { name: 'baiyinshizi', cat: 'equip', effect: 'equip_armor', slot: 'armor' },
  // 坐骑（+1 防御马 / -1 进攻马）
  dailu: { name: 'dailu', cat: 'equip', effect: 'equip_horse', slot: 'horsePlus' },
  jueying: { name: 'jueying', cat: 'equip', effect: 'equip_horse', slot: 'horsePlus' },
  zhaohuangfeidian: { name: 'zhaohuangfeidian', cat: 'equip', effect: 'equip_horse', slot: 'horsePlus' },
  hualiu: { name: 'hualiu', cat: 'equip', effect: 'equip_horse', slot: 'horsePlus' },
  chitu: { name: 'chitu', cat: 'equip', effect: 'equip_horse', slot: 'horseMinus' },
  dawan: { name: 'dawan', cat: 'equip', effect: 'equip_horse', slot: 'horseMinus' },
  zixing: { name: 'zixing', cat: 'equip', effect: 'equip_horse', slot: 'horseMinus' },
};

/** 中文显示名 */
export const CARD_NAMES: Record<string, string> = {
  sha: '杀', huosha: '火杀', leisha: '雷杀', shan: '闪', tao: '桃', jiu: '酒',
  guohechaiqiao: '过河拆桥', shunshouqianyang: '顺手牵羊', wuzhongshengyou: '无中生有',
  wuxiekeji: '无懈可击', juedou: '决斗', nanmanruqin: '南蛮入侵', wanjianqifa: '万箭齐发',
  taoyuanjieyi: '桃园结义', wugufengdeng: '五谷丰登', jiedaosharen: '借刀杀人',
  huogong: '火攻', tiesuolianhuan: '铁索连环',
  lebusishu: '乐不思蜀', shandian: '闪电', bingliangcunduan: '兵粮寸断',
  zhugelianyu: '诸葛连弩', cixiongshuanggujian: '雌雄双股剑', hanbingjian: '寒冰剑',
  qinglongyanyuedao: '青龙偃月刀', qinggangjian: '青釭剑', zhangbashemao: '丈八蛇矛',
  guanshifu: '贯石斧', fangtianhuaji: '方天画戟', qilingong: '麒麟弓',
  gudingdao: '古锭刀', zhuyueyushan: '朱雀羽扇',
  baguazhen: '八卦阵', renwangdun: '仁王盾', tengjia: '藤甲', baiyinshizi: '白银狮子',
  dailu: '的卢', jueying: '绝影', zhaohuangfeidian: '爪黄飞电', hualiu: '骅骝',
  chitu: '赤兔', dawan: '大宛', zixing: '紫骍',
};

/** 从行矩阵构建物理牌实例（id 含包前缀 + 包内同名同位序号，保证全局唯一） */
let CARD_SEQ = 0;
function buildDeck(pack: PackId, rows: Array<[Suit, number, string, boolean?]>): SgCard[] {
  const counters = new Map<string, number>();
  const out: SgCard[] = [];
  const prefix = pack === 'junzheng' ? 'jz' : 'std';
  for (const [suit, rank, name, ex] of rows) {
    const def = CARD_DEFS[name];
    if (!def) throw new Error(`未知卡牌名: ${name}`);
    const key = `${name}-${suit}-${rank}`;
    const n = (counters.get(key) ?? 0) + 1;
    counters.set(key, n);
    CARD_SEQ += 1;
    out.push({
      ...def,
      suit,
      rank,
      pack: ex ? 'ex' : pack,
      id: `sg-${prefix}-${n.toString(36).padStart(2, '0')}-${suit}${rankLabel(rank)}-${name}`,
    });
  }
  return out;
}

export const STANDARD_CARDS: SgCard[] = buildDeck('standard', STD_ROWS);
export const JUNZHENG_CARDS: SgCard[] = buildDeck('junzheng', JZ_ROWS);
export const ALL_CARDS: SgCard[] = [...STANDARD_CARDS, ...JUNZHENG_CARDS];

export const CARD_BY_ID: ReadonlyMap<string, SgCard> = new Map(ALL_CARDS.map((c) => [c.id, c]));

/** 牌堆配置 → 实例列表（新局） */
export function buildPile(config: DeckConfig): SgCard[] {
  return config === 'standard_only' ? [...STANDARD_CARDS] : [...ALL_CARDS];
}

/** 类型计数（测试断言用） */
export function countBy(cards: SgCard[]): { basic: number; trick: number; equip: number; delayed: number } {
  const c = { basic: 0, trick: 0, equip: 0, delayed: 0 };
  for (const card of cards) c[card.cat] += 1;
  return c;
}

/** 按名称计数 */
export function countByName(cards: SgCard[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const c of cards) m.set(c.name, (m.get(c.name) ?? 0) + 1);
  return m;
}

/** 装备效果描述要点（服务端实现依据） */
export const WEAPON_RANGE: Record<string, number> = Object.fromEntries(
  Object.values(CARD_DEFS)
    .filter((d) => d.slot === 'weapon')
    .map((d) => [d.name, d.range ?? 1]),
);
