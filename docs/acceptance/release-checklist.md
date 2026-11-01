# 发布清单（release-checklist.md）

## 1. 发布前必需项

- [x] 全部 P0/P1 缺陷关闭（defects.md：0 未决）
- [x] 自动化全绿：vitest 150+57、e2e 18、tsc ×2、build（本轮实测）
- [x] 专项脚本全绿：layout22/viewport18/rwd12/anim15/ux9/chk8/net15×2/sec9
- [x] 30 分钟浸泡 0 错误、RSS 无增长
- [x] 数据库迁移幂等 + 旧库兼容 + 备份恢复演练通过
- [x] npm audit 0 漏洞

## 2. 启动 / 停止

```bash
npm run build          # 构建前端 dist-client + 后端 dist-server
npm start              # node dist-server/server/index.js（默认 3001，PORT 可覆盖）
# 开发：npm run dev（并行 server+client）
```

## 3. 数据备份与恢复（发布/升级时执行）

```bash
# 备份（服务停止时最简单；运行中必须三件套一起拷贝）
cp data/app.db data/app.db-wal data/app.db-shm /backup/dir/
# 或 SQLite 在线备份（推荐）：sqlite3 data/app.db ".backup /backup/dir/app.db"
# 恢复：三件套放回原位（或仅 .db 若来自 .backup）后重启服务
```
- 本轮演练：三件套拷贝→独立进程打开→41 房间完整恢复（performance-report §5 同期执行）。

## 4. 数据库迁移与回滚

- 首次用新版本启动即自动迁移（4 个可空附加列，幂等）。
- 回滚：停服务 → 换回旧构建 → 直接启动（旧代码忽略新列，零数据库操作）。
- 升级前建议额外留一份 app.db 副本。

## 5. 监控与观测

- 服务端控制台日志：连接/断开/恢复房间数/清理数/错误（含 [rooms]/[io] 前缀）。
- 建议发布后关注：日志中 `[rooms] 恢复房间 X 失败`（损坏行会跳过不中断）、内存（浸泡基线 ~241MB/30min 无增长）。

## 6. 已知限制（发布说明用）

1. 120Hz 物理屏、Firefox/WebKit 未实测（NOT_TESTED，见 final-acceptance-report §5 Gate-20/21）。
2. 公网访问依赖用户自建隧道/部署；Quick Tunnel 地址临时且无鉴权（README）。
3. better-sqlite3 安装需构建环境或 prebuilds（README 三方案）。
4. 跳棋为"无强制跳跃/无吃子"变体（界面规则页已声明）。
5. 会话令牌存 localStorage（security-review §9）。

## 7. 发布判定

**建议发布**：本地 / 局域网 / 自备固定隧道场景均可。公网托管部署需另行授权与验证（BUILD-010/011）。
