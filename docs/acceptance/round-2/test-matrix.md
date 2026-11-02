# 第二轮 · 测试矩阵（test-matrix.md）

状态定义：PASS=本轮真实执行且有可复核证据；FAIL=执行且不符合；BLOCKED=环境阻止；NOT_TESTED=未执行。

## 1. 全量自动化（阶段 B/BUILD-001）

| ID | 目标 | 方法/文件 | 命令 | 结果 | 证据 |
|---|---|---|---|---|---|
| B-008a | 类型检查 | 双 tsconfig | npm run typecheck | exit 0 PASS | log-typecheck.txt |
| B-008b | 单元 | 9 文件 150 项 | npx vitest run --project unit | 150/150 PASS | log-unit.txt |
| B-008c | 集成 | 6 文件 57 项 | npx vitest run --project integration | 57/57 PASS | log-integration.txt |
| B-008d | E2E | 2 spec 18 项 | npx playwright test | 18/18 PASS | log-e2e.txt |
| B-008e | 构建 | vite+tsc | npm run build | exit 0 PASS | log-build.txt |
| SEC-010 | 依赖审计 | npm audit | npm audit --omit=dev | 0 漏洞 PASS | log-npm-audit.txt |

## 2. 中国象棋规则（阶段 C）

| ID | 目标 | 证据 | 状态 |
|---|---|---|---|
| XQ-001 | 初始盘 32 子/16+16/7 类/开局 44 着 | round2-independent R2-XQ×2（44=公认值） | PASS |
| XQ-002 | 九宫/仕斜走 | round2-independent + xiangqi-engine(仕九宫斜走) | PASS |
| XQ-003 | 马日字/蹩马腿 | round2-independent（h8 蹩腿仅剩 f8）+ 引擎 37 项 | PASS |
| XQ-004 | 车阻挡 | round2-independent（a4 卒）+ 车滑行 2 项 | PASS |
| XQ-005 | 炮架 | round2-independent（单架吃/双架不吃/平移）+ 引擎 2 项 | PASS |
| XQ-006 | 兵卒过河 | round2-independent（过河横/禁退/未过河禁横）+ 引擎 3 项 | PASS |
| XQ-007 | 占位/越界/非轮次 | round2-independent + 引擎 2 项 | PASS |
| XQ-008 | 照面/应将/自陷 | 引擎 37 项中 8 项（含 a9→a0 吃后照面非法实证） | PASS |
| XQ-009 | 困毙/和棋/重复/长将 | 引擎 5 项 | PASS |
| XQ-010 | 边界坐标 | 引擎越界/拒收 2 项 | PASS |
| XQ-011 | 服务端权威（禁伪造棋盘） | security.test + 集成层（客户端只提交意图） | PASS |
| XQ-012 | 棋谱/标记/动画一致 | e2e 中象用例 + net-check 15 步 | PASS |
| XQ-013 | 既有回归为真实规则断言 | 审读 37 项（全部断言合法性/终局，非渲染） | PASS |

## 3. 国际象棋规则（阶段 D）

| ID | 目标 | 证据 | 状态 |
|---|---|---|---|
| CH-001 | 初始局面/移动 | round2-independent perft(1..3)=20/400/8902（公认值） | PASS |
| CH-002 | 阻挡/吃子 | chess-rules-deep + perft 密度 | PASS |
| CH-003 | 将/自陷/将死/逼和/终局锁 | deep 6 项 + round2-independent 逼和公开局面 | PASS |
| CH-004 | 易位全条件 | deep 6 项（王动/车动/阻挡/受攻/被将） | PASS |
| CH-005 | 过路兵 | deep 3 项（时机/假目标/牵制） | PASS |
| CH-006 | 升变 | deep 2 + adapter + e2e 对话框 | PASS |
| CH-007 | FEN 一致 | round2-independent 往返 + deep 字段逐项 | PASS |
| CH-008 | PGN/回放 | deep PGN 往返 + 重放一致 | PASS |
| CH-009 | 重复/50/75/子力不足 | deep 6 项（含 75 步语义如实记录）+ Kiwipete perft | PASS |
| CH-010/011 | 特殊局面两端一致/终局拒走 | e2e + 集成终局锁定 | PASS |
| CH-012 | 异常输入/不完整 FEN | adapter 拒收用例 | PASS |

## 4. 中国跳棋规则（阶段 E）

