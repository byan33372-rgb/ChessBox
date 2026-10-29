# 验收日志（本轮完整质量验收）

> 开始检查点：git HEAD = `2dd6302`（main 分支，工作区干净）。
> 最终交付检查点：见 git log（本轮修复 + 验收文档提交）。
> 环境：Windows / Chrome 155（Playwright `channel: 'chrome'`）/ 20 逻辑核 / DPR 1 /
> 视口 1280×800（视觉另测 375/768/1024/1440）/ 显示器实测刷新率 **165–167 Hz**（rAF 与 vsync 锁定）。

## 阶段 0：安全接管与基线（BASE-001~007）

- BASE-001：结构/README/package.json 审读——Node >= 20.19（实测 v24.22.1）；npm scripts：
  dev / build(client+server) / start / test(vitest unit+integration) / test:e2e(playwright) /
  typecheck(client+server tsc) / tunnel。scripts/ 27 个测试与运维脚本；vitest 3 工程。
- BASE-002：git 工作区干净，main 单分支，HEAD=`2dd6302`——安全恢复点。
- BASE-003：docs/board-piece-animation-audit.md + 全部脚本核对。任务书提及 `scripts/e2e*` 不存在；
  e2e 位于 tests/e2e/app.spec.ts（Playwright 配置自起 3100 服务）。
- BASE-004：基线（原始输出 logs/）：
  | 检查 | 命令 | 结果 | 日志 |
  |------|------|------|------|
  | 类型检查 | `npm run typecheck` | OK | logs/base-typecheck.txt |
  | 单元+集成 | `npx vitest run` | 10 文件 148/148 | logs/base-vitest.txt |
  | 生产构建 | `npm run build` | OK | logs/base-build.txt |
  | lint | — | **项目无 lint 脚本**（如实记录，未加空检查） | — |
- BASE-005/006：真实浏览器检查 + 截图（docs/acceptance/shots/）。
- BASE-007：docs/acceptance/ 建立。

> 误判记录：`/api/health` 404 被误判为“服务 DOWN”；实际端点为 `/healthz`。后续以首页 200 + bundle 名判定。

## 阶段 1：双棋类规则（GAME-001~015）

命令：`npx vitest run tests/unit/xiangqi-engine.test.ts tests/unit/chess-rules-deep.test.ts tests/unit/chess-adapter.test.ts --reporter=verbose`
结果：**84/84 通过**（logs/stage1-rules-verbose.txt）。覆盖：初始局面/44 走法/兵种数量；马腿、象眼、
炮架（0/1/2）、兵卒过河与底线、九宫、将帅照面；将军/应将/将死/困毙；重复局面仲裁（长将判负、
否则判和）、60 回合无吃子、双方无攻击子力；国象六子走法/阻挡；易位全部非法条件；吃过路兵窗口与
移除位置；升变 4 选项/SAN/非法升变子；将杀/逼和/三次重复/50 回合/子力不足；非法走棋拒绝；
认输/提和/悔棋/重开/终局禁走（integration）；特殊残局 FEN 驱动。

## 阶段 2：房间、联机与服务端权威（NET-001~014）

- `npx vitest run --project integration --reporter=verbose` → **43/43**（logs/stage2-integration-verbose.txt）：
  建房/加入/观战/满员/无效 ID、走棋协议（一致性/revision/幂等/过期 revision/畸形载荷）、
  并发原子（同 revision 仅一步成功、双方同时仅轮次方成功）、升变、断线重连、令牌错误、
  重启恢复（SQLite）、认输/提和/悔棋/重开、聊天（顺序/XSS 文本/长度/限频/重连历史/重启恢复）、
  安全（敏感路径/安全头/畸形 Socket/伪造字段）。
- `node scripts/net-check.mjs` → **15/15 PASS**（logs/stage2-net-check.txt）。
- 补充：第三人观战探针（logs/probe-spectator.txt）——身份“观战”、无操作按钮、邀请链接可复制。

## 阶段 3：棋谱、复盘、导出与持久化（HIST-001~012）

- 单元：`npx vitest run tests/unit/exporters.test.ts --reporter=verbose` → **9/9**（logs/stage3-exporters-verbose.txt）。
- UI 实测：`node scripts/acceptance-hist.mjs` → **15/15 PASS**（logs/stage3-hist.txt）：
  双列棋谱对齐（炮二平五/马8进7…）、开局/上一步/下一步/当前导航、浏览历史不改权威状态、
  返回当前可继续对弈、快速导航无残影、复制 FEN（真实剪贴板读取 + chess.js 解析一致）、
  PGN 下载可回放（3 步）含 Event/White、中象 JSON `format=chessbox-xiangqi-v1` +
  “非通用标准 PGN”声明 + 末步 fenAfter=界面 FEN、中文棋谱下载、剪贴板拒绝反馈“复制失败”、
  刷新后棋谱/FEN 一致、空棋谱导航禁用且导出 moves=[]。
