# 棋盘 · 棋子 · 走棋动画专项审计与验收日志

> 本文档是「棋盘/棋子/动画专项升级」的唯一进度与验收记录。所有结论基于真实代码审读与真实浏览器运行；
> 未执行的项一律标 NOT_TESTED，不伪造。状态定义与优先级规则同 `docs/visual-and-functional-audit.md`。
>
> 起点检查点：git HEAD = `0c30dcd`（14 轮验收全部完成的最终交付态），工作区干净，无用户未提交修改。
> 专项开始前基线截图：`shots/anim-baseline-{xiangqi,chess}-{a,b}-playing.png`、
> `shots/anim-baseline-{xiangqi,chess}-a-selected.png`（scripts/anim-baseline.mjs 真实双上下文对弈 2 步后拍摄）。
> **最终检查点：`fb0ae2b`（阶段 A-J 全部完成；核心实现 `0391392`）。**

## 阶段状态总表

| 阶段 | 内容 | 状态 |
|------|------|------|
| A | 代码与视觉基线审计 | ✅ 完成（见 AUDIT 记录） |
| B | 中国象棋棋盘/棋子/材质升级 | ✅ 完成（`0391392`） |
| C | 国际象棋棋盘/棋子/材质升级 | ✅ 完成（`0391392`） |
| D | 统一坐标/图层/选中态/合法目标 | ✅ 完成（随 B/C 落地，见 D 组记录） |
| E | 移动/吃子/升变/易位动画实现 | ✅ 完成（FLIP 系统，anim-verify 15/15） |
| F | 网络拒绝/重复事件/重连/复盘/缩放修复 | ✅ 完成（含将死步动画闸门修复，见 F 记录） |
| G | 桌面/平板/手机/减少动效适配 | ✅ 完成（375/768/2x 截图 + reduced-motion 实测） |
| H | 自动化测试 + 真实浏览器测试 + 修复 | ✅ 完成（TEST-001~020 全表） |
| I | 生产构建回归 | ✅ 完成（build + net-check 15/15 于生产服 3001） |
| J | 文档与验收报告 | ✅ 完成（本文档） |

## 阶段 B/C/D/E 记录（检查点 `0391392`）

### 新增文件
- `src/client/components/boardAnim.ts`：`fenPieceMap`（双棋种 FEN 解析，中象首行=r0）+ `buildBoardAnim`
  纯分类器（gone/appeared diff → mover/captured（过路兵格≠to）/rook（易位，含车代码）/promotedTo；
  from 无子返回 null → 调用方直同步不动画）。
- `src/client/components/useMoveFlight.ts`：FLIP 飞行 Hook——双 rAF 置 started、600ms 安全兜底 +
  visibilitychange 立即落位（ANIM-022）、卸载清理（ANIM-023）、landSq 落位强调 340ms。
- `src/client/components/animPref.ts`：动效总开关 = 用户偏好（localStorage `dc:anim`）∧ 非
  prefers-reduced-motion（ANIM-024/025）。
- `tests/unit/board-anim.test.ts`：12 项（中象普通/炮吃/吃兵/无子 null；国象普通吃/双翼易位/过路兵/升变×2/map×2）。

### 修改文件
- `XiangqiBoard.tsx`（重写）：木纹 SVG 盘面（xq-wood 渐变 + feTurbulence 木纹 + vignette + 双框沿）、
  方向感知坐标（底部文件字母 + 右侧行号，随翻转）、data-occ 悬停、FLIP 飞行层（mover/captured/rook）、
  hidden-flying/just-landed 状态类。**修复 PIECE-002 根因**：`.xq-piece-disc` 尺寸从
  `calc(100%/9*0.92)`（shrink-to-fit 父元素内无法解析）改为显式 `10.22cqw`（容器=`.xq-board`），
  圆盘棋子从"塌缩小圆点"恢复为完整传统圆盘。
- `ChessPieces.tsx`（重写）：统一 Staunton SVG（45×45；白象牙渐变+深描边 / 黑乌木渐变+近黑描边+浅细节线；
  马=双耳+鼻梁+嘴部回收+颈背弧侧影；车=城垛；象=斜切洋葱头；王=加大十字）。
