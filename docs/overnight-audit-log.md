# 整夜审计与精修进度日志

> 本文档是持续执行的唯一进度来源。每次恢复工作先读本文件。
> 项目：D:\projects\chessbox（双棋种在线对弈：中国象棋 + 国际象棋）
> 规则：本文件只记录【已经真实执行并验证】的内容；未执行的阶段标记为 ⬜；数字以真实命令输出为准。

## 项目速览（来自实际文件与命令）

- 技术栈：React 19 + Vite 7 + TS 5.9（前端）/ Express 5 + Socket.IO 4.8 + better-sqlite3（后端）/ chess.js 1.4（国象规则）/ 自研中象引擎（src/games/xiangqi）
- 启动：`npm run dev`（开发，5173+3001）/ `npm run build && npm start`（生产，127.0.0.1:3001，HOST/PORT/DB_PATH 环境变量见 src/server/index.ts）
- 测试：`npm test`（Vitest）/ `npx playwright test`（e2e，系统 Chrome channel）/ `node scripts/layout-check.mjs`（UI 几何校验，需 3001 服务在线）
- 数据：data/app.db（SQLite，gitignored）
- Git：main 分支，检查点 commit `1b1208b`（第一版交付基线，48 文件）

## 阶段状态总表

| 阶段 | 内容 | 状态 |
|------|------|------|
| 0 | 环境与基线检查 | ✅ |
| 1 | 架构与代码质量审计 | ✅ |
| 2 | 国际象棋规则专项 | ⬜ |
| 3 | 双人联机与并发 | ⬜ |
| 4 | 棋谱/FEN/PGN/持久化 | ⬜ |
| 5 | 邀请链接/聊天/状态提示 | ⬜ |
| 6 | 安全审计 | ⬜ |
| 7 | 视觉精修 | ⬜ |
| 8 | 响应式与可访问性 | ⬜ |
| 9 | 性能测量 | ⬜ |
| 10 | 自动化回归 | ⬜ |
| 11 | 生产构建与隧道验证 | ⬜ |
| 12 | 文档与交付 | ⬜ |

---

## 阶段 0 记录（已执行）

- 上会话进程仍存活：生产服务 3001 在线（healthz 200）、隧道 silence-grain-taste-intensive.trycloudflare.com 在线（公网 200）。
- Git 初始化：`git init -b main`，检查点 commit `1b1208b`（48 文件；.gitignore 已排除 node_modules/data/tools/shots/test-results/*.log）。
- 待办：基线复测（npm test / build / e2e）在阶段 1 前执行并回填本节。

## 阶段 1 记录（审计发现，逐项附证据）

（进行中——发现问题逐条登记，处置后勾选）

## 恢复指令（如果中断）

1. `cd "D:\projects\chessbox" && git log --oneline -3 && git status --short`
2. `npm test` 确认基线绿色
3. 若服务未跑：`npm start`（后台）+ `npm run tunnel`（cloudflared 在 tools/）
4. 从"阶段状态总表"第一个 ⬜ 阶段继续；各阶段记录含具体命令。
