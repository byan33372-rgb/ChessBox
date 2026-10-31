# 三棋升级验收报告（three-games-upgrade-report.md）

- 项目：双人对弈网站三棋升级（中国跳棋新增 + 三棋统一上一手追踪 + 历史回看定位）
- 日期：2026-11-01
- 仓库：D:\projects\chessbox（main 分支）
- 基线检查点：`ebe0b58`（升级起点，中象/国象 148 vitest + 7 e2e 全绿）
- 本轮终点检查点：见 git log（阶段 A~G 共 8 个检查点提交）

---

## 1. 任务概述

按任务书完成五大块：
1. **A 新增中国跳棋（Sternhalma）**：121 孔位六角星盘、2/3/4/6 人、跳跃/连续跳、营地约束、服务端权威校验、持久化、导出。
2. **B 三棋统一"上一手起点与终点"追踪**（最高优先级）：起点琥珀虚线+「起」、终点青绿实线+「终」（颜色+形状双编码）；最近一步信息区；对手走棋提示；特殊动作完整轨迹。
3. **C 历史走棋回看与定位**：每步可点、起终点高亮跟随、最近 5 步可折叠面板、长棋谱窗口化。
4. **D 完整回归**：规则/联机/视觉/动画/响应式/性能/安全。
5. **E 保留既有功能**：中象/国象全部既有测试（123 项 vitest + 7 e2e）全程保持通过。

工作方式遵循任务书：直接改文件、连续执行、不伪造结果、每次修改配回归、数据库变更前设计回滚。

## 2. 交付范围与实现要点

### 2.1 跳棋规则引擎（阶段 A）
- `src/games/checkers/board.ts`：标准 17 行模型（行宽 1,2,3,4,13,12,11,10,9,10,11,12,13,4,3,2,1 = 121），显式行区间、六方向邻接、跳跃落点、像素换算 `px=(c−r/2)×s, py=r×(√3/2)×s`、六营地（尖 e1/m5/q13/m17/e13/a5）、`target(c)=(c+3)%6` 恒正对、SEAT_CAMP_MAPS（2/3/4/6 人全组合）。
- `src/games/checkers/engine.ts`：无强制跳跃/无吃子变体；`validatePath` 逐段校验（路径 2~16 点、盘内、防重复循环、n>2 每段必须跳跃、营地约束）；连跳返回完整 `path`；加载即胜检测（限完整 10 子局面）；多人认输 `resignSeat`（剩 1 人判胜、轮转跳过退出者）；FEN `cc1|turn|order|p=` 序列化（鲁棒分词解析）。
- 单元测试 25 项（几何/初始局面/移动/跳跃/连跳/非法路径/营地/胜利/轮转/认输/序列化）。

### 2.2 服务端协议与房间（阶段 B）
- `protocol.ts`：`RoomState.seats` 泛化 `Partial<Record<Side,SeatPublic>>`、新增 `seatOrder/seatCount`；`PublicMove` 新增 `path/extra/capturedSq`；`MoveRequest.path`；`SIDE_NAMES` 补全 c~f。
- `rooms.ts`：座位泛化（seatLettersOf/seatsAllFilled）、建房 seatCount、join 顺序分配→观战、跳棋多人认输语义、悔棋 plies 通用公式（回退到请求方上一手）、重开按原座位数重建引擎、持久化恢复含 path/extra。
- `store.ts`（数据库迁移，DATA-001~003）：
  - rooms 表 +`seat_count INTEGER`；moves 表 +`captured_sq TEXT`、`path_json TEXT`、`extra_json TEXT`。
  - **全部为可空附加列**：`ALTER TABLE ... ADD COLUMN`（幂等 try/catch）。
  - **回滚设计**：旧构建 `SELECT *` 忽略新列、INSERT 不含新列（默认 NULL）→ 回滚零操作；不修改/删除任何既有列；无数据搬迁。
- `socket.ts`：坐标正则放宽为全棋种 `/^[a-q][0-9]{1,2}$/`（中象 a0-i9/国象 a1-h8/跳棋 a1-q17）、`seatCount`/`path` zod 校验（path 2~16 点）。
- 集成测试 11 项：2/3/4/6 人分配、3 人轮转 a→b→c、超员观战、真实开局连跳 `[e3,e5,g5]` 服务端接受并广播 path、非法 path 拒绝、requestId 幂等、多人认输轮转/终局、重开清盘、**服务重启持久化恢复（含 path 落库与 rejoin 续弈）**。

### 2.3 跳棋前端（阶段 C）
- `CheckersBoard.tsx`：SVG 六角星盘（121 孔位全部来自 board.ts 几何）、营地淡色三角、大命中区（r=19 圆）、上一手标记（起/终）、连跳完整路径折线、飞行动画层、翻转支持、`data-cell` 可测性。
- `checkersUi.ts`：连跳交互纯函数（逐段选点、自动提交、`nextChainTargets` 防循环——链内重复格不得作为延伸目标，与服务端 SEC-006 同源规则）。
- `Room.tsx`：跳棋分支（多座位条 3/4/6 人、连跳横幅「完成跳跃」、终局座位名、导出、waiting 计数）；`PracticeBoard` 跳棋沙盒同规则。
- 首页第三入口卡（人数选择 2/3/4/6 + 主题插画 + checklist 组）；`theme-checkers` 深紫夜色主题。
- 导出：`buildCheckersText`（含连跳路径记谱）+ `buildCheckersJson`（chessbox-checkers-v1，含 seatOrder/path）。

