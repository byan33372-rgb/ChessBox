# 安全审查（security-review.md）

## 1. 审计范围

服务端（Express + Socket.IO + better-sqlite3 全部事件路径）、客户端输入面（坐标/path/座位/聊天/导出）、静态资源与配置、依赖链。仅针对本项目自有代码与本地服务，未做任何外部扫描。

## 2. 服务端权威性（SEC-001~003）

- 三棋全部走法经服务端可信引擎校验（`applyPlayerMove` → `engine.applyMove`）：席位占用、轮次、revision 乐观锁、requestId 幂等、合法性逐段校验后落库广播；客户端仅提交意图（from/to/path），无法提交棋盘状态（SEC-002）。
- 跳棋 path 由服务端逐段重验（起子归属/每段跳跃/营地约束/防重复/≤16 点）；棋盘几何 121 格白名单校验坐标（SEC-005/008：超长与循环路径有硬上限，无法拖垮服务端）。
- 回归证据：security.test 9 项 + concurrency.test 8 项 + checkers-rooms 并发抢占 + sec-check 9/9（生产模式敏感路径 404 与安全响应头）。

## 3. 输入校验（SEC-005）

- Socket 入口全部 zod schema：房间号/令牌/坐标（全棋种白名单正则）/path 数组 2~16 点/seatCount 枚举 {2,3,4,6}/聊天 ≤200 字/昵称 ≤12 字并过滤控制字符。
- 房间 ID 10 位高熵自定义字母表；会话令牌 24~64 位且仅存 SHA-256。

## 4. 限流、错误与日志（SEC-006）

- 五类令牌桶限流（建房/加入/走棋/聊天/动作）单测覆盖；错误统一 AppError 代码，无堆栈外泄；日志不打印令牌明文（仅前 6 位）。

## 5. 跨房间隔离与资源（SEC-007/008/009）

- socket.data.roomId 绑定单房间，事件处理均经 `rooms.get(data.roomId)` 取上下文——无跨房间事件路径（security.test 断言）。
- 静态资源 express.static 限定 dist-client；`/data` 数据库路径不挂 HTTP 路由（sec-check 实测 404）。
- 数据库全部参数化查询（better-sqlite3 prepare），无字符串拼接 SQL。

## 6. 依赖与许可证（SEC-010）

- `npm audit --omit=dev`：**found 0 vulnerabilities**（本轮实测）。
- 许可证盘点（lockfile 全量）：运行时核心 better-sqlite3@MIT、chess.js@BSD-2-Clause、express@MIT、socket.io@MIT、react@MIT、zod@MIT；全链 MIT/ISC/BSD/Apache-2.0/0BSD，无 GPL/AGPL 传染项；1 个转递依赖 xmlhttprequest-ssl 无 license 字段（socket.io-client 的 Node 端转递依赖，不进入浏览器产物，风险=许可证信息缺失，非代码风险，已记录）。

## 7. 迁移备份回滚（SEC-011）

- 迁移=4 个可空附加列（幂等 ALTER）；回滚=旧构建零操作（store.ts 注释留档）；DATA-003 旧库兼容单测 2 项；DATA-004 备份恢复演练通过（db+wal+shm 三件套拷贝恢复 41 房间）。

## 8. 修复纪律（SEC-012）

本轮唯一产品缺陷 DEF-001 的修复**未删除任何服务端校验**：营地约束语义修正（放行己方起始营）且"他人营地禁入/目标营不得离开"两条校验保持并在回归中断言。

## 9. 剩余风险

1. 会话令牌存于 localStorage（XSS 风险面）；当前无第三方脚本注入点、CSP 响应头已启用（sec-check 验证），接受为已知设计。
2. Quick Tunnel 为临时公开通道（若使用），无鉴权——任何拿到 URL 者可建房；属产品定位（朋友局），非缺陷。
3. xmlhttprequest-ssl 许可证字段缺失（见 §6）。
