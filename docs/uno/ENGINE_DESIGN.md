# UNO 模块 —— 引擎设计（ENGINE_DESIGN）

## 1. 总体架构

```
客户端（UnoTable.tsx）
   │  uno:command { commandId, expectedRevision, action }   ← 仅"意图"
   ▼
Socket 层：zod 校验 → 会话/座位鉴权 → unoLimit 限流（30 突发/12 每秒）→ 房间队列
   ▼
UnoGame.command()：幂等 → 版本校验 → 阶段/窗口分发
   ▼
规则引擎（engine.ts）：唯一可变权威状态 st: UnoState
   ▼
uno:state（个性化脱敏视图，每 socket 独立）+ persistUno（SQLite 命令历史）
```

## 2. 状态机

```
select ──(全员 ready)──→ playing ──(先清空手牌)──→ roundEnd
                           │
                           ├─ pending: choose-color（万能牌出牌后）
                           ├─ pending: challenge（+4 出牌后，下家响应）
                           ├─ pending: team-pass（Teams 开局传牌）
                           └─ pending: swap-target（换手牌选目标）
```

- 方向 `direction: 1 | -1`（reverse 翻转）
- `pendingDraw > 0` 表示有未执行的强制抽牌（+2/+4/自定义牌效果）
- Teams 模式：`teamPassDone` 控制开局传牌完成后才开始正常出牌

## 3. 出牌效果分发

| 牌 | 效果 |
| --- | --- |
| number | 匹配颜色/数字；Passing Symbol 触发队友随机交换 |
| draw2 | 下家罚抽 2 + 跳过 |
| reverse | 方向翻转 |
| skip | 下家跳过 |
| wild | 选色 |
| wild_draw4 | 下家罚抽 4 + 跳过 + 质疑窗口 |
| wild_swap | 选目标交换手牌 + 选色 |
| wild_custom | 预置模板：下家罚抽 3 + 选色 |
| wild_team_play | 选色 → 跳转到队友回合 |
| wild_team_draw4 | 下家罚 4 + 其队友罚 2 + 选色（孤立玩家退化为下家罚 4） |

## 4. Teams 机制

- 选队：`set-team` 命令（phase=select 时）；ready 后锁定
- 开局传牌：pending team-pass，全员提交后原子交换
- Team Play：出牌者选色 → `teamJumpTo` 队友 → 队友继续出牌
- 出局/回归：出完手牌 → isOut=true；队友抽牌时传半数 → 回归
- 队伍获胜：两名成员手牌均为 0

## 5. +4 质疑

出牌者打出 wild_draw4 后：
1. 服务端记录 `colorBeforeChallenge`
2. pending challenge → 下家
3. 下家响应 challenge true/false
4. true → 检查出牌者是否确实无该颜色 → 无则质疑成功（出牌者罚 4）/有则质疑失败（质疑者罚 6）
5. false → 下家罚 4

## 6. 恢复

与三国杀相同模式：serialize 保存 {seed, order, deckProfile, ruleProfile, teams, history}；deserialize 重放全部命令。SQLite `rooms.uno_json`。
