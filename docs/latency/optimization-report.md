# 阶段四–七：优化实施报告

- 时间：2026-11-05
- 原则：不重写项目、不改五棋规则、不跳过服务端校验、不丢有效走棋、不换技术栈、不购买付费资源。
- 结论：**在不削弱一致性的前提下，把「落子者本机可见」从约 470 ms（公网）降到 1–2 ms；对手可见仍由物理链路决定（P50 473 ms）；服务端处理未劣化（0.45–0.87 ms）。**

## 1. 改动清单

| 编号 | 改动 | 文件 | 目的 | 风险控制 |
| --- | --- | --- | --- | --- |
| OPT-001 | 服务端分阶段计时 `serverTiming` | `src/shared/protocol.ts`、`src/server/rooms.ts`、`src/server/socket.ts` | 定位真实瓶颈，区分队列/校验/规则/落库/状态/广播 | 只增加 `performance.now()` 调用，不改变走棋顺序；失败路径不计时 |
| OPT-002 | 延迟探针 `latency:ping` | `src/server/socket.ts`、`src/shared/protocol.ts` | 客户端 3 s 一次 RTT，不触碰对局状态 | 只回 `{ok,t}`，无房间副作用 |
| OPT-003 | 客户端延迟采集 + 开发者面板 | `src/client/net/roomClient.ts`、`src/client/components/LatencyPanel.tsx`、`src/client/views/Room.tsx`、`styles` | 展示 transport/RTT/ack/服务端分项/事件→绘制/重连/超时 | 默认隐藏；`?latency=1` 或 `Ctrl+Shift+L`；不含令牌/聊天 |
| OPT-004 | **乐观落子 + 回滚** | `src/client/views/Room.tsx` | 落子者点击即见，不等 RTT；服务端拒绝时回滚并同步权威局面 | 用同一规则引擎本地预览；只影响展示层；权威状态仍以 ack/广播为准；特殊动作（pass/数子/标记）不走乐观层 |
| OPT-005 | polling 传输看门狗 | `src/client/net/roomClient.ts` | 检测到 polling 时最多 2 次强制重连，重新尝试 WS 升级 | 保留 polling 兜底（兼容性）；限次避免重连风暴 |
| OPT-006 | 旧版本状态防回退 | `src/client/net/roomClient.ts` | `room:state`/ack 的 revision 低于本地时忽略，防重连/乱序覆盖新状态 | 只忽略严格更低版本；同版本仍应用（座位/在线状态可能同版本变更） |
| OPT-007 | 持久化失败回滚 | `src/server/rooms.ts` | 落库抛错时回退内存局面/棋谱/版本/outcome/offers，再返回错误 | 用 `move.fenBefore` 重建引擎；不影响成功路径 |
| OPT-008 | 动效三档 | `animPref.ts`、`Room.tsx`、`PracticeBoard.tsx` | 普通 180 ms / 快速 90 ms / 关闭；跳棋飞子 240/120 ms | 只改 CSS 变量与时长；规则/状态不变；`prefers-reduced-motion` 仍强制关闭 |
| OPT-009 | 测量脚本 | `scripts/latency-probe.mjs`、`latency-browser.mjs`、`latency-five-games.mjs`、`latency-proxy.mjs`、`latency-reconnect.mjs`、`stress-rooms.mjs`、`mobile-latency.mjs` | 可复现的本地/隧道/polling/弱网/重连/压力/移动端矩阵 | 只读协议客户端，不修改服务端数据（除正常建房） |
| OPT-010 | 320 px 横向溢出修复（DEF-LAT-001） | `src/client/styles/app.css` | 昵称/房间号输入框在 320 px 不再撑破卡片 | 仅 `min-width:0`/`flex-wrap`，桌面布局不变；layout/viewport/rwd 全部复测 |
| OPT-011 | 国象席位文案修正（DEF-LAT-002） | `src/client/views/Room.tsx` | 国象 a=白方（先手）、b=黑方；此前 my-seat/回合/最近一步把 a 显示成黑方 | 仅展示映射；棋规/服务端不变；新增 e2e 回归；net-check chess 15/15 |