- 持久化异常：`src/server/store.ts::loadRooms` 对损坏行 try/catch 跳过、不中断启动（HIST-012 依据）。

## 阶段 4/5：双棋种视觉（CN-VIS / INT-VIS）

- 截图（最终构建）：docs/acceptance/shots/{home-desktop, xiangqi-room-desktop, chess-room-desktop,
  xiangqi-room-mobile375, xiangqi-room-mobile375-scrolled, xiangqi-mobile375, chess-mobile375,
  xiangqi-tablet768, chess-hidpi2x, xiangqi-playing, xiangqi-selected, chess-playing, chess-selected,
  xiangqi-landscape667x375}.png
- 量化（logs/probe-visual-after.txt）：中象盘 340×378、格 31.2、棋子 34.6（1.111×格）、
  红字 rgb(179,53,44) 对棋子底 5.63:1、黑字 13.77:1；国象 64 格、棋子/格 0.92、16 个坐标标注。
- 目检：木纹盘面、圆形棋子、汉字居中锐利；楚河汉界/九宫/坐标清晰；国象 Staunton 棋子、
  深浅格与白/黑棋子轮廓清楚；选中环/合法点/最后一步/将军可用颜色区分。

### 修复 FIX-001（P3 视觉）：中象边线棋子遮挡行号/列字母

- 复现：初始局面下，i 线在第 0/3/6/9 行的棋子覆盖右侧行号；底线九子覆盖底部列字母
  （裁剪图 docs/acceptance/shots/_crop-coords.png 可见 0/3/6/9 缺失）。
- 根因：坐标定位在盘内木框带（`left: (W-MARGIN/2)/W`、`top:(H-MARGIN/2)/H`），而边线棋子
  外缘距盘边仅 ~1.6px，框带被完全覆盖。
- 修复：`XiangqiBoard` 根改为 `.xq-wrap` 包裹层，行号/列字母移到棋盘外侧独立标尺带
  （`.xq-ranks` / `.xq-files`，18px/16px），盘面宽度相应缩 18px；试玩卡与房间同步生效。
- 回归：零棋子-坐标重叠（probe-visual-after）；shots 重拍（_crop-coords-after.png 0–9 全可见）；
  layout 20/20、rwd 12/12、viewport 全过、anim-verify 15/15、e2e 7/7。
- 备注：修复中一度出现 `.xq-wrap` 在 flex 容器 shrink-to-fit 塌缩（盘面 1.3px），补
  `width:100%` 后恢复；试玩卡随包裹层变宽导致棋盘左对齐，补 `.gc-preview .xq-wrap`
  358/318px 定宽后居中——均为构建后实测发现并修正。

## 阶段 6：走棋动画专项（ANIM-001~020）

- `node scripts/anim-verify.mjs` → **15/15 PASS**（logs/stage6-anim-verify.txt）：
  flight 生命周期/落位精确/对手步同播/复盘不动画/吃子层/易位落位/重连不重播/动效开关。
- `node scripts/anim-extra.mjs` → **4/4 PASS**（logs/stage6-anim-extra.txt）：
  resize 中动画最终对位、reduced-motion 跳过动画、升变确认后呈现、快速连续无残影 32 子完整。
- `node scripts/anim-special.mjs` → **6/6 PASS**（logs/stage6-anim-special.txt）：
  马腿蹩住/让开、将军指示、挡将解除、愚人杀终局锁、过路兵 captured 层。
- 性能侧证据：H/J/I/D/K/E/F/G 场景的 settle 与完整性（见阶段 7）。

## 阶段 7：60–120 FPS 与交互性能（PERF-001~022）

### 方法（可复现）

- 脚本：`scripts/acceptance-perf.mjs`（A–N、P、网络分段、DPR2、reduced-motion）
  + `scripts/acceptance-perf-5min.mjs`（O）。
- 采样：页面内自停 rAF Promise（只记时间戳，不渲染、不改权威状态）；动画窗口 =
  目标格点击 → 飞行层过渡结束 + 卸载（事件驱动）。
