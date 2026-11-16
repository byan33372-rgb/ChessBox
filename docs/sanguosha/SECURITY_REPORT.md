# 三国杀·自由混战 —— 安全报告（SECURITY_REPORT）

- 日期：2026-11-07
- 范围：隐藏信息安全 / 命令伪造 / 重放与并发 / 跨房间 / 输入校验 / 持久化安全

## 1. 隐藏信息安全

| 信息 | 保护机制 | 验证 |
| --- | --- | --- |
| 手牌 | view(seat) 个性化：myHand 仅本人；他人仅 handCount；广播按 socket 单发（adapter.rooms 遍历） | 集成测试三视图交叉断言 |
| 牌堆顺序 | 永不下发；只发 drawCount | 视图无 pile 字段 |
| 判定牌 | 抽取前不公开；判定结果公开（JUDGE_RESULT 事件） | 规则允许 |
| 战报 | 仅公开事件（CARD_USED 公开花色点数；DRAW_HIDDEN 只报数量） | 无手牌字段 |
| 武将选择 | 选将前不公开他人武将；selected 后公开（信息应有） | 广播 |

**重连不泄露**：重连走 `room:rejoin`（令牌哈希鉴权）→ 个性化视图。

## 2. 命令伪造

- 会话绑定：`sg:command` 以 `socket.data.session`（令牌哈希）取座位，不信任 payload。
- 伪造牌 ID：深度校验 `validateWindowAction`——respond 牌必须在 legalCards（服务端算好）；discard/cards 必须在本人 hand；targets 必须在 candidates；choose 必须在 options。
- 伪造效果/判定/伤害：客户端只提交意图；引擎唯一计算。
- 出牌合法性：playableTargets（距离/空城/谦逊/次数）服务端执行。
- 观战者：NOT_PLAYER 拒绝（集成测试覆盖）。

## 3. 重放/并发/幂等

- commandId 集合幂等（集成测试：同 ID 双发同 revision）。
- expectedRevision 过期 → STALE_REVISION（集成测试）。
- 房间队列 enqueue 串行化。
- 快速连点：zod + 限流（moveLimit 20 突发/2 每秒）+ 深度校验三道闸。
- 限流拒绝 ack 携带最新视图，客户端不困在过期状态。

## 4. 输入校验

- zod schema：commandId 8–64 位；expectedRevision 非负整数或 null；action.type max(24) + passthrough。
- 深度校验 validateWindowAction 拒绝不合法参数。
- 聊天复用现有 chat:send 校验；React 转义 + CSP。
- 不 eval、不动态执行字符串（任务书禁止项核查通过）。
- 事件链深度：resolveDepth > 32 保护。

## 5. 持久化安全

- 令牌仅存哈希（现有机制）。
- sg_json 只含命令历史（客户端已提交的公开意图），不含秘密。
- 可空附加列向前迁移（不删除旧数据）。
- 持久化节流（每 10 条命令或每 5 秒）防 OOM。
- 服务端日志不打印手牌/牌堆顺序。

## 6. 测试矩阵

| 场景 | 测试 |
| --- | --- |
| 他人手牌泄露 | `sg-rooms.test.ts` 三视图交叉断言 |
| 伪造响应牌 | validateWindowAction + 集成幂等/过期 |
| 观战者操作 | 集成：第 4 人观战 select-general 被拒 |
| 重放/幂等 | 集成：同 commandId 双发 |
| 过期 revision | 集成 |
| 输入畸形 | zod + 集成重复武将拒绝 |
| 游戏结束后操作 | 集成 GAME_ENDED |
| 跨房间 | 现有 session/room 鉴权（不变） |

## 7. 未覆盖/限制

- 未做模糊测试/渗透测试。
- 限流为单机内存桶。
- HTTPS 由 Cloudflare 隧道终结。
