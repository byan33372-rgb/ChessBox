# 双人对弈 · 中国象棋 + 国际象棋在线网站

一个精致、响应式的双人棋类对弈网站：**访客打开分享链接即可加入房间**，无需注册、无需安装客户端、无需购买服务器。由你自己的电脑运行后端，通过 cloudflared Quick Tunnel 提供公网访问。

- **第一优先级**：规则正确（服务端权威校验）、联机可靠（断线重连/幂等/乐观锁）、安全、易运行
- **第二优先级**：视觉质量（暖色木质感、移动端适配）

---

## 1. 先决条件

| 项目 | 要求 |
|------|------|
| Node.js | **>= 20.19**（推荐 22/24 LTS，`node -v` 检查） |
| npm | 随 Node.js 自带 |
| 浏览器 | 朋友只需现代浏览器（Chrome/Edge/Safari/Firefox，手机亦可） |
| cloudflared | 可选（公网联机用），脚本可自动下载到项目内 |

> Windows 用户建议用 PowerShell 或 Git Bash 执行命令。

## 2. 安装

```bash
cd "D:\projects\chessbox"    # 你的项目目录
npm install
```

## 3. 开发模式（改代码时用）

```bash
npm run dev
# 后端: http://127.0.0.1:3001  前端(热更新): http://localhost:5173
# 浏览器打开 http://localhost:5173
```

Windows 也可以：`powershell -ExecutionPolicy Bypass -File scripts/start-dev.ps1`

## 4. 生产模式（给朋友玩用这个）

```bash
npm run build     # 构建前端 + 编译后端（已完成过可跳过）
npm start         # 启动 http://127.0.0.1:3001
```

Windows 一键脚本（自动构建+启动）：

```powershell
powershell -ExecutionPolicy Bypass -File scripts/start-prod.ps1
```

本地局域网联机（同一 WiFi）：把 HOST 改成 `0.0.0.0` 启动，朋友访问 `http://你的内网IP:3001`：

```bash
HOST=0.0.0.0 npm start          # macOS/Linux
$env:HOST="0.0.0.0"; npm start  # Windows PowerShell
```

## 5. 生成公网邀请链接（朋友不在同一网络）

保持 `npm start` 运行，另开一个终端：

```bash
npm run tunnel
```

- 首次使用未安装 cloudflared 时，按提示执行一次：
  `npm run tunnel -- --install`（从 Cloudflare 官方 GitHub Releases 下载到项目 `tools/` 目录，不改系统）
- 脚本会打印一个**真实的公网地址**，例如 `https://xxx-yyy.trycloudflare.com`
- 在房间页点「复制邀请链接」发给朋友即可

**重要须知（Quick Tunnel 的固有限制）：**

- 隧道和本机服务**任一停止，链接立即失效**；朋友会打不开
- 每次重启隧道，URL **通常会变化**，需要重新分享
- 无固定域名、无 SLA，适合朋友间对弈，不适合长期挂站
- 想要固定域名需自备域名并使用 Cloudflare 账号 + Named Tunnel（本项目已把隧道层隔离为脚本，可自行替换 ngrok/frp 等）

## 6. 玩法说明

1. 首页选「中国象棋」或「国际象棋」→ 创建房间
2. 房主是红方/白方；点「复制邀请链接」发给朋友
3. 朋友打开链接自动坐黑方；第三人及以后自动观战（不能干扰对局）
4. 点自己的棋子 → 绿点/圆环提示合法落点 → 点目标格走棋
5. 支持：悔棋（对方同意）、提和/认输、重新开局（双方同意）、聊天、
   断线重连（刷新页面即可恢复席位与局面）、复盘（上一步/下一步/跳转，不影响线上）
6. 导出：国象 PGN + FEN；中象中文纵线记谱文本 + 自定义 JSON（见下）

## 7. 测试

```bash
npm test          # 单元 + 集成（Vitest，共 70 项）
npm run test:e2e  # 端到端（Playwright，需先 npm run build；首次会自动装 Chromium）
npm run typecheck # TypeScript 前后端类型检查
```

## 8. 故障排查

