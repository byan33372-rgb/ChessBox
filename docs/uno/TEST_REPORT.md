# UNO —— 测试报告

- 日期：2026-11-07

## 1. 新增测试

| 文件 | 覆盖 | 项数 |
| --- | --- | ---: |
| `uno-cards.test.ts` | 三套牌组数量/混版隔离/积分/匹配/Passing Symbol | 6 |
| `uno-engine.test.ts` | 经典流程/+4 质疑/UNO 喊牌/Teams 传牌/TeamPlay/TeamDraw4/出局回归/退化 | 16 |
| `uno-rooms.test.ts` | 3 人整轮/4 人 Teams 整轮/幂等/过期/脱敏 | 3 |
| `uno.spec.ts` (e2e) | 首页卡/准备/桌面渲染/抽牌/320px | 3 |

## 2. 全量回归

| 套件 | 结果 |
| --- | ---: |
| vitest unit + integration（含全部新测试） | **397/397** |
| Playwright e2e（全站含 SG + UNO） | **33/33** |

## 3. 开发过程中发现并修复的缺陷

| 缺陷 | 修复 |
| --- | --- |
| 跨 profile ID 冲突（三套牌组各自计数器） | ID 加 profile 前缀 |
| 起始 +2 未执行罚抽 | begin() 立即罚抽并跳过 |
| Team Play 选色归属错误（应出牌者选色而非队友） | 出牌者选色 → teamJumpTo 机制 |
| Team 出局/回归逻辑（回归者 isOut 未重置） | OUT_RETURN 设 isOut=false |
| Teams 模式下个人清空即判胜（应为队伍两人都清空） | checkRoundEnd 区分 FFA/Teams |
| Passing Symbol 标记数量误写 18（实际 36） | 修正为 36 |
| UNO 限流过低导致浸泡/集成超时 | 专用 unoLimit 30 突发/12 每秒 |
| 限流拒绝不回视图 → 客户端困在过期视图 | 限流 ack 携带最新视图 |

## 4. 未覆盖/限制

- 30 分钟浸泡未跑（聚焦三国杀）
- 模糊测试未做
- 真机 iOS/Android 未测
