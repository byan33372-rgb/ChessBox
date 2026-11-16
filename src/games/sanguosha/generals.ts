/**
 * 三国杀·自由混战 —— 武将数据库（2013 标准版 27 名）。
 *
 * 技能为结构化元数据 + 效果处理器 ID（handler 实现于 skills.ts），禁止把中文描述当执行逻辑。
 * 主公技在自由混战中禁用（disabledInMode: 'lord'）。
 * 来源与裁定：docs/sanguosha/RULES_DECISIONS.md。
 */

export type Faction = 'wei' | 'shu' | 'wu' | 'qun';
export type Gender = 'm' | 'f';
/** 技能实现挂钩点 */
export type SkillHook =
  | 'damagedAfter'          // 受到伤害后（奸雄/反馈/刚烈/遗计/耀武）
  | 'judgeBefore'           // 判定牌生效前（鬼才）
  | 'judgeTaken'            // 获得判定牌（天妒）
  | 'drawPhase'             // 摸牌阶段替代/修改（突袭/裸衣/英姿）
  | 'preparePhase'          // 准备阶段（洛神）
  | 'startPhase'            // 回合开始（观星）
  | 'endPhase'              // 结束阶段（闭月）
  | 'playPhaseActive'       // 出牌阶段主动技（制衡/苦肉/青囊/反间/离间/结姻）
  | 'cardAsConverter'       // 视为另一张牌（倾国/武圣/龙胆/奇袭/国色/急救）
  | 'targeted'              // 成为杀目标时（流离）
  | 'shaTargeted'           // 使用杀指定目标后（铁骑）
  | 'shaLimit'              // 杀次数修改（咆哮）
  | 'shaResponseCount'      // 需要的闪数量（无双）
  | 'duelShaCount'          // 决斗需求数（无双）
  | 'targetable'            // 能否被指定为目标（空城/谦逊）
  | 'trickUsed'             // 使用锦囊后（集智）
  | 'trickDistance'         // 锦囊无距离限制（奇才）
  | 'loseEquipment'         // 失去装备（枭姬）
  | 'lastHandLost'          // 失去最后手牌（连营）
  | 'playNoSha'             // 出牌阶段未用杀标记（克己）
  | 'giveHandCards'         // 交牌（仁德）
  | 'damageDealtModify'     // 伤害+1（裸衣）
  | 'shaDamageTakenArmor';  // （占位）

export type SkillKind = 'active' | 'passive' | 'locked' | 'lord' | 'limited';

export interface SgSkill {
  id: string;
  name: string;
  kind: SkillKind;
  hook: SkillHook;
  /** 自由混战禁用（主公技） */
  disabledInMode?: boolean;
  desc: string;
  /** 出牌阶段主动技每回合限一次 */
  oncePerTurn?: boolean;
}

export interface SgGeneral {
  id: string;
  name: string;
  faction: Faction;
  gender: Gender;
  maxHp: number;
  version: 'std2013';
  skills: SgSkill[];
}

const lord = (id: string, name: string, desc: string): SgSkill => ({
  id,
  name,
  kind: 'lord',
  hook: 'damagedAfter',
  disabledInMode: true,
  desc: `${desc}（主公技，自由混战中禁用）`,
});

