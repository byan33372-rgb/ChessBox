# 阶段一：项目与运行环境审计（延迟专项）

- 审计时间：2026-11-05 12:40–13:15（Asia/Shanghai）
- 代码版本：`055c452`（第三轮报告）+ 本次延迟插桩改动（未提交）
- 审计方式：读源码 + 实际启动生产构建 + 双客户端真实 socket 对局探针（`scripts/latency-probe.mjs`）
- 原则：只记录实际观测到的内容；未实测项在文末单独标注「未验证」。

## 1. 技术栈与部署形态

| 项 | 实际值 |
| --- | --- |
| 前端 | React 19 + TypeScript 5.9 + Vite 7.3（生产构建 `dist-client/`） |
| 服务端 | Node.js + Express 5 + Socket.IO 4.8（`dist-server/server/index.js`） |
| 数据库 | better-sqlite3（SQLite，WAL 模式，`synchronous=NORMAL`），文件 `data/app.db` |
| 进程 | 单进程，HTTP 与 Socket.IO 同端口 **3001** |
| 公网入口 | Cloudflare Quick Tunnel（cloudflared，`--protocol http2 --edge-ip-version 4`） |
| 隧道落地 | 日志：`location=lax01`；HTTP 响应头 `CF-Ray: ...-LAX`（美国洛杉矶边缘） |
| 本机公网出口 | 203.0.113.10(redacted) |
| 局域网 | 192.168.0.100；路由器 gateway，UPnP 可用但其上报 WAN IP 为 192.168.0.1（双重 NAT，无公网入站条件）；本机无全局 IPv6 |
| 客户端 | 同一台 Windows 主机上的两个 Node socket 客户端（真实协议，不是 mock） |

> 结论先行：**服务端处理链路只有 0.45–0.87 ms；公网隧道路径是绝对瓶颈**。详见 `baseline-report.md`。

## 2. 走棋全链路（服务端）

```
socket.on('game:move')
  → zod 校验（from/to/path 格式）
  → requireSession（会话/房间绑定）
  → moveLimit 限流
  → rooms.enqueue(room, ...)            // 每房间串行队列
     → applyPlayerMove
        → 幂等缓存 room.moveAcks.get(requestId)
        → 观战/终局/满员/回合/revision 校验
        → engine.applyMove(input)        // 规则引擎（纯内存）
        → room.moves.push / revision++
        → store.appendMoveAndSaveRoom()  // 同步 SQLite 事务（落子 INSERT + 房间 UPSERT）
        → publicState(room)              // 全量状态（含全部历史 moves）
        → moveAcks.set(requestId, ack)
        → broadcast(room.id, state, 'move')  // io.to(room).emit('room:state')
     → ack(result)
```

关键观察：

1. **广播在 ack 之前**（同一同步调用栈内），ack 与广播几乎同一时刻发出；实测 ack 与对手收到的差值 <1 ms（本地）。
2. **SQLite 写是同步的**，且在广播之前执行。`appendMoveAndSaveRoom` 包在一个事务里：`moves INSERT` + `rooms UPSERT`。WAL + NORMAL 下单次事务实测 **0.17–0.61 ms**（见基线），不是两秒延迟的来源；但它是阻塞事件循环的同步 I/O，属于需要保留观察的次要点。
3. `publicState()` 每次走棋构建一次（失败路径也会构建），包含完整 `moves` 数组。实测 30 手时状态 8.9 KB，随手数线性增长。
4. 每房间队列 `enqueue` 串行化：同房间并发走棋不会互相覆盖，两方同时提交只有一手成功。

## 3. Socket.IO 配置

服务端（`src/server/index.ts`）：

```ts
cors: { origin: false, credentials: false }
maxHttpBufferSize: 64 * 1024
pingInterval: 20000
pingTimeout: 25000
```

客户端（`src/client/net/roomClient.ts`）：

```ts
transports: ['websocket', 'polling']   // 先 WS，失败降级 polling
reconnection: true
reconnectionDelay: 800
reconnectionDelayMax: 5000
```

- 服务端与客户端都支持 WS；经 Cloudflare 隧道实测可正常升级为 `websocket`。
- 客户端保留 polling 兜底（符合兼容性要求），但 **polling 经隧道每手 2.1–6.4 s**（实测），这是本任务最关键的风险点。
- 心跳 20 s / 25 s：隧道抖动时最坏 45 s 才能发现断线；本次未观察到主动断线，仅作为风险记录。

## 4. 数据库

表：

- `rooms(room_id PK, kind, fen, revision, phase, outcome_json, offers_json, seats_json, seat_count, created_at, updated_at)`
- `moves(room_id, ply, side, from_sq, to_sq, promotion, notation, fen_before, fen_after, captured, captured_sq, path_json, extra_json, check_flag, ts, PRIMARY KEY(room_id, ply))`
- `sessions(token_hash PK, room_id, seat, name, created_at)`
- `chat(room_id, ts, name, side, text)`

索引：

- `idx_moves_room ON moves(room_id)`
- `idx_sessions_room ON sessions(room_id)`

评估：

