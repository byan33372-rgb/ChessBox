# 五棋升级 · 总进度与验收（five-games-upgrade.md）

- 日期：2026-11-04（阶段A起）
- 基线：main @ `1044410` → 升级检查点 `a40d232`/`ad53053`/`c840970`/`2215f56`/本轮终检
- 性质：在已通过两轮验收的三棋平台上新增围棋与五子棋，并完成轻量化/延迟/手机适配三项优化

## A. 五棋功能清单（现状）

| 棋类 | 引擎 | 联机 | 棋谱/导出 | 上一手标记 | 恢复 |
|---|---|---|---|---|---|
| 中国象棋 | 自研（37 单测） | ✅ | 中文纵线/JSON | ✅（起终点） | ✅ |
| 国际象棋 | chess.js（62 单测） | ✅ | PGN/FEN | ✅（含易位extra/过路兵capturedSq） | ✅ |
| 中国跳棋 | 自研（28 单测） | ✅ 2/3/4/6人 | 文本/JSON | ✅（连跳全路径） | ✅ |
| 围棋（新） | 自研中国规则（21 单测） | ✅ 9/13/19路 | SGF子集/FEN | ✅（落点角标/死子叉） | ✅ |
| 五子棋（新） | 自研自由规则（17 单测） | ✅ 15路 | 文本/JSON v1 | ✅（落点角标/五连高亮） | ✅ |

## B. 围棋/五子棋实现情况

围棋（阶段D）：9/13/19 路；交叉点布局+星位天元；气/提子（含多块同提）/禁自杀/全局同形（positional+situational superko，声明含行棋方）；停一手；双停进入数子；死子双方标记交集、确认终局、意见不一恢复对弈；区域计分 + 贴目 7.5（房间徽章展示）；认输；SGF 导出（子集声明：SZ/KM/RU/PB/PW/RE/B/W/pass，行序未翻转）。
五子棋（阶段E）：15×15；四向五连与长连（自由规则声明）；满盘和棋；终局锁盘；胜利线 extra 广播高亮；文本/JSON v1 导出。

## C~E. 规则/联机/轨迹测试结果

- 引擎单测 38 项（go 21 + gomoku 17）全 PASS。
- 联机集成 9 项（five-games-rooms，含复审新增 DEF-FG-003 回归）：9 路对弈/提子广播 extra/双停数子终局(贴目)/恢复对弈/认输/五连判胜与胜利线广播/幂等不重复落谱/服务重启恢复（go13 fen 规格保持）——全 PASS。
- e2e 4 项（five-games.spec）：五入口+路数选择/围棋停手-数子-终局全流程/五子棋五连高亮+锁盘+真实下载/375px 五棋无溢出——全 PASS。
- 上一手：落子型为落点方形角标（MOVE-006/007），服务端确认事件生成（MOVE-002），刷新恢复走权威 state（MOVE-008）——e2e 断言。

## F. 轻量化（LIGHT-001~020）

| 指标 | 升级前 | 升级后 |
|---|---|---|
| 首屏 JS（单 chunk 原始） | 402KB | **308.6KB**（gzip 97KB） |
| 分割产物 | 无 | Room 30.1KB + checkersUi 92.3KB + PracticeBoard 4KB 按需加载 |
| 首页请求数（冷） | — | 5（html+js+css+2 svg） |
| 首页冷加载 | — | ~690ms（networkidle，3 次取样 687–702ms） |
| 首屏 JS 传输（含首屏可见沙盒的懒块） | — | ≈398KB（transferSize，gzip 后） |

手段：App 路由级 lazy、沙盒 IntersectionObserver 懒挂载、棋盘 SVG 矢量化、checkersUi 独立 chunk。LIGHT-005 部分达成：进入房间包内仍含全部引擎（合并 chunk），声明为已知限制。

## G. 延迟（阶段C，详见 network-latency-report.md）

回环 ack P50=1ms/P95=2ms/P99=3ms（6 分钟 1424 样本）；30 分钟五棋浸泡 ack P50≈1-3ms（见 soak-summary）；perf 分段（三棋）：本端 12.8ms/对端 16ms 中位。走棋路径为持久 WebSocket（LAT-002✅）、事件仅广播至房间（LAT-011✅）、走棋事务持久化保留（LAT-008✅）。

## H. 手机适配（阶段G，详见 mobile-compatibility-report.md）

- 11 视口 × 5 棋 = 55 项溢出/棋盘可见性检查全 PASS（five-games-viewport-matrix.txt）。
- `100dvh`、`env(safe-area-inset-*)` 接入；棋盘容器 `min(100%, calc(100dvh - 300px))` 自适应。
- 19 路围棋/15 路五子棋命中半径=半格以上 + 吸附（MOBILE-014）。
- 真机触控：无设备，浏览器模拟代替（MOBILE-023 已声明局限）。

## I. 60/120Hz 与压力

五棋 120 帧采样 0 帧超 16.67ms（go/gomoku 与三棋同达标）；120Hz 物理屏仍 NOT_TESTED。30 分钟五棋浸泡：错误 0（详见 performance-report）。

## J. 缺陷

| ID | 级别 | 内容 | 状态 |
|---|---|---|---|
| DEF-GO-001 | P1 | superko 初始键误记 'b'（白）→ 劫回提漏判 | 已修+回归 |
| DEF-GO-002 | P1 | loadFen 未播种局面历史 → 重载后回提漏判 | 已修+回归 |
| DEF-FG-001 | P1 | checklist 缺 go/gomoku 分组 → 首页整页崩溃 | 已修（补组） |
| DEF-FG-002 | P2 | 终局横幅赢家名称未走统一 sideName（五子棋显示"红方"） | 已修+e2e 回归 |
| DEF-FG-003 | P2 | freshEngine 丢围棋规格：9/13 路重开/悔棋至空盘变 19 路（复审发现） | 已修+回归（集成 9 路重开用例） |

## K/L. 构建与持久化

生产构建 exit 0；go13 fen 规格经重启恢复断言；数据库无 schema 变更（moves 表通用列承载 place 型，from=to=落点）。

## M/N/O. 未实现、运维与发布

- 未实现/部分：Renju 禁手（按 GOMOKU-016 不做，仅声明）；围棋悔棋=沿用通用悔棋申请（GO-023 保留）；SGF 行序未翻转（声明）；LIGHT-005 房间包合并引擎。
- NOT_TESTED：120Hz 物理屏、真机触控、Firefox/WebKit、公网跨区（沿用既有结论）。
- 运维：`npm run build && npm start`（PORT/DB_PATH 可覆盖）；备份=三件套拷贝；回滚=旧构建直启（无 schema 变更）。
- **发布建议：建议发布**（P0=0，P1=0 未决；NOT_TESTED 项随附）。


## 复审轮（2026-11-04，全面错漏审查）

- 新增发现并修复：DEF-FG-003（P2，freshEngine 丢围棋规格——9/13 路重开/悔棋至空盘变 19 路）；回归=集成「9 路房间重开后仍为 9 路」。
- 复核确认项：superko 历史经 replay 正确重建；undoRespond 悔棋保留规格（replay 走首着 fenBefore）；pass/mark 均入棋谱且重放一致；死子交集计分符合中国规则；GomokuEngine.legalMoves() 返回空数组为已文档化的合同偏差（落子型 UI 不逐点渲染，服务端为权威）。
- 历史说明：docs/acceptance/performance-report.md 在本任务书中被指定为同名交付文件，覆盖了全面验收轮同名文件——旧版完整保留于 git（commit 02c8548）。
