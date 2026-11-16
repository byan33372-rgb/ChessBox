# 延迟专项缺陷清单

| 编号 | 级别 | 现象 | 根因 | 处置 | 验证 |
| --- | --- | --- | --- | --- | --- |
| DEF-LAT-001 | P2 | 320 px 首页横向溢出 45 px | `.name-row input` 固定 170px + flex 默认 `min-width:auto` | 已修复：`flex-wrap` + `min-width:0` | 320px `scrollWidth=320`；三设备无溢出 |
| DEF-LAT-002 | P1 | 国象把先手方（a）显示为黑方，局面/回合/最近一步文案颠倒 | `sideName` 把 chess 与 go/gomoku 合并为 a=黑方 | 已修复：chess 单独映射 a=白方、b=黑方 | 新增 e2e；net-check chess 15/15 |
| DEF-LAT-003 | P1 | polling 兜底单手 2–6 s，出现「约两秒」体感 | polling 多次 HTTP 往返 + 跨太平洋隧道 | 已缓解：传输看门狗（最多 2 次重连尝试 WS）；根本解决需改部署路径 | 默认路径 100% WS；强制 polling 仍 2.8 s（对照） |
| DEF-LAT-004 | P2 | 对手可见延迟 P50 ≈0.47 s、P95 ≈1.2 s | Cloudflare Quick Tunnel 落地 LAX | 未改代码；建议公网直连/IPv6/国内节点（需授权） | 隧道 84 样本 P50 464 ms、P95 1 203 ms |
| DEF-LAT-005 | P3 | 长局广播载荷线性增长（30 手 8.9 KB） | 每手全量 `moves` | 记录；未改协议（回归面大、非主因） | 30 手 8.9 KB；服务端 state 构建 0.01 ms |
| DEF-LAT-006 | P3 | 快速点击可能触发 `STALE_REVISION`，需重试 | 客户端用本地 revision 提交；服务端严格乐观锁 | 保留「同步最新局面 + 提示」；不自动重放（避免下到非预期局面） | 探针/ e2e 可触发；正常手速概率低 |
| DEF-LAT-007 | P3 | SQLite 同步写位于广播前 | better-sqlite3 同步事务 | 保留（一致性优先）；实测 0.17–0.61 ms | 分项计时 |
| DEF-FIX-001 | P2 | 落库失败时内存已前进、未广播、客户端收错 | 先改内存再落库，无回滚 | 已修复：用 `move.fenBefore` 重建引擎并回退 moves/revision/outcome/offers | 类型检查；未做故障注入 |
| DEF-LAT-008 | P3 | 心跳 20 s/25 s，隧道静默断线发现慢 | Socket.IO 心跳配置 | 未改（过激会误判断线）；面板显示重连次数 | 30 分钟 0 断线；断网恢复 3.7 s |

## 已确认非缺陷（测试脚本问题）

- 探针早期 4 次 `STALE_REVISION` / `NOT_YOUR_TURN`：脚本未等双方收到广播就连续走棋；修正后 0 错误。
- 首轮 30 分钟浸泡挂起：脚本 `KINDS[i % 3]` 只轮转三棋 + checkers 在限流时无限等待 `room:state`；修正后 726 轮 0 错误。
- net-check 悔棋步骤竞态：A 的 ack 先于 B 的广播，测试立即计数导致 B=2；改为等待 B 归零后通过。