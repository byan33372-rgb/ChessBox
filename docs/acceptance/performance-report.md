# 五棋升级 · 性能报告（performance-report.md）

- 日期：2026-11-04
- 环境：Windows 10.0.26100 x64 台式机（20 逻辑核）；Chrome 156（Playwright headless channel:chrome）；DPR 1（另测 DPR2 场景）；视口 1280×800；检出刷新 ~167Hz（headless，不代表物理屏）

## 1. 帧率采样（五棋 × 120 帧，PERF-008/012）

| 棋类 | 有效帧 | P50 帧时 | P95 | P99 | >16.67ms |
|---|---|---|---|---|---|
| 中国象棋 | 120 | 6.1ms | 6.0ms | 5.9ms | 0 |
| 国际象棋 | 120 | 6.1ms | 5.9ms | 5.9ms | 0 |
| 中国跳棋 | 120 | 6.1ms | 5.9ms | 5.9ms | 0 |
| 围棋 | 120 | 6.1ms | 6.0ms | 5.9ms | 0 |
| 五子棋 | 120 | 6.1ms | 5.9ms | 5.9ms | 0 |

原始行：e2e `[PERF-008][kind]`（upgrade.spec）。60Hz 预算余量充足。

## 2. 综合压力场景（acceptance-perf.mjs，15 场景，三棋口径沿用）

- CPU4x 节流：1559 帧，平均 132.5fps，P95=12.2ms，>16.67ms 占 3.91%。
- 输入延迟 60 样本中位 0.8ms。reduced-motion 下飞行动画 0 次、终态正确。
- 场景含：普通/吃子/易位/过路兵/升变/翻转/快速连走/双端同步/复盘导航/窗口缩放/DPR2/后台节流恢复。

## 3. 30 分钟五棋浸泡（TEST-015/PERF-011）

- 负载：五棋循环建房→双客户端→脚本走棋（含应拒样本）→B 断线重连，独立 temp-DB 生产服。
- 结果：错误 0；ack 延迟 P50=1–3ms（逐周期 soak.jsonl）；RSS 30s 采样无增长趋势（rss.log）。
- 说明：go 用 9 路 + pass 序列；gomoku 固定四手循环——覆盖连接/持久化/轮转一致性而非棋力负载。

## 4. 60Hz / 120Hz 结论

- 60Hz：PASS（0 超预算帧 + 动画按真实时间推进 + 后台恢复正确）。
- 120Hz：NOT_TESTED（无物理 120Hz 设备；rAF 回调频率 ≠ 物理刷新率，已区分声明）。

## 5. 资源与加载（LIGHT-016）

| 指标 | 升级前 | 升级后 |
|---|---|---|
| 首屏 JS 原始/gzip | 402KB / 126.9KB | **308.6KB / 96.97KB**（-23%） |
| 懒 chunk | 无 | Room 30.1KB、checkersUi 92.3KB、PracticeBoard 4KB（按需） |
| CSS | 32.5KB（gzip 7.3KB） | 35.1KB（新增两棋样式，gzip ≈7.9KB） |
| 首页冷加载（networkidle） | 未测 | 687–702ms，5 请求 |
| 首屏 JS 传输量（含首屏可见沙盒懒块，gzip 后） | 未测 | ≈398KB |

预算建议（LIGHT-017）：首屏 gzip JS ≤ 120KB（当前 97KB 达标）；总 gzip JS（含首屏懒块）≤ 420KB（当前 ≈398KB 达标）。方法学：bunle 体积来自 vite build 输出行；传输量来自 Performance API transferSize（真实压缩后字节数）；时间来自 3 次冷加载取样（禁缓存路由头）。