## 2. 修复前后对比（真实数据）

| 指标 | 修复前 | 修复后 | 样本/条件 |
| --- | ---: | ---: | --- |
| 公网隧道 · 落子者点击→本机可见 | ≈472 ms（等 ack 才 setState） | **P50 1.1 ms / P95 2.0 ms** | 浏览器 12 手，WS |
| 本机 · 落子者点击→本机可见 | ≈4 ms（ack） | **P50 0.9 / P95 1.5 ms** | 浏览器 12 手，WS |
| 公网隧道 · 对手可见 | P50 416–473 ms | P50 473 ms | 未变（物理链路） |
| 本机 · 对手可见 | P50 0.77 ms | P50 2.3 ms（浏览器双 rAF 口径） | 口径不同，仍 <5 ms |
| 公网隧道 · 服务端 total | 0.45 ms | 0.45–0.75 ms | 20 手 |
| 本机 · 服务端 total | 0.87 ms | 0.87–1.42 ms（棋种差异） | 30 手 / 五棋各 6 手 |
| polling 单手 ack | 2.81 s | 2.81 s（对照未变） | 强制 polling；看门狗负责脱离 |
| 持久化失败一致性 | 内存前进但未落库/未广播 | 回滚后返回错误 | 代码路径，未做故障注入 |

说明：

- 「修复前落子者可见 ≈ ack」依据：旧客户端只有收到 ack 后才 `setState(ack.state)`，页面在该时刻才出现新棋子；同一次隧道测试的 ack P50 为 472.5 ms。
- 修复后落子者在点击后的下一个 DOM 变更就显示（MutationObserver 记录 1–2 ms），ack 仍在 ~472 ms 到达；两者解耦。
- 对手可见没有变化，且**不可能**通过前端降到 50 ms；它由「对手 ↔ 服务器」的物理路径决定。

## 3. 五棋场景矩阵（阶段七，真实走棋）

本机（`docs/latency/raw/five-games-local.json`，每棋 6 手）：

| 棋种 | ack P50 | ack P95 | 对手 P50 | 服务端 total 均值 |
| --- | ---: | ---: | ---: | ---: |
| 中象 | 1.70 ms | 2.32 ms | 1.82 ms | 1.11 ms |
| 国象 | 1.65 ms | 3.91 ms | 1.78 ms | 1.42 ms |
| 跳棋（2 人自由选座） | 1.00 ms | 1.15 ms | 0.96 ms | 0.43 ms |
| 围棋（19 路） | 1.11 ms | 1.66 ms | 1.15 ms | 0.58 ms |
| 五子棋 | 0.97 ms | 1.28 ms | 0.90 ms | 0.43 ms |

公网隧道（`five-games-tunnel.json`，每棋 6 手）：

| 棋种 | ack P50 | ack P95 | 对手 P50 | 服务端 total 均值 |
| --- | ---: | ---: | ---: | ---: |
| 中象 | 481.63 ms | 1380.41 ms | 487.81 ms | 0.84 ms |
| 国象 | 479.49 ms | 1440.29 ms | 557.08 ms | 1.07 ms |
| 跳棋 | 516.62 ms | 967.24 ms | 516.69 ms | 0.48 ms |
| 围棋 | 532.86 ms | 621.88 ms | 497.43 ms | 0.63 ms |
| 五子棋 | 512.78 ms | 1058.05 ms | 556.24 ms | 0.46 ms |

判读：五棋的延迟结构完全一致（服务端亚毫秒、网络占 99%+），说明瓶颈与棋种/规则无关。

## 4. 清单逐项状态

### SOCKET-001~020

