# UNO 模块说明

## 玩法边界（首版）

- **3~4 人真人在线**；经典个人混战（先出完手牌者获胜）。
- 牌堆：经典 108 张（`uno_classic_108`）。扩展 112（`uno_classic_112`，含换手牌+3 张预置自定义牌）与 UNO Teams 112（`uno_teams_112`）已实现牌堆与引擎，房间创建默认 108。
- 服务端权威：洗牌/匹配/罚抽/方向/UNO 漏喊/传牌/胜负全部服务端结算。
- 隐藏信息安全：手牌只发本人；他人只有手牌数量。

## 模式

| 模式 | 规则配置 | 人数 | 说明 |
| --- | --- | --- | --- |
| 经典个人混战 | classic_ffa | 3~4 | 默认；先出完手牌者胜 |
| UNO Teams 官方 | classic_teams_official | 4（2v2） | 两名成员都清空才获胜 |
| 3 人 2v1（平台自定义） | classic_teams_2v1_custom | 3 | 孤立玩家团队牌退化；界面明示非官方 |

## 对局操作

- 点击手牌出牌（不匹配的牌置灰，不可点击，title 显示原因）
- 无可出牌时点「抽 1 张」；剩 2 张时点「UNO!」喊牌
- 万能牌出牌后弹出颜色选择
- Teams 模式：开局前点 A/B 选队 → 全员 ready → 开局传牌（点击手牌选 1 张，双方秘密交换）
- 战报：右侧实时滚动

## 关键规则

- 匹配：颜色相同 / 数字相同 / 符号相同 / 万能牌任意
- +2：下家罚抽 2 跳过；+4：下家罚抽 4 跳过（可质疑：非法出牌者罚 4，质疑失败罚 6）
- 反转：方向翻转；跳过：下家失去回合
- UNO 喊牌：剩 2 张时喊；漏喊被抓罚抽 2 张
- Teams：开局传牌、Team Play（跳转到队友）、Team Draw Four（下家+4 其队友+2）、Passing Symbol、出局/回归
- 起始牌：+2 → 先手罚抽 2 跳过；反转 → 方向翻转；跳过 → 先手跳过；+4 → 放回重翻

## 文件

| 文件 | 职责 |
| --- | --- |
| `src/games/uno/cards.ts` | 三套牌组构建 + 匹配规则 |
| `src/games/uno/engine.ts` | 规则引擎（状态机/回合/罚抽/Teams/UNO） |
| `src/games/uno/adapter.ts` | GameEngine 占位适配 |
| `src/client/components/UnoTable.tsx` | 对局桌面 UI |
| `tests/unit/uno-cards.test.ts` | 牌组数量断言（6 项） |
| `tests/unit/uno-engine.test.ts` | 引擎规则（16 项） |
| `tests/integration/uno-rooms.test.ts` | 联机整轮（3 项） |
| `tests/e2e/uno.spec.ts` | 浏览器流程（3 项） |
| `docs/uno/RULES_DECISIONS.md` | 规则裁定记录 |
