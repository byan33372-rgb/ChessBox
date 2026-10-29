# 最终验收报告（中国象棋 + 国际象棋在线对弈）

> 验收类型：完整质量验收（规则、联机、棋谱、视觉、动画、帧率、响应式、安全、构建）
> 结论：**在本地生产模式、桌面与移动浏览器范围内达到发布条件**（Gate A–O 全部 PASS，
> 已知残余问题见 §14，均不阻塞发布）。
> 本报告所有数字均来自本轮真实执行；未执行的项明确标注 NOT TESTED/BLOCKED，不做推断性宣称。

---

## 1. 项目版本、分支与检查点

| 项 | 值 |
|----|----|
| 仓库 | `D:\projects\chessbox` |
| 分支 | `main`（单分支） |
| 验收起始检查点 | `2dd6302`（棋盘/棋子/动画专项完成后的干净工作区） |
| 本轮交付检查点 | `git log` 中提交信息以「验收: 中象坐标外置修复」开头的提交（父提交 `2dd6302` 为验收起点） |
| 最终构建产物 | `dist-client/assets/index-DrgBxrHq.js` + `index-D5tzqaqW.css`；`dist-server/server/index.js` |
| 运行模式 | 生产构建 + `node dist-server/server/index.js`（端口 3001，SQLite 持久化） |

## 2. 实际运行环境

| 项 | 值 |
|----|----|
| OS | Windows（Node v24.22.1） |
| 浏览器 | Google Chrome **155.0.0.0**（Playwright `channel:'chrome'`，headed） |
| CPU | 20 逻辑核 |
| GPU | 未获取到可靠的硬件级 GPU 型号/占用（浏览器未暴露），性能以 rAF 帧时间为准 |
| 显示器刷新率 | **实测 165–167 Hz**（`requestAnimationFrame` 与 vsync 锁定：众数间隔 6ms，771/775；空闲 154.6–165 fps） |
| 视口 / DPR | 主性能 1280×800 @ DPR 1；另测 DPR 2（deviceScaleFactor=2）；视觉 375/768/1024/1440 |
| 电源模式 | 插电（台机）；测试期间用 `SetThreadExecutionState` 保持显示唤醒，防止息屏降频 |
| 其他 | 项目 `npm run dev`（用户常驻）与隧道脚本进程存在，性能测试期间无人工操作；系统 CPU 占用约 4% |

## 3. 修改文件清单及目的

### 产品代码（仅视觉/响应式，无规则/协议/库表变更）

| 文件 | 修改目的 |
|------|----------|
| `src/client/components/XiangqiBoard.tsx` | 根节点改为 `.xq-wrap` 包裹层；行号/列字母移至棋盘外侧独立标尺带（修复边线棋子遮挡坐标，FIX-001）；盘内坐标节点删除 |
| `src/client/styles/app.css` | 新增 `.xq-wrap/.xq-ranks/.xq-files/.xq-rank/.xq-file` 样式；`.gc-preview .xq-wrap` 定宽居中（358/318px）；`.board-wrap` 宽度增加 300px 下限（基础 + ≤980px 断点，修复手机横屏棋盘过小，FIX-002） |

### 测试/证据工具（非产品逻辑）

| 文件 | 目的 |
|------|------|
| `scripts/acceptance-perf.mjs`（新增） | 阶段 7 主性能采样（A–N、P、网络分段、DPR2、reduced-motion），真实 rAF、事件驱动窗口 |
| `scripts/acceptance-perf-5min.mjs`（新增） | 场景 O：连续对弈 5 分钟 + 内存/DOM 采样 |
| `scripts/acceptance-hist.mjs`（新增） | 阶段 3 HIST-001~012 UI 实测（双客户端、剪贴板、下载文件解析） |
| `scripts/probe-{raf,settle,chess-cycle,viewmove,spectator,visual,longframes,resetlong,occlusion,home-layout,landscape,bulk-iso}.mjs`（新增） | 环境/行为探针与归因实验（帧率锁定、settle 事件、坐标遮挡、遮挡降频、布局等） |
| `scripts/layout-check.mjs` | 修正计数口径（排除飞行层棋子）FIX-003 |
| `scripts/shots.mjs` | 修正建房按钮选择器（`.gc-create-btn`）FIX-004 |
| `scripts/viewport-check.mjs` | 增加棋盘宽度下限断言（≥240px）FIX-005 |
| `docs/acceptance/**`（新增） | 日志、性能 JSON、截图、本报告 |