- 走棋写入是主键 `(room_id, ply)` 的 INSERT + `rooms` 主键 UPSERT，均为索引命中，无表扫描。
- 每次走棋只写当前一手，不重写历史；`buildPersist` 只写房间快照（fen/revision/seats/offers），不写 moves 全量。
- 无 `roomId/gameId/moveId` 缺失索引问题（`moves` 的复合主键已覆盖按房间查询）。
- `updated_at` 清理查询 `SELECT room_id FROM rooms WHERE ... updated_at < ?` 无索引；但只在启动/定时清理时执行，不在走棋路径。

## 5. 客户端状态与渲染

- `roomClient` 用 `useState<RoomState>` 保存权威状态；`stateRef` 供动作读取最新 revision。
- 收到 `room:state` 直接 `setState(p.state)`；收到 ack 也 `setState(ack.state)`。
- `Room` 每次状态变化重建本地引擎（用于合法着法提示）并重渲染棋盘；走棋动画为 FLIP/飞子，时长 240 ms（跳棋 checkers flight），**不阻塞逻辑状态更新**；关闭动效时立即清除在飞层。
- 未发现 `setTimeout(500/1000/2000)` 之类硬编码等待；未发现「等动画结束再更新棋盘」的门控。
- 现有缺口：落子者自己的棋子在 ack 前不显示（无乐观 UI），公网高 RTT 下主观等待 = 一个 RTT。

## 6. 重连与会话

- 令牌存 `localStorage`（`dc:token:<roomId>`），重连走 `room:rejoin`，返回完整状态与棋谱。
- 每次 `connect` 都会重新 join；服务端 `bindSocket` 允许同一会话多标签页接管。
- 断线期间服务端继续接受对手走棋并落库；重连后通过全量状态恢复。
- 重连限流：`RATE_LIMITED` 时 2.5 s 退避重试，不进入致命态。

## 7. 隧道

- Quick Tunnel 每次重启 URL 变化；隧道进程当前存活（PID 33200），入口 `https://accessibility-consumption-attacked-mirror.trycloudflare.com`。（测试时地址；Quick Tunnel 于 2026-11-05 14:56 失效重启为 `https://clicks-head-fruit-birthday.trycloudflare.com`，仍落地 LAX）
- 落地 `lax01`（洛杉矶）。中国本地 → 洛杉矶的 TCP 建连 0.20–0.44 s，TLS 0.42–0.74 s，首字节 1.0–1.9 s（单次 3.9 s）。
- 这是「朋友走一步要等约 2 秒」的最大嫌疑：玩家 → CF 边缘 → 洛杉矶隧道入口 → 家庭上行 → 服务器，再原路返回；两名玩家各走一遍跨太平洋路径。

## 8. 现有错误/风险清单（审计时）

| 编号 | 现象 | 影响 | 状态 |
| --- | --- | --- | --- |
| AUD-001 | 公网隧道落地 LAX，RTT 400 ms 起，抖动到 1.5 s | 所有走棋/加入/聊天都慢 | 实测确认，部署层问题 |
| AUD-002 | polling 兜底经隧道单手 2.1–6.4 s | 弱网/WS 被阻断时出现「约两秒」体感 | 实测确认 |
| AUD-003 | 客户端无乐观落子，落子者等待一个 RTT | 公网下自己落子也不即时 | 待修（本轮已实现） |
| AUD-004 | 每手广播全量 `moves`，载荷随手数线性增长（30 手 8.9 KB） | 长局上行占用增大、丢包重传概率增大 | 记录，低优先级 |
| AUD-005 | SQLite 同步写位于广播前 | 理论事件循环阻塞；实测 <1 ms | 记录，暂不改（一致性优先） |
| AUD-006 | 心跳 20 s/25 s | 隧道静默断线发现慢 | 记录 |
| AUD-007 | `publicState()` 一手构建一次，失败路径也构建 | 可忽略（实测 0.01 ms） | 无动作 |

## 9. 未验证项（诚实标注）

- **没有第二台真实设备/第二个真实网络**：本轮公网数据由「同一台主机经隧道回环」测得，能证明隧道路径成本，但不能替代「本地 ↔ 异地」双端实测。
- **没有真实移动端**：移动端结论将用 Playwright 设备仿真 + CPU/网络节流给出，不等同真机。
- **没有 120 Hz 真机**：高刷适配只能做代码与 60 Hz 仿真验证。
- **未测家庭上行带宽占用峰值**：仅记录载荷大小与 RTT。
- 真实朋友端的运营商/路由/信号质量未知，无法复现其具体 2 s 样本。

## 10. 本轮已加入的观测能力

- 服务端 `serverTiming`：`queueMs / validateMs / applyMs / persistMs / stateMs / broadcastMs / totalMs`，随 `game:move` ack 返回。
- 客户端 `latency`：transport、RTT 中位数（3 s 一次 `latency:ping`）、点击→ack、事件→绘制（双 rAF）、重连/超时计数、stateVersion、requestId。
- 开发者面板：`?latency=1` 或 `Ctrl+Shift+L` 打开，默认对普通玩家隐藏；不含令牌/聊天内容。
- 探针脚本：`scripts/latency-probe.mjs`，支持 `--transport polling`、本地/隧道、逐手记录。
