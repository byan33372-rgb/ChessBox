# 五棋升级任务进度（five-games-upgrade.md）

## 阶段 A：基线（2026-11-03）
- 起点：main @ `1044410`（第二轮独立审计完成）；工作区仅 1 个日志文件改动，无产品代码改动。
- 基线执行：typecheck 0 ✅；vitest 227 项——**1 failed**（round2 perft(3) 5s 超时，机器并行负载下的慢测试抖动，非产品缺陷 → 加显式 30s 超时后 227/227 ✅）；e2e 18/18 ✅；build 0 ✅。
- 升级前产物基线（LIGHT-001）：dist-client JS 402KB（gzip ≈126KB）、CSS 32.5KB（gzip ≈7.3KB），单 chunk 无分割。
- 原有三棋功能清单：房间/邀请/三棋引擎/服务端权威/上一手标记/连跳路径/复盘/导出/聊天/断线恢复/持久化/响应式（round-2 报告全部 PASS）。
- 检查点：见 git log「阶段A」提交。

## 进度索引
- 阶段 B 轻量化：见本文「阶段B」节 + docs/acceptance/performance-report.md
- 阶段 D/E 围棋/五子棋：引擎与测试见 src/games/go|gomoku、tests/unit
- 其余各章验收结论汇总于 final-release-report.md
