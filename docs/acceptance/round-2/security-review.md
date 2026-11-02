# 第二轮 · 安全审查（security-review.md）

## 审计范围

服务端全部 Socket 事件路径、HTTP 静态资源、SQLite 持久化、客户端输入面（坐标/path/座位/聊天）、依赖链。仅针对本项目与本地服务，无外部扫描。

## 服务端权威性（SEC-001~003）

- 三棋全部走法经服务端引擎校验后才落库广播；客户端仅提交 from/to/path 意图，**无提交棋盘状态的协议面**（SEC-002 协议层排除）。
- 权威链：席位占用 → 轮次 → revision 乐观锁 → requestId 幂等 → 引擎合法性 → 房间队列串行 → 事务落库。
- 跳棋 path 服务端逐段重验（盘内白名单/占用/营地/防循环/≤16 点）；本轮独立推导测试实证越界/循环/超长/空路径全拒。

## 输入校验与限流（SEC-004/005）

- zod schema 全覆盖（坐标白名单正则、path 2~16 点、seatCount 枚举、聊天/昵称限长 + 控制字符过滤）。
- 五类令牌桶限流单测覆盖；sec-check 生产模式实测敏感路径 404 + 安全响应头 9/9。

## 日志与泄露（SEC-006）

- 令牌仅存 SHA-256，日志只打前 6 位；错误响应统一 AppError，无堆栈/路径外泄（sec-check 断言）。

## 数据与恢复（SEC-007~009）

- moves/rooms 同事务写入（崩溃一致性）；本轮 6 分钟浸泡 267 周期/0 错误；旧库兼容单测 2 项；备份恢复演练沿用第一轮结论（db+wal+shm 三件套 → 41 房间完整恢复）。

## 依赖与许可证（SEC-010）

- `npm audit --omit=dev`（本轮实测，log-npm-audit.txt）：**found 0 vulnerabilities**。
- 许可证盘点沿用第一轮全量 lockfile 结果：运行时核心 better-sqlite3@MIT、chess.js@BSD-2-Clause、express@MIT、socket.io@MIT、react@MIT、zod@MIT；无 GPL/AGPL；1 个转递依赖 xmlhttprequest-ssl 无 license 字段（信息缺失，非代码风险，不进浏览器产物）。

## 未扫描项（SEC-011）

- `npm audit` 未覆盖 dev 依赖深度链的非常规漏洞面（audit 默认含 dev，本轮按生产口径 --omit=dev 出证）；无 SAST/渗透测试——**不声称"无漏洞"，仅声明上述扫描范围内 0 已知漏洞**。
