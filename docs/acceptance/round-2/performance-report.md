# 第二轮 · 性能报告（performance-report.md）

## 1. 环境（PERF-012）

Windows 10.0.26100 x64 台式机（20 逻辑核）；Chrome 156（Playwright headless，channel:chrome）；DPR 1（另测 DPR=2 场景）；视口 1280×800；采样=Performance API rAF 帧间隔 + performance.now 分段计时；刷新率检出 ~167Hz（headless，**不代表物理显示能力**）。

## 2. 动画场景实测（scripts/acceptance-perf.mjs，15 场景，169.5s，exit 0）

结果文件：docs/acceptance/perf-results.json（本轮覆盖更新）。

- CPU 4x 节流压力（PERF-001/002/007）：1559 帧样本，平均 132.5fps，帧时中位 6.1ms，**P95=12.2ms**，P99=24.3ms，>16.67ms 占 3.91%、>8.33ms 占 9.36%；40 次动画点击→落位中位 222.8ms（动画本体 198ms 中位——等待≈动画时长，无额外卡顿）。
- 输入延迟：60 样本中位 0.8ms、P95 1.5ms。
- 网络分段（PERF-013，回环）：本端 ack 中位 12.8ms/P95 15.2ms；对端 中位 16ms/P95 28ms——与 FPS 分开统计。
- 场景覆盖（PERF-005）：中象普通/炮吃、国象普通/吃子/易位/过路兵/升变、翻转、快速连走、双端同步、复盘导航、窗口缩放、DPR 变化、后台节流恢复（后台期间对手走棋，恢复后状态正确、无卡半途飞行层 → PERF-004/014 通过）。
- reduced-motion：飞行动画 0 次、终态正确（PERF-007）。
- 残影/双份渲染（PERF-003）：anim-verify 16/16 通过（FLIP 落位/清除/层序断言）。

## 3. 三棋各 120 帧采样（e2e PERF-008，本轮 e2e 18 项含此 4 项）

走棋后静止采样 120 帧：三棋 **>16.67ms 帧数均为 0**，P95≈166.7–169.5fps（headless 未限速）→ 60Hz 预算（16.67ms）余量充足。

## 4. 5 分钟持续走棋（PERF-011）

- 工具：tests/soak/soak.mjs（纯协议客户端）+ 独立生产服务（temp DB）。
- 结果（docs/acceptance/round-2/soak-summary.json）：**267 周期 / 走棋成功 1157 / 应拒 267 / 断线重连 267 / 错误 0**；ack 延迟 P50=1ms、P95=2ms、P99=3ms、max=5ms（1424 样本）；逐周期日志 soak.jsonl。
- 帧回调/监听器泄漏：267 次重连后延迟无劣化（P50 恒 1ms）；上轮 30 分钟浸泡 RSS ~120MB 无增长（长期证据沿用）。

## 5. 60Hz / 120Hz 结论（PERF-008~010）

- **60Hz：PASS**——渲染帧时 P95 远低于 16.67ms（正常 0 帧/压力 3.91% 超 16.67ms），动画按真实经过时间推进（代码审读+后台恢复行为）。
- **120Hz：NOT_TESTED**——无物理 120Hz 显示器；headless 检出 167Hz 仅证明帧调度可支撑 >120fps，不作为物理显示证据。
- rAF 回调频率 ≠ 物理显示帧率：本报告明确区分（PERF-010）。
