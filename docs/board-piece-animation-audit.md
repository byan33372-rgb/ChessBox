# 棋盘 · 棋子 · 走棋动画专项审计与验收日志

> 本文档是「棋盘/棋子/动画专项升级」的唯一进度与验收记录。所有结论基于真实代码审读与真实浏览器运行；
> 未执行的项一律标 NOT_TESTED，不伪造。状态定义与优先级规则同 `docs/visual-and-functional-audit.md`。
>
> 起点检查点：git HEAD = `0c30dcd`（14 轮验收全部完成的最终交付态），工作区干净，无用户未提交修改。
> 专项开始前基线截图：`shots/anim-baseline-{xiangqi,chess}-{a,b}-playing.png`、
> `shots/anim-baseline-{xiangqi,chess}-a-selected.png`（scripts/anim-baseline.mjs 真实双上下文对弈 2 步后拍摄）。

## 阶段状态总表

| 阶段 | 内容 | 状态 |
|------|------|------|
| A | 代码与视觉基线审计 | ✅ 完成（见 AUDIT 记录） |
| B | 中国象棋棋盘/棋子/材质升级 | ⏳ 未执行 |
| C | 国际象棋棋盘/棋子/材质升级 | ⏳ 未执行 |
| D | 统一坐标/图层/选中态/合法目标 | ⏳ 未执行 |
| E | 移动/吃子/升变/易位动画实现 | ⏳ 未执行 |
| F | 网络拒绝/重复事件/重连/复盘/缩放修复 | ⏳ 未执行 |
| G | 桌面/平板/手机/减少动效适配 | ⏳ 未执行 |
| H | 自动化测试 + 真实浏览器测试 + 修复 | ⏳ 未执行 |
| I | 生产构建回归 | ⏳ 未执行 |
| J | 文档与验收报告 | ⏳ 未执行 |

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