> **未修改**：规则引擎（`src/games/**`）、联机协议（`src/server/**`）、数据库结构（`data/app.db` schema）、
> 动画实现（`useMoveFlight/boardAnim`）本轮均未改动。

## 4. 全部验收编号结果

### 4.1 功能编号

| 组 | 编号范围 | 结果 | 证据 |
|----|----------|------|------|
| 基线 | BASE-001~007 | PASS | logs/base-*.txt；git `2dd6302` |
| 棋规 | GAME-001~015 | PASS | logs/stage1-rules-verbose.txt（84/84） |
| 联机 | NET-001~014 | PASS | logs/stage2-integration-verbose.txt（43/43）+ logs/stage2-net-check.txt（15/15）+ logs/probe-spectator.txt |
| 棋谱 | HIST-001~012 | PASS | logs/stage3-exporters-verbose.txt（9/9）+ logs/stage3-hist.txt（15/15） |
| 中象视觉 | CN-VIS-001~012 | PASS（FIX-001 后） | docs/acceptance/shots/*.png + logs/probe-visual-after.txt |
| 国象视觉 | INT-VIS-001~010 | PASS | 同上 |
| 动画 | ANIM-001~020 | PASS | logs/stage6-anim-{verify,extra,special}.txt（15+4+6）+ 性能场景 H/J/D/K/E/F/G/I/L/M/N |
| 性能 | PERF-001~022 | PASS（60/120Hz 说明见 §11） | docs/acceptance/perf-results.json、perf-5min.json、logs/stage7-perf*.txt |
| 响应式 | RWD-001~010 | PASS（FIX-002 后） | logs/final-rwd.txt（12/12）、stage8-viewport-final.txt、final-layout.txt（20/20）、stage8-ux.txt（9/9）、stage8-chk.txt（8/8） |
| 安全 | SEC-001~012 | PASS（开发依赖漏洞见 §14） | logs/stage9-sec.txt（9/9）、npm audit 日志、bundle 扫描 |
| 构建 | BUILD-001~009 | PASS（公网隧道未验证） | logs/final-e2e.txt（7/7）、stage10-boot.txt、final-vitest.txt |

### 4.2 最终 Gate（只使用 PASS / FAIL / BLOCKED / NOT_TESTED）

| Gate | 内容 | 结果 | 关键依据 |
|------|------|------|----------|
| A | 基础构建与静态检查 | **PASS** | typecheck OK；build OK；vitest 148/148；e2e 7/7；无 lint 脚本（如实记录） |
| B | 中国象棋规则 | **PASS** | 84 条规则测试全过（马腿/象眼/炮架/兵卒/九宫/照面/将死/困毙/重复/长将/60 回合） |
| C | 国际象棋规则 | **PASS** | 易位全部非法条件、过路兵、升变、将杀/逼和/三次重复/50 回合/子力不足 |
| D | 双客户端联机与重连 | **PASS** | integration 43/43 + net-check 15/15 + e2e 重连 + K/N 场景 |
| E | 棋谱、复盘与导出 | **PASS** | exporters 9/9 + HIST 15/15（含 FEN/PGN/JSON/剪贴板拒绝/刷新一致） |
| F | 中国象棋棋盘与棋子视觉 | **PASS** | 截图 + 量化（棋子 1.111×格、红字 5.63:1、黑字 13.77:1、坐标 0–9 全可见） |
| G | 国际象棋棋盘与棋子视觉 | **PASS** | 64 格、棋子/格 0.92、16 坐标、Staunton 统一素材、翻转正确 |
| H | 普通移动、吃子及特殊走法动画 | **PASS** | anim 25/25 + 性能场景 D/E/F/G/H/J/K 的 settle 与完整性 |
| I | 桌面与移动端响应式 | **PASS** | rwd 12/12、viewport 全过（棋盘 ≥240px 断言）、layout 20/20、横屏修复 |
| J | 60 Hz 帧率与帧时间 | **PASS** | 16.67ms 预算：P95 **6.2ms**、P99 6.2ms、超预算 ≤0.4%（合成循环）/0.002%（5 分钟）；输入 P95 1.2ms。**说明：环境为 165Hz 面板，未在 60Hz 面板单独复测**（见 §11） |
| K | 120 Hz 帧率与帧时间 | **PASS** | 真实 **165–167Hz**（高于 120Hz）实测：P95 6.1–6.2ms ≤ 8.33ms 预算；空闲 154.6–165fps；未切换到 120Hz 刷新模式（显示器无 120Hz 模式，见 §11） |
| L | 长时间运行与资源清理 | **PASS** | 5 分钟连续对弈：287 轮 / 1148 手校验 / 0 失败 / 49432 帧 / 平均 164.4fps / P95 6.2ms / P99 6.2ms / 长帧 9（0.018%）/ 堆波动 8.4–15.5MB（首末 +5.5MB，无单调增长）/ DOM 无增长 / 终局 32 子无残留（见 §10） |
| M | 安全与异常恢复 | **PASS** | sec 9/9；integration 安全/并发 15 项；生产依赖 0 漏洞；错误路径 JSON 404 |
| N | 生产构建和实际运行 | **PASS**（公网访问 NOT TESTED） | 生产服务 200 + 最新 bundle；冷启动 1812ms；e2e 独立服务 7/7；隧道未验证见 §16 |
| O | 文档、证据与可复现性 | **PASS** | 本报告 + acceptance-log + logs/（原始输出）+ shots/ + perf JSON + 脚本可复跑 |

## 5. 失败项、修复与回归

| 编号 | 级别 | 复现 | 根因 | 最小修复 | 回归证据 |
|------|------|------|------|----------|----------|
| FIX-001 | P3 视觉 | 初始局面右缘行号 0/3/6/9 与底部列字母被边线棋子遮挡（`shots/_crop-coords.png`） | 坐标位于盘内木框带，边线棋子外缘距盘边 ~1.6px，完全覆盖标尺 | 行号/列字母移至棋盘外侧 `.xq-ranks/.xq-files` 标尺带；包裹层 `.xq-wrap`（宽度 +18px 右/+16px 下） | `shots/_crop-coords-after.png`（0–9/a–i 全可见）；probe-visual 零重叠；layout 20/20；rwd 12/12；viewport 全过；anim 15/15；e2e 7/7 |
| FIX-002 | P2 响应式 | 667×375 横屏房间棋盘仅 **97px**（格 ~10px，不可点击） | `.board-wrap` 在 ≤980px 断点用 `calc(100vh-260px)`，375 高 → 115px | 基础与断点两处宽度均加 `max(300px, …)` 下限（短视口允许滚动） | 667×375 棋盘 **282px**（格 25.8px）、无横向溢出（`shots/xiangqi-landscape667x375.png`）；viewport-check 新增 ≥240px 断言 |
| FIX-003 | 测试缺陷 | layout-check 国象子数 33（预期 32） | `.chess-piece` 计数包含飞行层临时棋子 | 选择器限定 `.chess-sq .chess-piece` / `.board-overlay > .xq-piece` | layout 20/20 |
| FIX-004 | 测试缺陷 | shots.mjs 建房后 waitForURL 超时 | 点击卡片容器（无点击事件），应点 `.gc-create-btn` | 修正选择器 | shots 全部截图生成 |
| FIX-005 | 测试缺陷 | viewport-check 对“棋盘过小”漏检 | 只断言不超宽 | 增加 `board.width >= 240` 断言 | 全视口通过 |

> 另有一批**验收脚本自身**的缺陷与修正（非产品）：性能探针死锁（evaluate 等待被自身阻塞的 Promise）、
> 固定等待与过渡完成竞态、首页双棋盘坐标重名导致国象点击失效、练习沙盒判和后静止帧污染、
> headless 无 vsync 假帧率、CDP `hidden` 生命周期不被接受、Windows 遮挡检测/息屏降频等。
> 全部记录于 `docs/acceptance/acceptance-log.md` 阶段 7「工具缺陷与修正」。

## 6. 棋规测试报告

- 命令：`npx vitest run tests/unit/xiangqi-engine.test.ts tests/unit/chess-rules-deep.test.ts tests/unit/chess-adapter.test.ts --reporter=verbose`
- 结果：**84/84 通过**（`logs/stage1-rules-verbose.txt`，逐条可读）。
- 中国象棋：初始 FEN/44 合法走法/兵种数量；车马象士将炮兵卒走法与吃子；马腿（空盘 8 走法、
  蹩腿封两向）；象眼/不过河；炮架 0/1/2 与隔子吃；兵卒未过河/过河/底线；九宫与仕的斜线；
  将帅照面（挡子沿列移动合法/离列非法）；将军与应将（其余走法全部非法）；将死/困毙；
  三次重复（长将方判负、否则判和）；60 回合无吃子；双方无攻击子力判和。
- 国际象棋：初始局面；六子走法/阻挡；易位（王/车动过、路径被占、经攻击格、被将军时禁止）；
  吃过路兵（双步窗口/过期不可吃/移除位置）；升变（4 选项、SAN、非法升变子拒绝）；
  将军/将杀（scholar）/逼和/三次重复/50 回合/子力不足；非法走棋拒绝。
- 联机层权威校验：非法坐标/错误房/非轮次/过期 revision/伪造身份/重复 requestId 均被服务端拒绝
  （integration + security + concurrency，43/43）。

## 7. 联机、重连、棋谱与导出

- 双客户端（独立 browser context）：建房 → 邀请链接 → 加入 → 双方记谱/回合/局面一致；
  非轮次与非法目标无效果；复盘不影响对方；聊天实时；刷新凭令牌恢复席位；悔棋同意回退；
  断线离线徽章 + 第三人观战不抢座；认输终局锁。（net-check 15/15）
- 断线/重连/服务重启：integration「断线后重连」「服务重启后房间/棋谱/会话恢复」全过；
  5 分钟场景中反复重开与连续走子无状态漂移。
- 棋谱/导出（HIST 15/15）：中象两列棋谱（炮二平五/马8进7…）；国象 SAN（e4/e5/Nf3）；
  开局/上一步/下一步/当前；快速导航无残影；复制 FEN（真实剪贴板校验 + chess.js 解析一致）；
  PGN 下载可回放（3 步，含 Event/White/Result）；中象 JSON `chessbox-xiangqi-v1` 且明示
  “非通用标准 PGN”、末步 fenAfter 与界面 FEN 一致；中文棋谱可下载；剪贴板被拒时有“复制失败”反馈；
  刷新后棋谱/FEN 一致；空棋谱导航禁用、导出 moves=[]。
- 持久化：SQLite（`data/app.db`）；`loadRooms` 对损坏行跳过、不中断启动。

## 8. 关键视觉截图（真实运行页面）

| 文件 | 内容 |
|------|------|
| `docs/acceptance/shots/home-desktop.png` | 首页：双棋种创建卡 + 两个可玩试玩盘（最终构建） |
| `docs/acceptance/shots/xiangqi-room-desktop.png` | 中象房间对局中：木纹盘、圆子、楚河汉界、九宫、盘外行号 0–9/列字母 a–i、选中环与合法点 |
| `docs/acceptance/shots/chess-room-desktop.png` | 国象房间（黑方视角，翻转）：8×8 木纹格、Staunton 棋子、坐标、SAN 棋谱 |
| `docs/acceptance/shots/xiangqi-mobile375.png` | 中象移动端玩家视图（375×667） |
| `docs/acceptance/shots/xiangqi-room-mobile375.png` | 中象移动端观战视图（“你的身份：观战”，导出可用） |
| `docs/acceptance/shots/chess-mobile375.png` | 国象移动端 |
| `docs/acceptance/shots/xiangqi-tablet768.png` | 中象平板 768 |
| `docs/acceptance/shots/chess-hidpi2x.png` | 国象 DPR 2 高清 |
| `docs/acceptance/shots/xiangqi-landscape667x375.png` | 手机横屏（FIX-002 验证，棋盘 282px） |
| `docs/acceptance/shots/xiangqi-{playing,selected}.png`、`chess-{playing,selected}.png` | 走棋中/选中态 |
| `docs/acceptance/shots/_crop-coords.png` / `_crop-coords-after.png` | FIX-001 修复前后（行号遮挡对比） |
| `docs/acceptance/shots/_crop-files-after2.png` | 底部列字母 a–i 修复后 |

量化视觉指标（`logs/probe-visual-after.txt`）：
中象盘 340×377.8、格 31.2、棋子 34.6（1.111×格）；红字 `rgb(179,53,44)` 对棋子底 5.63:1、
黑字 13.77:1；19 个坐标（9 列 + 10 行）零棋子重叠。国象 64 格、棋子/格 0.92、16 个坐标标注。

## 9. 性能测试方法、样本与时长

- **采样器**：页面内自停 `requestAnimationFrame` Promise，仅记录 `performance.now()` 时间戳，
  不渲染、不修改权威状态；每个动画窗口 = 目标格点击 → 飞行层 `transitionend` + 卸载（事件驱动）。
- **指标**：平均 FPS = 1000×(n−1)/首尾时间差；中位/P95/P99/max 帧时间；超 16.67ms（60Hz 预算）
  与 8.33ms（120Hz 预算）帧数与比例；长帧 >33.4ms；click→transitionend（本端全链路）与
  fly 挂载→transitionend（纯动画）；输入响应（选中环 DOM 出现）；网络分段（ack/广播）。
- **样本量**：中象普通动画 **240** 次、国象普通动画 **240** 次（≥100/棋种）；DPR2 40 次；
  CPU 4× 40 次；吃子/易位/过路兵/升变/炮吃/翻转/快速连续/导航/resize 各 1–2 次真实对局事件；
  输入响应 60 样本；网络分段 12 手；连续对弈 5 分钟 287 轮 / 1148 手 / 49432 帧
- **采样时长**：主脚本 168s（A–N/P/网络分段）；B/C 各约 56s；5 分钟场景 300s。
- **环境**：headed Chrome 155，反降频参数 + 保持唤醒；headless 无 vsync（曾 450+fps 假数据）已弃用；
  显示器 165–167Hz（vsync 锁定）。
- **防污染**：练习沙盒严格轮次 + 60 回合/三次重复判和 → 4 手换边循环 + 每 8 手重开 +
  逐手落点校验（本轮 B/C 均 240/240、0 失败）。

## 10. 各场景帧率与帧时间（最终构建）

| 场景 | 动画数 | 帧数 | 平均 FPS | 中位 | P95 | P99 | max | >16.67ms | 长帧 | 落位中位/P95 |
|------|--------|------|----------|------|-----|-----|-----|----------|------|--------------|
| A 静止 5s | — | 775 | 154.6 | 6.1 | 6.1 | 6.2 | 321.2 | 1 (0.13%) | 1 | — |
| B 中象普通 | 240 | 8477 | 151.4 | 6.1 | 6.2 | 6.2 | 193.8 | 31 (0.37%) | 30 | 196.5 / 198.6 |
| C 国象普通 | 240 | 8547 | 151.8 | 6.1 | 6.2 | 6.2 | 169.7 | 32 (0.37%) | 31 | 196.8 / 198.4 |
| R 国象 DPR2 | 40 | 1428 | 153.6 | 6.1 | 6.2 | 6.2 | 169.8 | 4 (0.28%) | 4 | 197.2 / 200.2 |
| H 中象炮吃 | 1 | 38 | 165.0 | 6.1 | 6.1 | 6.2 | 6.2 | 0 | 0 | 208.8 |
| J 快速连续 | 2 | 121 | 163.6 | 6.1 | 6.2 | 6.2 | 12.1 | 0 | 0 | 230.5 |
| I 翻转 | — | 77 | 165.0 | 6.1 | 6.2 | 6.2 | 6.2 | 0 | 0 | — |
| D 国象吃子 | 1 | 34 | 140.2 | 6.1 | 24.2 | 24.2 | 24.2 | 2 (5.88%) | 0 | 243.5 |
| K 对手端回吃 | 1 | 36 | 152.3 | 6.1 | 12.1 | 18.2 | 18.2 | 1 (2.78%) | 0 | 208（动画） |
| E 易位 | 2 | 35 | 157.0 | 6.1 | 12.0 | 12.1 | 12.1 | 0 | 0 | 214.2 |
| F 过路兵 | 1 | 38 | 156.7 | 6.1 | 12.1 | 12.2 | 12.2 | 0 | 0 | 225.5 |
| G 升变 | 1 | 41 | 161.0 | 6.1 | 6.1 | 12.1 | 12.1 | 0 | 0 | 239.4 |
| L 棋谱快导 | — | 192 | 163.3 | 6.1 | 6.1 | 6.2 | 18.2 | 1 (0.52%) | 0 | — |
| M resize | — | 148 | 161.7 | 6.1 | 6.2 | 12.1 | 18.2 | 1 (0.68%) | 0 | — |
| N 后台恢复 | — | — | — | — | — | — | — | — | — | 恢复后 2 步/d5 黑兵/无飞层 |
| P CPU 4× | 40 | 1551 | 132.4 | 6.1 | 12.2 | 24.3 | 247.1 | 63 (4.06%) | 6 | 224.8 / 238.0 |
| Q reduced-motion | 1 | — | — | — | — | — | — | — | — | 无飞层，19.7ms 到终态 |

- **输入响应（本地）**：中位 **0.7ms**、P95 **1.2ms**、max 2.3ms（目标 ≤50ms）。
- **网络分段（本机回环，12 手）**：提交点击→本端棋谱 中位 12.6ms；→对方端棋谱 中位 15ms。
  该数值只代表本机回环，不代表公网延迟。
- **K 对手端**：对方端棋谱出现 11ms 后飞行层挂载（peerVisual），动画 208ms。
- **长帧说明**：B/C 的 30/31 个长帧集中在测试装置每 8 手一次的“重开试玩”（引擎重建整盘渲染）；
  归因实验（80 窗口、两种重开方式）各仅 1 个长帧（窗口最大帧中位 6.2ms）；真实对局场景长帧 0–1；
  **5 分钟连续对弈 49432 帧中 9 个长帧（0.018%）**。

### 5 分钟连续对弈（场景 O）

<!-- O-BLOCK -->
| 指标 | 结果 |
|------|------|
| 时长 / 轮次 | 300s；287 个 4 手循环 |
| 动画/校验 | 1148 次走棋动画；**1148 手落点校验，0 失败轮** |
| 帧采样 | **49432 帧** |
| 平均 FPS | **164.4**（165Hz 屏满帧） |
| 帧时间 | 中位 6.1ms；**P95 6.2ms；P99 6.2ms** |
| 超预算/长帧 | >16.67ms：16（0.032%）；>8.33ms：63（0.13%）；**长帧 >33.4ms：9（0.018%）** |
| 内存 | 每 30s 采样：8.4–15.5MB 波动（V8 GC），首末 +5.5MB，无单调增长 |
| DOM | 1055 → 955（-100，瞬态节点回收），无增长 |
| 终局完整性 | 32 子、0 飞行层、0 被吃层、h7 红炮 / h2 黑炮归位 |

> 说明：每 2 轮点「重开试玩」避免 60 回合无吃子判和；恢复后继续循环。该场景同时覆盖
> 连续动画、反复引擎重建、内存/监听器累积检查（SEC-011 / ANIM-018）。
<!-- O-BLOCK-END -->

## 11. 60 Hz 与 120 Hz：实测 / 推断 / 未验证

| 项 | 状态 | 说明 |
|----|------|------|
| 显示器真实刷新率 | **实测** | 165–167Hz（rAF 间隔众数 6ms；810 帧无重复时间戳探针） |
| 120Hz+ 预算（8.33ms） | **实测通过** | 关键动画 P95 **6.1–6.2ms**、P99 6.2ms ≤ 8.33ms；空闲 154.6–165fps |
| 60Hz 预算（16.67ms） | **实测通过（在高刷面板上）** | 帧时间远低于 16.67ms；动画为合成器 transform，单帧工作负载同量级 |
| 60Hz 面板单独复测 | **未验证** | 当前环境无 60Hz 模式/面板；未把推断写成实测。需要 60Hz 显示器或系统级刷新率切换后复跑 `scripts/acceptance-perf.mjs` |
| 120Hz 刷新模式单独复测 | **未验证（不必要）** | 显示器原生 165Hz 高于 120Hz，已直接验证 ≥120Hz 能力；未切换到 120Hz 模式 |
| 低性能设备（CPU 4× 降速） | **实测** | avg 132.4fps、P95 12.2ms、P99 24.3ms、4.06% 帧超 16.67ms、动画 198ms（仅慢 1–2%） |

> 结论：GATE-K 以 **真实 165Hz 实测**判定 PASS（高于 120Hz 目标）；GATE-J 以 16.67ms 预算判据
> 在本环境实测通过，但**没有 60Hz 面板的独立实测**，该点如实标注，未宣称“已在 60Hz 设备验证”。

## 12. 性能优化前后对比

本轮**未发现需要优化的性能缺陷**，因此没有性能代码改动：
- 修复前构建（`2dd6302`）：B 240 动画 avg 151.4fps / P95 6.2ms / P99 6.2ms；C 240 动画 151.7fps / 6.2 / 6.2。
- 最终构建（视觉/响应式修复后）：B 151.4fps / 6.2 / 6.2；C 151.8fps / 6.2 / 6.2。
- 结论：视觉修复（坐标标尺/宽度下限）未引入帧率或落位回归；落位中位保持 ~196.5ms。

## 13. 构建、类型检查、Lint、测试命令与结果

| 检查 | 命令 | 结果 |
|------|------|------|
| 类型检查 | `npm run typecheck` | **OK**（client+server，0 错误） |
| Lint | — | **项目未配置 lint 脚本**（未添加空检查；如实记录） |
| 单元+集成 | `npx vitest run` | **148/148**（10 文件；84 规则 + 12 board-anim + exporters 等 + 43 集成） |
| E2E | `npx playwright test` | **7/7**（独立 3100 服务；含移动端 375、导出、升变、重连） |
| 生产构建 | `npm run build` | **OK**（`index-DrgBxrHq.js` / `index-D5tzqaqW.css`） |
| 生产启动 | `node dist-server/server/index.js` | 首页 200、最新 bundle；冷启动到 `/healthz` 200 **1812ms** |
| 安全探测 | `node scripts/sec-check.mjs` | **9/9** |
| 依赖审计 | `npm audit --omit=dev` / `npm audit` | 生产 **0**；开发依赖 3（见 §14） |

## 14. 已知问题、未完成项、阻塞与建议

1. **开发依赖漏洞（不阻塞发布）**：`vitest/tinypool/@vitest/mocker` 共 3 个（1 moderate、2 critical），
   仅影响测试工具链，生产依赖 0 漏洞。建议后续将 vitest 升级到 5.x（major，需回归测试）。
2. **无 lint 脚本**：项目未配置 ESLint/Prettier 校验；本轮未擅自引入。建议后续补充。
3. **公网隧道未验证**：`tunnel.log` 最后一次记录（2026-10-28）Quick Tunnel 验证为 **HTTP 530（不可达）**；
   本轮未获得可用公网 URL。复现：`npm run tunnel`（需外网与 cloudflared），成功后会打印
   `https://<随机>.trycloudflare.com`。**不得把旧 URL 当作可用地址**。
4. **60Hz 面板未单独实测**（见 §11）；120Hz 以 165Hz 实测覆盖。
5. **手机横屏触控**：667×375 下棋盘 282px、格 25.8px（修复前 97px/10px），可点击但低于 44px
   触控推荐值；后续可为横屏增加“棋盘优先全屏/可缩放”布局。
6. **合成循环长帧**：B/C 每 8 手重开试玩造成 0.37% 长帧（测试装置行为）；真实连续对弈 5 分钟
   49432 帧中 9 个长帧（0.018%）。
7. **环境噪声**：Windows 遮挡检测/息屏会使 rAF 降至 ~1s/帧；性能脚本已加反降频参数与
   `SetThreadExecutionState`，报告中已剔除受污染轮次并重跑确认（B/C 240/240、0 失败）。
8. **调试脚本**：`scripts/_qrooms.cjs`、一次性探针保留在 `scripts/`（未纳入产品依赖），可后续清理。

## 15. 启动、停止、重启、测试、浏览器与备份命令

```powershell
# 安装依赖（首次）
npm install

# 开发模式（后端 3001 + Vite 5173）
npm run dev

# 生产构建 + 启动
npm run build
npm start                       # 或 powershell -ExecutionPolicy Bypass -File scripts/start-prod.ps1

# 后台启动 / 停止 / 查看
powershell -ExecutionPolicy Bypass -File scripts/start-server-bg.ps1
powershell -ExecutionPolicy Bypass -File scripts/stop-server.ps1
Get-Content logs/server.log -Tail 50

# 类型检查 / 单测+集成 / E2E / 生产构建
npm run typecheck
npx vitest run
npx playwright test
npm run build

# 验收专用（本报告数据）
node scripts/acceptance-perf.mjs            # 阶段 7 主性能（headed Chrome，约 3 分钟）
node scripts/acceptance-perf-5min.mjs       # 场景 O 5 分钟
node scripts/acceptance-hist.mjs            # 棋谱/导出 UI 实测
node scripts/rwd-check.mjs ; node scripts/viewport-check.mjs ; node scripts/layout-check.mjs
node scripts/anim-verify.mjs ; node scripts/anim-extra.mjs ; node scripts/anim-special.mjs
node scripts/sec-check.mjs
node scripts/shots.mjs                      # 截图 → shots/（→ docs/acceptance/shots/）

# 浏览器打开（本机）
start http://127.0.0.1:3001/

# 数据备份 / 恢复（SQLite 三件套，停服后复制最稳妥）
powershell -ExecutionPolicy Bypass -File scripts/stop-server.ps1
Copy-Item data\app.db,data\app.db-wal,data\app.db-shm D:\backup\ -Force
# 恢复：停服 → 覆盖回 data\ → 启动
```

## 16. 公网隧道

- 已实际执行过的隧道记录（`tunnel.log`，2026-10-28 11:27）：
  `https://benefits-massage-neither-gamecube.trycloudflare.com`，**最后一次连通性验证为 HTTP 530**，
  即该地址当时不可用；本轮没有重新建立并验证成功的公网地址。
- 因此 BUILD-005/006 记为 **未验证（NOT TESTED）**；不提供任何伪造/过期 URL。
- 复现命令：`npm run tunnel`（自动下载/调用 cloudflared Quick Tunnel；需外网权限）。
  成功输出 `https://<随机>.trycloudflare.com` 后，用另一网络环境打开
  `https://<随机>.trycloudflare.com/healthz` 与首页复核。

---

## 附：证据索引

- 验收日志：`docs/acceptance/acceptance-log.md`
- 性能数据：`docs/acceptance/perf-results.json`、`perf-5min.json`、`perf-reset-attribution.json`、
  `visual-metrics.json`
- 原始日志：`docs/acceptance/logs/`（基线、规则/集成 verbose、net-check、perf、hist、anim、rwd/viewport/
  layout/ux/chk/sec、e2e、boot、探针与修复构建记录）
- 截图：`docs/acceptance/shots/`（见 §8）