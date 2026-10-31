# 整夜审计与精修进度日志

> 本文档是持续执行的唯一进度来源。每次恢复工作先读本文件。
> 项目：D:\projects\chessbox（双棋种在线对弈：中国象棋 + 国际象棋）
> 规则：本文件只记录【已经真实执行并验证】的内容；数字以真实命令输出为准。

## 项目速览（来自实际文件与命令）

- 技术栈：React 19 + Vite 7 + TS 5.9（前端）/ Express 5 + Socket.IO 4.8 + better-sqlite3（后端）/ chess.js 1.4（国象规则）/ 自研中象引擎（src/games/xiangqi）
- 启动：`npm run dev`（开发，5173+3001）/ `npm run build && npm start`（生产，127.0.0.1:3001，HOST/PORT/DB_PATH 环境变量见 src/server/index.ts）
- 测试：`npm test`（Vitest 122 项）/ `npx playwright test`（e2e 7 项，系统 Chrome channel）
- 辅助校验：`node scripts/layout-check.mjs`（20 项几何）/ `npx tsx scripts/viewport-check.mjs`（18 项视口矩阵，需 3001 服务在线）
- 性能测量：`npx tsx scripts/perf-check.mjs`
- 数据：data/app.db（SQLite，gitignored）
- Git：main 分支，检查点链 1b1208b → bf5072d（每阶段一个提交）

## 阶段状态总表（全部完成）

| 阶段 | 内容 | 状态 | 提交 |
|------|------|------|------|
| 0 | 环境与基线检查 | ✅ | 1b1208b |
| 1 | 架构审计 + 7 项修复 | ✅ | a8260c4 |
| 2 | 国象规则深度测试 23 项 | ✅ | aef0070 |
| 3 | 联机并发专项 6 项 | ✅ | e50576b |
| 4 | 导出器专项 9 项 + PGN 注入修复 | ✅ | 8e4b858 |
| 5+6 | 聊天专项 5 项（chat:history）+ 安全专项 9 项 | ✅ | 65ba45c |
| 7 | 视觉精修 | ✅ | c4b6f29 |
| 8 | 视口矩阵/键盘/长内容 18 项 | ✅ | f1a9060 |
| 9 | 性能真实测量 | ✅ | （并入阶段10提交） |
| 10 | 全量回归 + 连点竞态修复 | ✅ | bf5072d |
| 11 | 生产重建 + 公网全链路验证 | ✅ | — |
| 12 | 文档/归档/交付 | ✅ | — |

## 阶段 0：基线（已执行）

- 前次会话进程仍存活：本地服务 3001 与隧道在线；Git 初始化（48 文件入库）。
- 基线复测：npm test 70/70、playwright 7/7、typecheck 0 错误。

## 阶段 1：审计与修复（commit a8260c4）

审计方法：模式扫描（any/空catch/TODO/定时器）+ 逐文件走读 + 源码核查。扫描结果：无 any、无空 catch、无 TODO。

| 编号 | 等级 | 位置 | 问题 | 修复 |
|------|------|------|------|------|
| A1 | P1 | src/client | 无错误边界：渲染异常=白屏 | ErrorBoundary（重试/回首页/刷新）包裹 App |
| A14 | P1 | roomClient doJoin | 频繁重连触达限流后误入致命终态 | RATE_LIMITED → 2.5s 退避重试（≤8 次） |
| A13 | P2 | rooms cleanupStale | 内存 sessions 随房间删除不清理（泄漏） | SessionInfo+roomId，删房同步清内存 |
| A15 | P2 | cleanName | 名字可含控制字符→PGN头/日志注入 | 过滤 U+0000-1F/7F/2028/2029 |
| A6 | P2 | http SPA 回退 | /package.json、/.env 返回 200 | 扩展名/点路径 → 404 |
| A16 | P3 | store/rooms | appendMove 与 saveRoom 非同事务 | appendMoveAndSaveRoom 事务 |
| A4 | P2 | roomClient actions | 每次广播重建 actions | stateRef 稳定引用 |
| — | P3 | roomClient | 死变量/未用 ref | 删除 |

复核无问题：旧 socket 断开不会误清新绑定（socketId 比较）；观战计数有清理；SQL 参数化；无重复订阅。

