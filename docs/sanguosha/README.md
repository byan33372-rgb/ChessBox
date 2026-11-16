# 三国杀·自由混战（sanguosha_free_for_all）模块说明

## 玩法边界

- **3~4 人真人在线混战**；无身份、无阵营、无队友；最后一名存活玩家获胜。
- 使用 2013 标准版 27 名武将 + 160 张牌堆（标准 108 含 4 EX + 军争 52）。
- 服务端权威：洗牌/摸牌/判定/伤害/濒死/死亡/胜负全部由服务端规则引擎结算；客户端只提交意图。
- 隐藏信息安全：手牌只发给本人；他人只能看到数量；牌堆顺序永不下发。

## 进入方式

1. 首页第 6 张卡「三国杀·自由混战」，选择 3 人 / 4 人 → 创建房间。
2. 朋友通过邀请链接加入（平台统一房间/令牌/重连机制）。
3. 房间内每位玩家从 27 名武将中选择 1 名（重复不可选；主公技显示禁用）。
4. 全员选将后自动开局：随机先手 → 每人 4 张起手 → 回合制混战。

## 对局操作

- 出牌阶段：点击手牌（合法牌高亮；非法目标不可点并显示原因）→ 点选目标 → 确认。
- 技能：出牌阶段下方技能按钮（主动技）；锁定技自动触发。
- 响应窗口：闪/杀/桃/无懈可击——面板列出当前可打出的牌与放弃按钮。
- 濒死：任何存活玩家可按「本人→顺时针」顺序用桃救援（酒限自救）。
- 弃牌阶段：按体力弃至手牌上限（吕蒙克己可跳过）。
- 战报：右侧实时滚动；终局可导出 JSON / TXT。

## 文件结构

| 文件 | 职责 |
| --- | --- |
| `src/games/sanguosha/cards.ts` | 160 张牌数据与牌堆构建 |
| `src/games/sanguosha/generals.ts` | 27 名武将元数据与技能描述 |
| `src/games/sanguosha/types.ts` | 权威状态结构 |
| `src/games/sanguosha/rng.ts` | 种子随机（可复现） |
| `src/games/sanguosha/engine.ts` | 规则引擎（回合/距离/伤害/濒死/响应/判定） |
| `src/games/sanguosha/skills.ts` | 技能钩子实现 |
| `src/games/sanguosha/adapter.ts` | GameEngine 占位适配（房间系统集成） |
| `src/server/rooms.ts` / `socket.ts` / `store.ts` | 房间接入 / `sg:command`+`sg:state` / SQLite 持久化 |
| `src/client/components/SanguoshaTable.tsx` | 对局桌面 UI |

## 测试

- 数据层：`tests/unit/sg-cards.test.ts`（16 项）
- 引擎：`tests/unit/sg-engine.test.ts`（9）+ `sg-effects.test.ts`（16）+ `sg-skills.test.ts`（28）
- 联机：`tests/integration/sg-rooms.test.ts`（7，含 3/4 人整局机器人完成）
- 浏览器：`tests/e2e/sanguosha.spec.ts`（3）
- 浸泡：`scripts/sg-soak.mjs`（30 分钟）→ `SOAK_REPORT.md`

## 文档

- `RULES_DECISIONS.md`：规则来源/版本差异/自由混战裁定
- `FREE_FOR_ALL_RULES.md`：玩家可读完整规则
- `CARD_CATALOG.md` / `GENERAL_CATALOG.md`：自动生成的逐张/逐将目录
- `ENGINE_DESIGN.md`：协程状态机/响应栈/伤害管线
- `SECURITY_REPORT.md` / `TEST_REPORT.md` / `SOAK_REPORT.md` / `RELEASE_CHECKLIST.md`
