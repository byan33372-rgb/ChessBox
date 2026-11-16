# 三国杀·自由混战 —— 引擎设计（ENGINE_DESIGN）

## 1. 总体架构

```
客户端（SanguoshaTable.tsx）
   │  sg:command { commandId, expectedRevision, action }   ← 仅"意图"
   ▼
Socket 层（socket.ts）: zod 校验 → 会话/座位鉴权 → 限流 → 房间队列串行化
   ▼
SanguoshaGame.command()：幂等 → 版本校验 → 阶段匹配 → 窗口动作深度校验 → 驱动协程
   ▼
规则引擎（engine.ts + skills.ts）：唯一可变权威状态 st: SgState
   ▼
sg:state（个性化脱敏视图，每 socket 独立） + persistSanguosha（SQLite 命令历史）
```

## 2. 协程状态机（generator 驱动）

- 整局流程是一个 generator（`gameLoop → runTurn → playPhase/resolveSha/resolveDamage/…`）。
- 需要玩家输入处 `yield` 一个 **Wait 窗口**；驱动器 `pump()` 挂起并把窗口记为 `pending`。
- 命令到达 → `validateWaitCommand`（身份/阶段）+ `validateWindowAction`（深度语义校验：牌在手、数量、选项成员、目标候选、观星子集）→ `waitToResult` → `pump(result)` 续跑。
- **客户端输入永远无法在流程深处抛错**：所有可由输入触发的错误都在入口被拒绝；流程内 throw 仅代表引擎内部断言（记 ENGINE_ERROR 日志，冻结对局——集成测试证明正常对局不触发）。
- 深度保护：`resolveDepth > 32` 时停止新的伤害结算（防递归）。

Wait 类型：`play / respond / discard / choose / cards / targets / guanxing`。

## 3. 响应与嵌套

- **无懈可击链**：`nullifyChain()` 递归 generator——从使用者下家顺时针询问持无懈者；打出后对"该无懈"再开反制链；反制成立则原效果继续存活（继续询问）。语义为开关翻转，测试覆盖。
- **濒死**：`dyingFlow()` 生成唯一 windowId 的窗口序列（本人→顺时针），每张桃即时复查体力；全 pass → 死亡。
- **杀**：流离转移 → 铁骑判定 → 仁王盾 → 闪响应（无双 ×2、八卦阵判定替代、青龙刀追加、贯石斧强命）→ 伤害管线。
- **AOE**：从使用者下家按座次逐个「无懈 → 响应 → 结算」。

## 4. 伤害管线 resolveDamage()

伤害前修正（白银狮子/藤甲/寒冰剑/麒麟弓）→ 扣血 → 濒死 → 受伤后技能（奸雄/反馈/刚烈/遗计/耀武，按技能表顺序）→ 连环传导（先解除自身横置，传导同属性伤害给下一名横置者）。

**同批死亡**：`resolveDepth > 0` 时不判胜；链条回到 0 统一 `checkVictory()`——实现"同一结算批次全员死亡=平局"。

## 5. 状态与视图

- 权威状态 `SgState`：players（手牌/装备/判定区/横置/flags）、drawPile/discardPile/processing、delayedAs（判定区效果名映射，支持转换牌）、revision、log、rng。
- **视图**：`view(seat)` 个性化——myHand 仅本人；他人只有 handCount；pending 附 legalCards/hints（合法性全部服务端算好）；log 只含公开事件。
- 牌张完整性：`locationOfAll()` 断言 160 张各在唯一区域（draw/discard/processing/hand/equip/judgment）。

## 6. 随机与恢复

- mulberry32 种子随机（seed+counter 入状态）；测试注入固定种子；生产用 crypto 级种子。
- **恢复 = 命令重放**：serialize 保存 {seed, order, deckConfig, history[]}；deserialize 重建引擎并重放全部已验证命令——洗牌顺序、挂起窗口、revision 完全一致。SQLite `rooms.sg_json` 每条命令后事务化更新。

## 7. 超时托管

socket 层为每个房间维护 `sgTimers`：出现 pending 窗口后 45s 无人响应 → `forceAuto()`（响应 pass / 弃牌最少张 / 选择最后一项 / 出牌结束）→ 广播。限流拒绝的 ack 也携带最新视图，客户端不会困在过期状态。

## 8. 房间集成

- `GameKind += 'sanguosha'`；`SanguoshaStubEngine` 占位实现 GameEngine（棋类协议对其全非法），房间/座位/限流/聊天/重连全部复用。
- `Schemas.create` 支持 seatCount 3/4；满员后不自动开局——全员 `select-general` 后引擎 `begin()`。
- 断线重连：现有 rejoin 令牌机制不变；重连后由广播拿到新的个性化视图（含 pending 提示）。