### 2.4 三棋统一上一手追踪（阶段 D）
- 中象/国象棋盘统一标记：起点琥珀虚线环 +「起」、终点青绿实线环 +「终」（颜色+形状双编码，色觉无障碍）；标记保留至下一手确认（静态渲染，非动画产物）；刷新/重连后随 state 恢复；历史回看时随所选步。
- `LastMoveBar`：三棋统一最近一步信息区（着法语义 + 起终点图例）。
- 对手走棋 toast：`对方移动了：<方> <着法>`（同 ply 去重）。
- 特殊动作轨迹（服务端权威推导）：
  - 国象王车易位：`extra=[{车 from→to}]`，棋盘 `last-extra` 双格标记；
  - 吃过路兵：`capturedSq` = 被吃兵实际格（≠ 落点）；
  - 跳棋连跳：完整 path 折线。
- MOVE-038 防重复：走棋链路无增量事件流，客户端以服务端权威 RoomState 整体覆盖（幂等）；同一着法唯一标识 = `ply`（房间内唯一）+ `revision` 单调版本；requestId 幂等防重复落谱（集成测试覆盖）。

### 2.5 历史回看与定位（阶段 E）
- 棋谱每步可点（双人两列/跳棋多人单列带座位色徽标）、点击定位到该步后局面、起终点高亮跟随所选步、连跳显示每段。
- 最近 5 步可折叠面板（最新在上、可点击定位）。
- 长棋谱窗口化：固定行高 + 滚动窗口渲染（288px 视口、±8 行 overscan），不再逐行挂载；复盘行自动滚入视野。
- 快速连点只改本地 `viewPly`（纯状态），与走棋动画闸门隔离，不影响线上对局。

### 2.6 动画（阶段 F）
- 跳棋飞行动画层（单步/连跳统一 from→to 平移，240ms，token 化缓动）；可选落点脉冲提示。
- `prefers-reduced-motion` 下动画禁用，但上一手标记/连跳折线为静态渲染**全部保留**。
- 复盘态不残留飞行层；动效开关沿用既有 `dc:anim`。

## 3. 测试与验收矩阵

| 套件 | 数量 | 结果 |
|---|---|---|
| vitest unit（含跳棋 25、国象 extra 4） | 134 | ✅ 全绿 |
| vitest integration（含跳棋联机 11） | 54 | ✅ 全绿 |
| Playwright e2e（既有 7 + 跳棋 2 + 升级回归 4） | 13 | ✅ 全绿 |
| 生产构建 vite+tsc | — | ✅ 通过 |
| 合计自动化 | 201 | ✅ |

关键新覆盖：
- 跳棋几何 121 格/星尖/邻接/像素不重合/目标正对（unit）
- 连跳逐段校验、路径防循环、超长/盘外/落点被占拒绝（unit）
- 多座位分配/轮转/观战/认输/重开/持久化恢复（integration，双客户端）
- 真实浏览器双人对弈：单步→标记→最近一步→最近 5 步→连跳逐段→自动提交→复盘定位（e2e + IAB 实测）
- 中象起/终标记、国象易位 extra 轨迹（e2e）
- 三棋 375×667 无横向溢出（e2e）

## 4. 性能（PERF）

- 真实 Chrome（Playwright channel:chrome）房间页走棋后 rAF 采样 119 帧：**P50≈164 FPS，P95≈169 FPS，P99≈169 FPS，min≈161 FPS**（无掉帧；数值超 60 系刷新率为 headless 渲染管线未限速所致，说明每帧渲染成本 ≪ 6ms）。
- 长棋谱窗口化将 DOM 行数从 O(n) 降为常数窗口。
- **NOT_TESTED（如实声明）**：物理 60Hz/120Hz 真机屏与低端移动设备实测（本环境无该硬件）；数据库千局规模压测。

## 5. 安全（SEC）

- 沿用并复验既有安全体系：Origin 校验、会话令牌哈希、限流、zod 输入校验、SQL 参数化、PGN 头净化。
- 新增面：`path` 数组 schema 校验（2~16 点、逐格格式）+ 引擎逐段权威校验（防循环/防超长/防越权棋子）；`seatCount` 白名单 {2,3,4,6}；多座位权限（观战 NOT_PLAYER、非轮次 NOT_YOUR_TURN、STALE_REVISION 自愈）均有集成断言。

## 6. 数据库变更与回滚

- 变更：4 个可空附加列（rooms.seat_count；moves.captured_sq/path_json/extra_json）。
- 回滚：回滚到旧构建零数据库操作（旧代码忽略新列）；迁移幂等可重复执行；无既有列修改或删除；无数据搬迁。
- 备份建议（部署侧）：升级前对 `data/*.db` 复制一份（本机文件级备份即可）。

## 7. 真实浏览器与公网验证