| 项 | 状态 | 说明 |
| --- | --- | --- |
| 001 持久 WS | PASS | 实测 `websocket` |
| 002 transports/upgrade/ping | PASS | WS 优先，polling 兜底；20/25 s 心跳 |
| 003 保留 polling 兜底 | PASS | 保留 + 看门狗（最多 2 次重连尝试升级） |
| 004 每客户端一条连接 | PASS | 每房间一个 socket |
| 005 监听器清理 | PASS | effect cleanup disconnect |
| 006 不重复注册 | PASS | 单次注册 |
| 007 最小载荷 | PARTIAL | 仍为全量 RoomState；30 手 8.9 KB；已记录，未改协议 |
| 008 事件标准化 | PASS | 统一 `room:state`/`game:move` |
| 009 房间广播正确 | PASS | `io.to(roomId)` |
| 010 聊天不阻塞走棋 | PARTIAL | 聊天与走棋共用房间队列，但实测 <1 ms；未拆队列 |
| 011 统计不占关键路径 | PASS | 无统计写 |
| 012 eventId/requestId 去重 | PASS | requestId 幂等缓存 |
| 013 stateVersion 防旧覆盖 | PASS | 服务端 revision + 客户端严格低版本忽略 |
| 014 重连重复/乱序/补发 | PARTIAL | 重连全量恢复；无客户端 outbox 自动补发 |
| 015 明确 sent/validated/committed/rendered | PASS | 面板展示 ack/服务端分项/绘制 |
| 016 不排除对手 | PASS | 广播含发送者与对手 |
| 017 不低优先级批量走棋 | PASS | 立即 emit |
| 018 可靠重试/恢复 | PARTIAL | ack 超时提示；依赖重连全量恢复；无自动重发 |
| 019 幂等重复请求 | PASS | 同 requestId 返回同一 ack，不重复落子 |
| 020 走棋失败可恢复 | PASS | STALE_REVISION 返回最新状态；乐观层回滚 |

### SERVER-001~015（按任务书列出的关键项）

| 项 | 状态 | 说明 |
| --- | --- | --- |
| 001 精简关键路径 | PASS（未改） | 队列 0.05 ms；无冗余 await |
| 002 快速准确校验 | PASS | 校验 0.01 ms |
| 003 少重复计算/序列化 | PARTIAL | `publicState` 每手一次；未做增量 |
| 004 状态与棋谱一致 | PASS | 同一事务内落子+快照 |
| 005 事务/索引 | PASS | 复合主键 + 单事务 |
| 006 不阻塞事件循环 | PARTIAL | SQLite 同步 0.17–0.61 ms；未改异步 |
| 007 非关键异步队列 | PARTIAL | 聊天与走棋共用房间队列 |
| 008 房间并发原子 | PASS | 每房间 enqueue |
| 009 两手不能都成功 | PASS | revision + 队列 |
| 010 重连/重启恢复 | PASS | rejoin 全量 + SQLite 恢复 |
| 011 先测量再改持久化 | PASS | 已测量；未盲目改 |
| 012 失败一致性 | PASS | 本轮加入回滚 |
| 013 广播顺序 | PASS | ack 与广播同栈，实测同时到达 |
| 014 无重复写 | PASS | 1 move + 1 room |
| 015 负载下退化 | 未测 | 压力测试进行中 |

### FRONT-001~020（按任务书）

