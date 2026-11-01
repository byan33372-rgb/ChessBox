# 性能验收报告（performance-report.md）

## 1. 测试环境（PERF-012）

| 项 | 值 |
|---|---|
| 设备 | Windows 10.0.26100 x64 台式机（20 逻辑核） |
| 浏览器 | Chrome 156.0.0.0（Playwright channel:chrome，headless 模式） |
| DPR / 视口 | 1.0（另测 DPR=2 场景 R_chess_dpr2）/ 1280×800 |
| 刷新率 | headless 环境检出 ~167Hz（**不代表物理显示能力**，仅说明渲染管线可支撑 >120fps 的帧调度） |
| 采样方式 | Performance API：requestAnimationFrame 帧间隔原始采样 + performance.now 输入/网络分段计时（PERF-010/011） |

## 2. 三棋各 120 帧采样（PERF-008，走棋后静止页面采样）

| 棋种 | 有效帧 | 时长 | P50 帧时 | P95 | P99 | >16.67ms 帧数 |
|---|---|---|---|---|---|---|
| 中国象棋 | 120 | 733ms | 6.1ms | 6.0ms(166.7fps) | 5.9ms(169.5fps) | **0** |
| 国际象棋 | 120 | 746ms | 6.1ms | 5.9ms | 5.9ms | **0** |
| 中国跳棋 | 120 | 734ms | 6.1ms | 6.0ms | 5.9ms | **0** |

原始输出见 e2e 日志 `[PERF-008][kind]` 行（`npx playwright test tests/e2e/upgrade.spec.ts -g PERF-008`）。

## 3. 综合性能场景（scripts/acceptance-perf.mjs，15 场景，169.6s）

结果文件：docs/acceptance/perf-results.json。要点：

- **CPU 4x 节流压力**（PERF-002/013）：1559 帧采样，平均 132.5fps，帧时中位 6.1ms，P95=12.2ms，P99=24.3ms，>16.67ms 占 3.91%、>8.33ms 占 9.36%；40 次动画点击到落位中位 222.8ms（动画本身 198ms 中位——即等待时间≈动画时长，无额外卡顿）。
- **输入延迟**：60 样本，中位 0.8ms、P95 1.5ms。
- **网络分段**（PERF-016，本机回环）：走棋点击→本端棋谱渲染 中位 12.3ms / P95 42.5ms；→对方端 中位 15ms / P95 44ms（含 socket 往返+双方渲染，不含公网延迟）。
- **场景覆盖**（PERF-003~006）：中象普通/炮吃子、国象普通/吃子/易位/过路兵/升变、翻转、快速连续走棋、双端同步、复盘导航、窗口缩放、DPR 变化、后台节流恢复（后台期间对手走棋，恢复后状态正确、无卡半途飞行层）。
- **reduced-motion**（PERF-007）：开启后飞行动画 0 次、棋谱延迟 16.8ms、终态正确——动画禁用不影响信息完整性（MOVE-020）。

## 4. 帧预算结论（PERF-013/014）

- 60Hz 预算（16.67ms）：三棋静止页面 120 帧采样 0 超预算；CPU4x 压力下超预算比例 3.91%（节流环境），正常环境 0。**60Hz 支持 PASS**。
- 120Hz：headless 帧调度可达 ~165fps 说明每帧渲染成本 ≪8.3ms；**真实 120Hz 物理屏 NOT_TESTED**（无该硬件，不伪称通过）。

## 5. 30 分钟浸泡（GATE-23 / DATA-009 / PERF-015）

- 工具：tests/soak/soak.mjs（纯 Socket 协议客户端，非内部函数调用）；独立服务（temp DB /tmp/acc-soak/soak.db）。
- 负载模型：循环执行三棋建房→双客户端→脚本化走棋（含非法请求应拒样本）→复盘读取→B 断线重连→退出。
- 结果（docs/acceptance/logs/soak-summary.json）：**1334 周期 / 走棋成功 5781 / 应拒 1335 / 断线重连 1334 / 错误 0**；ack 延迟 P50=1ms、P95=3ms、P99=4ms、max=10ms（7116 样本）。
- 内存：服务端 RSS 30s 间隔采样 30 分钟稳定在 ~120MB，无增长趋势（docs/acceptance/logs/soak-rss.log）；事件监听器随 disconnect 清理（1334 次重连后延迟无劣化，P50 恒 1ms）。
- 原始逐周期日志：docs/acceptance/logs/soak.jsonl（1334 行）。

## 6. 限制声明（PERF-014/010）

- headless 环境的 rAF 频率与显示器刷新解耦：本报告的 fps 数字证明"渲染成本与帧调度健康"，不证明物理屏观感；物理屏验证需真机（NOT_TESTED）。
- 网络延迟仅本机回环；公网延迟未测（无授权不公开服务）。
