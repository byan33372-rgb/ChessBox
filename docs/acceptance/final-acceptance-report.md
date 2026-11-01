# 发布前全面验收 · 最终验收报告（final-acceptance-report.md）

- 日期：2026-11-01
- 项目：双人对弈网站（中国象棋 / 国际象棋 / 中国跳棋）
- 仓库：D:\projects\chessbox（main）
- 本轮起点：`ef5d162`（三棋升级完成）；本轮新增提交：`2c7607d`（DEF-001 修复）、`059e0ae`（验收补测）
- 上一版报告（双棋轮次，git 历史 40caa78）已被本报告取代，可由 git 检出查阅。
- 测试环境：Windows 10.0.26100 x64，Node v24.22.1 / npm 11.19.1，真实 Chrome 156（Playwright channel:chrome）+ Edge（channel:msedge）+ Playwright Chromium 1248；Vite 7 / TS 5.9 / Express 5 / Socket.IO 4.8 / better-sqlite3

---

## 1. 基线与本轮修改摘要

基线（AUDIT-007，全部实测）：tsc client/server = exit 0；vitest unit 134 + integration 54；Playwright e2e 13；npm run build exit 0；npm audit --omit=dev = 0 vulnerabilities。基线零失败（docs/acceptance/baseline.md）。

本轮修改：
1. **DEF-001（P1，产品缺陷，已修复）**：跳棋起始营内互走被引擎 `campViolation` 误禁——满营时后排骨（如南尖 m17）因邻格全为己方棋子且营内移动被拒，**整局无法移动**。修复：引擎与前端 UI 纯函数同源豁免己方起始营（他人营地仍禁入、目标营地不得离开的规则不变）。回归：营内腾位单测 3 项 + 4/6 人实际对局集成测试。
2. 测试基建补强（如实分类为测试缺陷，非产品缺陷）：跳棋导出与棋盘 UI 纯函数此前零直测（补 11 项单测）；4/6 人此前只测入座未测实际走棋（补集成 2 项）；同轮并发抢占（补集成 1 项）；跳棋导出下载链路未经真实浏览器验证（补 e2e 下载断言）；旧版数据库 schema 兼容无回归保护（补 DATA-003 单测 2 项）；layout-check / chk-check / soak 脚本为双棋时代的陈旧断言（已修正到三棋规格，未降低断言强度）。

## 2. 三种棋类测试结果

| 模块 | 自动化证据 | 结果 |
|---|---|---|
| 中国象棋规则 | xiangqi-engine 37 项（九宫/蹩马腿/塞象眼/炮架/兵过河/照面/应将/将死/困毙/重复/长将/子力和/120步/记谱/重放/越界拒收） | PASS |
| 国际象棋规则 | chess-rules-deep 40 + adapter 18 + extras 4（双步/斜吃/过路兵时机与牵制/易位全条件/四种升变/将死/逼和/50步/三次重复时点/子力不足逐例/PGN往返/终局锁定） | PASS |
| 中国跳棋规则 | checkers-engine 28（几何121/邻接/跳跃/连跳逐段/防循环/营地约束含 DEF-001 回归/胜利/轮转/认输/FEN）+ checkers-ui 9 | PASS |
| 跳棋联机 | checkers-rooms 17 项集成：2/3/4/6 人**实际对局**轮转、超员观战、开局真实连跳 [e3,e5,g5] 服务端接受并广播 path、非法 path 拒绝、requestId 幂等、多人认输、重开、重启持久化恢复、并发抢占 | PASS |
| 导出 | exporters 11 项 + e2e 真实下载（PGN/中文棋谱/JSON/跳棋 txt+json，含文件名与内容断言） | PASS |

## 3. 联机 / 轨迹 / 历史回放 / 持久化 / 响应式

- **联机**：net-check 双独立浏览器上下文 15 步清单（中象 15/15 + 国象 15/15）；集成层双客户端三棋全流程；Edge 第二引擎双端同步冒烟一致。
- **上一手轨迹**：三棋统一起点琥珀虚线+「起」/终点青绿实线+「终」（颜色+形状双编码）；e2e 断言标记存在、LastMoveBar 文本、最近 5 步面板、易位 extra 双格标记、连跳 polyline；MOVE-007 非法请求不更新标记（e2e）；刷新后标记随权威 state 恢复（e2e + IAB 实测）。
- **历史回放**：每步可点定位、复盘横幅、回看后返回实时、复盘不影响线上（e2e + 集成）；长谱窗口化渲染；最近 5 步可折叠面板。
- **持久化**：服务重启恢复（集成 + DATA-003 旧库兼容 2 项）；DATA-004 备份/恢复演练——db+wal+shm 三件套拷贝后完整恢复 41 个房间（含棋谱）。
- **响应式**：viewport-check 18 PASS、rwd-check 12 PASS、e2e 三棋 375×667 无横向溢出；6 张真实截图（docs/acceptance/screenshots/）。