| ID | 目标 | 证据 | 状态 |
|---|---|---|---|
| CC-001 | 是中国跳棋 | 六角星 121 位几何测试（非 8×8） | PASS |
| CC-002 | 121 位/坐标/邻接 | round2-independent（行宽求和+距离=spacing 双向校验） | PASS |
| CC-003 | 营地/目标映射 | round2-independent（10×6/互斥/中心对称） | PASS |
| CC-004 | 2/3/4/6 人座位/初始/目标 | 引擎 4 项 + 集成 4 人数实际对局 | PASS |
| CC-005/006 | 普通步/六向跳 | round2-independent（开局步距离∈{100,200}、落点=2×位移） | PASS |
| CC-007 | 跳己方/对方/被跳子保留 | round2-independent + 引擎 | PASS |
| CC-008 | 连跳中间节点 | 引擎整链 path + e2e 三段实跳 | PASS |
| CC-009 | 占位/越界/不存在 | round2-independent（落点被占拒；跳己方合法对照） | PASS |
| CC-010 | 循环/重复/超长/安全 | round2-independent（循环/20 点超长/空路径）+ 服务端同源 | PASS |
| CC-011 | 规则与 UI 说明一致 | 引擎注释=UI 规则文案（无强制跳/无吃子/营内可动/不得离目标营） | PASS |
| CC-012 | 连跳终止一致 | round2-independent（整链 vs 逐段等价） | PASS |
| CC-013 | 胜利/结束锁 | 引擎胜利 3 项 + 集成终局 | PASS |
| CC-014 | 座位冲突/轮转 | 集成 2/3/4/6 人轮转（a→b→c→d/a→f） | PASS |
| CC-015 | 断线恢复 | 集成重启恢复 + 浸泡 267 次重连 0 错误 | PASS |
| CC-016 | 棋谱含完整路径 | 集成 path 落库断言 + e2e polyline | PASS |
| CC-017 | 独立测试用例 | round2-independent 全部 8 项（独立推导） | PASS |
| CC-018 | 未实测人数标注 | 2/3/4/6 全部有真实执行 → 无 NOT_TESTED 项 | PASS |

## 5. 上一手轨迹（阶段 F）

MOVE-001~016：全部 PASS——权威记录含 ply/revision/path/extra（MOVE-001/002）；三棋标记 e2e（003/004）；标记与选中/目标/将军视觉分离（004）；动画后保留+更新（005/006）；MOVE-007 非法不改标记 e2e；刷新恢复 e2e（008）；双端一致 net-check（009）；易位 extra 单测+e2e（010）；过路兵/中象吃子/升变 extras 单测（011）；连跳 polyline e2e（012）；回放跟随/回实时 e2e（013）；幂等/覆盖 07 项集成（014）；起点来自 moves 记录（015，display.lastMove=moves[ply-1]）；双独立浏览器提示 net-check + toast e2e（016）。

## 6. 联机一致性与并发（阶段 G）

NET-001~015 全部 PASS：双独立 context（net-check 15/15 ×2 + 集成双客户端）；跳棋 2/3/4/6 人（集成实际对局）；A/B 互走同步（NET-004/005）；非法/伪造（NET-006，security.test）；并发抢占（NET-007，checkers-rooms 并发用例 + concurrency.test）；串行化（NET-008，房间队列 enqueue+revision）；监听器重复注册（NET-009，e2e 刷新后续走 + 浸泡 267 重连延迟无劣化）；断线/刷新恢复（NET-010~012）；跨房间隔离（NET-012，security.test）；规范化状态比较（NET-013）；时间戳分段（NET-014，perf netLatency）；禁内部函数替代（NET-015，全部走真实 socket/浏览器）。

## 7. 动画与帧率（阶段 H）

PERF-001~016：PASS（除 PERF-009 NOT_TESTED）——详见 performance-report.md。

## 8. 安全/数据/恢复（阶段 I）

SEC-001~011 全部 PASS：sec-check 9/9、security.test 9、npm audit 0 漏洞、旧库兼容 2 项、备份恢复演练（上一轮 41 房间 + 本轮浸泡独立 DB）、日志无敏感信息。详见 security-review.md。

## 9. 生产构建与兼容（阶段 J）

BUILD-001~009：PASS（除 BUILD-005 Firefox/WebKit NOT_TESTED、公网 BUILD-010 未授权 BLOCKED）。详见 final-report.md §9。

## 10. NOT_TESTED / BLOCKED 汇总

| 项 | 状态 | 原因 |
|---|---|---|
| 120Hz 物理屏（PERF-009） | NOT_TESTED | 无 120Hz 真机；headless 检出 167Hz 不代表显示能力 |
| Firefox / WebKit（BUILD-005） | NOT_TESTED | 系统未安装且包下载渠道受限；已覆盖 Chrome/Edge/Chromium |
| 公网隧道（BUILD-010） | BLOCKED | 本轮无公网部署授权 |
| 触摸真机（BUILD-007 部分） | NOT_TESTED | 无触屏硬件；触摸模拟已由 rwd-check/视口脚本覆盖 |
