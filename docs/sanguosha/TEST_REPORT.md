# 三国杀·自由混战 —— 测试报告（TEST_REPORT）

- 日期：2026-11-07
- 环境：Node v24 / Windows / vitest 3.2 / Playwright 1.64 / 真实 Chrome

## 1. 基线确认（开发前）

- 五棋 vitest 296/296 通过（开发前实测记录）
- 五棋 e2e 27/27 通过

## 2. 新增测试

### 单元（vitest）

| 文件 | 覆盖 | 项数 |
| --- | --- | ---: |
| `sg-cards.test.ts` | 160 张牌堆数量/类别/唯一 ID/矩阵/EX/花色方向 | 16 |
| `sg-engine.test.ts` | 开局/回合流转/杀闪/濒死/距离/空城/谦逊 | 9 |
| `sg-effects.test.ts` | 锦囊（决斗/南蛮/五谷/火攻/借刀/铁索/延时）/装备/酒 | 16 |
| `sg-skills.test.ts` | 27 名武将技能正向路径 | 28 |
| `uno-cards.test.ts` | 三套牌组数量/混版隔离/积分/匹配/Passing Symbol | 6 |
| `uno-engine.test.ts` | UNO 匹配/抽牌/+4 质疑/UNO 喊牌/Teams 传牌/退化 | 16 |

### 集成（真实 Socket）

| 文件 | 覆盖 | 项数 |
| --- | --- | ---: |
| `sg-rooms.test.ts` | 建房/选将/自动开局/重复拒/隐藏手牌/幂等/过期/3 人整局/4 人整局/观战 | 7 |
| `uno-rooms.test.ts` | 3 人经典整轮/4 人 Teams 整轮（含传牌/TeamPlay/TeamDraw4）/幂等 | 3 |

### e2e（真实 Chrome）

| 文件 | 覆盖 | 项数 |
| --- | --- | ---: |
| `sanguosha.spec.ts` | 首页卡/选将/桌面/结束回合/320px | 3 |
| `uno.spec.ts` | 首页卡/准备/桌面/抽牌/320px | 3 |

## 3. 全量回归

| 套件 | 结果 |
| --- | ---: |
| vitest unit + integration（含全部新测试） | **397/397** |
| Playwright e2e（全站含 SG + UNO） | **33/33** |
| layout-check（7 卡片） | 全部通过 |
| sec-check（安全探测） | 9/9 |
| ux-check | 9/9 |
| viewport-check（55 视口矩阵） | 全部通过 |

## 4. 开发过程中发现并修复的缺陷

| 缺陷 | 修复 |
| --- | --- |
| 延时锦囊判定后先弹出判定区，出牌阶段读不到 → 跳过失效 | 用 flags.skipPlay/skipDraw 记录判定结果 |
| 转换牌进判定区按物理名结算（国色方块闪→被丢弃） | 加 delayedAs 映射（效果名 ≠ 物理名） |
| 游戏结束后仍打开弃牌窗口 | runTurn 各阶段后检查 winner |
| 八卦阵哨兵 'bagua' 被当牌 ID 查询 → crash | 返回真实判定牌 ID |
| 客户端输入错误在流程深处 throw → 整局死亡 | 命令入口统一深度校验 + 火攻不匹配视为放弃 |
| 跨包 ID 冲突（std/jz 各自计数器） | ID 加包前缀 + 全局序号 |
| 铁索连环 use 后未询问目标 | 引擎询问 1–2 名 |
| UNO 起始 +2 未执行罚抽 | begin() 立即罚抽 |
| Team Play 选色归属错误（应出牌者选色） | 出牌者选色 → 选色后跳转队友 |
| Team 出局/回归逻辑错误 | 出完者 isOut=true；队友 ≥2 张传一半回归 isOut=false |
| 三国杀持久化 OOM（每命令 JSON.stringify 全量 history） | 节流：每 10 条命令或每 5 秒持久化一次 |
| 限流拒绝不回视图 → 客户端困在过期视图 | 限流 ack 也携带最新视图 |

## 5. 未覆盖/限制

- 30 分钟浸泡基础设施已实现，首次运行暴露持久化 OOM（已修复节流）；修复后的 30 分钟浸泡结果见 `SOAK_REPORT.md`
- 模糊测试/渗透测试未做
- 真机 iOS/Android 未测
