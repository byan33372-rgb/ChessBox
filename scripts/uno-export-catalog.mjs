import { writeFileSync, mkdirSync } from 'node:fs';
import { UNO_CLASSIC_108, UNO_CLASSIC_112, UNO_TEAMS_112 } from '../dist-server/games/uno/cards.js';

const kindL = { number: '数字', draw2: '+2', reverse: '反转', skip: '跳过', wild: '万能', wild_draw4: '万能+4', wild_swap: '万能换手', wild_custom: '万能自定义', wild_team_play: '团队万能', wild_team_draw4: '团队+4' };
const colorL = { R: '红', Y: '黄', G: '绿', B: '蓝' };

let um = '# UNO —— 卡牌目录（三套牌组，由数据层自动生成）\n\n';
um += '> 生成来源：`src/games/uno/cards.ts`；数量断言见 `tests/unit/uno-cards.test.ts`。\n\n';
for (const [title, cards] of [['经典 108 张', UNO_CLASSIC_108], ['经典扩展 112 张', UNO_CLASSIC_112], ['UNO Teams 112 张', UNO_TEAMS_112]]) {
  um += `## ${title}\n\n| ID | 类型 | 颜色 | 数字 | 分值 | Passing Symbol |\n|---|---|---|---|---|---|\n`;
  for (const c of cards) {
    um += `| \`${c.id}\` | ${kindL[c.kind]} | ${c.color ? colorL[c.color] : '—'} | ${c.number ?? '—'} | ${c.score} | ${c.hasPassingSymbol ? '✓' : ''} |\n`;
  }
  um += '\n';
}

mkdirSync('docs/uno', { recursive: true });
writeFileSync('docs/uno/CARD_CATALOG.md', um, 'utf8');
console.log('UNO catalog exported:', UNO_CLASSIC_108.length + UNO_CLASSIC_112.length + UNO_TEAMS_112.length, 'cards total');