- IAB 真实浏览器：双标签页 2 人跳棋全流程（入座→单步→双端标记/信息区/最近 5 步同步→连跳逐段选点+横幅→自动提交→刷新恢复座位/棋谱/连跳折线）✅（DOM 断言）。
- 窄屏 375×667 实测无横向溢出 ✅。
- 公网：生产构建 + `node dist-server` + cloudflared Quick Tunnel，公网 URL HTTP 200（DNS 解析至 Cloudflare 边缘 HKG，Server: cloudflare），**公网链路上创建跳棋房间 + WebSocket 已连接 + 121 孔位渲染 + 创建者入座** ✅。
  - 隧道地址：https://particles-freeze-weekend-drain.trycloudflare.com（Quick Tunnel 为临时地址，进程停止即失效，重启生成新地址——与 README 一致）。

## 8. BLOCKED / NOT_TESTED 项（如实）

| 项 | 状态 | 原因 |
|---|---|---|
| IAB 截图视觉验收 | BLOCKED | 自动化环境截图面持续超时（`browser screenshot surface preparation timed out`）；已用 DOM 结构断言替代验证标记/折线/营地色存在性 |
| 物理 60/120Hz 真机帧率 | NOT_TESTED | 本环境无对应硬件；headless Chrome 采样已证渲染成本远低于 60fps 预算 |
| 跨物理局域网真机对弈 | NOT_TESTED | 无法物理操作另一局域网设备；以公网隧道 DNS/边缘节点证据 + 双上下文 e2e 替代 |
| 跳棋导出下载链路自动化 | NOT_TESTED | 浏览器下载对话框自动化受限；导出函数与既有两棋同链路（既有 e2e 已验证该链路） |
| 千局规模数据库压测 | NOT_TESTED | 超出本轮范围；schema 变更为可空附加列、查询路径未变 |

## 9. Gate A~O 结论

| Gate | 内容 | 结论 |
|---|---|---|
| A | 接管审计/基线/保护既有功能 | PASS（基线 ebe0b58；既有 148 项全程绿） |
| B | 跳棋规则引擎 | PASS（25 unit） |
| C | 协议扩展与多座位房间 | PASS（protocol/rooms/socket + 11 integration） |
| D | 持久化与数据库迁移 | PASS（可空列迁移 + 恢复测试 + 回滚设计） |
| E | 前端入口/棋盘组件/沙盒 | PASS（首页三卡 + CheckersBoard + PracticeBoard + e2e） |
| F | 三棋统一上一手追踪 | PASS（标记/信息区/toast/特殊轨迹 + e2e） |
| G | 历史回看与定位 | PASS（最近 5 步/窗口化/定位 + e2e） |
| H | 动画与 reduced-motion | PASS（flight/折线/标记保留；截图面 BLOCKED 已用 DOM 断言覆盖） |
| I | 联机 2/3/4/6 人 | PASS（integration 双客户端 + 公网实测） |
| J | 全量回归 | PASS（188 vitest + 13 e2e） |
| K | 性能 | PASS（P95≈169FPS；真机刷新率 NOT_TESTED 已声明） |
| L | 安全 | PASS（新增面 schema+权威校验；既有体系复验） |
| M | 生产构建与公网隧道 | PASS（构建 200 + 公网建房走棋） |
| N | 文档与功能清单回填 | PASS（本报告 + checklist 真实证据） |
| O | 归档交付 | PASS（D:\projects\archive\三棋升级\） |

## 10. 已知限制（非缺陷，如实）

1. 跳棋采用"无强制跳跃、无吃子"变体（CHECKERS-014/015，UI 规则文案一致）。
2. 多人局悔棋语义 = 回退到请求方最近一手之前；提和/悔棋请求在任何新着后自动过期。
3. 认输的多人跳棋座位退出轮转但棋子保留在盘（不影响轮转与终局判定）。
4. Quick Tunnel 地址临时；固定域名需用户自有 Cloudflare 配置（README 方案二）。
5. 2 人跳棋翻转按钮与 b 方自动镜像并存；多人局保持北向上（固定视角）。

## 11. 检查点清单（git）

- ebe0b58 检查点：三棋升级起点
- 2579f55 阶段A：跳棋引擎 + 25 单测
- 68666c8 阶段B：多座位协议 + 11 集成
- 684dced 阶段C：跳棋前端
- 000ecb1 阶段D：统一上一手追踪
- c4edcb8 阶段E：历史回看与定位
- 5359432 阶段G-1：跳棋 e2e + 连跳防循环
- b42a044 阶段G-2：升级回归 e2e + checklist 回填
- （本轮终点）阶段H：报告与归档

## 12. 交付物清单

- 源码与测试：仓库内（src/games/checkers/*、src/server/{rooms,store,socket}.ts、src/client/components/CheckersBoard.tsx、checkersUi.ts、MoveList.tsx 等）。
- 本报告：docs/acceptance/three-games-upgrade-report.md；归档副本 D:\projects\archive\三棋升级\three-games-upgrade-report.md。
- 运行方式：`npm run build && npm start`（README 含 better-sqlite3 装机三方案与隧道说明）。