- 统计：平均 FPS=1000×(n−1)/首尾差；中位/P95/P99 帧时间；超 16.67ms 与 8.33ms 帧数/比例；
  长帧 >33.4ms；max；click→transitionend 与 fly 挂载→transitionend。
- 输入响应：`el.click()` 同步派发 → MutationObserver 捕获选中环（本地 UI，不含网络）。
- 网络分段：提交点击→本端棋谱（ack）；→对方端棋谱（广播）。本机回环单独报告。
- headed Chrome（headless 无 vsync，曾测 450+fps 假数据，已弃用）+ 反降频参数
  （`--disable-backgrounding-occluded-windows --disable-renderer-backgrounding
  --disable-background-timer-throttling --disable-features=CalculateNativeWinOcclusion`）。
- 防污染：练习沙盒严格轮次 + 判和（60 回合/三次重复）→ 4 手换边合法循环 + 每 8 手重开 +
  逐手落点校验，避免把判和后的静止帧当动画帧。
- 环境稳定性：长跑时机（显示器休眠/系统遮挡）会造成 ~1s 帧间隔；已用
  `SetThreadExecutionState(ES_CONTINUOUS|ES_DISPLAY_REQUIRED)` 保持唤醒，并在最终一轮确认
  B/C 各 240/240 动画、0 失败。

### 主场景结果（最终构建，JSON: perf-results.json）

环境：Chrome 155 / 20 核 / DPR 1 / 1280×800 / 实测刷新率 **167Hz**（众数 6ms，771/775）/ reduced=false。

| 场景 | 动画/采样 | 帧数 | 平均 FPS | 中位 | P95 | P99 | max | >16.67ms | 长帧 | click→settle 中位/P95 |
|------|----------|------|----------|------|-----|-----|-----|----------|------|----------------------|
| A 静止 | — | 775 | 154.6 | 6.1 | 6.1 | 6.2 | 321.2 | 1 (0.13%) | 1 | — |
| B 中象普通 | 240 | 8477 | 151.4 | 6.1 | 6.2 | 6.2 | 193.8 | 31 (0.37%) | 30 | 196.5 / 198.6 ms |
| C 国象普通 | 240 | 8547 | 151.8 | 6.1 | 6.2 | 6.2 | 169.7 | 32 (0.37%) | 31 | 196.8 / 198.4 ms |
| R 国象 DPR2 | 40 | 1428 | 153.6 | 6.1 | 6.2 | 6.2 | 169.8 | 4 (0.28%) | 4 | 197.2 / 200.2 ms |
| H 中象炮吃 | 1 | 38 | 165.0 | 6.1 | 6.1 | 6.2 | 6.2 | 0 | 0 | 208.8 ms |
| J 快速连续 | 2 | 121 | 163.6 | 6.1 | 6.2 | 6.2 | 12.1 | 0 | 0 | 230.5 ms |
| I 翻转 | — | 77 | 165.0 | 6.1 | 6.2 | 6.2 | 6.2 | 0 | 0 | — |
| D 国象吃子 | 1 | 34 | 140.2 | 6.1 | 24.2 | 24.2 | 24.2 | 2 (5.88%) | 0 | 243.5 ms |
| K 对手端回吃 | 1 | 36 | 152.3 | 6.1 | 12.1 | 18.2 | 18.2 | 1 (2.78%) | 0 | 动画 208 ms；peerVisual 11 ms |
| E 易位 | 2 | 35 | 157.0 | 6.1 | 12.0 | 12.1 | 12.1 | 0 | 0 | 214.2 ms |
| F 过路兵 | 1 | 38 | 156.7 | 6.1 | 12.1 | 12.2 | 12.2 | 0 | 0 | 225.5 ms |
| G 升变 | 1 | 41 | 161.0 | 6.1 | 6.1 | 12.1 | 12.1 | 0 | 0 | 239.4 ms |
| L 棋谱快导 | — | 192 | 163.3 | 6.1 | 6.1 | 6.2 | 18.2 | 1 (0.52%) | 0 | — |
| M resize | — | 148 | 161.7 | 6.1 | 6.2 | 12.1 | 18.2 | 1 (0.68%) | 0 | — |
| P CPU 4× | 40 | 1551 | 132.4 | 6.1 | 12.2 | 24.3 | 247.1 | 63 (4.06%) | 6 | 224.8 / 238.0 ms |