| 症状 | 处理 |
|------|------|
| 首页点创建没反应，提示无法连接 | 后端没启动：开发模式跑 `npm run dev`，生产跑 `npm start` |
| 端口被占用 | `npm start` 前设 `PORT=其他端口`；Windows 停止旧进程：`powershell -File scripts/stop-server.ps1` |
| 隧道链接打不开 | 确认 `npm start` 仍在运行、隧道终端没关；Quick Tunnel URL 每次重启会变 |
| 朋友是观战者 | 房间两个席位已被占用（或前一个玩家掉线但席位保留），席位永不静默被抢 |
| 忘记房间号 | 链接形如 `/r/xxxxxxxxxx`，从聊天记录里找；数据库也可查（见备份） |
| 数据坏了想重来 | 停止服务后删除 `data/app.db`（会清掉所有房间与棋谱） |

## 9. 停止服务

- 开发/生产终端按 `Ctrl+C`
- Windows 找不到终端时：`powershell -ExecutionPolicy Bypass -File scripts/stop-server.ps1`
- macOS/Linux：`bash scripts/dev.sh stop`
- 隧道：在隧道终端按 `Ctrl+C`（服务与隧道是两个终端/进程）

## 10. 数据备份与恢复

- 所有房间、对局、会话都存在 **`data/app.db`（SQLite）**，整个目录拷走即完成备份
- 恢复：停止服务 → 把 `app.db` 放回 `data/` → 重启服务，玩家凭原会话令牌（存在各自浏览器 localStorage）重连，棋谱完整恢复
- 导出单局：房间页「导出 PGN / 中文棋谱 / JSON」按钮

## 11. 棋谱格式说明（如实声明）

- **国际象棋**：标准 PGN（含结果与元数据）、标准 FEN —— 由 chess.js 权威生成
- **中国象棋**：
  - 中文纵线记谱（红方汉字一~九、黑方数字 1~9，前/中/后消歧）
  - JSON 为**本项目自定义格式** `chessbox-xiangqi-v1`（FEN 行序 r0=黑方底线、w=红走），
    **不是通用标准 PGN**，不做兼容性宣称
- 中象重复局面：三次重复自动判和；**长将**（重复区间内一方每步将军）判负；
  长捉等其他复杂仲裁未实现，可用提和/认输解决
- 中象 60 回合无吃子自动判和（简化自中国规则 60 回合自然限着）

## 12. 架构与安全要点

```
src/client     React 前端（Vite + TS + 手写 CSS）
src/server     Express + Socket.IO 后端（房间/会话/限流/SQLite）
src/shared     前后端共享协议类型
src/games      规则引擎：chess.js 适配器 + 自研中象引擎（前后端同源使用）
tests/         unit / integration / e2e
scripts/       启动、停止、隧道脚本
data/          SQLite 数据（.gitignore 已排除）
```

- 走棋全部**服务端校验**（席位、轮次、revision 乐观锁、走法合法性、幂等 requestId），
  浏览器无法伪造事件改变棋盘
- 房间 ID 10 位 ≈ 49bit 熵；会话令牌 192bit（数据库只存 SHA-256，URL 不含任何凭证）
- 同房间操作串行化；事件限流；Origin 与 Host 一致性校验；输入 zod 校验
- 默认只监听 127.0.0.1；CSP/nosniff/frameguard 等安全头；不暴露任何调试/管理接口
- 依赖：chess.js（BSD-2-Clause）、socket.io（MIT）、express（MIT）、
  better-sqlite3（MIT）、zod（MIT）、React/Vite/Playwright 等（MIT）

## 13. 常用命令一览

| 命令 | 作用 |
|------|------|
| `npm run dev` | 开发模式（前后端 + 热更新） |
| `npm run build` | 生产构建 |
| `npm start` | 生产启动（仅本机 127.0.0.1:3001） |
| `npm run tunnel` | 启动公网隧道（需先 `npm start`） |
| `npm run tunnel -- --install` | 下载 cloudflared 到项目 tools/ |
| `npm test` / `npm run test:e2e` | 自动化测试 |
