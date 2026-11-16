// 导出 CARD_CATALOG.md 与 GENERAL_CATALOG.md（由数据生成，保证与实现一致）
import { ALL_CARDS, JUNZHENG_CARDS, STANDARD_CARDS, CARD_NAMES, countByName } from '../dist-server/games/sanguosha/cards.js';
import { GENERALS, FACTION_NAMES } from '../dist-server/games/sanguosha/generals.js';
import { writeFileSync, mkdirSync } from 'node:fs';

const suitL = { S: '♠', H: '♥', C: '♣', D: '♦' };
const rankL = (r) => ({ 1: 'A', 11: 'J', 12: 'Q', 13: 'K' }[r] ?? String(r));
const catL = { basic: '基本', trick: '普通锦囊', delayed: '延时锦囊', equip: '装备' };
const packL = { standard: '标准', ex: '标准·EX', junzheng: '军争' };

let md = '# 三国杀·自由混战 —— 卡牌目录（160 张，由数据层自动生成）\n\n';
md += '> 生成来源：`src/games/sanguosha/cards.ts`；数量断言见 `tests/unit/sg-cards.test.ts`。\n\n';
for (const [title, cards] of [['标准版（108 张，含 4 EX）', STANDARD_CARDS], ['军争篇（52 张）', JUNZHENG_CARDS]]) {
  md += `## ${title}\n\n| 花色点数 | 牌名 | 类别 | 来源包 | 实例 ID |\n|---|---|---|---|---|\n`;
  for (const c of cards) {
    md += `| ${suitL[c.suit]}${rankL(c.rank)} | ${CARD_NAMES[c.name]} | ${catL[c.cat]} | ${packL[c.pack]} | \`${c.id}\` |\n`;
  }
  md += '\n';
}
const m = countByName(ALL_CARDS);
md += '## 合并牌堆计数\n\n| 牌名 | 数量 |\n|---|---:|\n';
for (const [k, v] of [...m.entries()].sort()) md += `| ${CARD_NAMES[k] ?? k} | ${v} |\n`;
md += `\n合计：${ALL_CARDS.length} 张\n`;

mkdirSync('docs/sanguosha', { recursive: true });
writeFileSync('docs/sanguosha/CARD_CATALOG.md', md, 'utf8');

let gm = '# 三国杀·自由混战 —— 武将目录（27 名，2013 标准版，由数据层自动生成）\n\n';
gm += '> 生成来源：`src/games/sanguosha/generals.ts`。主公技在自由混战中禁用（disabledInMode）。\n\n';
for (const g of GENERALS) {
  gm += `## ${g.name}（${FACTION_NAMES[g.faction]} · ${g.gender === 'm' ? '男' : '女'} · ${g.maxHp} 体力 · \`${g.id}\`）\n\n`;
  for (const s of g.skills) {
    gm += `- **${s.name}**（${s.kind}${s.disabledInMode ? '，本模式禁用' : ''}）：${s.desc}\n`;
  }
  gm += '\n';
}
writeFileSync('docs/sanguosha/GENERAL_CATALOG.md', gm, 'utf8');
console.log('catalog exported:', ALL_CARDS.length, 'cards,', GENERALS.length, 'generals');

import { UNO_CLASSIC_108, UNO_CLASSIC_112, UNO_TEAMS_112 } from '../dist-server/games/uno/cards.js';

let um = '# UNO —— 卡牌目录（三套牌组，由数据层自动生成）

';
um += '> 生成来源：\；数量断言见 \。

';
const kindL = { number: '数字', draw2: '+2', reverse: '反转', skip: '跳过', wild: '万能', wild_draw4: '万能+4', wild_swap: '万能换手', wild_custom: '万能自定义', wild_team_play: '团队万能', wild_team_draw4: '团队+4' };
const colorL = { R: '红', Y: '黄', G: '绿', B: '蓝' };
for (const [title, cards] of [['经典 108 张', UNO_CLASSIC_108], ['经典扩展 112 张', UNO_CLASSIC_112], ['UNO Teams 112 张', UNO_TEAMS_112]]) {
  um += \;
  for (const c of cards) {
    um += \\;
  }
  um += '
';
}
writeFileSync('docs/uno/CARD_CATALOG.md', um, 'utf8');
console.log('UNO catalog exported');
