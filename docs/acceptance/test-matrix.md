# 验收测试矩阵（test-matrix.md）

> 所有"结果"均为本轮真实执行；未执行项注明原因。证据路径：/tmp 会话日志在报告定稿时已抄录至本表与各专项报告；可复现命令全部列出。

## A. 自动化套件（本轮实测）

| ID | 模块 | 方法 | 命令 | 结果 | 证据 |
|---|---|---|---|---|---|
| AUDIT-007-1 | 类型检查 | tsc | `npx tsc -p tsconfig.client.json --noEmit` | exit 0 | 会话日志 |
| AUDIT-007-2 | 类型检查 | tsc | `npx tsc -p tsconfig.server.json --noEmit` | exit 0 | 会话日志 |
| AUDIT-007-3 | 单元 | vitest unit | `npx vitest run --project unit` | **150 passed / 0 failed**（基线 134 → 本轮新增 16） | 本表 §B |
| AUDIT-007-4 | 集成 | vitest integration | `npx vitest run --project integration` | **57 passed / 0 failed**（基线 54 → 本轮新增 3） | 本表 §B |
| AUDIT-007-5 | 端到端 | Playwright | `npx playwright test` | **18 passed / 0 failed**（基线 13 → 补测 +5） | 本表 §B |
| AUDIT-007-6 | 构建 | vite+tsc | `npm run build` | exit 0 | 会话日志 |
| AUDIT-007-7 | 依赖审计 | npm audit | `npm audit --omit=dev` | 0 vulnerabilities | security-review.md |
| AUDIT-007-8 | 锁文件 | npm ci dry-run | `npm ci --dry-run` | exit 0 | 会话日志 |

## B. 单元测试明细（150 = 基线 134 + 本轮新增 16）

| 文件 | 数量 | 覆盖（对应验收 ID） |
|---|---|---|
| xiangqi-engine.test.ts | 37 | XIANGQI-001~015（九宫/斜走/田字象眼/蹩马腿/车炮/兵/照面/应将/将死/困毙/重复/长将/子力和/记谱/重放/越界） |
| chess-rules-deep.test.ts | 40 | CHESS-002~009（双步/斜吃/过路兵时机+牵制/易位全条件/升变/将死/逼和/50步/三次重复时点/子力不足逐例/FEN 字段） |
| chess-adapter.test.ts | 18 | CHESS-010/012（PGN 往返/重放一致性/越界拒收/终局锁定） |
| chess-extras.test.ts | 4 | MOVE-014/015（易位 extra、过路兵 capturedSq、普通吃子） |
| checkers-engine.test.ts | 28（+3 回归并入） | CHECKERS-002~020（几何/营地/跳跃/连跳/防循环/胜利/轮转/认输/FEN + DEF-001 营内回归 3 项） |
| checkers-ui.test.ts（新增） | 9 |
| exporters.test.ts 追加 | +2 | HISTORY-009（跳棋 txt/json） | MOVE-017/SEC-006 UI 同源（FEN 解析/防循环/逐段交互/普通步目标） |
| board-anim.test.ts | 12 | VIS-006/PERF-001（FLIP 推导/易位车/升变/吃子层） |
| exporters.test.ts | 9+2 | HISTORY-007~009（PGN/中文/JSON/跳棋 txt+json） |
| legacy-db-compat.test.ts（新增） | 2 | DATA-003（旧库自动补列/读写兼容/迁移幂等） |

## C. 集成测试明细（57 = 基线 54 + 本轮新增 3）