- 输入响应（本地选中环，60 样本）：中位 **0.7ms**，P95 **1.2ms**，max 2.3ms（目标 ≤50ms）。
- 网络分段（12 手，本机回环）：ack 中位 12.6ms；对方端棋谱中位 15ms。
- reduced-motion（Q）：matchMedia=true，走棋后飞行层 0 个，19.7ms 内到达终态。
- DPR2（R）：与 DPR1 同档（P95 6.2ms）。
- N 后台冻结→恢复：恢复后 2 步、d5 黑兵、无卡半途飞行层。
- 完整性：H b0=红炮；K 双端 6 步且 e5=黑马；E 王 g1/车 f1；F d6 白兵且 d5 空；G b8 白后；
  J 双端 2 步/32 子/无飞行层；L 0 飞行层/32 子/4 步。
- 长帧说明：B/C 的 30/31 个长帧集中在每 8 手一次的测试装置“重开试玩”（引擎重建整盘渲染）；
  归因实验（logs/probe-resetlong.txt）对 80 窗口两种重开方式均只有 1 个长帧（窗口最大帧中位 6.2ms）；
  无重开的真实对局场景长帧 0–1 个。**连续对弈 5 分钟场景 O：49432 帧仅 9 个长帧（0.018%，见下）**。

### 场景 O：连续对弈 5 分钟（PERF-004 O / PERF-016）

<!-- O-RESULT-START -->
- 时长 300s；**287 轮 × 4 手 = 1148 手落点校验，0 失败轮**（每轮验 h7 红炮 / h2 黑炮归位）。
- 帧采样 **49432 帧**；平均 **164.4 FPS**；中位 6.1ms；P95 **6.2ms**；P99 **6.2ms**；
  超 16.67ms 帧 16 个（0.032%）、超 8.33ms 帧 63 个（0.13%）、长帧（>33.4ms）**9 个（0.018%）**。
- 内存：每 30s 采样，堆在 8.4–15.5MB 间波动（V8 GC 周期），首末差 +5.5MB，无单调增长趋势；
  DOM 节点 1055→955（-100，重开/瞬态节点回收），**无增长**。
- 终局完整性：32 子、0 飞行层、0 被吃层、h7 红炮 / h2 黑炮（与轮次归位一致）。
- 说明：早期脚本（单向穿梭 + 不重开）在 120 手判和后仍计时，数据作废；本结果为 4 手换边 +
  每 2 轮重开的有效连续对弈数据。
<!-- O-RESULT-END -->

### 工具缺陷与修正（验收脚本自身，非产品缺陷）

1. `startProbe` 的 evaluate 等待页面 Promise 而 resolve 依赖 endProbe → 死锁（首版卡死 15 分钟）。
   修正：Promise 存页面，安装立即返回，`__endRaf()` 后由 readProbe 取值。
2. 固定 300ms 等待与 180ms 过渡 + 双 rAF 启动竞态（settle 仅 1/120）→ 事件驱动窗口。
3. 首页两个试玩棋盘坐标重名，全局 querySelector 命中中象棋盘 → 国象点击全失效；
   修正：所有沙盒选择器限定 `.practice-board[data-kind=…]`。
4. 沙盒严格轮次 + 判和：单向穿梭使大部分点击无效（静止帧当动画帧）；修正：4 手换边 + 定期重开 +
   逐手校验。
5. headless rAF 无 vsync（450+fps 假数据）→ 全部改 headed；CDP screencast 受编码节流不可作帧率计。
6. `Page.setWebLifecycleState 'hidden'` 被本 Chrome 拒绝 → 用 `'frozen'`。
7. 双窗口并行时仅对前台窗口采样（bringToFront），对方端状态用 DOM 完整性校验。
8. Windows 原生遮挡检测 + 显示器休眠会降频（曾测得 1s 帧间隔、B/C 大量失败）→ 增加
   `--disable-features=CalculateNativeWinOcclusion` 与 SetThreadExecutionState 保持唤醒；
   遮挡探针（logs/probe-occlusion.txt）证明被覆盖窗口仍 165fps/max 6.2ms。

## 阶段 8：响应式布局（RWD-001~010）

- `node scripts/rwd-check.mjs` → **12/12**（logs/final-rwd.txt）：1440/1280/1024/820/414/375 首页无横向溢出；
  中象/国象房间 1280 与 375 无溢出、按钮可达、翻转棋盘真实生效（棋子纵向互换）。
- `node scripts/viewport-check.mjs` → 全过（logs/stage8-viewport-final.txt）：1024/768/667×375/320 无溢出、
  棋盘 530/542/282/282px、30 步双端一致、长昵称不溢出、键盘 Tab 可遍历、复盘 29/30。