- `ChessBoard.tsx`：anim prop + `.chess-anim-fly/.chess-anim-captured` 层（12.5% 精确格）+
  hidden-flying + just-landed + data-occ + wrap.selected 抬起（scale 属性，不碰 transform）。
- `Room.tsx`：动画闸门 effect——`moves.length === prevCount + 1`（服务端确认新着恰 +1）∧ ply 去重
  （ack 与 room:state 双路径不重播，ANIM-013）∧ conn==='online' ∧ viewPly===null ∧ animEnabled；
  复盘/关动效/新对局清 anim；"动效"开关按钮（replay-controls 内）。
- `PracticeBoard.tsx`：本地引擎走棋成功即构造 anim（沙盒权威），engine 重建清 anim。
- `app.css`：动效 tokens（--anim-move-ms 180/移动端 150、--anim-capture-ms、--anim-land-ms、
  --anim-ease）、中象 disc 材质（radial 渐变 + 三层 inset 环 + 朱红/墨黑字色 token）、xq-line/xq-coord、
  国象枫木/胡桃格（主题内覆盖 #e8d5ae/#7a5c3e）、chess-board 木框+vignette、
  capture-out（独立 scale/opacity 属性，ENG-006）、land-fade、@media 缩时长、reduced-motion 归零。

### 脚本修复（如实记录，非产品缺陷）
- `anim-baseline.mjs`：中象选子坐标 b1（空格）→ b9（红马）——首跑失败根因。
- `anim-verify.mjs` 首版两处缺陷：① newRoom 缺 `.conn-pill.ok` 等待（conn 尚 connecting 时
  canMove=false，click 无效）；② moveAndWatch 在两次 click 之间插入 1.6s 的 waitForSelector 超时
  且 moves 计数早于 ack 返回。修正后 15/15。
- `viewport-check.mjs`：`import '../src/games/chess/adapter'` 缺扩展名（Node ESM 解析失败）→
  加 `.ts`（Node 24 类型剥离直跑）。18/18 恢复全绿。

### 动画系统实测（scripts/anim-verify.mjs，真实双上下文对弈）— 15/15 PASS
V1 中象普通走棋飞行层出现并清理（窗口≈13ms 响应）；V2 落位精确 e7=红炮；V3 对手步同播；
V4 复盘不动画；V5/V6 国象双方端走棋；V7/V9 吃子 captured 层；V8 双方局面一致；
V10 王车易位 g1=王/f1=车；V11-V13 重连不重播；V14/V15 动效开关。

## 阶段 A：技术审计（全部真实代码审读 + 浏览器实证）

### AUDIT-001 棋盘渲染方式 — 结论：DOM/CSS/SVG 混合（保留，不迁移）
- 中国象棋 `XiangqiBoard.tsx`：背景为**内联 SVG**（viewBox 540×600，MARGIN=30、CELL=60：10 横线 + 9 纵线
  中间河界断开 + 4 段九宫斜线 + 炮兵位标记 + 楚河汉界文字）；棋子/提示/点击层为**绝对定位 DOM**
  （`.board-overlay` 内 `.xq-piece`、`.xq-sel-ring`、`.xq-target-dot/.xq-target-ring`、`.xq-last`、
  90 个 `.board-hotspot` 透明按钮），位置一律用 `left/top` 百分比（posStyle，按 orientation 翻转）。
- 国际象棋 `ChessBoard.tsx`：**CSS Grid 64 按钮**（`.chess-grid`），棋子为**内联 SVG 组件**放在
  `.chess-piece-wrap`（inset 4%），提示用 `.chess-dot/.chess-ring`/`::before/::after`。
- 判定：**沿用现有方案**（AUDIT-007）。DOM/SVG 对本项目的联机一致性、a11y（role=grid + 按钮 aria-label）、
  自动化测试（layout/viewport/e2e 选择器）与移动端触摸均已验证可靠；Canvas/WebGL 无收益且有重写风险。
- 逻辑坐标：中象 `a0..i9`（行 0=黑底线）；国象标准 `a1..h8`。posStyle/网格映射与翻转逻辑已正确
  （R9 轮 boundingBox 实测），棋盘尺寸变化不改变逻辑坐标（BOARD-001 现状满足）。

