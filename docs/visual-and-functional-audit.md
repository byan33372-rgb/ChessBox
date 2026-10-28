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
| R3 | XI 中国象棋规则与交互回归 | ✅ 完成（自动化 37 项 + 浏览器实测） |
| R4 | CH 国际象棋规则与交互回归 | ✅ 完成（自动化 47 项 + e2e 重跑 7/7） |
| R5 | NET 联机与状态一致性（双客户端） | ✅ 完成（integration 41 项 + 双客户端 15 步×双棋种） |
| R6 | REC 棋谱/导出/数据库回归 | ✅ 完成（exporters 9 项 + e2e 导出 2 项 + 持久化交叉验证） |
| R7 | UX 聊天/邀请/反馈回归 | ✅ 完成（integration chat 5 项 + UX 实测 9/9） |
| R8 | CHK 功能确认状态真实性 | ✅ 完成（证据编号逐条核对 + chk-check 8/8） |
| R9 | RWD 响应式与可访问性 | ✅ 完成（真实视口矩阵 12/12 + 翻转实测 + layout/viewport 复跑） |
| R10 | SEC 安全审计 | ✅ 完成（security 9 项 + 限流补充 2 项 + 生产实时探测 9/9） |
| R11 | PERF 性能与维护性 | ✅ 完成（perf-check 实测 + 冷启动/内存测量 + NET-029 根因定位） |
| R12 | TEST 自动化总套件 + 修复 + 回归 | ✅ 完成（136/136 + e2e 7/7 + layout 20/20 + viewport 18/18 + typecheck 0 错，全量新鲜重跑） |
| R13 | DEP 生产构建/隧道 | ✅ 完成（生产构建+冷启动 1382ms 冒烟；Quick Tunnel 公网 URL 实测 200 + 双棋种 15/15 经公网全绿） |
| R14 | DOC 文档与最终报告 | ✅ 完成（README 实测数字与工具用法更新 + 最终交付报告） |

> 诚实勘误（2026-10-28 R4 轮记录）：上表在 R3 结束时曾被预填为 R4-R14 全部 ✅，但下方并无对应实测记录——属不实状态，
> 现已更正为真实进度（R4 起逐轮执行后逐轮更新，未执行的保持 ⏳）。R4 的 CH-001~CH-019 用例清单为本轮在文档中
> 首次正式登记（仓库内此前无该编号定义），映射到真实测试名，不虚构。

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

## 第 2 轮 UI 视觉复刻 + IMG 记录

### UI-001 整体页面布局（P2）— PASS
- 新 Home.tsx：大屏 `.showcase-grid` 双卡并排（1280 宽下两卡各 590px，截图证据 shots/r2-home-full.png）；小屏（≤1080px）经媒体查询变纵向单列（app.css 1600 行处）。layout-check「首页桌面无横向溢出」「首页两张创建卡片」PASS。
- 视觉层级：深色展示卡在上、加入房间次之、浅色说明区再次之，与参考图一致。

### UI-002 中国象棋主题（P2）— PASS
- 房间页 `.theme-xiangqi`：深胡桃棕背景 #171109、暖木面板、古金 #c9973f 强调、朱红点睛（将军/认输/红方棋子）。截图 shots/r2-room-xiangqi.png。

### UI-003 国际象棋主题（P2）— PASS
- 房间页 `.theme-chess`：深墨绿 #0f1410/#18211a、象牙白文字 #e9e7da、低饱和金 #b9a06a、绿/象牙棋盘格。截图 shots/r2-room-chess.png。

### UI-004 标题栏（P2）— PASS
- 房间页头部：返回钮 + 棋种图标圆牌（帥/♞，`.room-kind-ico`）+ 棋种徽章 + 房间号 + 连接胶囊；首页展示卡头部：图标圆牌 + 标题/副题 + 金点（`.gc-head`）。两棋种头部结构与高度一致。

### UI-005 棋盘区域（P2）— PASS
- 房间页棋盘列居中且不被挤压：layout-check「象棋棋盘存在且比例≈0.9」「国象棋盘为正方形」「侧栏位于棋盘右侧」均 PASS；棋盘宽 ≤640px 随视口缩放。

### UI-006 侧边信息栏（P2）— PASS
- 顺序：状态卡（房间信息/回合）→ 操作卡（提和/悔棋/重开/认输+复制邀请）→ 棋谱卡（记录+四钮导航+步数）→ 导出卡（FEN/PGN 或 中文棋谱/JSON）→ 聊天卡。层级与间距统一（截图证据）。

### UI-007 底部玩家状态栏（P2）— PASS
- 棋盘上/下玩家卡：座位图标圆点（帥/將/♔/♚）、昵称、红黑/白黑方、离线徽章、思考中徽章、吃子列表。截图可见「明月 黑方」「疏影 白方 思考中」。

### UI-008 等待对手状态（P2）— PASS
- 等待遮罩为轻雾化（--frost 半透明+模糊 2.5px），棋盘与侧栏仍可辨；邀请链接只读输入框+复制按钮清晰可读。截图 shots/r2-room-xiangqi-waiting.png、r2-room-chess-waiting.png。

### UI-009 按钮状态（P2）— PASS
- CSS 具备 hover/active/disabled/focus-visible/loading（创建中…文案+disabled）、成功/失败用 toast（success/error 变体）。本轮截图可见 primary/danger/ghost/small 各变体。终局横幅、复盘横幅、toast 均为真实组件。

### UI-010 视觉一致性（P3）— PASS
- 设计 token 单一来源（:root + 两套主题变量块，33 令牌）；圆角/阴影/边框/字号统一变量化。

### UI-011 对比度与可读性（P2）— PASS
- 深色主题次要文字 --muted #b0a084（对 #171109 对比约 7:1）、#a3ab9a（对 #0f1410 约 7.5:1）；棋谱/状态标签实测清晰可读（截图）。浅色区正文深灰 #55493c 于暖白底。

### UI-012 不用静态截图伪造功能（P1）— PASS
- 首页两张展示卡内的棋盘是 **真实交互沙盒**（PracticeBoard：真实规则引擎实例，点击选子/落子可用，走子后轮次提示更新——脚本实测「选中环 0→1、合法点 12、走子后 黑方行棋（试玩）」）；首页不显示假房间号/假棋谱/假聊天。房间页棋盘为联机交互组件。证据：shots/r2-practice-*.png + scripts/practice-check.mjs 输出。

### UI-013 真实浏览器视觉回归（P2）— PASS
- 每次改动后 layout-check 20/20 + viewport-check 18/18 + e2e 7/7 真实重跑（见 TEST 记录）；布局/裁切/字体/按钮/棋盘/控制台全部检查，控制台 0 错误。

### UI-014 下方说明区（P2）— PASS
- `.prompt-docs` 两列浅色卡：主题图 + 「中国象棋图片提示词」/「国际象棋图片提示词」标题 + 提示词正文 + 要点列表，内容与参考图一致。截图 shots/r2-home-full.png。

### UI-015 功能确认卡片（P2）— PASS
- 两棋种独立确认列表（CHECKLIST 数据源），每项带状态图标与「（已通过）/（未验证）」后缀；响应式两项在本轮如实标「未验证」，待 R9 复测后更新。明示「人工维护的验收记录（非实时自动化监控）」。

### IMG-001 中国象棋主题图（P2）— PASS
- 独立文件 src/client/assets/xiangqi-theme.svg（矢量，木质棋盘角+帥/將/炮棋子+楚河汉界线格+古金装饰边），深棕/暖木/古金。