- `node scripts/layout-check.mjs` → **20/20**（logs/final-layout.txt）：格子/棋子/对齐/侧栏/棋谱/选中点/
  坐标 16/移动端热区 31px。
- `node scripts/ux-check.mjs` → **9/9**（logs/stage8-ux.txt）；`chk-check.mjs` → **8/8**（logs/stage8-chk.txt）。
- 修复 FIX-002（P2 响应式）：**手机横屏 667×375 棋盘仅 97px（格 ~10px，不可用）**。
  根因：`.board-wrap` 宽 `min(100%, 640px, calc(100vh-220px))`，≤980 断点又为
  `min(100%, calc(100vh-260px), 560px)`，375 高度 → 115px。修复：两处均加 `max(300px, …)` 下限
  （短视口允许纵向滚动）。回归：667×375 棋盘 **282px**（格 25.8px），无横向溢出；
  viewport-check 增加 `board.width >= 240` 断言防回归。

## 阶段 9：安全、可靠性与资源（SEC-001~012）

- `node scripts/sec-check.mjs` → **9/9**（logs/stage9-sec.txt）：敏感路径 404（.env/package.json/
  data/app.db/node_modules/src/logs）、SPA 200、nosniff/SAMEORIGIN/no-referrer/Permissions-Policy/
  CSP（无 unsafe-eval）、/healthz 200、/api/* JSON 404 不泄露。
- integration security 8 项 + concurrency 7 项覆盖服务端权威校验、伪造身份、令牌跨房、限流。
- 依赖：`npm audit --omit=dev` → **0 漏洞**；完整 audit → 3 个（1 moderate + 2 critical，全部在
  **开发依赖** vitest/tinypool/@vitest/mocker，仅测试工具链；修复需 vitest 5 major，未在验收中升级）。
- 产物：dist-client bundle 扫描无 `app.db/DB_PATH/process.env/密钥` 标记；前端不含服务端配置。
- 资源清理：5 分钟 O 终局 DOM 增长 0、堆 +0.9MB；N 场景恢复无残留飞层；SEC-011 依据。

## 阶段 10：构建、生产模式与部署（BUILD-001~009）

- `npm run typecheck` OK；`npm run build` OK（最终 bundle `index-D5tzqaqW.css` + `index-DrgBxrHq.js`）；
  `npx vitest run` 148/148；`npx playwright test` **7/7**（logs/final-e2e.txt）。
- 生产服务：`node dist-server/server/index.js` → 首页 200、bundle 最新；冷启动到 `/healthz` 200
  **1812ms**（logs/stage10-boot.txt，PID 124412）。
- 直接访问 `/r/<id>`、刷新恢复、非法路径由 e2e/net-check/security 覆盖；`/healthz` 200。
- 公网隧道：`tunnel.log` 最后记录（2026-10-28 11:27）Quick Tunnel 验证为 **HTTP 530 不可达**；
  本轮未获得新的可用公网地址 → **未验证**。复现命令：`npm run tunnel`（需外网 + cloudflared）。

## 阶段 11：自动修复与重复验收

| 编号 | 级别 | 问题 | 修复 | 回归 |
|------|------|------|------|------|
| FIX-001 | P3 视觉 | 中象边线棋子遮挡行号 0/3/6/9 与列字母 | 坐标移至盘外标尺带（包裹层） | shots/visual/layout/rwd/viewport/anim/e2e 全绿 |
| FIX-002 | P2 响应式 | 手机横屏棋盘 97px 不可点击 | `.board-wrap` 宽度 300px 下限（两处断点） | 667×375 → 282px；viewport 断言 ≥240px |
| FIX-003 | 测试 | layout 把飞行层棋子计入 32 子（33） | 选择器限定 `.chess-sq .chess-piece` / `.board-overlay > .xq-piece` | layout 20/20 |
| FIX-004 | 测试 | shots.mjs 点击卡片不建房 | 改点 `.gc-create-btn` | shots DONE |
| FIX-005 | 测试 | viewport 只判“不超宽”，横屏塌缩漏检 | 增加棋盘宽度下限断言 | 全过 |

产品代码仅改 `XiangqiBoard.tsx` + `app.css`（视觉/响应式）；**未改规则引擎、联机协议、数据库结构**。

## 阶段 12/13：Gate 与最终报告

见 `docs/acceptance/final-acceptance-report.md`（Gate A–O、15 项交付内容、命令与已知问题）。