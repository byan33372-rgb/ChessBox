# 第二轮 · 测试环境与运行诊断（test-environment.md）

## 1. 实际环境

| 项 | 值 |
|---|---|
| OS | Windows 10.0.26100 x64 |
| Node / npm | v24.22.1 / 11.19.1 |
| 包管理器 | npm + package-lock.json（`npm ci --dry-run` 于第一轮验收实测 exit 0） |
| TypeScript | 5.9.3（client/server 双 tsconfig） |
| Vitest / Playwright | 3.2.7 / 1.64.1（本轮 `--version` 实测） |
| 浏览器 | 系统 Chrome 156（channel:chrome）、Edge（channel:msedge）、Playwright Chromium 1248 |
| 数据库 | better-sqlite3 原生模块 ABI 137 加载成功 |

## 2. 依赖安装诊断（B-004~007）

- 初步审计环境出现的“npm install 超时 / vitest 找不到”**未在本工作区复现**：本工作区 node_modules 完整（vitest/playwright/better-sqlite3 均可执行）。
- 按任务要求评估干净安装路径：`npm ci` 会删除现有 node_modules 并重新安装 better-sqlite3（需要 VS Build Tools 或 prebuilds 下载）。第一轮验收已用 `npm ci --dry-run` 验证锁文件一致性（exit 0）；本轮为保留可复现基线**不执行破坏性重装**，如需干净安装请按 README 三方案操作（重试 / `--ignore-scripts` + 拷贝 prebuilds / 安装 VS Build Tools）。
- 结论：测试运行阻塞**不存在**于当前工作区；原初步审计环境的失败归因于其独立环境网络/安装超时，与项目代码无关（B-010 精神：使用现有可用 node_modules 完成全部真实测试）。

## 3. 本轮实际执行命令与退出码（全部真实执行）

| 命令 | 退出码 | 证据 |
|---|---|---|
| npm run typecheck | 0 | log-typecheck.txt |
| npx vitest run --project unit | 0（150 passed） | log-unit.txt |
| npx vitest run --project integration | 0（57 passed） | log-integration.txt |
| npx playwright test | 0（18 passed） | log-e2e.txt / log-e2e-final.txt |
| npm run build | 0 | log-build.txt |
| npm audit --omit=dev | 0（0 vulnerabilities） | log-npm-audit.txt |
| node scripts/layout-check.mjs | 0（22 PASS） | log-layout-check.txt |
| node scripts/viewport-check.mjs | 0（18 PASS） | log-viewport-check.txt |
| node scripts/rwd-check.mjs | 0（12 PASS） | log-rwd-check.txt |
| node scripts/anim-verify.mjs | 0（16 PASS） | log-anim-verify.txt |
| node scripts/ux-check.mjs | 0（9 PASS） | log-ux-check.txt |
| node scripts/chk-check.mjs | 0（8 PASS） | log-chk-check.txt |
| node scripts/sec-check.mjs | 0（9 PASS） | log-sec-check.txt |
| node scripts/net-check.mjs xiangqi | 0（15/15） | log-net-xiangqi.txt |
| node scripts/net-check.mjs chess | 0（15/15） | log-net-chess.txt |
| node scripts/acceptance-perf.mjs | 0（15 场景） | log-perf.txt + ../perf-results.json |
| node scripts/acceptance-shots.mjs | 0（6 张截图复拍） | log-shots.txt |
| node tests/soak/soak.mjs（6 分钟） | 0（267 周期/0 错误） | soak-summary.json / soak.jsonl |
| npx vitest run（全量合并） | 0（**227 passed**） | log-vitest-all.txt |

## 4. 失败分类记录（B-009）

1. 专项脚本首轮 exit 1 ×9：**环境问题**（3001 服务未启动），非测试失败、非产品缺陷；重启后全绿。
2. 新增独立推导测试初版 11 failed：**测试缺陷**（构造错误），逐项探针定位后修正为 20/20；无产品缺陷。
3. 断言失败（产品行为不符合预期）：**0**。