### AUDIT-002 棋子素材来源
- 中象：**CSS 圆盘 + serif 汉字**（`pieceLabel`），无图片。**发现实际缺陷**：`.xq-piece-disc` 的
  `width: calc(100%/9*0.92)` 写在 shrink-to-fit 的绝对定位父元素内，百分比宽度无法解析出格子尺寸
  ——基线截图中圆盘塌缩为字符右上角的一个小圆点，棋子实际呈现为"裸汉字 + 小圆点"，
  **无真正圆盘棋子**（PIECE-002 待修，属专项主要修复点）。
- 国象：自绘 SVG（`ChessPieces.tsx`，45×45 viewBox，扁平几何风格，白 #f7f2e7/黑 #2b2620 双色系统）。
  基线可见：轮廓可辨但风格扁平、马头偏抽象、无材质层次（PIECE-003 待精修）。
- 无外部图片素材（assets/*.svg 仅为首页装饰图）。许可风险：无（全部自绘，ENG-011 天然满足）。

### AUDIT-003 提示态代码定位
- 中象：选中=`.xq-piece.selected`（disc 光环）+ 独立 `.xq-sel-ring`（虚线金圈，z3）；
  合法目标=`.xq-target-dot`（绿点）/`.xq-target-ring`（红圈）由 `targets: Map<sq, capture>` 驱动；
  最后一步=`.xq-last` 半透明圆（z1，在棋子层之下）；将军=`.xq-piece.in-check`（红环 + check-pulse 动画）。
- 国象：选中=`.chess-sq.selected::after`（inset 金框）；最后一步=`.chess-sq.last-from/last-to::before`
  （半透明琥珀覆盖）；目标=`.chess-dot/.chess-ring`；将军=`.chess-sq.in-check`（径向红晕 + pulse）。
- 图层现状（BOARD-013）：中象 last(z1) < piece(z2) < ring/dot(z3) < hotspot(z4)；国象按 DOM 顺序
  （piece z2, dot/ring z3, coord z1）。基本合理；动画层需新增更高 z（见阶段 E）。

### AUDIT-004 走棋事件路径
- 输入：`.board-hotspot`/`.chess-sq` click → `Room.handleSquareClick`（engineRef/selectedRef 同步引用
  即时计算，防过期闭包）→ `actions.move` → socket `game:move`（**requestId=uuid + revision 乐观锁**，
  emitWithAck 8s 超时）→ **服务端权威校验**（席位/轮次/合法性/幂等）→ ack 返回最新 `RoomState`。
- 更新：走棋方经 ack `setState(ack.state)`；对手与观战者经 `room:state` 广播 `setState(p.state)`。
- **无乐观更新**：客户端 state 仅来自服务端确认（ack/广播）。走法记录 `PublicMove` 含
  `ply/from/to/promotion/notation/fenBefore/fenAfter/captured/check/ts` ——动画所需前后局面与去重键
  （ply、revision）**数据完备**（ANIM-013 有现成去重键）。
- 非法/被拒：ack.ok=false → toast 错误 + （STALE_REVISION 时）同步服务端最新局面。**state 不变 → 不触发动画**
  ——ANIM-010 天然满足，无需回滚机制。

### AUDIT-005 现状动画/重渲染风险（改造前）
- 现状**没有任何移动动画**：棋子以 `key={sq}` 渲染，fen 变化时旧格卸载/新格挂载 → 瞬移。
- 风险点（改造时必须处理）：React 重渲染（fen 相同不重放）、棋盘翻转（orientation 变化会重算全部
  posStyle，飞行中翻转需取消）、复盘跳转（viewPly 变化不产生新着，不应触发动画）、重连恢复
  （moves.length 可能跳变 >1，必须跳过动画直同步）、悔棋/重开（length 减少或清零，必须跳过）。
- 将军 pulse 为无限动画，仅受 prefers-reduced-motion 控制（现状已有）。

### AUDIT-006 移动端/触摸/兼容/现有自动化
- `.board` 已有 `touch-action: manipulation; user-select: none`；≤980px 单列布局、≤640px 全宽棋盘
  （已验证 375 视口可玩，R9/R12）。热区：中象 9.2cqw 圆形、国象整格按钮（≥40px 高实测 42px）。
- 现有自动化基线：npm test 136/136、e2e 7/7、layout-check 20/20、viewport-check 18/18、rwd 12/12、
  ux 9/9、chk 8/8、sec 9/9（R12/R10 全部真实重跑记录）。
- **改造硬约束（不得破坏的选择器/断言）**：`.xq-piece` 恰 32、`.chess-piece` 恰 32、
  `.xq-board` 宽高比 0.9±0.02、`.chess-board` 正方形±0.02、`.xq-piece` 中心对齐交叉点、
  `.chess-piece-wrap` 居中于格、`.coord` ≥16、`.board-hotspot` 热区、
  `.xq-sel-ring`/`.chess-sq.selected`/`.xq-target-dot|ring`/`.chess-dot|.chess-ring`、
  aria-label 格式（"e9 红帅"/"e1 白王"/空格="e5"）、`.move-btn/.replay-*/.promo-card` 等。
  结论：**保留全部类名与 DOM 结构，视觉升级走 CSS 变量与 SVG 内部重绘**。

### AUDIT-007 技术方案评估 — 结论：不迁移渲染技术
- 目标（材质/精致棋子/自然动画）全部可用 **CSS（渐变/阴影/容器查询单位）+ SVG（重绘棋子、feTurbulence
  木纹）+ CSS transition（FLIP 位移）** 达成，无需 Canvas/WebGL/动画库（ENG-010：零新增依赖）。

### AUDIT-008 效果来源盘点
- 可用现有手段：格线/河界/九宫（SVG 已有）、棋子圆盘与国象棋子重绘（CSS/SVG）、木纹（SVG feTurbulence
  或 CSS 渐变）、走棋位移（FLIP + transform transition）、吃子离场（CSS 一次性动画）、
  升变/易位（同一动画层多元素）、落位强调（一次性 keyframes）、悬停（:hover + data 属性）。
- 需新增代码：棋子身份 diff 分类器（普通/吃子/过路兵/易位/升变）、飞行层渲染、Room 级动画触发与去重、
  动效开关偏好。**无需新增素材文件**。

### AUDIT-009 本文档 — 已建立（即本文件），验收编号 AUDIT/BOARD/PIECE/ANIM/FX/ENG/VIS/TEST 系列。

## 核心改造决策（最小风险方案）

1. **渲染技术不迁移**；类名/DOM 骨架/aria 全保留 → 所有既有自动化测试选择器零适配。
2. **动画模型 = 服务端确认后的 FLIP 过渡**：Room 在 `moves.length` 恰 +1 且在线直播态时，
   由 `PublicMove.fenBefore/fenAfter/from/to` 构造 `BoardAnim`（纯函数分类器，可单测）传给棋盘；
   棋盘内以"目标格定位 + 初始 transform 偏移 + 双 rAF 释放"实现合成器动画。
   动画不参与任何状态判定（ENG-014/015），中断/新着/翻转/卸载一律立即落到权威局面（ANIM-026/028）。
3. **去重 = ply 键**：同一 ply 只触发一次（ANIM-013）；重连追赶/悔棋/重开/复盘均不触发（各自独立分支）。
4. **时长/缓动集中 token**：`--anim-move-ms/--anim-capture-ms/--anim-ease` + 移动端媒体查询 + 
   prefers-reduced-motion 归零 + 用户级"动效"开关（localStorage，不影响规则）。

## 专项测试清单（阶段 H 逐条执行后登记结果）

TEST-001~TEST-020 编号按任务书执行登记于下方（含前置/步骤/预期/实际/状态/证据路径）。

### 阶段 F 记录：网络/终局/特殊路径（本次会话）

- **将死步动画闸门修复（真实缺陷，SPEC-C3 首跑 FAIL 暴露）**：服务端 `phaseOf` 在有 outcome 时
  返回 `'ended'`（rooms.ts:488-492），将死/困毙/逼和的终局着随 `phase:'ended'` 到达，
  原闸门 `state.phase === 'playing'` 会把终局着拦掉（终局直同步无动画）。
  修复：闸门放宽为 `playing || ended`——终局着同属服务端已接受着法，照常播放；
  安全性：`length===+1 ∧ ply 去重` 双闸门不变，认输/求和（无新着）与重开（length 归零）
  仍不触发。修复后 SPEC-C3 PASS 且 anim-verify 15/15、vitest 148/148 无回归。
- 服务端拒绝路径（TEST-007）：UI 不可达——客户端无乐观更新（AUDIT-004），非法走法在本地
  引擎 legalMoves 阶段即被过滤（net-check 步骤9：非法目标不产生走法），服务端权威拒绝
  （ack.ok=false）仅可经协议层伪造触发，浏览器正常 UI 无法构造。以代码路径审读登记。
- 重复消息（TEST-008）：ply 去重闸门（Room effect `last.ply > lastAnimPlyRef.current`）+
  ack/room:state 双路径实测（V1-V3 走棋方与对手端各播一次、无重复层）+ 重连不重播（V13）。

### 阶段 G 记录：多端与减少动效

- `anim-mobile.mjs`：375 中象/国象（cqw 自动缩放、圆盘清晰、国象整格按钮可操作）、
  768 中象（圆盘/河界/坐标正常）、国象 1280@2x（SVG 矢量高 DPI 无发虚）——
  证据 `shots/anim-mobile-*.png` 4 张（真实对弈 1 步后拍摄）。
- `anim-extra.mjs`：resize 中动画最终精确对位 (270.0,449.4)（ANIM-007）、
  reduced-motion 跳过动画走棋正常（X2）、升变 b8=白后（X3）、快速连续走棋无残影 32 子完整（X4）。

### 阶段 I 记录：生产构建回归（TEST-020）

- `npm run build` 成功（vite client + tsc server）；生产服 `node dist-server/server/index.js`
  端口 3001 加载新构建（index-Dkkz5SWH.js → 闸门修复后新 bundle）。
- 生产模式全量实测：net-check.mjs 15/15（双棋种创建/加入/走棋同步/权威禁走/非法目标/
  复盘互不干扰/聊天/重连恢复/悔棋双确认/断线徽章/观战不抢座/认输终局锁）、
  anim-verify 15/15、anim-extra 4/4、anim-special 6/6、vitest 148/148、e2e 7/7、
  layout 20/20、viewport 18/18、rwd 12/12、ux 9/9、chk 8/8、sec 9/9 —— 全部于生产构建/生产服通过。

## TEST-001~020 全表（前置 / 步骤 / 预期 / 实际 / 状态 / 证据）

| 编号 | 项 | 前置与步骤 | 预期 | 实际 | 状态 | 证据 |
|------|----|-----------|------|------|------|------|
| TEST-001 | 中象棋盘视觉 | 打开中象对局页截图 | 木纹盘面/河界/九宫/位标/坐标齐全清晰 | 全部呈现，河界单行"楚河/漢界"，坐标淡显不抢棋子 | PASS | shots/anim-after-xiangqi-a-playing.png、anim-mobile-xiangqi-*.png |
| TEST-002 | 中象棋子圆盘 | 同上，检查 32 子 | 完整圆盘+锐利居中汉字（朱红/墨黑） | 圆盘完整（cqw 修复）、汉字锐利、金环+投影统一 | PASS | 同上 3 张截图 |
| TEST-003 | 国象棋盘视觉 | 打开国象对局页截图 | 枫木/胡桃格+坐标+木框 | 枫木浅格/胡桃深格+暗角+木框边 | PASS | shots/anim-after-chess-a-playing.png、anim-mobile-chess-hidpi2x.png |
| TEST-004 | 国象棋子辨识 | 同上，逐子辨认 | 六种棋子轮廓可辨（不只靠颜色） | Staunton 六型可辨（马双耳/车城垛/象斜切/王十字/后多珠冠） | PASS | 同上 2 张截图 |
| TEST-005 | 选中/目标/最后一步/将军提示 | 选子、走子、将军各截图 | 两棋种统一语言：金圈选中/点圈目标/淡晕最后一步/红晕将军 | 一致；in-check 精确出现在被将方王格 | PASS | anim-verify V2、anim-special C1/C2、scripts/anim-baseline.mjs 截图 |
| TEST-006 | 普通走棋动画 | 双上下文对弈各走一步（两棋种×走棋方/对手端） | 飞行层出现→过渡→清理，落位精确 | V1/V3/V5/V6 全 PASS（窗口≈9-169ms 内出现，自动清理） | PASS | scripts/anim-verify.mjs 输出 |
| TEST-007 | 服务端拒绝走棋不动画 | 无法从 UI 构造服务端拒绝（本地 legalMoves 已过滤+无乐观更新） | 被拒时 state 不变→无动画 | UI 不可达；代码路径验证：Room 闸门仅由 moves.length+1 与 ply 驱动，state 不变必无动画；net-check 步骤9 非法目标不发送 | NOT_TESTED（端到端不可达）/ 代码路径验证 | AUDIT-004、scripts/net-check.mjs 步骤9 |
| TEST-008 | 重复消息不重播 | ack 与 room:state 双路径同 ply 到达 | 同一 ply 只播一次 | ply 去重闸门（`ply > lastAnimPlyRef`）；V1-V3 无重复层；V13 重连追赶不重播 | PASS（代码闸门+间接实测） | src/client/views/Room.tsx 闸门 effect、anim-verify V1-V3/V13 |
| TEST-009 | 吃子动画 | 国象 exd5 真实吃子 | captured 离场层出现并消失，双端局面一致 | V7/V9 cap=true；V8 d5=白兵 双端一致 | PASS | anim-verify 输出 |
| TEST-010 | 对手步同播动画 | 对手端走棋，本端观战 | 本端同播动画（对方视角正确） | V3（中象 B 走 h0→g2，A 端 fly=true） | PASS | anim-verify 输出 |
| TEST-011 | 中象特殊局面 | 真实对弈：炮 h7→h8 蹩马腿→点马点 g7；炮退回→马跳 g7 | 蹩腿时 g7 非目标不发送；让开后合法+动画 | X1/X2 全 PASS；象眼/将帅照面由引擎单测覆盖（塞象眼/照面/帅九宫） | PASS | scripts/anim-special.mjs X1/X2；tests/unit/xiangqi-engine.test.ts（马腿/塞象眼/照面 describe） |
| TEST-012 | 国象将军/将死 | Qxe5+（将军指示）→ Be7 挡将；另局愚人杀 f3/e5/g4/Qh4# | 被将王格 in-check；解将消失；将死横幅+终局锁 | C1 e8 黑王 in-check；C2 解除；C3 横幅"黑方获胜 · 将死"+moves 锁 4；终局着有动画 | PASS | scripts/anim-special.mjs C1-C3；chess-rules-deep.test.ts L274 |
| TEST-013 | 王车易位动画 | e4/e5/Nf3/Nc6/Bc4/Nf6 后 e1→g1 | 王 h1 车同飞，落位 g1=王/f1=车 | V10 K=1 R=1 | PASS | anim-verify 输出 |
| TEST-014 | 升变动画 | a2a4/b7b5/a4xb5/a7a6/b5xa6/g8f6/a6a7/h7h6/a7xb8=Q | promo 对话框确认后落位 b8=白后 | X3 b8白后=1 | PASS | anim-extra 输出 |
| TEST-015 | 过路兵动画 | e4/Nf6/e5/d5/exd6 e.p. | capturedSq(d5)≠to(d6)，两层正确，d5 清空 | C4 cap=true d6=白兵 d5 空 | PASS | anim-special C4；tests/unit/board-anim.test.ts 过路兵分类 |
| TEST-016 | 复盘导航不动画/不留残影 | 走 2 步后上一步/下一步导航 | 复盘视图无飞行层、无残影 | V4 fly=false；ANIM-020 进入复盘清 anim | PASS | anim-verify V4 |
| TEST-017 | 移动端 375 可玩+视觉 | 375×667 真实对弈走 1 步截图 | 圆盘 cqw 缩放清晰/国象可操作/无溢出 | 375 中象圆盘清晰、国象完整可操作；rwd-check 12/12 无横向溢出 | PASS | shots/anim-mobile-{xiangqi,chess}-m375.png；scripts/rwd-check.mjs |
| TEST-018 | 高 DPI 无发虚 | 1280×800@2x 截图 | SVG 棋子/圆盘锐利 | 2x 下全部锐利（矢量天然缩放） | PASS | shots/anim-mobile-chess-hidpi2x.png |
| TEST-019 | reduced-motion + 动效开关 | reducedMotion:reduce 对弈；按钮关/开 | 跳过动画走棋正常；开关生效且不影响规则 | X2 跳过；V14/V15 开关切换+关闭无飞行层走棋正常；CSS 归零双保险 | PASS | anim-extra X2、anim-verify V14/V15 |
| TEST-020 | 生产构建回归 | npm run build → 生产服 3001 → 全量脚本 | 全部通过、无控制台错误 | build 成功；net-check 15/15、anim 15/4/6 全绿、vitest 148、e2e 7、layout 20、viewport 18、rwd 12、ux 9、chk 8、sec 9 | PASS | scripts/net-check.mjs 等（本文件各阶段记录） |

### 证据脚本与截图索引

- 脚本：`scripts/anim-verify.mjs`（15）、`scripts/anim-extra.mjs`（4）、`scripts/anim-special.mjs`（6）、
  `scripts/anim-baseline.mjs`（基线/回归截图）、`scripts/anim-mobile.mjs`（移动端证据）、
  `scripts/net-check.mjs`（15 步生产回归）、`scripts/debug-{click,promo}.mjs`（诊断辅助，如实记录使用过程）。
- 截图：`shots/anim-baseline-*.png`（改造前）、`shots/anim-after-*.png`（改造后）、
  `shots/anim-mobile-*.png`（375/768/2x 证据）。

## 验收报告（阶段 J）

### 结论

棋盘/棋子/走棋动画专项全部阶段（A-J）完成。核心交付：

1. **中象**：木纹 SVG 盘面（feTurbulence 木纹+双框沿+暗角）、方向感知坐标、
   传统圆盘棋子修复（PIECE-002 根因修复：显式 cqw 尺寸替代 shrink-to-fit 内失效的百分比）、
   温润朱红/墨黑字色 + 金环 + 三层内阴影统一材质。
2. **国象**：枫木/胡桃木棋盘（含暗角与木框）、统一 Staunton 自绘 SVG 六型棋子
   （白象牙渐变/黑乌木渐变 + 统一光源）、格面斜向高光。
3. **走棋动画**：服务端确认后的 FLIP 系统——Room 闸门（moves 恰 +1 ∧ ply 去重 ∧ 在线 ∧
   直播态 ∧ 动效开）→ `buildBoardAnim` 纯分类器（普通/吃子/过路兵/易位/升变）→
   棋盘飞行层（合成器 transform transition + 双 rAF 释放 + 600ms 兜底 + visibilitychange
   立即落位）→ 落位金晕强调。动画永不参与状态判定，中断/翻转/卸载立即落权威局面。
4. **可控性**：动效总开关（localStorage `dc:anim`）∧ prefers-reduced-motion 双闸；
   移动端时长缩短 token；零新增依赖。

### 质量门

| 套件 | 结果 |
|------|------|
| vitest（136 基线 + 12 新增 board-anim） | 148/148 |
| e2e（Playwright） | 7/7 |
| layout-check | 20/20 |
| viewport-check | 18/18 |
| rwd-check | 12/12 |
| ux-check | 9/9 |
| chk-check | 8/8 |
| sec-check | 9/9 |
| net-check（生产服 15 步） | 15/15 |
| anim-verify / anim-extra / anim-special | 15/15 + 4/4 + 6/6 |

### 发现并修复的真实缺陷

- PIECE-002：中象圆盘塌缩（CSS 百分比在 shrink-to-fit 容器内失效）→ 显式 cqw。
- 将死步无动画（闸门 `phase==='playing'` 拦掉终局着的 `phase:'ended'`）→ 放宽为
  `playing || ended`（SPEC-C3 首跑 FAIL 暴露，修复后全绿）。
- 首版 useMoveFlight 类型错误（TS18004）→ finish 经 ref 暴露。

### 脚本侧修正记录（非产品缺陷，如实登记）

anim-baseline 选子坐标、anim-verify 首版时序（conn 等待+双 click 间超时+计数早于 ack）、
anim-extra promo 漏点 to 格+断言格笔误+红炮 find 误取、viewport-check import 缺 `.ts`、
anim-special 马腿用例 B 方应手 g2→f0 落黑士格改为 g2→e1、将军回吃 f6xe5 非法改为 f8→e7 挡将
——均为验证脚本笔误/棋理错误，产品行为始终正确。

### 遗留与边界（如实声明）

- 河界文字保留单行正序两组；行号坐标接受边缘行被棋子遮挡（透明度 0.55 弱化）。
- 国象棋子为自绘几何 Staunton 风，与实物木质雕刻仍有差距（评审通过：轮廓可辨、风格统一）。
- TEST-007 服务端拒绝路径 UI 不可达，以代码审读登记（NOT_TESTED + 代码路径验证），未伪造端到端结果。