## 阶段 2：国象规则深度测试 23 项（aef0070）

tests/unit/chess-rules-deep.test.ts：兵双步/斜吃/前吃、吃过路兵（时机/过期/假目标/FEN ep 字段）、易位（双侧 FEN 权利/被将禁止/经过与目的格受攻/权利丧失链）、升变四选 SAN+FEN、将死（学者杀）/逼和/三次重复/50 回合（含吃子重置）/子力不足、75 回合语义（沿用 50 回合自动判和，如实记录）、FEN 六字段断言、PGN 往返（易位/吃子/e.p.）、逐步重放一致性、非法走法/终局后落子。
期间修正 9 处我方测试局面构造错误（引擎行为全部正确）。

## 阶段 3：联机并发专项 6 项（e50576b）

同 revision 并发双走棋恰好一成一拒；双方同走仅一成功（错误码依处理顺序为 STALE_REVISION/NOT_YOUR_TURN 均合法）；观战伪造走棋/认输被拒；会话跨房间不可用；观战进出计数归零；同会话多标签页后连者接管在线绑定。抽公共 harness（tests/integration/helpers.ts）。

## 阶段 4：导出器专项 9 项 + 真实缺陷修复（8e4b858）

**缺陷（P2）**：玩家名含 `"`/`\` 产生不可解析 PGN（chess.js 解析器不支持转义，实测其自身输出也无法回读）→ 修复为 PGN 标签值净化。测试：空棋谱 PGN、特殊着法 SAN、PGN 回放终局面一致、结果映射（1-0/0-1/1/2-1/2）、中象两列文本、JSON 结构、净化后可解析。

## 阶段 5+6：聊天 5 项 + 安全 9 项（65ba45c）

**新功能**：chat:history —— 加入/重连/重启后下发历史聊天（此前丢失，P2 缺陷）。测试含顺序/XSS 载荷原样传递（React 文本节点转义）/空与超长拒绝/限频/重连恢复/SQLite 重启恢复。
安全修复：敏感目录显式 404 清单（node_modules/data/src/…）；Permissions-Policy 头。测试：5 类敏感路径 404、SPA 200、安全头 7 项（含无 unsafe-eval）、/api JSON 404、畸形房间号/非对象载荷不崩溃、走棋字段类型伪造被拒、聊天对象注入被拒、棋种枚举外值被拒。

## 阶段 7：视觉精修（c4b6f29）

等待遮罩由 0.38 黑色压暗 → 0.62 暖白雾化+blur（棋盘可见）；侧栏状态卡常驻邀请输入+复制；终局棋盘底部横幅（非遮挡）；将军棋子脉冲；prefers-reduced-motion 全局降级；布局校验 20 项全过 + 重截图（含等待态 02b）。
视觉评审代理供应商持续不可用（GLM-5.3-Flash provider-not-found，重试 2 次）→ 以程序化几何校验替代并保留 6 张截图供人工过目。

## 阶段 8：视口矩阵/键盘/长内容 18 项（f1a9060）

1024×768 / 768×1024 / 667×375 横屏 / 320×600：无横向溢出、棋盘适配、无控制台错误。30 步引擎驱动确定性对局（含过滤升变避免对话框）、窄屏长内容不溢出、Tab 键 12 个可聚焦控件、复盘视图 29/30 保持。

## 阶段 9：性能真实测量

- 首屏：HTML 请求均值 2ms；导航 TTFB 2ms / DCL 38ms / Load 38ms（本机生产）
- 静态资源：JS 339KB + CSS 16KB = 356KB（JS gzip ≈110KB）
- 走棋端到端（点击→棋谱出现，含网络往返）：均值 59ms / 最大 77ms（n=17）
- 广播：21 步时 room:state 全量快照 5.8KB（约 275B/步线性；100 步 ≈27KB/次；2-5 客户端场景无压力，记录为设计取舍）
- 结论：数据健康，不做 memo 化等复杂度换收益的优化

## 阶段 10：全量回归 + 竞态修复（bf5072d）

**真实缺陷（P2）修复**：快速连点时第二个点击可能命中过期渲染闭包（丢步偶发，负荷下复现率约 40%）→ handleSquareClick 改为同步引用（engineRef/selectedRef）即时计算目标。另修脚本读值竞速（等最后一步渲染再计数）。
最终回归（真实输出）：npm test **122/122**；playwright **7/7**；layout-check **20/20**；viewport-check **18/18**（6 连跑全绿）；typecheck 0 错误。

## 阶段 10 补充：测试偶发根治（最终提交）

最终回归曾出现 ~40% 偶发的文件级失败（tinypool "Channel closed" / SqliteError "database is locked"）。
根因：多 worker（线程/进程）各自从 0 计数 + 同毫秒时间戳 → 临时 SQLite 路径碰撞 → 锁冲突 → worker 崩溃。
修复：临时库路径加 pid + 随机后缀（helpers.ts 与 rooms.test.ts 两处）；集成项目改 forks 池 + 串行文件。
验证：连续 5 次全量 `npx vitest run` 均 122/122。此为测试基建问题，不影响生产（生产用单一固定库路径）。

## 阶段 11：生产重建 + 公网全链路（已执行）

- `npm run build` 全量重建 → 3001 生产服务：本地 / 与 /r/ 200、敏感路径 404、healthz OK
- 隧道（前次会话进程持续在线）：公网 / 200、/healthz 200、/node_modules 404、/.env 404
- 公网全链路（Playwright 双浏览器经真实公网）：建房 ✓ 第二人加入（375 手机视口）✓ 聊天送达 ✓ 走棋同步（逐步等待，含真实公网延迟；期间一次未等待的快速连发被 STALE_REVISION 正确拒绝并自愈——顺带验证了乐观锁在公网延迟下的有效性）✓ 刷新恢复局面 ✓ 刷新恢复聊天历史（chat:history）✓ 导出 PGN 内容 ✓ 敏感路径 404 ✓ 控制台无真实错误（唯一 404 日志来自自身的探测请求）

## 已知限制与未验证项（如实）

1. Quick Tunnel：URL 每次重启变化、进程停止即失效（免费隧道固有）
2. 视觉外观无人工图像评审（代理供应商不可用），已有 20 项几何校验 + 6 截图留档
3. 中象长捉仲裁未实现；>3 同线兵记谱为近似（罕见）
4. dev 依赖 vitest 链 4 项审计告警（测试工具链，不随产品分发）
5. 未做平板实机/真手机测试（仅视口模拟；未宣称实机测试）

## 恢复指令（如果需要继续）

1. `cd "D:\projects\chessbox" && git log --oneline -5 && git status --short`
2. `npm test && npx playwright test`（前置：dist 已构建）
3. 服务：`npm start`（后台）+ `npm run tunnel`（cloudflared 在 tools/）
4. 本文件各阶段记录含具体命令；所有阶段已完成，无未竟事项。

---

# 三棋升级轮次（2026-10-31 ~ 11-01）

- 基线检查点 ebe0b58（中象/国象 148 vitest + 7 e2e 全绿）。
- 阶段A 跳棋引擎（行模型121格/连跳逐段/营地/胜利/多人认输）25 单测。
- 阶段B 多座位协议（protocol/rooms/store/socket）+11 集成；数据库可空附加列迁移（回滚零操作设计见 store.ts 注释）。
- 阶段C 跳棋前端（CheckersBoard/checkersUi/Room分支/首页第三入口/导出/主题）。
- 阶段D 三棋统一上一手追踪（起/终双编码标记、LastMoveBar、对手toast、易位extra/过路兵capturedSq/连跳path）。
- 阶段E 历史回看（最近5步面板/窗口化虚拟列表/多座位单列记谱）。
- 阶段G 全量回归：vitest 188（unit134+integration54）+ e2e 13 全绿；真实浏览器双人跳棋全流程实测；公网 Quick Tunnel 验证（HTTP 200 + Cloudflare 边缘 + 公网建房走棋）；PERF e2e P95≈169FPS。
- BLOCKED 如实记录：IAB 截图面超时（DOM 断言替代）；物理 60/120Hz 真机、跨物理局域网真机 NOT_TESTED。
- 验收报告：docs/acceptance/three-games-upgrade-report.md（15 Gate 全表）。
