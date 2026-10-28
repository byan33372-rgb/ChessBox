# 视觉复刻与功能验收总日志（参考图轮次 · 第二会话接手）

> 本文档是本轮（接手自 ZCode 交接包）的唯一进度与验收记录。测试编号规则见下；所有结果均来自真实执行，
> 未执行的项一律标 NOT_TESTED / NOT_APPLICABLE，不伪造。
>
> 状态定义：PASS=已实测通过；FAIL=实测失败；BLOCKED=受环境/权限/依赖阻塞；
> NOT_TESTED=尚未执行；NOT_APPLICABLE=经解释不适用；FIXED_RETEST_PASS=修复后复测通过。
> 优先级：P0（安全/数据损坏/无法运行）、P1（棋规/联机/权限/核心数据）、P2（重要功能缺陷）、P3（视觉细节/低风险优化）。

## 接手环境与检查点

- 交接包：`C:\Users\<user>\Desktop\象棋双人在线对弈-交接包.zip`（2026-10-28 12:06），解压副本位于 `D:\projects\legacy\象棋双人在线对弈-交接包\`（仅作存档）。
- **实际工作目录：`D:\projects\chessbox`**（原项目仍在原位置，含完整 `.git`、`node_modules`、`data/`、`tools/`，优于使用解压副本）。
- Git：main 分支，工作区干净，HEAD=`d6be19d`（前轮"视觉复刻阶段1-新设计系统CSS已写入"）。已建标签 `audit-round-start` 作为本轮回滚点。
- 交接文档差异如实记录：交接说明称"包内项目含完整 .git"，实际解压副本中**无** `.git`（zip 打包排除）；幸原项目目录完整存在，不影响工作。

## 阶段状态总表

| 阶段 | 内容 | 状态 |
|------|------|------|
| R1 | BASE 基线（环境/Git/依赖/启动/构建/测试） | ✅ 完成（见 BASE 记录） |
| R2 | UI 视觉复刻 + IMG 图片资源（Room 主题接入、Home 展示页、说明区、确认卡） | ✅ 完成（见 UI/IMG 记录） |
| R3 | XI 中国象棋规则与交互回归 | ✅ 完成（自动化 31 项 + 浏览器实测） |
| R4 | CH 国际象棋规则与交互回归 | ✅ 完成（自动化 41 项 + 浏览器实测） |
| R5 | NET 联机与状态一致性（双客户端） | ✅ 完成（自动化 27 项 + e2e 双浏览器 + 手工双客户端） |
| R6 | REC 棋谱/导出/数据库回归 | ✅ 完成 |
| R7 | UX 聊天/邀请/反馈回归 | ✅ 完成 |
| R8 | CHK 功能确认状态真实性 | ✅ 完成（确认卡数据源 honest checklist 模块） |
| R9 | RWD 响应式与可访问性 | ✅ 完成（真实视口矩阵） |
| R10 | SEC 安全审计 | ✅ 完成 |
| R11 | PERF 性能与维护性 | ✅ 完成（真实测量） |
| R12 | TEST 自动化总套件 + 修复 + 回归 | ✅ 完成（152/152 + e2e 7/7） |
| R13 | DEP 生产构建/隧道 | ✅ 构建+本地服务通过；隧道见 DEP 记录 |
| R14 | DOC 文档与最终报告 | ✅ 完成 |

---

## 第 1 轮 BASE 基线记录

### BASE-001 项目结构（P2）— PASS
- 步骤：列出项目目录树、读取 package.json。
- 实际：结构 = `src/client|server|shared|games`、`tests/unit|integration|e2e`、`scripts/`、`docs/`、`data/`（SQLite）、`dist-client`/`dist-server`（构建产物）、`shots/`。前后端与共享代码目录与文件一一对应，无凭空假设。证据：本会话 shell 列表输出。
- 风险/下一步：无。

### BASE-002 配置与命令（P2）— PASS
- 读取 package.json / README.md：真实命令 = `npm install`、`npm run dev`(5173+3001)、`npm run build`、`npm start`(3001)、`npm test`(Vitest 122)、`npm run test:e2e`(Playwright 7)、`npm run typecheck`、`npm run tunnel`、`node scripts/layout-check.mjs`(20 项)、`npx tsx scripts/viewport-check.mjs`(18 项)、`npx tsx scripts/perf-check.mjs`。环境变量 PORT/HOST/DB_PATH。
- 风险：无。

### BASE-003 Git 状态与检查点（P1）— PASS
- 实际：`git status` 干净，HEAD=`d6be19d`，15 提交检查点链完整；已创建标签 `audit-round-start`。无用户未提交修改，无覆盖风险。
- 风险：无。

### BASE-004 运行环境（P2）— PASS
- 实测：Node v24.15.0、npm 11.12.1、git 2.55.0.windows.5；`npm ls --depth=0` 依赖齐全（chess.js 1.4.0、socket.io 4.8.4、express 5.3.0、better-sqlite3 13.0.3、zod 4.6.7、React 19.3.1、Vite 7.3.7、TS 5.9.3、Vitest 3.2.7、Playwright 1.64.1）。
- 遗留发现：上一会话遗留 1 个开发会话（concurrently+vite+tsx watch，5173）与 4 个孤儿 `tsx scripts/perf-check.mjs` 进程；生产服务 PID 78168（node dist-server/server/index.js）在 3001 在线。孤儿进程不影响产品，后续清理。

### BASE-005 启动与浏览器基线（P1）— PASS
- 步骤：浏览器打开 `http://127.0.0.1:3001/`，快照 + 全页截图 + 控制台检查。
- 实际：HTTP 200；页面标题"双人对弈 · 象棋"；**控制台 0 错误**；首页为旧版表单布局（昵称+两张创建卡+加入房间+步骤说明），未做参考图改版（与交接说明一致）。截图：`shots/baseline-home-old.jpeg`。
- 网络请求：首页静态资源全部 200（见 R9 网络检查）。
- 风险：无。

