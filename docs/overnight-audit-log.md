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
| 2 | 国际象棋规则专项 | ⬜ || 3 | 双人联机与并发 | ⬜ |
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
- Git 初始化：`git init -b main`，检查点 commit `1b1208b`（48 文件；.gitignore 排除 node_modules/data/tools/shots/test-results/*.log）。
- 基线复测（真实输出）：`npm test` → 3 files / 70 tests passed；`npx playwright test` → 7 passed (7.7s)；`npm run typecheck` → 无错误。

## 阶段 1 记录（审计+修复，commit a8260c4）

审计方法：模式扫描（any/空catch/TODO/定时器/火后不理）+ 逐文件走读 server/client/games + 对怀疑点做源码核查与测试验证。扫描结果：无 any、无空 catch、无 TODO；定时器均有 unref/cleanup。

真实缺陷与处置（全部已修复并回归 70/70 + 双端 typecheck）：

| 编号 | 等级 | 位置 | 问题 | 修复 |
|------|------|------|------|------|
| A1 | P1 | src/client | 无错误边界：渲染异常=白屏 | 新增 ErrorBoundary（重试/回首页/刷新），包裹 App |
| A14 | P1 | roomClient.ts doJoin | 频繁重连触达 joinLimit 后误入"致命"终态（网络抖动→假死） | RATE_LIMITED → 2.5s 退避重试（上限 8 次），仅真错误才 fatal |
| A13 | P2 | rooms.ts cleanupStale | 内存 sessions Map 随房间删除永不清理（长期运行泄漏） | SessionInfo 增加 roomId，删房时同步清内存索引 |
| A15 | P2 | rooms.ts cleanName | 玩家名可含控制字符 → PGN 头注入/日志污染 | 过滤 U+0000-1F/U+007F/U+2028/2029 |
| A6 | P2 | http.ts SPA 回退 | /package.json、/.env 等带扩展名/点路径返回 200 index.html | 仅无扩展名页面路径回退；其余走 404 |
| A16 | P3 | store/rooms | appendMove 与 saveRoom 非同事务（崩溃窗口半写） | 新增 appendMoveAndSaveRoom 事务方法 |
| A4 | P2 | roomClient actions | useMemo 依赖 state → 每次广播重建 actions | stateRef 引用最新局面，actions 引用稳定 |
| — | P3 | roomClient | 死变量 joined / 未使用 ref lastReason | 删除 |

复核无问题（记录结论）：断线重连与旧 socket 解绑以 socketId 比较保护（新连接不会被旧 disconnect 误清）；观战者计数有 delete；better-sqlite3 全参数化；CSP/Origin 校验完备；广播为全量快照是记录在案的取舍（见阶段 9 测量）。

## 恢复指令（如果中断）

1. `cd "D:\projects\chessbox" && git log --oneline -3 && git status --short`
2. `npm test` 确认基线绿色
3. 若服务未跑：`npm start`（后台）+ `npm run tunnel`（cloudflared 在 tools/）
4. 从"阶段状态总表"第一个 ⬜ 阶段继续；各阶段记录含具体命令。