| 文件 | 数量 | 覆盖 |
|---|---|---|
| rooms.test.ts | 20 | NETWORK-002/008/011/014、DATA-001/002（建/加/重连/悔棋/重开/重启恢复） |
| checkers-rooms.test.ts | 17（11 基线 + 4/6 人 2 + 并发抢占 1，另 3 项并入既有 describe） | CHECKERS-004/010/015/016/017/018/020、SERVER-001~012（2/3/4/6 人实际对局、连跳 path、幂等、认输、重开、持久化、并发抢占） |
| concurrency.test.ts | 8 | NETWORK-010、SEC-004（重复/并发/过期版本） |
| security.test.ts | 9 | SEC-001~009（席位/轮次/伪造/跨房间/输入校验） |
| ratelimit-extra.test.ts | 2 | SEC-006 |
| chat.test.ts | 5 | NETWORK-013 |
| rooms（本轮改动断言） | +0 | seats 语义更新（缺失=未占位），不改断言强度 |

## D. 端到端明细（18 = 2 spec）

| spec | 数量 | 覆盖 |
|---|---|---|
| app.spec.ts | 7 | 中象双人全流程/非法走棋/国象升变/窄屏/导出下载×2 |
| upgrade.spec.ts | 11 | 跳棋 2 人全流程（含连跳逐段）/首页三入口+3 人座位条/中象起终标记/国象易位 extra/MOVE-007/跳棋导出真实下载/375 溢出/PERF-004/PERF-008 三棋×120 帧 |

## E. 专项脚本（真实浏览器 + 生产构建服务）

| ID | 脚本 | 结果 |
|---|---|---|
| VIS/GATE-02 | `node scripts/layout-check.mjs` | 22/22 PASS（本轮修正"两卡"陈旧断言→三卡+人数选择） |
| VIS-008/RESP | `node scripts/viewport-check.mjs` | 18/18 PASS |
| RESP-001 | `node scripts/rwd-check.mjs` | 12/12 PASS |
| GATE-18 | `node scripts/anim-verify.mjs` | 15/15 PASS |
| UX | `node scripts/ux-check.mjs` | 9/9 PASS |
| GATE-02 深度 | `node scripts/chk-check.mjs` | 8/8 PASS（本轮修正 16→24 项陈旧断言） |
| GATE-09 | `node scripts/net-check.mjs xiangqi` / `chess` | 各 15/15 PASS，控制台错误 0 |
| GATE-22 | `node scripts/sec-check.mjs` | 9/9 PASS（敏感路径 404 + 安全响应头） |
| PERF-002~016 | `node scripts/acceptance-perf.mjs` | 15 场景全通过（performance-report.md） |
| VIS-012 | `node scripts/acceptance-shots.mjs` | 6 张真实截图 docs/acceptance/screenshots/ |
| RESP-002 | Edge 引擎冒烟（双上下文同步） | PASS；Firefox/WebKit **NOT_TESTED**（系统未安装、下载渠道受限） |
| DATA-004 | 备份/恢复演练（db+wal+shm 三件套拷贝→新进程打开） | 41 房间完整恢复 PASS |
| GATE-23 | 30 分钟浸泡 `node tests/soak/soak.mjs` | 见 performance-report.md §5 |

## F. 未执行项与原因

| ID | 项 | 状态 | 原因 |
|---|---|---|---|
| GATE-20 | 120Hz 物理屏实测 | NOT_TESTED | 环境无 120Hz 物理显示器；headless 检测值（167Hz）不作为显示能力证据 |
| RESP-002 | Firefox / WebKit | NOT_TESTED | 本机未安装且包下载渠道受限（GitHub 直连被重置）；已用 Chrome/Edge/Chromium 三 Chromium 系引擎覆盖 |
| BUILD-010 | 公网隧道 | BLOCKED | 本轮未获公网部署授权（BUILD-009）；上一轮 Quick Tunnel 真实验证留档可查 |
| PERF-015-物理 | 真机长时间交互（触屏/移动端硬件） | NOT_TESTED | 无真机；以 30 分钟桌面浸泡 + 触摸模拟（rwd-check）替代 |
| HISTORY-013-极端 | 5000+ 步棋谱压测 | NOT_TESTED | 窗口化渲染已实现并以 288px 视口验证；极端规模未专门压测 |