## 4. 生产构建与关键流程

- `npm run build` exit 0；`node dist-server/server/index.js` 生产模式（端口 3001）承载全部脚本验收与截图。
- 生产模式下真实完成：中象 15 步对局、国象 15 步对局（net-check）、跳棋 2/3/4/6 人关键流程（集成 + e2e + Edge 冒烟）。
- 公网部署：本轮未获明确公网授权 → 按任务书 BUILD-009/011 不公开服务，**公网验证标 BLOCKED**（上一轮 Quick Tunnel 曾真实验证成功并留档：three-games-upgrade-report.md §7）。

## 5. 验收门禁（26 项）

| Gate | 内容 | 结论 | 证据 |
|---|---|---|---|
| GATE-01 | 基线与保护措施 | PASS | baseline.md；git 工作区干净起验 |
| GATE-02 | 首页与全部按钮 | PASS | layout-check 22 + ux-check 9 |
| GATE-03 | 中国象棋规则 | PASS | 37 单测 + e2e |
| GATE-04 | 国际象棋规则 | PASS | 62 单测 + e2e |
| GATE-05 | 跳棋棋盘和坐标 | PASS | 几何单测 + 截图 04 |
| GATE-06 | 跳棋 2/3/4/6 人 | PASS | 集成四人数实际对局 + e2e |
| GATE-07 | 连跳与胜利判定 | PASS | 单测 + 集成 + e2e |
| GATE-08 | 房间/座位/轮次 | PASS | rooms.test 20 + checkers-rooms 17 |
| GATE-09 | 实时多人走棋 | PASS | net-check 15/15 ×2 + Edge 冒烟 |
| GATE-10 | 非法请求与服务端权威 | PASS | security.test + concurrency.test + sec-check 9/9 |
| GATE-11 | 上一手起点终点 | PASS | upgrade.spec 标记/信息区断言 |
| GATE-12 | 对手走棋提示 | PASS | e2e toast 断言 + 截图 04 |
| GATE-13 | 特殊走法与连跳轨迹 | PASS | extras 4 单测 + 连跳 polyline e2e |
| GATE-14 | 历史棋谱复盘 | PASS | e2e + acceptance-hist |
| GATE-15 | FEN/PGN/跳棋棋谱 | PASS | exporters 11 + 真实下载 e2e |
| GATE-16 | 刷新重连持久化 | PASS | e2e 刷新 + 集成重启恢复 + DATA-003/004 |
| GATE-17 | 棋盘棋子视觉 | PASS | layout 22 + 截图 6 张 |
| GATE-18 | 动画准确性 | PASS | anim-verify 15/15 + reduced-motion 断言 |
| GATE-19 | 60 Hz 性能 | PASS | 三棋各 120 帧采样 0 帧超 16.67ms；CPU4x 压力 P95=12.2ms（acceptance-perf 15 场景） |
| GATE-20 | 120 Hz 性能 | NOT_TESTED | 无真实 120Hz 物理屏（headless 检测值 167Hz 不代表显示能力） |
| GATE-21 | 响应式与跨浏览器 | PASS（部分） | Chromium 系三引擎 + 全视口矩阵；Firefox/WebKit 未安装 → 引擎覆盖 NOT_TESTED |
| GATE-22 | 安全与异常恢复 | PASS | sec-check 9/9 + npm audit 0 漏洞 + 异常用例 |
| GATE-23 | 长时间运行稳定性 | PASS | 30 分钟浸泡 0 错误（performance-report §5） |
| GATE-24 | 生产构建 | PASS | build exit 0 + npm ci --dry-run exit 0 |
| GATE-25 | 生产环境关键流程 | PASS | 生产模式三棋流程 + 截图 |
| GATE-26 | 文档备份恢复 | PASS | README + 本轮报告 + DATA-004 演练 |

## 6. 已知问题、阻塞项与发布建议

- **P0：0 项；P1：0 项未决**（DEF-001 已修复并回归）。
- 未决 P2/P3：无新增。
- 阻塞/未测：120Hz 物理屏、Firefox/WebKit 引擎、公网部署授权（环境条件，不阻断本地发布）。
- **发布建议：可以发布**（本地 / 局域网 / 自备隧道场景）。发布前执行 release-checklist.md 的备份与回滚步骤。

详细数据：test-matrix.md / defects.md / performance-report.md / security-review.md / release-checklist.md。