export const GENERALS: SgGeneral[] = [
  { id: 'caocao', name: '曹操', faction: 'wei', gender: 'm', maxHp: 4, version: 'std2013', skills: [
    { id: 'jianxiong', name: '奸雄', kind: 'passive', hook: 'damagedAfter', desc: '当你受到伤害后，你可以获得造成此伤害的牌。' },
    lord('hujia', '护驾', '当你需要使用或打出闪时，其他魏势力角色可以打出一张闪。'),
  ] },
  { id: 'simayi', name: '司马懿', faction: 'wei', gender: 'm', maxHp: 3, version: 'std2013', skills: [
    { id: 'fankui', name: '反馈', kind: 'passive', hook: 'damagedAfter', desc: '当你受到伤害后，你可以获得伤害来源的一张牌。' },
    { id: 'guicai', name: '鬼才', kind: 'passive', hook: 'judgeBefore', desc: '一名角色的判定牌生效前，你可以打出一张手牌代替之。' },
  ] },
  { id: 'xiahoumin', name: '夏侯惇', faction: 'wei', gender: 'm', maxHp: 4, version: 'std2013', skills: [
    { id: 'ganglie', name: '刚烈', kind: 'passive', hook: 'damagedAfter', desc: '当你受到伤害后，你可以进行判定：若结果不为红桃，伤害来源选择弃置两张手牌或受到你造成的1点伤害。' },
  ] },
  { id: 'zhangliao', name: '张辽', faction: 'wei', gender: 'm', maxHp: 4, version: 'std2013', skills: [
    { id: 'tuxi', name: '突袭', kind: 'active', hook: 'drawPhase', desc: '摸牌阶段，你可以放弃摸牌，改为获得至多两名有手牌的其他角色的各一张手牌。' },
  ] },
  { id: 'xuchu', name: '许褚', faction: 'wei', gender: 'm', maxHp: 4, version: 'std2013', skills: [
    { id: 'luyi', name: '裸衣', kind: 'active', hook: 'drawPhase', desc: '摸牌阶段，你可以少摸一张牌：本回合你的【杀】和【决斗】造成的伤害+1。' },
  ] },
  { id: 'guojia', name: '郭嘉', faction: 'wei', gender: 'm', maxHp: 3, version: 'std2013', skills: [
    { id: 'tiandu', name: '天妒', kind: 'locked', hook: 'judgeTaken', desc: '锁定技：你的判定牌生效后，你获得之。' },
    { id: 'yiji', name: '遗计', kind: 'passive', hook: 'damagedAfter', desc: '当你每受到1点伤害后，你可以摸两张牌，然后将至多两张牌交给其他角色。' },
  ] },
  { id: 'zhenji', name: '甄姬', faction: 'wei', gender: 'f', maxHp: 3, version: 'std2013', skills: [
    { id: 'qingguo', name: '倾国', kind: 'passive', hook: 'cardAsConverter', desc: '你可以将黑色手牌当【闪】使用或打出。' },
    { id: 'luoshen', name: '洛神', kind: 'active', hook: 'preparePhase', desc: '准备阶段开始时，你可以进行判定：若结果为黑色，你获得此牌并可以再次发动；若为红色，判定牌置入弃牌堆且技能结束。' },
  ] },
  { id: 'liubei', name: '刘备', faction: 'shu', gender: 'm', maxHp: 4, version: 'std2013', skills: [
    { id: 'rende', name: '仁德', kind: 'active', hook: 'giveHandCards', desc: '出牌阶段，你可以将任意张手牌交给其他角色：当你于此阶段内给出的牌首次达到两张时，你回复1点体力。' },
    lord('jijiang', '激将', '当你需要使用或打出杀时，其他蜀势力角色可以打出一张杀。'),
  ] },
  { id: 'guanyu', name: '关羽', faction: 'shu', gender: 'm', maxHp: 4, version: 'std2013', skills: [
    { id: 'wusheng', name: '武圣', kind: 'passive', hook: 'cardAsConverter', desc: '你可以将红色牌当【杀】使用或打出。' },
  ] },
  { id: 'zhangfei', name: '张飞', faction: 'shu', gender: 'm', maxHp: 4, version: 'std2013', skills: [
    { id: 'paoxiao', name: '咆哮', kind: 'locked', hook: 'shaLimit', desc: '锁定技：你使用【杀】无次数限制。' },
  ] },
  { id: 'zhugeliang', name: '诸葛亮', faction: 'shu', gender: 'm', maxHp: 3, version: 'std2013', skills: [
    { id: 'guanxing', name: '观星', kind: 'active', hook: 'startPhase', desc: '回合开始阶段开始时，你可以观看牌堆顶的X张牌（X为存活角色数且至多为5），以任意顺序放回牌堆顶，其余置于牌堆底。' },
    { id: 'kongcheng', name: '空城', kind: 'locked', hook: 'targetable', desc: '锁定技：若你没有手牌，你不能成为【杀】和【决斗】的目标。' },
  ] },
  { id: 'zhaoyun', name: '赵云', faction: 'shu', gender: 'm', maxHp: 4, version: 'std2013', skills: [
    { id: 'longdan', name: '龙胆', kind: 'passive', hook: 'cardAsConverter', desc: '你可以将【杀】当【闪】、【闪】当【杀】使用或打出。' },
  ] },
  { id: 'machao', name: '马超', faction: 'shu', gender: 'm', maxHp: 4, version: 'std2013', skills: [
    { id: 'mashu', name: '马术', kind: 'locked', hook: 'trickDistance', desc: '锁定技：你计算与其他角色的距离-1。（按距离钩子实现）' },
    { id: 'tieqi', name: '铁骑', kind: 'passive', hook: 'shaTargeted', desc: '当你使用【杀】指定目标后，你可以进行判定：若结果为红色，该角色不能使用【闪】响应此【杀】。' },
  ] },
  { id: 'huangyueying', name: '黄月英', faction: 'shu', gender: 'f', maxHp: 3, version: 'std2013', skills: [
    { id: 'jizhi', name: '集智', kind: 'passive', hook: 'trickUsed', desc: '当你使用普通锦囊牌时（延时锦囊除外），你可以摸一张牌。' },
    { id: 'qicai', name: '奇才', kind: 'locked', hook: 'trickDistance', desc: '锁定技：你使用锦囊牌无距离限制。' },
  ] },
  { id: 'sunquan', name: '孙权', faction: 'wu', gender: 'm', maxHp: 4, version: 'std2013', skills: [
    { id: 'zhiheng', name: '制衡', kind: 'active', hook: 'playPhaseActive', oncePerTurn: true, desc: '出牌阶段限一次，你可以弃置任意张手牌，然后摸等量的牌。' },
    lord('jiuyuan', '救援', '处于濒死状态的主公角色，吴势力角色对自己使用的桃回复体力+1。'),
  ] },
  { id: 'ganning', name: '甘宁', faction: 'wu', gender: 'm', maxHp: 4, version: 'std2013', skills: [
    { id: 'qixi', name: '奇袭', kind: 'passive', hook: 'cardAsConverter', desc: '你可以将黑色牌当【过河拆桥】使用。' },
  ] },
  { id: 'lvmeng', name: '吕蒙', faction: 'wu', gender: 'm', maxHp: 4, version: 'std2013', skills: [
    { id: 'keji', name: '克己', kind: 'passive', hook: 'playNoSha', desc: '弃牌阶段，若你于出牌阶段内未使用过【杀】，你可以跳过此阶段。' },
  ] },
  { id: 'huanggai', name: '黄盖', faction: 'wu', gender: 'm', maxHp: 4, version: 'std2013', skills: [
    { id: 'kurou', name: '苦肉', kind: 'active', hook: 'playPhaseActive', desc: '出牌阶段，你可以失去1点体力，然后摸两张牌。' },
  ] },
  { id: 'zhouyu', name: '周瑜', faction: 'wu', gender: 'm', maxHp: 3, version: 'std2013', skills: [
    { id: 'yingzi', name: '英姿', kind: 'locked', hook: 'drawPhase', desc: '锁定技：摸牌阶段，你多摸一张牌。' },
    { id: 'fanjian', name: '反间', kind: 'active', hook: 'playPhaseActive', oncePerTurn: true, desc: '出牌阶段限一次，你可以将一张手牌交给一名其他角色：其选择一种花色并展示此牌，若花色不同，其受到你造成的1点伤害；无论结果其获得此牌。' },
  ] },
  { id: 'daqiao', name: '大乔', faction: 'wu', gender: 'f', maxHp: 3, version: 'std2013', skills: [
    { id: 'guose', name: '国色', kind: 'passive', hook: 'cardAsConverter', desc: '你可以将方块牌当【乐不思蜀】使用。' },
    { id: 'liuli', name: '流离', kind: 'passive', hook: 'targeted', desc: '当你成为【杀】的目标时，你可以弃置一张牌并将此【杀】转移给你攻击范围内的一名其他角色（不能是此【杀】的使用者）。' },
  ] },
  { id: 'luxun', name: '陆逊', faction: 'wu', gender: 'm', maxHp: 3, version: 'std2013', skills: [
    { id: 'qianxun', name: '谦逊', kind: 'locked', hook: 'targetable', desc: '锁定技：你不能成为【顺手牵羊】和【乐不思蜀】的目标。' },
    { id: 'lianying', name: '连营', kind: 'passive', hook: 'lastHandLost', desc: '当你失去最后一张手牌后，你可以摸一张牌。' },
  ] },
  { id: 'sunshangxiang', name: '孙尚香', faction: 'wu', gender: 'f', maxHp: 3, version: 'std2013', skills: [
    { id: 'jieyin', name: '结姻', kind: 'active', hook: 'playPhaseActive', oncePerTurn: true, desc: '出牌阶段限一次，你可以弃置两张手牌，选择一名已受伤的男性角色：你与其各回复1点体力。' },
    { id: 'xiaoji', name: '枭姬', kind: 'passive', hook: 'loseEquipment', desc: '当你失去装备区里的一张装备牌后，你可以摸两张牌。' },
  ] },
  { id: 'huatuo', name: '华佗', faction: 'qun', gender: 'm', maxHp: 3, version: 'std2013', skills: [
    { id: 'jijiu', name: '急救', kind: 'passive', hook: 'cardAsConverter', desc: '你的回合外，你可以将红色牌当【桃】使用。' },
    { id: 'qingnang', name: '青囊', kind: 'active', hook: 'playPhaseActive', oncePerTurn: true, desc: '出牌阶段限一次，你可以弃置一张手牌，选择一名已受伤的角色，其回复1点体力。' },
  ] },
  { id: 'lvbu', name: '吕布', faction: 'qun', gender: 'm', maxHp: 4, version: 'std2013', skills: [
    { id: 'wushuang', name: '无双', kind: 'locked', hook: 'shaResponseCount', desc: '锁定技：你使用【杀】时，目标角色需依次打出两张【闪】才能抵消；与你【决斗】的角色每次需打出两张【杀】。' },
  ] },
  { id: 'diaochan', name: '貂蝉', faction: 'qun', gender: 'f', maxHp: 3, version: 'std2013', skills: [
    { id: 'lijian', name: '离间', kind: 'active', hook: 'playPhaseActive', oncePerTurn: true, desc: '出牌阶段限一次，你可以弃置一张牌并选择两名男性角色：视为先选的角色对后选的角色使用【决斗】。' },
    { id: 'biyue', name: '闭月', kind: 'passive', hook: 'endPhase', desc: '结束阶段开始时，你可以摸一张牌。（本项目自动摸牌，见规则决策）' },
  ] },
  { id: 'huaxiong', name: '华雄', faction: 'qun', gender: 'm', maxHp: 6, version: 'std2013', skills: [
    { id: 'yaowu', name: '耀武', kind: 'locked', hook: 'damagedAfter', desc: '锁定技：当你受到红色【杀】造成的伤害后，伤害来源需选择一项：1.弃置一张手牌；2.令你摸一张牌。' },
  ] },
  { id: 'yuanshu', name: '袁术', faction: 'qun', gender: 'm', maxHp: 4, version: 'std2013', skills: [
    lord('wangzun', '妄尊', '主公回合开始时，你可以摸一张牌（依赖主公身份）。'),
    { id: 'tongji', name: '同疾', kind: 'locked', hook: 'trickDistance', desc: '锁定技：若你的手牌数为唯一最多，你与其他角色计算距离+1。（自由混战裁定，见规则决策）' },
  ] },
];

export const GENERAL_BY_ID: ReadonlyMap<string, SgGeneral> = new Map(GENERALS.map((g) => [g.id, g]));

/** 自由混战中禁用的技能（主公技等） */
export function disabledSkillIds(generalId: string): Set<string> {
  const g = GENERAL_BY_ID.get(generalId);
  return new Set((g?.skills ?? []).filter((s) => s.disabledInMode).map((s) => s.id));
}

export const FACTION_NAMES: Record<Faction, string> = { wei: '魏', shu: '蜀', wu: '吴', qun: '群' };