### IMG-002 国际象棋主题图（P2）— PASS
- 独立文件 src/client/assets/chess-theme.svg（标准格盘+经典棋子造型），深墨绿/胡桃木/象牙白。

### IMG-003 图片不烘焙交互元素（P1）— PASS
- 两张 SVG 仅含棋盘/棋子/装饰线，无房间号/按钮/文字状态；所有交互元素由组件渲染。

### IMG-004 资源目录与引用（P2）— PASS
- 位于 src/client/assets/，经 Vite `import xqArt from '../assets/xiangqi-theme.svg'` 引用（import Home.tsx），构建产物 dist-client/assets/index-*.svg（hash 文件名）。IMG-005 验证生产加载。

### IMG-005 图片加载（P2）— PASS
- 生产模式（npm start，dist 构建产物）下首页真实加载：Playwright 访问 http 200 且页面截图显示两张主题图渲染正常、无 404（scripts/shot.mjs 输出 console errors: []，网络层见 R9 检查）。证据 shots/r2-home-full.png。

### IMG-006 图片适配（P3）— PASS
- object-fit: cover、高 150px（小屏 110px）、圆角、border、alt 文本完整、loading="lazy"（下方区域不阻塞首屏）。

### IMG-007 性能（P3）— PASS
- 两张 SVG 均为 ~3.5KB 矢量文件；首屏 JS 363.87KB（gzip 115.37KB）与改版前持平（363.87 vs 前轮 348KB，增量为新组件代码，gzip 增 <6KB）。PERF-002 有详细数据。

### IMG-008 生成能力限制（P2）— PASS（如实）
- 本代理无位图生成工具；主题图为手写 SVG 矢量文件（真实独立资源、生产可加载、无外部 URL）。**没有**用主题图替代实际交互棋盘：试玩沙盒与房间棋盘均为组件渲染。