| 项 | 状态 | 说明 |
| --- | --- | --- |
| 001 立即选中反馈 | PASS | 选中环即时 |
| 002 快速合法提示 | PASS | 本地引擎 |
| 003 乐观 UI | PASS | 五棋均支持；实测 1–2 ms |
| 004 拒绝回滚 | PASS | 已实现；e2e 用「丢弃广播 + 延迟 ack」强制服务端拒绝，验证乐观标记先出现、ack 后回滚并提示 |
| 005 有效事件立即逻辑更新 | PASS | 广播即 setState |
| 006 动画与逻辑解耦 | PASS | 逻辑先更新，动画叠加 |
| 007 动画不阻塞下一事件 | PASS | 飞行层独立 |
| 008 关闭/失败时状态正确 | PASS | anim-verify 15/15 |
| 009 最后一步标记即时 | PASS | 乐观 move 作为 lastMove |
| 010 对手落子提示 | PASS | LastMoveBar + 标记 + toast |
| 011 不额外等 1–2 s | PASS | 无定时器等待 |
| 012 快速/普通/关闭 | PASS | 本轮三档；动画验证 15/15 |
| 013 低端手机优先 | 未测 | 移动端阶段 |
| 014 减少全盘重渲染 | PARTIAL | Room 整体重渲染；实测 7–11 ms |
| 015 避免临时 DOM 洪峰 | PASS | SVG 棋子，无逐帧 DOM 重建 |
| 016 transform + rAF | PASS | FLIP transform + 双 rAF |
| 017 动画后清理 | PASS | 计时器/rAF/监听清理 |
| 018 页面/房间/重连切换清理 | PASS | effect cleanup |
| 019 关闭动效标记保留 | PASS | 标记独立于动画 |
| 020 跳棋连跳/围棋/五子即时 | PASS | 连跳本地逐段、落子即时；对手在提交后可见 |

## 5. 回归结果

- `vitest`：**296/296 通过**（21 个文件，unit + integration；新增 `tests/integration/latency.test.ts` 7 项）。
- Playwright e2e：**27/27 通过**（含五棋、选座、导出、PERF-008；新增延迟面板、国象席位文案、乐观回滚 3 项）。
- net-check：中象 15/15、国象 15/15（含刷新恢复、悔棋、断线徽章、认输锁定）。
- `scripts/anim-verify.mjs`：**15/15 PASS**（含三档动效）。
- 浏览器延迟测试：本机 12 手、隧道 12 手、隧道复测 6 手，均 0 错误。
- 弱网代理：300 ms / 1000 ms RTT 两组，均 0 错误；断线重连 3.7 s 恢复、0 非预期错误。
- 移动端仿真：3 设备 × CPU 4×，0 溢出、0 长任务、落子 P95 13–15 ms。
- 布局/视口/RWD/清单/UX：layout-check、viewport-check（55 视口）、rwd 12/12、chk 8/8、ux 9/9 全绿。
- 五棋延迟矩阵：本机 5/5、隧道 5/5，均 0 协议错误。
- 生产构建：通过；首屏 JS 312 KB（gzip 98 KB），Room chunk 35.9 KB（gzip 11.4 KB）。

## 6. 未做的优化及原因

| 候选 | 为什么不做 |
| --- | --- |
| 增量广播（只发新 move） | 会改变所有集成测试依赖的 `room:state.moves` 语义，回归面大；当前载荷不是两秒主因（30 手 8.9 KB，服务端构建 0.01 ms）。列为后续项。 |
| 广播前不同步落库 | 可能丢步/重启后不一致；任务书禁止为速度牺牲一致性。 |
| 客户端自动重放 STALE_REVISION | 可能把棋下到玩家未预期的局面；保留「同步+提示重试」。 |
| 降低 pingInterval/Timeout | 高 RTT 抖动下更容易误判断线；当前无断线样本。 |
| 开启 permessage-deflate | 小消息收益有限，CPU/兼容性风险；未测。 |
| 更换隧道/购买服务器 | 任务书禁止未授权购买；已给出部署建议。 |

## 7. 剩余风险

1. **对手可见延迟**：公网隧道 P50 ~470 ms、P95 ~1.1 s；无法用前端消除。需要部署层改变路径。
2. **polling 兜底**：看门狗只能尝试升级；若网络彻底阻断 WS，用户仍会落在 2–6 s 的 polling 路径。
3. **长局载荷**：30 手 8.9 KB，长局线性增长；未做增量广播。
4. **STALE_REVISION 快速点击**：低概率需重试。
5. **持久化失败回滚**：代码路径已加，未做故障注入验证。
