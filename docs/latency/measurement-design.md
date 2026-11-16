# 阶段二：全链路延迟测量设计

目标：把「点击 → 本机可见 → 对手可见 → 动画完成」拆成可复现的分段，定位真实瓶颈；不伪造、不用跨设备 `Date.now()` 相减、不影响正常玩家。

## 1. 时间轴（T0–T9）

| 标记 | 含义 | 采集位置 | 时钟 |
| --- | --- | --- | --- |
| T0 | 点击/落子意图 | 客户端点击处理器 | `performance.now()` |
| T1 | 客户端发出 `game:move` | `roomClient.actions.move` | `performance.now()` |
| T2 | 服务端收到事件 | `socket.on('game:move')` 首行 | Node `performance.now()` |
| T3 | 校验完成 | `applyPlayerMove` 校验后 | 同上 |
| T4 | 规则计算完成 | `engine.applyMove` 后 | 同上 |
| T5 | 持久化完成 | `appendMoveAndSaveRoom` 后 | 同上 |
| T6 | 权威状态构建完成 | `publicState` 后 | 同上 |
| T7 | 广播 emit 完成 | `broadcast` 调用后 | 同上 |
| T8 | 对手收到广播 | 客户端 `room:state` 回调 | 对手 `performance.now()` |
| T9 | 对手棋盘绘制完成 | 双 `requestAnimationFrame` 后 | 同上 |

约束：

- 服务端与客户端各自使用单调时钟，**只做同进程内相减**。
- 不做「客户端 A 的 Date.now() − 客户端 B 的 Date.now()」；跨设备只比较**时长**（各自 RTT、各自渲染耗时）。
- 动画完成单独测量（跳棋飞子 240 ms；其余棋盘为 CSS 过渡），不并入「逻辑可见」。

## 2. 事件标识与幂等

- 每手走棋携带客户端生成的 `requestId`（UUID），服务端在 `room.moveAcks` 缓存 200 条：重复请求返回同一 ack，不重复落子（SEC-004）。
- `revision` 为房间单调版本号，服务端严格校验；旧事件/迟到事件不会覆盖新状态。
- 广播 `room:state` 携带完整 `state.revision`；客户端收到低版本直接忽略（当前实现为覆盖，后续可加显式忽略，见优化报告）。
- `eventId` 当前未单独引入：`requestId` + `revision` 已能唯一标识一手；再引入 `eventId` 属于冗余，故不增加协议字段（在最终报告说明）。

## 3. RTT 测量

- 客户端每 3 s 发送 `latency:ping`，服务端只回 `{ok:true, t:Date.now()}`，不触碰房间状态。
- 客户端取最近 20 个样本的中位数作为 RTT 展示值；同时保留样本数。
- RTT 包含：客户端 → 网络 → 服务端 → 网络 → 客户端；不含服务端业务处理（业务处理另行用 `serverTiming.totalMs` 展示）。
- 不使用 Socket.IO 内部 ping 作为业务 RTT（其间隔 20 s，粒度太粗）。

## 4. 服务端分项（随 ack 返回）

```ts
interface ServerTiming {
  queueMs: number;      // 收到事件 → 进入房间队列
  validateMs: number;   // 座位/回合/版本/幂等
  applyMs: number;      // 规则引擎
  persistMs: number;    // SQLite 事务
  stateMs: number;      // publicState
  broadcastMs: number;  // io.to().emit 调用（不含内部异步序列化）
  totalMs: number;      // 收到事件 → ack 前
}
```

- 只随 `game:move` ack 返回，**不广播给对手**，避免泄露服务端内部耗时与增加载荷。
- 幂等缓存命中时返回同一 `serverTiming`（表示首次处理耗时），并注明这是缓存值。
- 失败路径不返回分项（避免为诊断增加失败路径开销）。

## 5. 客户端指标

| 指标 | 定义 |
| --- | --- |
| `ackMs` | T1 → 收到 ack |
| `serverTiming` | 服务端返回的分项 |
| `renderMs` | 收到 `room:state` → 双 rAF 后（近似下一次绘制） |
| `rttMs` | 最近 20 次 `latency:ping` 中位数 |
| `transport` | `websocket` / `polling` |
| `reconnects` | 连接建立次数（排除首次） |
| `timeouts` | ack 超过 7 s 的次数 |
| `stateVersion` | 当前 `revision` |
| `lastMove.requestId` | 最近一手请求 ID（面板只显示前 8 位） |

## 6. 分位数与验收口径

- 报告 P50 / P95 / P99 / Max / 均值，以及 >300 / >500 / >1000 / >2000 ms 计数；不只报平均值。
- 样本量：每组 ≥30 手（polling 对照 8 手，因其单次成本高，单独标注）。
- 离群值不剔除，单独列出发生的手数与时刻。
- 验收目标（任务书）：本机点击→可见 P95 ≤50 ms；服务端处理 P95 ≤50 ms；局域网 P95 ≤100 ms；同区域公网 P95 ≤300 ms；>500 ms 分析；>1000 ms 严重；≈2000 ms 在受控正常网络下视为严重缺陷。

## 7. 采样、开关与隐私

- 服务端分项：**始终计算**（`performance.now()` 两次调用，成本 <0.01 ms），但只在 ack 中返回；不写日志、不落库。
- 客户端 ping：仅在对局页启用，3 s 一次；离开房间清除定时器。
- 开发者面板：默认隐藏；`?latency=1` 或 `Ctrl+Shift+L` 开启，`localStorage['dc:latency']` 记忆；普通玩家看不到。
- 面板不显示令牌、聊天内容、对手姓名；`requestId` 只显示前 8 位。
- 服务端不记录任何每手延迟日志，避免日志 I/O 进入关键路径。

## 8. 已实现 vs 未实现

已实现：

- 服务端 `serverTiming` 全分项；
- 客户端 RTT、ack、render、transport、重连/超时、stateVersion；
- 开发者面板；
- 探针脚本（本地/隧道/polling）。

未实现/未验证：

- 真正的 T0（指针按下）与 T9（动画完成）全链路串联：当前 T0 由点击处理器内调用 `actions.move` 的时刻近似，T9 用双 rAF 近似绘制完成；动画完成时间未单独上报到面板。
- 跨设备时钟对齐（NTP 式偏移估计）：未做，按设计不需要。
- 服务端事件循环延迟（event loop lag）采样：未做；本轮用「queueMs + totalMs」间接观察。
- 生产环境采样率控制：当前面板按需开启，无自动上报，故无需采样率。

## 9. 复现命令

```bash
# 本地 WS
node scripts/latency-probe.mjs --url http://127.0.0.1:3001 --moves 30 --label local --out docs/latency/raw/local.json

# 公网隧道 WS
node scripts/latency-probe.mjs --url https://<tunnel>.trycloudflare.com --moves 20 --label tunnel --out docs/latency/raw/tunnel.json

# 强制 polling 对照
node scripts/latency-probe.mjs --url https://<tunnel>.trycloudflare.com --moves 8 --transport polling --label polling --out docs/latency/raw/polling.json
```

浏览器端：打开对局页 `?latency=1`，面板显示 transport / RTT / 点击→ack / 服务端分项 / 事件→棋盘 / 重连 / stateVersion。
