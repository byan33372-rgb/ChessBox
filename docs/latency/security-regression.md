# 阶段十三：安全回归报告（延迟优化后）

- 时间：2026-11-05 13:16–13:20
- 目标：确认「为降低延迟」没有放宽任何服务端校验、没有泄露秘密、没有引入新攻击面。
- 结论：**没有放宽校验；新增插桩只增加只读数字字段；296 项 vitest（含 9 项 HTTP/Socket 安全）与 9/9 实时安全探测全部通过。**

## 1. 逐项核对（SEC-001~013）

| 编号 | 要求 | 状态 | 证据 |
| --- | --- | --- | --- |
| SEC-001 | 所有走棋必须服务端校验 | PASS | `applyPlayerMove`：座位→回合→revision→幂等→引擎合法性；客户端乐观 UI 只改展示层 |
| SEC-002 | 不信任客户端身份 | PASS | 会话由 `room:create/rejoin` 令牌（SHA-256 哈希存库）绑定；走棋用 `session.seat`，不读 payload 的 side |
| SEC-003 | 不信任房间/回合/状态 | PASS | 房间由 socket 会话绑定；`room.engine.turn()` 与 `revision` 严格校验 |
| SEC-004 | 幂等（重复请求不重复落子） | PASS | `room.moveAcks` 按 requestId 缓存；集成测试「同 requestId 双发只落一子」 |
| SEC-005 | 旧事件不覆盖新状态 | PASS | 服务端 revision 乐观锁；客户端忽略严格更低 revision 的广播/ack |
| SEC-006 | 重启一致性 | PASS | SQLite 事务；`rooms.loadPersisted()` 重放；既有「重启后棋谱/FEN 恢复」测试 |
| SEC-007 | 走棋与棋盘一致 | PASS | 服务端从同一引擎生成 `fenAfter` 与 `moves`；广播/ack 同源 |
| SEC-008 | 聊天/走棋输入校验 | PASS | zod：坐标正则、path 2–16、聊天长度/内容；非法输入返回 `INVALID_INPUT` |
| SEC-009 | 性能日志不含秘密 | PASS | 服务端不写每手延迟日志；`serverTiming` 只含数字；客户端面板不显示令牌/聊天；`requestId` 仅 UUID |
| SEC-010 | 不为速度放宽安全 | PASS | 未改校验顺序/规则；乐观 UI 可回滚；未跳过落库/广播 |
| SEC-011 | 限流与滥用保护 | PASS | 建房 2/0.2、加入 8/0.15、走棋 20/2、聊天 6/0.5、操作 15/1；压力测试触发 `RATE_LIMITED` |
| SEC-012 | HTTP 安全头/敏感路径 | PASS | `scripts/sec-check.mjs` 9/9；CSP、nosniff、SAMEORIGIN、no-referrer |
| SEC-013 | 新插桩不改变对局状态 | PASS | `latency:ping` 无房间副作用（测试断言 revision 不变）；`serverTiming` 只读 |

## 2. 实时探测结果

```
SEC-01 PASS 敏感路径全部 404（/.env /package.json /data/app.db /node_modules /src/server/index.ts /data /logs/server.log）
SEC-02 PASS SPA 路由 / 与 /r/<id> 均 200
SEC-03 PASS X-Content-Type-Options: nosniff
SEC-04 PASS X-Frame-Options: SAMEORIGIN
SEC-05 PASS Referrer-Policy: no-referrer
SEC-06 PASS Permissions-Policy camera=() microphone=() geolocation=()
SEC-07 PASS CSP default-src 'self'，无 unsafe-eval
SEC-08 PASS /healthz 200
SEC-09 PASS /api/* 404 JSON，不泄露内部信息
9/9 通过
```

## 3. 自动化测试

- `tests/integration/security.test.ts`：9 项（HTTP 安全头、Socket 输入校验、伪造身份、越权等）。
- `tests/integration/concurrency.test.ts`：6 项（并发走棋只有一手成功、房间队列）。
- `tests/integration/latency.test.ts`（本轮新增）：7 项
  - serverTiming 全分项为有限非负数；
  - `latency:ping` 不改变 revision；
  - serverTiming 不进入广播；
  - 过期 revision 被拒且返回最新状态；
  - 同 requestId 幂等只落一子；
  - 非法坐标 `INVALID_INPUT` 不落子；
  - ack 不含 token，广播 revision/手数与 ack 一致。
- 全量：**296/296 vitest 通过**。

## 4. 新增面评估

| 新增面 | 风险 | 处置 |
| --- | --- | --- |
| `serverTiming` 字段 | 暴露服务端处理耗时 | 只回给走棋者；不含内部路径/错误；对手广播不含；无敏感信息 |
| `latency:ping` | 可被滥用做 RTT 探测/放大 | 只回 `{ok,t}`，无房间副作用；受连接级限流/Origin 校验保护（与其它事件同层） |
| 客户端 `window.__dcLatency` | 暴露 requestId/耗时 | requestId 为随机 UUID，不是凭证；不含 token/聊天/对手信息 |
| 开发者面板 | 普通玩家可见诊断 | 默认隐藏；仅 `?latency=1` 或快捷键开启；CSS 固定层不拦截棋盘点击（pointer-events 默认，面板在右上角） |
| 持久化失败回滚 | 回滚后引擎重建是否一致 | 用 `move.fenBefore` 重建；失败路径不广播、不返回成功；未放宽任何校验 |
| polling 看门狗 | 重连风暴 | 最多 2 次；只在检测到 polling 时触发；保留兜底 |

## 5. 未验证/限制

- 未做渗透测试/模糊测试；输入校验依据既有 zod + 集成测试。
- 未做依赖漏洞扫描（`npm audit` 未执行）；依赖版本未变。
- 未验证 CDN/隧道层的 TLS/证书细节（Cloudflare 提供）。
- 持久化失败回滚未做故障注入（无法在不破坏 DB 的情况下稳定触发）。