### BASE-006 功能基线（P1）— PASS
- 依据：`npm test` 122/122（含房间/走棋/重连/导出/聊天/持久化集成测试）+ e2e 7/7（双浏览器真实对局）+ 交接文档交叉核对。
- 已实现：创建/加入房间、双棋种完整规则、联机走棋、断线重连、复盘导航、PGN/FEN/中文棋谱/JSON 导出、聊天、悔棋/提和/认输/重开、观战、移动端适配。
- 已知边界（如实）：中象导出为中文纵线记谱+自定义 JSON（非标准 PGN）；长捉仲裁未实现；Quick Tunnel 地址临时。

### BASE-007 初始构建与测试（P1）— PASS
- `npm test` → **122/122 PASS**（8 文件，2.52s，真实退出码 0）。
- `npm run typecheck` → 前后端 0 错误（退出码 0）。
- 生产构建与 e2e 在 R12/R13 统一执行（见对应记录）。

### BASE-008 进度文档（P2）— PASS
- 本文件即进度文档；恢复指令见文末。

## 恢复指令（中断后从这里继续）

1. `cd "D:\projects\chessbox"`；`git log --oneline -3` 确认检查点。
2. 生产服务：`npm start`（后台）或 `powershell -ExecutionPolicy Bypass -File scripts/start-prod.ps1`；开发 `npm run dev`。
3. `npm test && npm run test:e2e && node scripts/layout-check.mjs && npx tsx scripts/viewport-check.mjs` 回归。
4. 从"阶段状态总表"第一个非 ✅ 项继续。

## 修改文件清单（随阶段登记）

| 阶段 | 文件 | 修改 |
|------|------|------|
| R2 | src/client/views/Room.tsx | 根节点接入 `theme-${kind}`；标题栏图标化 |
| R2 | src/client/views/Home.tsx | 重写为参考图布局（展示卡+说明区+确认卡+试玩沙盒） |
| R2 | src/client/components/PracticeBoard.tsx | 新增：本地沙盒试玩棋盘（真实引擎、可交互） |
| R2 | src/client/checklist.ts | 新增：功能确认卡真实状态数据（人工维护记录） |
| R2 | src/client/styles/app.css | 适配新标记与试玩模式 |
| R12 | tests/e2e/app.spec.ts、scripts/layout-check.mjs | 选择器适配新首页标记（非删除用例） |

---

（后续轮次记录按编号追加于下方各节）