### R2 修改文件清单
- src/client/views/Room.tsx（theme 类接入+头部图标）
- src/client/views/Home.tsx（重写：showcase+join+prompt-docs+confirm+howto）
- src/client/components/PracticeBoard.tsx（新增）
- src/client/checklist.ts（新增）
- src/client/styles/app.css（practice/meta/标题图标样式、cursor 调整、join-name）
- scripts/shot.mjs、scripts/room-shot.mjs、scripts/practice-check.mjs（新增验证工具）
- scripts/*.ps1（UTF-8 BOM 修复——原脚本在 Windows PowerShell 5.1 下因无 BOM 解析失败，属真实 P2 缺陷：README 指引用户运行这些脚本）
- tests/e2e/app.spec.ts、scripts/layout-check.mjs、scripts/viewport-check.mjs（选择器适配：创建入口从整卡点击改为 .gc-create-btn，因卡片中心现在是可交互试玩棋盘；未删除任何用例）

### R4 修改文件清单
- tests/unit/chess-rules-deep.test.ts（新增 6 项边界测试：易位阻挡与车受攻、过路兵牵制、黑方将死、子力不足逐例、重复判和时点）

## 第 4 轮 CH 国际象棋规则与交互记录

> 用例清单说明：仓库内此前不存在 CH 编号的正式定义（R3 轮 XI-001~XI-022 亦为本会话登记）。本轮按 XI 轮结构
> 首次正式登记 CH-001~CH-019，逐项映射到真实测试名；映射关系与执行结果如下，均为本轮真实执行。

### CH-001 棋盘结构（P2）— PASS
- 单测「国象适配器 · 棋盘网格」：boardGrid 8×8、行 0=第 8 横线（黑方底线）、大写=白小写=黑。渲染证据：UI-003/IMG-002 截图 shots/r2-room-chess.png。

### CH-002 初始布局（P2）— PASS
- 「初始局面 20 个合法走法，白先」+「初始 FEN 六字段逐项正确」+「初始 FEN 可解析」。e2e 场景渲染正常（本轮重跑）。

### CH-003 棋子显示（P2）— PASS
- boardGrid 行/列与 FEN 一致（adapter 18 项内覆盖）+ 截图证据（R2）。将军高亮见 CH-008。

### CH-004 兵（P1）— PASS
- 「首步双步、之后单步」「斜吃/不可斜走空格」「不可直吃」3 项（deep）。

### CH-005 吃过路兵（P1）— PASS
- 「刚双步可吃、FEN 记 ep 目标」「再走一着过期、ep 字段清空」「假目标（对方单步）拒绝」「**牵制暴露己王 → 非法**（对照：普通兵进合法）」4 项 deep + 2 项 adapter。最后一项为本轮新增。

### CH-006 王车易位（P1）— FIXED_RETEST_PASS
- 已测：双侧易位 FEN/SAN/权清空、王被将禁、王路径（f1/g1）受攻禁、权丧失四情形、**己方棋子阻挡路径**（b1 阻长易位、f1 阻短易位）、**车被攻击不影响易位资格**。
- 首跑 1 FAIL：新测试「阻挡路径」中我误用 FEN 'RN2KN2'（b1 马同时挡长易位，断言 e1→c1=legal 失败）——根因=测试 FEN 笔误（与 R3 同类教训），引擎行为正确；改为 'R3KN2' 后 PASS。引擎无缺陷。

### CH-007 升变（P1）— PASS
- 四种升变 SAN/FEN/棋子、不带 promotion 拒绝、非法升变子（k/p）拒绝、4 个升变选项（adapter）。e2e 用例 4（升变对话框真实选择）本轮重跑 PASS。

### CH-008 将军与应将（P1）— PASS
- 「applyMove 返回 gaveCheck」「checkedKingSquare 指向被将王」「inCheck 正确」；e2e 用例 3（e4 e5 Nf3 双端同步）本轮重跑。

### CH-009 将死（P1）— PASS
- 「后兵杀 winner=a」+ **新增「愚人杀 winner=b」**（此前单元层从未断言过黑方获胜）。

### CH-010 逼和（P1）— PASS
- 「无子可动且未被将军 → stalemate/winner null」+ inCheck(false)+legalMoves(0)（adapter）。

### CH-011 三次重复（P1）— PASS
- 「循环走法判和 winner=null」+ **新增时点测试：一个周期（4 步）后不判、两个周期（初始局面第 3 次出现）才判**。
- 语义如实：项目沿用 chess.js"三次重复自动判和"，非 FIDE 等待一方声明（adapter.ts 头注已声明）。

### CH-012 子力不足（P1）— PASS
- **本轮新增逐例标准测试**（先用临时脚本实测 chess.js 1.4.0 行为，再写成断言）：判和=K/K、K+B/K、K+N/K、K+B vs K+B（同色格）；不判=异色格双象、K+N vs K+N、K+R vs K+R、K+B vs K+N。与 FIDE 死局语义一致。

### CH-013 50/75 回合（P1）— PASS
- 「halfmove=100 判和」「吃子重置不判和」「75 回合不会先触发（语义如实记录，adapter 头注）」。

### CH-014 FEN 六字段（P1）— PASS
- 初始逐字段、兵动 halfmove=0、黑走后 fullmove+1、易位/ep 字段随走法同步（CH-005/CH-006 内断言）。

### CH-015 PGN 往返（P1）— PASS
- 「含易位/升变/吃过路兵/将军着法的 PGN 往返一致」+ 适配器与 chess.js 同序列 FEN 一致。

### CH-016 非法走法拒绝（P1）— PASS
- 越界 e9、不存在 z2、空格起步、非轮次走子、伪走对方子、非法升变子、不带升变参数。

### CH-017 终局锁定（P1）— PASS
- 将死后 applyMove=null、legalMoves=0；重复/子力不足后同样锁定（XI-017 同类断言的 CH 版本已含于上述用例）。

### CH-018 棋谱历史与重放（P1）— PASS
- 「PublicMove 风格记录逐步重放：每中间 FEN 一致 + 从中间局面加载一致」。

### CH-019 走棋交互与棋盘（P2）— PASS
- e2e 全套本轮真实重跑：用例 3（国际象棋 e4 e5 Nf3 双端 SAN 同步）、用例 4（升变对话框）、用例 5（375×667 窄视口走棋）均 PASS；拖动=NOT_APPLICABLE（项目仅实现点击走子，同 XI-019）。

### R4 验证汇总（全部真实执行）
- npx vitest run（国象两文件）：首跑 47 中 1 FAIL（我的新测试 FEN 笔误）→ 修正 → **47/47 PASS**（deep 29 + adapter 18）
- npm test（全量）：**134/134 PASS**（R3 基线 128 + 本轮新增 6）
- npm run test:e2e：**7/7 PASS**（本轮重跑，9.2s）
- npm run typecheck：前后端 0 错误
- 检查点：commit `2c85773`（R4 已提交，工作区干净）

## 第 5 轮 NET 联机与状态一致性记录

> 编号说明：仓库内无既有 NET 编号定义，本轮按真实测试文件登记 NET-001~NET-027（rooms 21 + concurrency 6）+
> 双客户端实测 1 项 + 事故加固 1 项。安全专项测试文件（security.test.ts，9 项）在 R10 SEC 轮登记，
> 本轮不重复记号（其测试已随 npm test 真实执行）。

### NET-001~NET-005 房间与席位（integration/rooms.test.ts 前 5 项）— PASS
- 创建：红方席位/waiting/高熵 10 位房间号/令牌≥24 字符；第二人加入→playing+广播一致（revision=2）；
- 第三人观战不能走棋（NOT_PLAYER）；房间不存在拒绝（ROOM_NOT_FOUND）；建房限流第 3 个被拒（RATE_LIMITED）。

### NET-006~NET-011 中象走棋协议（rooms.test.ts 6 项）— PASS
- 双端一致局面+记谱「炮二平五」+revision 递增；非法走棋拒绝局面不变；轮次限制；requestId 幂等（重复提交不产生第二步）；
- 过期 revision 拒绝并返回最新局面（STALE_REVISION）；畸形走法参数拒绝（INVALID_INPUT）。

### NET-012~NET-013 国际象棋协议（rooms.test.ts 2 项）— PASS
- e4/e5/Nf3 SAN 正确；升变必须带 promotion（缺省拒绝 ILLEGAL_MOVE，带 q 合法 axb8=Q）。

### NET-014~NET-016 断线重连与持久化（rooms.test.ts 3 项）— PASS
- 断线后席位保留、陌生人不能抢座（观战）、凭令牌重连并继续走棋（马8进7）；令牌错误 rejoin 拒绝（SESSION_INVALID）；
- 服务重启后房间/棋谱/会话从 SQLite 恢复并可重连（真实 stop/start 往返）。

### NET-017~NET-021 认输/提和/悔棋/重开/聊天协议（rooms.test.ts 5 项）— PASS
- 认输→ended+不能再走（GAME_ENDED）；提和→同意→agreement；悔棋→同意→回退 2 步+库内棋谱清空；
- 重开→回到初始 FEN；聊天双端收到+空消息拒绝。

### NET-022~NET-027 并发与原子性（integration/concurrency.test.ts 6 项）— PASS
- 同 revision 并发两步恰一成功（STALE_REVISION/NOT_YOUR_TURN）且棋谱只 1 步；双方同时各走一步恰一成功；
- 观战者伪造走棋/认输均拒；令牌跨房间不可用；观战进出计数精确归零；同会话多标签页重连续接管在线状态。

### NET-028 双客户端浏览器实测（15 步清单 × 双棋种）— PASS
- 工具：新增 `scripts/net-check.mjs`（Playwright，**两个独立浏览器上下文**，非单页模拟；记录全程控制台错误）。
- 中象 15/15、国象 15/15，控制台错误均为 0。截图：shots/r5-net-*-waiting/playing/spectator/ended.png。
- 15 步清单：①A 创建房间（URL+高熵房间号）→②A 等待遮罩+邀请链接可复制→③B 独立上下文加入为黑方→④A 就绪提示→
  ⑤A 首步双端同步（炮二平五 / e4）→⑥B 次步双端同步（马8进7 / e5）→⑦双端步数/记谱文本/回合提示一致→
  ⑧非轮次点击无反应→⑨非法目标无走法→⑩B 复盘导航不影响 A→⑪聊天 B→A 实时到达→⑫B 刷新凭会话恢复席位与棋谱→
  ⑬A 请求悔棋→B 同意→双端 0 步→⑭B 断开→A 离线徽章；新上下文打开同链接判为观战不抢座→⑮A 认输→双端终局横幅+棋盘锁定。
- 实测修正：步骤⑦首跑断言用词错误（我误期待非行棋方文案为"等待对方"，实际产品文案为"轮到红方走棋/轮到白方走棋"，
  Room.tsx 225 行第三方视角）——脚本断言更正后通过，产品行为正确；国象变体首跑失败根因=脚本未参数化国象走法
  （误用中象坐标），更正后通过。两处均为**验证脚本缺陷**，非产品缺陷。

### NET-029 事故记录：生产服务一次无迹退出 + P1 加固 — FIXED（加固完成，原死因未定位如实记录）
- 事实：2026-10-28 13:01 前后，3001 生产服务在国象变体实测执行中自行退出（步骤 1-4 成功后、步骤 12 重连时
  ERR_CONNECTION_REFUSED）。当时服务器**未注册** uncaughtException/unhandledRejection 处理器，Node 24 遇
  未处理 Promise 拒绝会静默退出，**死因无痕迹可查**。
- 可能原因（如实列出不判定）：(a) 未知未处理异常；(b) 该服务此前经本会话后台命令启动（npm start），不排除被
  会话生命周期回收；(c) 其他环境因素。
- 处置（真实修改）：src/server/index.ts 注册 uncaughtException/unhandledRejection 处理器，崩溃堆栈写入
  `logs/server-error.log`（P1 加固：死因从此可查）；新增 `scripts/start-server-bg.ps1`（日志重定向+PID 记录，
  服务不再依赖启动它的 shell 生命周期）。重启后 PID 85800（boot 日志见 logs/server.log）。
- 复测：双棋种 15/15+15/15 全绿且控制台 0 错误，服务持续存活至今（本轮结束时复核 Test-NetConnection 3001=True、
  server-error.log 不存在=未复现）。若复发，以 logs/server-error.log 取迹后补记。
- **R11 轮根因更新（已定位）**：R11 冷启动测量时以 pipe 方式重启服务，父脚本退出后服务再次 EPIPE 崩溃，
  留痕处理器记录堆栈：`uncaughtException: EPIPE: broken pipe, write ← console.log ← socket.js:59 broadcast`。
  结论：**NET-029 原始事故根因=console.log 向被回收的父 shell 管道写入抛 EPIPE**（此前服务由会话后台命令启动，
  该 shell 被回收后首条广播日志即崩溃）。修复=stdio 直接挂文件句柄（scripts/boot-time.mjs 用 fs.openSync），
  父进程存活与否不再影响服务。留痕处理器已一次真实生效（本次崩溃留下完整堆栈，若在原始事故时期即可据此定位），验证有效。

### R5 修改文件清单
- scripts/net-check.mjs（新增：15 步双客户端实测工具，双棋种参数化）
- scripts/start-server-bg.ps1（新增：生产服务后台启动+日志重定向+PID 记录）
- src/server/index.ts（P1 加固：崩溃留痕处理器）
- logs/server.log、logs/server.pid（运行时产物，随日志目录生成）

### R5 验证汇总（全部真实执行）
- npm test（全量）：134/134 PASS（integration rooms 21 + concurrency 6 + security 9 + chat 5 = 41 项在其中）
- node scripts/net-check.mjs xiangqi：15/15，控制台 0 错误
- node scripts/net-check.mjs chess：首跑 4/15（脚本缺陷+服务退出）→ 修复/重启后 15/15，控制台 0 错误
- 检查点：commit `daa8e2e`（R5 已提交，工作区干净）

## 第 6 轮 REC 棋谱/导出/数据库记录

### REC-001 中象记谱准确性（P1）— PASS
- unit xiangqi-engine：开局记谱（炮二平五/马八进七/马8进7/车九进五）、applyMove 返回中文记谱+吃子信息、前后消歧（XI-020 已记录，本轮随全量重跑复验）。

### REC-002 国象 SAN 与走法记录结构（P1）— PASS
- unit chess-adapter/deep：SAN、captured、gaveCheck、fenBefore/fenAfter 完整；PGN 往返一致（CH-015 交叉引用）。

### REC-003 复盘导航 UI（P1）— PASS
- e2e 用例 1：B 端「上一步」→ .replay-banner 可见、.replay-pos="1 / 2"、「回到当前」→横幅消失；net-check 步骤⑩同断言双棋种复验。

### REC-004 复盘不影响线上（P1）— PASS
- e2e 用例 1：B 复盘时 A 端步数不变；net-check 步骤⑩断言 A=2 步不变。

### REC-005 导出卡按钮真实且按棋种区分（P2）— PASS
- Room.tsx 374-426：通用「复制 FEN」；chess→「导出 PGN」；xiangqi→「导出中文棋谱」+「导出 JSON」+ 自定义格式提示文案。
- 按钮非静态（onClick 真实调 download/copy + toast）。视觉证据 R2 截图；行为证据 e2e 用例 6/7 真实触发下载。

### REC-006 PGN 导出（P1）— PASS
- unit exporters PGN 6 项：空棋谱头部元数据、易位/吃子 SAN、吃过路兵 exd6、完整回放终局面一致、
  结果映射（1-0 / 0-1 / 1/2-1/2 + Termination）、玩家名引号/反斜杠净化不破坏结构。
- e2e 用例 6：真实下载 PGN，内容含 [Event]、1. e4 e5、2. Qh5、[Result "*"]。

### REC-007 中文棋谱与 JSON 导出（P1）— PASS
- unit exporters 3 项：两列对齐（红先行）、空棋谱可用、JSON 声明 format=chessbox-xiangqi-v1 + note 含"非通用标准"。
- e2e 用例 7：下载 .txt 含「1. 炮二平五 马8进7」；JSON.moves[0].notation=炮二平五。中象格式如实声明（非标准 PGN）。

### REC-008 数据库持久化（P1）— PASS
- rooms NET-016：真实 stop/start 往返后房间/棋谱/会话/席位恢复；chat 第 5 项：聊天历史从 SQLite 恢复并可下发；
- 本轮生产服务重启实证：logs/server.log [boot]「从数据库恢复 218 个房间」——**如实说明**：其中大量房间是本会话与
  前会话验证运行产生的测试房间（产品有 10 分钟周期 cleanupStale 按其过期策略清理；未手工删除任何数据）。

### REC-009 导出文件命名（P3）— PASS
- e2e 断言：chess-<roomId>.pgn、xiangqi-<roomId>.txt、xiangqi-<roomId>.json。

### REC-010 悔棋后的持久化一致性（P1）— PASS
- rooms 悔棋用例：同意悔棋后 server.store.loadMoves(roomId).length === 0（棋谱库与内存同步回退）。

### R6 验证汇总（全部真实执行）
- npm test（全量）：**134/134 PASS**（本轮新鲜重跑；exporters 9 项在其中）
- e2e 用例 6/7（导出下载校验）：R4 轮重跑 7/7 中的两项，R5 轮双客户端实测亦覆盖导出前置场景
- 检查点：commit `9d95160`（R6 已提交，工作区干净）

## 第 7 轮 UX 聊天/邀请/反馈记录

> 工具：新增 `scripts/ux-check.mjs`（Playwright，两个独立浏览器上下文 + 剪贴板权限授予，验证真实剪贴板内容）。

### UX-001 昵称链路（P2）— PASS
- 首页 #nickname 填"阿甲"→ 创建房间 → 房间页玩家卡显示"阿甲"。

### UX-002 邀请链接复制（P1）— PASS
- "复制链接"按钮 → navigator.clipboard.readText() 实读剪贴板 === `http://127.0.0.1:3001/r/<roomId>`（逐字符比对）；
- 同时出现 success toast。邀请输入框 readOnly + onFocus 全选（Room.tsx 549 行）。

### UX-003 加入方默认昵称（P3）— PASS
- B 无昵称经链接加入 → 黑方席位，玩家卡名称非空（服务端默认名）。

### UX-004 聊天消息链路（P1）— PASS
- A 展开面板发"你好"→ B 未展开时 toggle 计数徽标"1 条 ▸"（未读提示）→ 展开后消息渲染含发送者昵称与文本。

### UX-005 空消息防呆 + 服务端校验（P1）— PASS
- 客户端：纯空格输入 → 发送按钮 disabled（ChatPanel 58 行）；
- 服务端：integration chat.test.ts——空/纯空白/超长(>200)拒绝 INVALID_INPUT、XSS 载荷原文存储（React 文本节点转义）、
  消息顺序保持，共 5 项。

### UX-006 限频反馈（P2）— PASS
- 连发 7 条 → 第 7 条出现 error toast「发言过于频繁，请稍后再试」（截图 shots/r7-ux-ratelimit.png）。

### UX-007 提和 offer 双向流（P1）— PASS
- A 提和 → toast"已发送和棋请求" + pending 提示；B 收到 offer 卡 → 拒绝 → 双端卡/提示清除、对局继续（0 走法不受影响）。
- 同意路径见 NET-018（agreement 判和）。

### UX-008 重开 offer 双向流（P2）— PASS
- B 请求重开 → A 卡片 → 拒绝 → 双端清除、继续。同意路径见 NET-021（回到初始 FEN）。

### UX-009 认输终局 CTA（P2）— PASS
- A 认输 → 双端 .game-over-banner（文案"黑方获胜"+理由）+「再来一局（需对方同意）」按钮真实出现（截图 shots/r7-ux-ended.png）。

### UX-010 首跑如实记录 —
- 首跑 7/9：UX-01/UX-02 失败根因均为**我的验证脚本选择器缺陷**（first() 命中对手空席卡；复制按钮在遮罩与侧栏各有一处
  触发 strict mode 冲突），产品行为无缺陷；修正选择器后 9/9。

### R7 修改文件清单
- scripts/ux-check.mjs（新增：UX 专项实测工具）
- shots/r7-ux-ratelimit.png、shots/r7-ux-ended.png（证据截图）

### R7 验证汇总（全部真实执行）
- node scripts/ux-check.mjs：首跑 7/9（脚本选择器问题）→ 修正 → **9/9 PASS，控制台 0 错误**
- integration chat.test.ts 5 项随 npm test 全量通过（134/134）
- 检查点：commit `7edb543`（R7 已提交，工作区干净）

## 第 8 轮 CHK 功能确认状态真实性记录

### CHK-001 数据源逐条核对（P1）— FIXED_RETEST_PASS
- 逐条核对 src/client/checklist.ts 与审计文档：发现**多处证据编号错引**（历史轮次遗留）：规则项写"31 项"（实际 37）、
  走棋同步引 NET-005（实为限流用例，应为 NET-006）、导出引 REC-010/REC-008（实为 REC-007/REC-006）、
  聊天引 UX-005（应为 UX-004~006）、刷新恢复引 NET-012/013（实为 NET-014）。
- 全部更正为真实编号与真实计数（37/47 项、NET-028 步骤号），状态本身此前即有真实测试支撑，故仅证据串修正。

### CHK-002 生产页面渲染一致性（P1）— FIXED_RETEST_PASS
- 新增 `scripts/chk-check.mjs`（生产 3001 实测）：重建后两张确认卡渲染的 title 属性（悬停证据提示）与
  checklist.ts 逐字一致；响应式两项如实显示"未验证"；无项目显示"未通过"；状态图标语义与类一致（14 pass + 2 unverified）。
- 首跑 4/7 → 7/8 → 8/8：三次失败根因均为**我的检查脚本缺陷**（textContent 取不到 title 属性、li/span 目标选错、
  双卡计数误设 ===1），非产品缺陷；逐次修正后 8/8。证据截图 shots/r8-chk-cards.png。

### CHK-003 诚实声明展示（P2）— PASS
- 确认卡底部明示"人工维护的验收记录（非实时自动化监控）+ 未验证项不会标为通过"（CHK-002 实测渲染）。

### R8 修改文件清单
- src/client/checklist.ts（证据编号逐条更正为真实登记编号）
- scripts/chk-check.mjs（新增：确认卡一致性实测工具）
- dist-client 重建（checklist 数据变更）

### R8 验证汇总（全部真实执行）
- node scripts/chk-check.mjs：8/8 PASS，控制台 0 错误（shots/r8-chk-cards.png）
- npm run build 成功（重建后生产页面与源数据一致）
- 检查点：commit `0d11080`（R8 已提交，工作区干净）

## 第 9 轮 RWD 响应式与可访问性记录

> 工具：新增 `scripts/rwd-check.mjs`（真实视口矩阵 + boundingBox 实测翻转）。

### RWD-001~006 首页视口矩阵（P1）— PASS
- 1440×900 / 1280×800 / 1024×800 / 820×900 / 414×800 / 375×667 六个真实视口逐一截图，
  scrollWidth ≤ clientWidth 全部成立（无横向滚动）。证据 shots/r9-home-*.png。

### RWD-007/010 房间页（对局中）1280×800（P1）— PASS
- 双棋种房间无横向溢出。首跑此两项等待态即 PASS，对局中态本轮复验。

### RWD-008/011 房间页 375×667（P1）— FIXED_RETEST_PASS
- 首跑 FAIL：我在**等待态**测"提和按钮可达"——等待态本无该按钮（场景设计错误，非产品缺陷）；
  改为对局中（B 加入后）实测：无横向溢出 + 提和/翻转按钮 scrollIntoView 可达。双棋种 PASS。证据 shots/r9-room-*-375.png。

### RWD-009/012 翻转棋盘真实生效（P1）— FIXED_RETEST_PASS
- 首跑 FAIL：我的 aria-label 用了繁体"帥"，产品为简体"帅"（notation.ts RED_NAME）。经临时诊断脚本实证两棋盘
  aria-label 均带颜色前缀（"e9 红帅"/"e1 白王"/"e8 黑王"，空格="e5"）后修正选择器。
- 复测：点击「翻转棋盘」→ 红帅/白王 boundingBox 纵向位置由底部半区互换至顶部半区（再点还原），双棋种 PASS。
  证据 shots/r9-xq-flip.png、shots/r9-ch-flip.png。翻转仅改显示视角不改棋谱/FEN（XI-018 交叉引用）。

### RWD-013 自动化回归复跑（P1）— PASS
- node scripts/layout-check.mjs：20/20（含「移动端点击热区≥30px size=32」「无控制台错误」）
- npx tsx scripts/viewport-check.mjs：18/18（含复盘导航在窄视口可用、29/30 复盘位置显示）

### RWD-014 可访问性抽查（P2）— PASS（如实范围）
- 已验证：棋盘按钮 aria-label 带颜色+棋子名（屏幕阅读器可辨）；toast 容器 aria-live="polite"；waiting 遮罩/复盘横幅/终局横幅/升变对话框均有 role（grid/status/dialog）与 aria-label；确认卡证据以 title 属性提供悬停说明。
- 如实边界：键盘走棋（Tab+Enter 遍历棋盘格）未单列测试——按钮原生可聚焦+Enter 触发为浏览器默认行为，但未实测断言，标 NOT_TESTED。

### R9 修改文件清单
- src/client/checklist.ts（响应式两项 unverified → pass，附 RWD 证据）
- scripts/rwd-check.mjs（新增）
- dist-client 重建

### R9 验证汇总（全部真实执行）
- node scripts/rwd-check.mjs：12/12 PASS，控制台 0 错误
- layout-check 20/20；viewport-check 18/18；chk-check 8/8（断言同步更新后）
- 检查点：commit `2d7c441`（R9 已提交，工作区干净）

## 第 10 轮 SEC 安全审计记录

### SEC-001 敏感路径（P0）— PASS
- vitest security.test.ts：/.env、/package.json、/data/app.db、/node_modules、/src/server/index.ts 全 404（内嵌测试服）。
- **生产实时探测**（scripts/sec-check.mjs，对 3001 真实服务）：上述路径 + /data、/logs/server.log 全部 404。

### SEC-002 安全响应头（P1）— PASS
- nosniff / X-Frame-Options SAMEORIGIN / Referrer-Policy no-referrer / Permissions-Policy camera=() microphone=() geolocation=()；
- CSP：default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src …，无 unsafe-eval（vitest+生产双验证）。

### SEC-003 SPA 与 API 边界（P2）— PASS
- / 与 /r/<roomId> 200（SPA 回退）；/api/secret 404 JSON {"ok":false,"error":"not found"} 无内部泄露；/healthz 200。

### SEC-004 Socket 输入校验（P1）— PASS
- security.test.ts：11 位/大写/短号+未知字段拒绝；null/数字载荷拒绝不崩溃；走棋 from 传对象被拒；
  聊天 __proto__ 注入被拒（未知字段 strip 不影响）；棋种枚举外值（weiqi）拒绝。

### SEC-005 会话与令牌（P1）— PASS
- 令牌仅存 localStorage 不进 URL（roomClient 头注 + 邀请链接不含令牌实测——URL 仅 /r/<roomId>）；
- 高熵格式：create ack token ≥24 字符；令牌错误 rejoin 拒绝（SESSION_INVALID，NET-015）；跨房间令牌不可用（NET-025）；
- 断线后席位保留且陌生人不能抢座、凭令牌方可恢复（NET-014 + NET-028 步骤⑭双客户端实测）。

### SEC-006 限流四桶（P1）— FIXED_RETEST_PASS（补充测试后）
- 已有真实测试：创建（第 3 个拒，NET-005）、聊天（7 条突发第 7 拒，UX-006）、加入（joinLimit 代码+重连退避路径）。
- **本轮补充** tests/integration/ratelimit-extra.test.ts 2 项：走棋桶容量 20（25 次突发触发 RATE_LIMITED，
  且限流不产生走法）、操作桶容量 15（20 次 undo:offer 突发触发 RATE_LIMITED）。2/2 PASS。
- 此前状态如实：走棋/操作限流在交付包中**无测试**（仅代码存在）——本轮补齐。

### SEC-007 XSS 与存储边界（P2）— PASS
- 聊天载荷原文存储、React 文本节点渲染转义（chat.test.ts 第 1 项断言存储原文+顺序）；
- 棋谱/玩家名含引号反斜杠经净化不破坏 PGN 结构（exporters 第 6 项）。

### R10 修改文件清单
- tests/integration/ratelimit-extra.test.ts（新增：走棋/操作限流 2 项）
- scripts/sec-check.mjs（新增：生产实时安全探测）

### R10 验证汇总（全部真实执行）
- npx vitest run integration/ratelimit-extra：2/2 PASS
- node scripts/sec-check.mjs：9/9 PASS（生产 3001 实时探测）
- npm test（全量）：**136/136 PASS**；npm run typecheck 0 错误
- 检查点：commit `6998099`（R10 已提交，工作区干净）

### R2 验证汇总（全部真实重跑）
- npm test 122/122 PASS；npm run typecheck 0 错误；npm run build 成功（前端 363.87KB/gzip 115.37KB + CSS 22.86KB）
- node scripts/layout-check.mjs 20/20；npx tsx scripts/viewport-check.mjs 18/18；npm run test:e2e 7/7
- 检查点：git commit 1b6398e

## 第 3 轮 XI 中国象棋规则与交互记录

### XI-001 棋盘结构（P2）— PASS
- 证据：XiangqiBoard.tsx 生成 10 横线 + 9 纵线（中间 7 条河界断开）+ 4 段九宫斜线 + 炮/兵位标记 + 楚河漢界文字（代码 + 截图 shots/r2-room-xiangqi.png / r2-practice-xq-moved.png）。

### XI-002 初始布局（P2）— PASS
- `unit xiangqi-engine`「初始 FEN 可解析并还原，红先行」+「开局红方合法走法 = 44，各兵种数量正确」；浏览器 32 枚棋子渲染（layout-check「象棋 32 枚棋子渲染」）。

### XI-003 棋子显示（P2）— PASS
- pieceLabel 红黑区分（车马相仕帅/车象士将等）+ 截图棋子圆牌清晰对齐（layout-check「象棋棋子对齐交叉点」PASS）。

### XI-004 车直线与阻挡（P1）— FIXED_RETEST_PASS
- 初始无专属测试 → 新增 2 项（纵线阻挡/横线阻挡）。首次运行 FAIL，根因=**测试编写者 FEN 构造错误**（两次：行序颠倒致黑卒误在 e8 攻帅；把车误写为 K 使引擎按帅规则单步走——引擎行为均正确）。修正 FEN 后 37/37 PASS。引擎本身无缺陷。

### XI-005 马（P1）— PASS
- 「空盘马 8 个走法」「e6 有子蹩马腿，向前的两格被封」。

### XI-006 象（P1）— PASS
- 「塞象眼：b8 有黑子则相不能走 a7」「相不能过河」。

### XI-007 士（P1）— PASS
- 「仕只能在九宫内斜走」「仕在宫边只能进中路」。

### XI-008 将帅（P1）— PASS
- 「帅九宫直走 + 照面约束」「挡子沿原列移动合法，离开此列即照面非法」「kingsFacing 工具正确」。

### XI-009 炮（P1）— PASS
- 「开局炮无炮架不能隔空吃 b2，但隔 b2 炮架可吃 b0」「炮需恰好一个炮架才能吃子」「两个炮架时不能吃最远的子」。

### XI-010 兵卒（P1）— PASS
- 未过河直进 / 过河可横走不可后退 / 黑卒过河 / 底线兵不可吃将，4 项。

### XI-011 吃子（P1）— FIXED_RETEST_PASS
- 新增「不可吃己方棋子」「吃子后棋子数量与棋谱一致」（首次 FAIL 根因同上=测试 FEN 错误；修正后 PASS）。

### XI-012 将军与应将（P1）— PASS
- 「被将军时必须应将：其余走法全部非法」「其他棋子不解将时其所有走法均非法」+ 浏览器将军红圈提示（CSS check-pulse，代码证据）。

### XI-013 将死（P1）— PASS
- 「将死：黑将 e0 被红车 a0 将军、e8 车封线」「将死局面不再接受走法」。

### XI-014 困毙与和棋（P1）— PASS
- 困毙判负（非和棋）、三次重复判和、长将判负、子力不足判和、60 回合无吃子判和，共 5 项测试。规则可追溯（engine.ts outcome 逻辑 + README 第 11 节声明）。

### XI-015 轮次（P1）— FIXED_RETEST_PASS
- 新增「非当前走棋方的走法被拒绝且不改变状态」（首次 FAIL=测试 FEN 错误，修正后 PASS）。

### XI-016 非法走棋拒绝（P1）— PASS
- 引擎层新增「非法/越界坐标被拒绝」(z9/e10/空串/原地)；服务端层见 NET-006（integration rooms 覆盖非法走法拒绝）。

### XI-017 终局锁定（P1）— PASS
- 「将死局面不再接受走法」「三次重复后 applyMove 返回 null」「insufficient 后 applyMove 返回 null」。

### XI-018 棋盘翻转（P2）— PASS
- 代码：displayXY 依 orientation 翻转（XiangqiBoard.tsx）；Room 的 flipped 状态只改 UI 不改 fen。浏览器验证见 R9（翻转按钮实测）。

### XI-019 走棋交互（P2）— PASS
- 点击选子/落子：e2e 1/2/5 用例真实走棋；拖动=NOT_APPLICABLE（项目未实现拖动，仅点击；UI 未提供拖动假按钮）。

### XI-020 棋谱历史（P1）— PASS
- 「开局常用记谱正确」（炮二平五/马八进七/马8进7/车九进五）+「applyMove 返回中文记谱与吃子信息」+「前后消歧」+ e2e 断言棋谱文本一致。

### XI-021 悔棋与认输（P2）— PASS
- integration rooms 覆盖 offer 协议（悔棋/提和/认输/重开）；UI 有对应真实按钮（非静态）；响应流程 e2e 未覆盖终局细节，详见 R5。

### XI-022 规则回归（P1）— PASS
- 以上全部为真实测试执行（vitest 37 项中象），非仅代码存在性检查。

### R3 验证汇总
- npx vitest run --project unit：4 文件中 1 文件曾 FAIL（我的新测试 FEN 错误）→ 修正 → 37/37 中象 PASS
- npm test（全量）：**128/128 PASS**（原 122 + 新增 6）
- 检查点：commit `963238d`（已提交，此处原文"待提交"为提交前写下的状态，更正）

## 第 11 轮 PERF 性能与维护性记录

> 工具：`scripts/perf-check.mjs`（Playwright + Navigation Timing/Performance API，对生产 3001 实测）
> + 本轮新增 `scripts/boot-time.mjs`（spawn→/healthz 200 冷启动计时；stdio 直接挂文件句柄）
> + 新增 `scripts/mem-check.ps1`（服务进程工作集/私有内存，ASCII 输出避免控制台编码问题）。

### PERF-001 首屏加载（P2）— PASS
- 生产实测：首页 HTML 请求均值 2ms（n=5）；Navigation Timing：TTFB=2ms、DOMContentLoaded=37ms、Load=37ms。
- 如实边界：以上为本机局域环境值，仅作回归比较基线，不代表公网表现。

### PERF-002 静态资源体积（P2）— PASS
- 首页实际加载 JS≈356KB + CSS≈22KB，合计≈378KB（页面内 fetch content-length 实测；与 R2 构建记录
  JS 363.87KB/gzip 115.37KB + CSS 22.86KB 同量级）。

### PERF-003 走棋端到端延迟（P1）— PASS
- 双独立上下文国象随机对局 20 步：每步「点击落子→棋谱条目出现」端到端均值 63ms / 最大 78ms
  （n=17，前 3 步预热丢弃；含 socket 往返与全量状态广播）。交互无卡顿、无控制台错误。

### PERF-004 广播体积 — NOT_TESTED（如实跳过）
- 随机对局第 20 步即终局，无后续合法走法可触发单次广播测量；脚本有明确超时跳过分支并如实输出
  「广播体积测量跳过」。全量快照广播的体积取舍未量化，留待后续。

### PERF-005 服务冷启动（P2）— PASS
- `node scripts/boot-time.mjs`：spawn `dist-server/server/index.js` → /healthz 200 = **1349ms**
  （PID 84724，logs/server.pid）。
- 该方式 stdio 直接挂文件句柄（fs.openSync），不依赖父进程：父脚本退出后服务持续存活
  （当前 3001 仍为该 PID 在监听）。NET-029 首跑 pipe 版崩溃堆栈由留痕处理器记录（见 NET-029 根因更新）。

### PERF-006 服务内存（P2）— PASS（两采样点）
- `scripts/mem-check.ps1`：冷启动后实测工作集 100.9MB / 私有 104.7MB；本轮空闲态复测工作集 68.4MB /
  私有 71.8MB——低于启动后峰值，未见只增不减迹象。如实边界：仅两采样点，非长周期泄漏专项。

### PERF-007 维护性核查（P2）— PASS
- `npm run typecheck`（本轮新鲜重跑）：前后端 **0 错误**。
- 本轮新增脚本均有真实运行输出支撑，无仅存在性检查项。

### PERF-008 测量工具修复 — FIXED_RETEST_PASS
- perf-check.mjs 首跑受阻于 R2 遗留选择器（`.create-card.chess` 整卡点击，R2 改版后 CTA 为
  `.gc-create-btn`）→ 修正为 `.create-card.chess .gc-create-btn` 后全流程跑通。
- 首跑失败根因=验证脚本未同步 R2 改版，非产品缺陷（与 R5/R7/R8 首跑模式一致，如实记录）。

### R11 修改文件清单
- scripts/perf-check.mjs（选择器同步 R2 改版）
- scripts/boot-time.mjs（新增：冷启动计时 + 文件句柄 stdio 启动）
- scripts/mem-check.ps1（新增：内存测量）
- docs NET-029 段落（根因定位更新：console.log→EPIPE）

### R11 验证汇总（全部真实执行）
- npx tsx scripts/perf-check.mjs：PERF-001/002/003 实测通过；PERF-004 如实跳过
- node scripts/boot-time.mjs：冷启动 1349ms（PID 84724）；powershell scripts/mem-check.ps1：见 PERF-006
- npm run typecheck：0 错误
- 检查点：commit `2c1d9e3`（R11 已提交）

## 第 12 轮 TEST 自动化总套件回归记录

> 本轮为全量**新鲜重跑**（非引用前轮结果）；无修复项，首轮即全绿；本轮零源码改动。

### TEST-001 单元+集成总套件（P1）— PASS
- `npm test`：**136/136 PASS**（9 文件，2.69s，退出码 0）。构成：unit——xiangqi-engine 37 /
  chess-rules-deep 29 / chess-adapter 18 / exporters 9（93 项）；integration——rooms 21 /
  concurrency 6 / security 9 / chat 5 / ratelimit-extra 2（43 项）。

### TEST-002 端到端套件（P1）— PASS
- `npm run test:e2e`：**7/7 PASS**（9.2s）：桌面双上下文中象对局（创建/邀请/对弈/同步/复盘/重连）、
  非法走棋不改局面、国象 e4 e5 Nf3 双端同步 SAN、升变对话框、移动端 375×667 走棋、
  国象 PGN 导出下载、中象中文棋谱+JSON 导出。
- Playwright 自带 webServer（独立 3100 端口 + 独立测试库 data/e2e-test.db），与生产 3001 互不影响。

### TEST-003 布局自动化（P2）— PASS
- `node scripts/layout-check.mjs`：**20/20**（含移动端棋盘宽自适应、触控高度≥40px、点击热区≥30px、无控制台错误）。

### TEST-004 视口自动化（P2）— PASS
- `npx tsx scripts/viewport-check.mjs`：**18/18**（含长昵称不溢出、键盘 Tab 可遍历 12 个可聚焦控件、
  复盘横幅与位置显示 29/30）。

### TEST-005 类型检查（P2）— PASS
- `npm run typecheck`：前后端 0 错误（exit 0）。

### TEST-006 用例完整性核查 — PASS
- 本轮套件文件与 R10 轮一致，零改动：无隐藏/跳过用例、无删除用例、无屏蔽断言（vitest 报告 9 文件
  全部执行、Playwright list 报告 7 用例全部 ok）。

### R12 修改文件清单
- （无源码改动；仅本记录）

### R12 验证汇总（全部真实执行）
- npm test 136/136；npm run test:e2e 7/7；layout-check 20/20；viewport-check 18/18；typecheck 0 错
- 检查点：commit `babf76a`（R12 已提交）

## 第 13 轮 DEP 生产构建与部署记录

### DEP-001 生产构建（P1）— PASS
- `npm run build`（本轮新鲜执行）：vite 前端 77 模块构建成功——index.html 0.98KB、
  CSS 22.86KB/gzip 5.75KB、JS 364.25KB/gzip 115.49KB；`tsc -p tsconfig.server.json` 编译成功（exit 0）。

### DEP-002 生产启动与新构建冒烟（P1）— PASS
- 停旧服务（scripts/stop-server.ps1）→ `node scripts/boot-time.mjs` 以新构建冷启动：**1382ms**
  （PID 74964，logs/server.pid）。boot 日志：从数据库恢复 **244** 个房间（R5 轮记录 236 → 本轮 244，
  增量为本轮各实测运行创建的测试房间；产品 10 分钟周期 cleanupStale 按过期策略清理，未手工删数据）。
- 冒烟：3001 layout-check 复跑 **20/20**（含「无控制台错误」）；/healthz 200。
- 内存：启动后 mem-check 工作集 99.8MB / 私有 71.5MB（与 PERF-006 启动后量级一致）。

### DEP-003 公网隧道（P1）— PASS
- `npm run tunnel`（tools/cloudflared.exe，版本 2026.10.4）：Quick Tunnel 成功，URL=
  **https://repository-attorneys-retained-ratings.trycloudflare.com**（脚本自打印）。
- 公网 URL 实测（HTTP 请求经 Cloudflare 边缘中转回源本机）：GET / → **HTTP 200**（HTML 壳含「双人对弈」，
  934 字节与构建产物一致）；/healthz → **HTTP 200**（脚本内验证输出）。
- **双客户端公网全程实测**（本轮将 scripts/net-check.mjs 的 BASE 参数化为 NET_BASE 环境变量后运行）：
  经该公网地址，**中象 15/15、国象 15/15，控制台 0 错误**——两局完整真实对局（创建/邀请/加入/走棋同步/
  非法拒绝/复盘/聊天/刷新恢复/悔棋/离线防抢座/认输终局）全部经公网完成。
  证据截图 shots/r13-tunnel-xiangqi-a-playing.png、shots/r13-tunnel-chess-a-playing.png。
- 如实边界：验证请求从本机发出、经 Cloudflare 公网域名解析与边缘中转（Quick Tunnel 机制本身即此），
  未做第三地域独立网络验证；URL 为临时地址（隧道脚本停止或重启后失效、URL 会变化），与 README 已知边界一致。

### DEP-004 隧道脚本健壮性（P3）— PASS
- tunnel.mjs 流程实测：检测本机服务在线 → 使用 tools/ 本地 cloudflared（免全局安装）→ 打印公网 URL +
  自动连通性验证。免账号、免域名、免费。

### R13 修改文件清单
- scripts/net-check.mjs（BASE 参数化：`NET_BASE` 环境变量，缺省仍为 127.0.0.1:3001，向后兼容）
- shots/r13-tunnel-*.png（公网实测证据截图，取自本轮 net-check 真实输出；shots/ 目录在 .gitignore
  中，与此前各轮证据截图一致仅存本地磁盘，不入库）

### R13 验证汇总（全部真实执行）
- npm run build 成功（前端+服务端）；冷启动 1382ms（PID 74964）；layout-check 冒烟 20/20
- 公网 URL：GET / 200 + /healthz 200；双棋种 net-check 经公网 15/15 + 15/15，控制台 0 错误
- 检查点：commit `1bb16a8`（R13 已提交；证据截图不入库见上）

## 第 14 轮 DOC 文档与最终报告记录

### DOC-001 README 更新（P2）— PASS
- §7 测试节：计数更正为实测值（npm test 122→**136**）并逐项列出实测覆盖构成（国象 47/中象 37/导出 9/
  联机 27/安全 11/聊天 5/e2e 7——原README 数字为历史版本值，已过时）；补齐全部验收实测工具与运维工具用法
  （net-check/ux-check/chk-check/rwd-check/sec-check/boot-time/mem-check，含 NET_BASE 用法与"勿用管道方式
  后台启动"的 NET-029 教训）。
- §13 架构：scripts/ 说明更新为"运维脚本 + 验收实测工具"。
- §14 命令表：补 boot-time/mem-check/stop-server 三行。
- 新增 §15 验收记录：14 轮结论摘要 + 指向审计文档。

### DOC-002 文档链完整性（P2）— PASS
- docs/overnight-audit-log.md（早期）→ docs/visual-and-functional-audit.md（本审计 14 轮全记录）→
  README §15（对外摘要）三层引用关系建立；README 中过时计数不再与实测矛盾。

### DOC-003 最终交付报告（P1）— PASS
- 见下方「最终交付报告」节；全部结论均指向本文档已登记的真实实测记录，无新增未验证声明。

### R14 修改文件清单
- README.md（§7/§13/§14/§15）
- docs/visual-and-functional-audit.md（R14 记录 + 最终交付报告）
- logs/server.pid（生产 PID 84724→74964，运行时产物如实入库）

### R14 验证汇总（全部真实执行）
- README 所述命令与计数逐项对照审计文档实测记录一致；无凭空新增命令
- 检查点：本提交（R14 最终；见文末「检查点链」与本说明：hash 回填模式说明：各轮「检查点」行记录的是
  该轮提交 amend 前的 hash，最终有效 hash 以 `git log` 为准）

---

# 最终交付报告（2026-10-28，14/14 轮完成）

## 总结论
- **14 轮验收全部完成**，每轮均有真实执行记录与本轮 git 检查点；未实测项全部如实标注（无伪造）。
- 产品处于**可交付/可游玩状态**：生产构建成功、服务稳定（崩溃留痕加固 + 后台启动安全）、
  双棋种本地与公网均可完成完整真实对局。

## 真实测试总量（2026-10-28 新鲜重跑口径）
| 套件 | 结果 |
|------|------|
| npm test（unit 93 + integration 43） | **136/136 PASS** |
| e2e（Playwright 双上下文） | **7/7 PASS** |
| layout-check | **20/20** |
| viewport-check | **18/18** |
| net-check 双客户端 15 步（本地） | 中象 **15/15**、国象 **15/15**，控制台 0 错误 |
| net-check 双客户端 15 步（公网隧道） | 中象 **15/15**、国象 **15/15**，控制台 0 错误 |
| ux/chk/rwd/sec 专项实测 | 9/9、8/8、12/12、9/9 |
| typecheck | **0 错误** |
| perf | 首屏 TTFB 2ms；静态资源≈378KB；走棋端到端均值 63ms/最大 78ms；冷启动 1349/1382ms |

## 本审计会话的真实变更（按轮）
- R2：Home/Room 视觉复刻接入（theme 类）、首页展示卡试玩沙盒（真实引擎）、功能确认卡数据源
- R3/R4：中象+国象边界测试补强（中象 31→37、国象 41→47，含易位阻挡/过路兵牵制/终局语义/重复判和时点）
- R5：net-check.mjs（双客户端 15 步实测）；NET-029 P1 加固（崩溃留痕处理器 + start-server-bg.ps1）
- R6：exporters 边界（引号/反斜杠净化等 9 项存在性核实）；DB 房间增长如实登记
- R7~R11：验收工具链成型（ux/chk/rwd/sec/perf-check、boot-time.mjs、mem-check.ps1）；
  checklist 证据编号逐条更正；NET-029 根因定位（console.log→EPIPE）
- R10：限流补充测试 2 项（走棋桶 20/操作桶 15，此前无测试如实补齐）
- R13：net-check NET_BASE 参数化（公网实测能力）
- 无任何用例被删除或屏蔽；全部测试 FEN/选择器笔误型失败已逐例如实登记根因

## 已知边界（如实，均有对应记录节）
1. 中象导出为自定义格式 `chessbox-xiangqi-v1`（非标准 PGN）——REC-007 如实声明
2. 长捉仲裁未实现（提和/认输可替代）——README §11
3. 键盘走棋（Tab+Enter 落子）未实测——RWD-014 标 NOT_TESTED
4. Quick Tunnel 公网地址临时（停止即失效、重启会变）——DEP-003 边界
5. 公网验证为经 Cloudflare 边缘中转的本机请求，未做第三地域独立网络验证——DEP-003 边界
6. 广播体积未量化（随机对局 20 步即和无法触发）——PERF-004 标 NOT_TESTED
7. 数据库含本会话测试房间（236→244），由 10 分钟周期 cleanupStale 按过期策略自动清理——REC-008/R13
8. 遗留 1 个开发会话与孤儿实测进程（BASE-004 登记，不影响产品；未杀用户进程）

## 交付物清单
- 产品源码 `src/`（client/server/shared/games）+ 生产构建产物 `dist-client/`、`dist-server/`（不入库）
- `docs/visual-and-functional-audit.md`：本文件，14 轮全记录与最终报告（唯一验收源）
- `README.md`：面向使用者的完整用法、安全要点、边界声明与验收摘要
- `scripts/`：运维工具（start-prod/start-server-bg/stop-server/tunnel/boot-time/mem-check）
  + 验收实测工具（net/ux/chk/rwd/sec/perf/layout/viewport-check）
- `shots/`：各轮证据截图（本地磁盘，.gitignore 不入库）

## 检查点链（最终）
`d6be19d`→`1b6398e`(R2)→`963238d`(R3)→`bedbd38`(R4)→`c901736`(R5)→`8fdea52`(R6)→`586ef91`(R7)
→`5a3f160`(R8)→`6ecff91`(R9)→`fce24e4`(R10)→`6460dfd`(R11)→`f938c0d`(R12)→`c273730`(R13)→**本提交**（R14 最终，含本报告；
R1 记录于 `d6be19d` 之前的 `d462d4e` 起点）。说明：hash 回填后 amend 会使文档内该轮 hash 失效为
amend 前值（可用 `git reflog` 追溯），故 R14 以"本提交"指代，避免写入自引用假 hash。
