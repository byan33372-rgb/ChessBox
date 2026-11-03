# 五棋升级 · 最终发布报告（final-release-report.md）

- 日期：2026-11-04
- 项目：dual-chess-online @ main（基线 `1044410` → 本轮提交链 a40d232/ad53053/c840970/2215f56/本轮）
- 结论先行：**建议发布**（P0=0、P1=0 未决；NOT_TESTED 项均为环境限制并已明示）

## 1. 审计范围与环境

五棋规则/联机/轨迹/动画/性能/安全/数据/生产构建/手机适配。环境：Win10 x64、Node 24.22.1、Vitest 3.2.7、Playwright 1.64.1 + Chrome 156/Edge、better-sqlite3 ABI 137。30 分钟五棋浸泡独立 temp-DB 生产服。

## 2. 测试统计（全部本轮真实执行）

| 类别 | 数量 | 结果 |
|---|---|---|
| 单元（含新 go 21/gomoku 17/独立推导 20） | **265** | 0 failed |
| 集成（含 five-games-rooms 8 项） | **65** | 0 failed |
| E2E（含 five-games.spec 4 项） | **22** | 0 failed |
| 专项脚本 | layout22/viewport18/rwd12/anim16/ux9/chk8/sec9/net15×2/perf15 场景 | 全 PASS |
| 视口矩阵 | 11 视口 × 5 棋 = 55 | 0 溢出 |
| 稳定性 | 30 分钟五棋浸泡：1325 周期/5742 步/1326 应拒/1325 重连 | 0 错误 |

## 3. 规则与联机结果

详见 game-rules-report.md。要点：围棋中国规则全链（提子/自杀/superko 劫/停手/数子/贴目 7.5/恢复对弈）与五子棋自由规则全链（四向五连/长连/满盘和/终局锁）引擎级验证；双客户端房间流程五棋全覆盖（既有 3 棋沿用 + 新增 go/gomoku 8 集成 + 4 e2e）。

## 4. 轨迹与提示

落子型上一手=落点方形角标（服务端确认事件驱动），移动型保留起终点与路径；五子棋胜利线 extra 高亮；围棋提子 extra 与计数展示；刷新恢复走权威 state。e2e/integration 双端断言。

## 5. 轻量化与加载

首屏 JS 402KB→308.6KB（gzip 97KB，-23%）；Room/checkersUi/PracticeBoard 按需 chunk；首页冷加载 ~690ms/5 请求。方法学与全表见 performance-report.md §5。

## 6. 延迟

回环 RTT：ack P50=1–3ms/P95=2–3ms/P99=3–4ms/max≈8ms（7068 样本）；perf 分段：本端 12.8ms/对端 16ms 中位；跨区公网边界首包 0.73–1.07s（沿用外网 6 节点实测）。详见 network-latency-report.md。

## 7. 手机适配

55/55 视口矩阵 PASS；dvh/safe-area 接入；高密度棋盘吸附命中。真机触控 NOT_TESTED（无设备，已声明）。详见 mobile-compatibility-report.md。

## 8. 缺陷清单（本轮新增）

| ID | 级别 | 描述 | 修复 |
|---|---|---|---|
| DEF-GO-001 | P1 | superko 初始键误 'b' → 劫回提漏判 | `2c7607d` 链内修复+回归 |
| DEF-GO-002 | P1 | loadFen 未播 superko 历史 → 重载后回提漏判 | 引擎修复+回归 |
| DEF-FG-001 | P1 | checklist 缺 go/gomoku 分组 → 首页整页崩溃 | 补组+5 卡验证 |
| DEF-FG-002 | P2 | 终局横幅赢家未走统一 sideName | 修复+e2e 回归 |

P0=0；P1 未决=0；P2 未决=0。

## 9. 构建与持久化

`npm run build` exit 0；生产服承载全部脚本/浸泡；go13 fen 规格重启恢复断言；数据库无 DDL（moves 通用列承载 place 型），回滚=旧构建直启。

## 10. 未实现 / NOT_TESTED / BLOCKED

- Renju 禁手：按任务书作为独立未来模式（未实现，未宣传）。
- 围棋悔棋：沿用通用双人悔棋（无围棋特化死子回退），GO-023 如实标注。
- SGF 导出行序未翻转（子集声明于导出文件 note）。
- LIGHT-005 房间包内五引擎合并 chunk（按棋种再分割列为后续）。
- NOT_TESTED：120Hz 物理屏、真机触控、Firefox/WebKit、公网跨区本轮未重测（沿用上一轮 6 国节点实测）、SAST。
- BLOCKED：无授权不公网部署。

## 11. 运维

启动：`npm run build && npm start`（PORT/DB_PATH 可覆盖）。停止：结束进程/端口。备份：data/*.db 三件套（-wal/-shm）拷贝或 `.backup`。恢复：三件套放回后重启；回滚：旧构建直启（无 schema 变更）。

## 12. 发布建议

**建议发布**：五棋功能与规则有真实测试证据（265+65+22+55 项），P0/P1 清零，资源/延迟/手机适配达标且方法学可复核。剩余 NOT_TESTED 项作为已知限制随发布说明披露。
