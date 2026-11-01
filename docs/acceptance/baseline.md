# 验收基线（baseline.md）

- 生成时间：2026-11-01 09:14–09:20（Asia/Shanghai）
- 操作者：ZCode 自动验收（三棋发布前全面验收轮）

## 1. 环境与项目状态

| 项 | 值 |
|---|---|
| 项目根 | D:\projects\chessbox |
| Git 分支 / HEAD | main @ `ef5d162`（阶段H：验收报告与归档） |
| 工作区状态 | 干净（无未提交修改） |
| Node / npm | v24.22.1 / 11.19.1 |
| 锁文件 | package-lock.json 存在（npm ci 可用） |
| 技术栈 | React 19 + Vite 7 + TS 5.9；Express 5 + Socket.IO 4.8 + better-sqlite3；chess.js 1.4；自研中象/跳棋引擎 |

## 2. 服务与数据库

- 启动：`npm start` → `node dist-server/server/index.js`（默认端口 3001，`PORT` 可覆盖；DB：`DB_PATH` 缺省 `data/app.db`）。
- 数据库：SQLite（WAL），表 rooms / moves / sessions / chat；本轮迁移为 4 个**可空附加列**（rooms.seat_count；moves.captured_sq / path_json / extra_json），幂等 ALTER，回滚=旧构建零操作（详见 src/server/store.ts 注释）。
- 测试基建：vitest projects（unit/integration，integration 用 forks 池防 IPC 抖动）、Playwright（channel:chrome，webServer 自动起生产 dist）、临时 DB 路径 pid+随机后缀。

## 3. 基线测试结果（AUDIT-007，本轮实测退出码）

| 命令 | 退出码 | 结果 |
|---|---|---|
| `npx tsc -p tsconfig.client.json --noEmit` | 0 | 通过 |
| `npx tsc -p tsconfig.server.json --noEmit` | 0 | 通过 |
| `npx vitest run --project unit` | 0 | **134 passed / 0 failed** |
| `npx vitest run --project integration` | 0 | **54 passed / 0 failed** |
| `npx playwright test` | 0 | **13 passed / 0 failed** |
| `npm run build`（vite + tsc server） | 0 | 通过 |
| `npm audit --omit=dev` | 0 | found 0 vulnerabilities |

日志副本：/tmp/acc-unit.log、/tmp/acc-int.log、/tmp/acc-e2e.log、/tmp/acc-build.log（会话临时区）。

## 4. 基线失败（AUDIT-008）

**无**。全部 201 项自动化测试基线全绿，无隐藏失败、无 skip。

## 5. 测试有效性抽查（AUDIT-009）

- 规则类测试直接调用真实引擎断言合法性/终局（xiangqi-engine 37 项、chess 深度规则、checkers-engine 25 项），非固定断言。
- 集成测试走真实 Socket.IO 服务端（RoomManager+Store+内存 HTTP），双客户端交互；非仅组件渲染。
- e2e 走真实浏览器 + 生产构建产物（playwright webServer 起生产服务）。
- 风险点（本轮补强）：跳棋导出函数（buildCheckersText/Json）此前无单元测试；跳棋多人关键流程（3/4/6 人）此前仅集成层覆盖、缺浏览器层；`parseCheckersFenPieces`/`nextChainTargets` UI 纯函数缺直测。

## 6. 已知风险与缓解

1. better-sqlite3 无 VS Build Tools 环境安装可能失败 → README 三方案（重试 / --ignore-scripts+prebuilds / 装 VS Build Tools）。
2. IAB 自动化截图面超时（环境限制）→ 视觉证据改用 Playwright 真实浏览器截图。
3. 物理高刷屏与跨局域网真机不可用 → 相关 Gate 按任务书标 NOT_TESTED/BLOCKED。
4. 测试服务器与浸泡服务已隔离到 /tmp 数据库，不会触碰用户 data/app.db。

## 7. 本轮承诺

- 不覆盖未提交修改（当前无）、不删数据、迁移先备份。
- 全部缺陷修复配回归测试；失败不隐藏；未测不标过。
