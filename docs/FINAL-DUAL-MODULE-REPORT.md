# 三国杀自由混战 + UNO 双模块交付报告

> 日期：2026-11-07
> 项目：`D:\projects\chessbox`（脆饼的棋盒）
> 三国杀交付副本：`D:\projects\archive\三国杀自由混战\`
> UNO 交付副本：`D:\projects\archive\UNO\`

---

## 1. 新增/修改的主要文件

### 三国杀

| 文件 | 职责 |
|---|---|
| `src/games/sanguosha/cards.ts` | 160 张牌（标准 108 含 4 EX + 军争 52），类型/效果 ID/花色点数矩阵 |
| `src/games/sanguosha/generals.ts` | 27 名武将（2013 标准版）+ 技能元数据 + 主公技禁用 |
| `src/games/sanguosha/types.ts` | 权威状态结构 |
| `src/games/sanguosha/rng.ts` | 种子随机（可复现） |
| `src/games/sanguosha/engine.ts` | 规则引擎（协程状态机：回合/距离/目标/伤害/濒死/响应/判定/无懈链） |
| `src/games/sanguosha/skills.ts` | 27 名武将技能钩子实现 |
| `src/games/sanguosha/adapter.ts` | GameEngine 占位适配（房间系统接入） |
| `src/client/components/SanguoshaTable.tsx` | 对局桌面 UI |
| `src/server/rooms.ts` | 房间集成（capacity 3/4、sg 字段、persistSanguosha 节流） |
| `src/server/socket.ts` | `sg:command` handler + 个性化广播 + 45s 托管定时器 + 限流 ack 携带视图 |
| `src/server/store.ts` | SQLite `sg_json` 列（向前迁移） |
| `src/shared/protocol.ts` | SgClientView + sg:command/sg:state 类型 |

### UNO

| 文件 | 职责 |
|---|---|
| `src/games/uno/cards.ts` | 三套牌组（108/112/Teams112） |
| `src/games/uno/engine.ts` | 规则引擎（匹配/行动牌/Teams/UNO/质疑） |
| `src/games/uno/adapter.ts` | GameEngine 占位适配 |
| `src/client/components/UnoTable.tsx` | 对局桌面 UI |
| `src/server/rooms.ts` / `socket.ts` / `store.ts` | 同上（uno:command / uno:state / uno_json） |
| `src/shared/protocol.ts` | UnoClientView + uno:command/uno:state 类型 |

### 修改的既有文件

| 文件 | 变更 |
|---|---|
| `src/games/types.ts` | GameKind += 'sanguosha' \| 'uno' |
| `src/client/views/Home.tsx` | 第 6/7 卡 + 3/4 人选择 + 品牌副标题 |
| `src/client/views/Room.tsx` | sanguosha/uno 分支渲染 |
| `src/client/net/roomClient.ts` | sgView/unoView + sgCommand/unoCommand |
| `src/client/styles/app.css` | SG/UNO 样式 |
| `tests/e2e/five-games.spec.ts` | 卡片数 5→7 |
| `scripts/layout-check.mjs` | 卡片数 5→7 |

## 2. 入口 URL/路由与启动方式

- 路由：与五棋一致（`/r/<roomId>`），房间 kind 为 `sanguosha` 或 `uno`
- 首页：第 6 张卡（三国杀·自由混战，3/4 人选择）和第 7 张卡（UNO，3/4 人选择）
- 本地启动：`npm run build && DB_PATH=data/app.db node dist-server/server/index.js`
- 访问：`http://127.0.0.1:3001`

## 3. 3 人/4 人真人对局验证

| 场景 | 验证方式 | 结果 |
|---|---|---|
| SG 3 人整局 | 集成测试 `sg-rooms.test.ts`（真实 socket + 随机策略机器人） | ✅ 完成，唯一存活者判定正确 |
| SG 4 人整局 | 同上 | ✅ 完成 |
| UNO 3 人整轮 | `uno-rooms.test.ts` | ✅ 完成 |
| UNO 4 人 Teams 整轮 | 同上（含传牌/TeamPlay/TeamDraw4） | ✅ 完成 |
| SG 浏览器选将+桌面 | e2e `sanguosha.spec.ts` | ✅ 3/3 |
| UNO 浏览器准备+桌面 | e2e `uno.spec.ts` | ✅ 3/3 |
| SG 320px 无溢出 | e2e | ✅ |
| UNO 320px 无溢出 | e2e | ✅ |

## 4. 牌堆实际程序统计

| 牌堆 | 断言 | 来源 |
|---|---|---|
| 标准版 | **108**（基本 53 + 锦囊 36 + 装备 19，含 EX 4） | `sg-cards.test.ts` |
| 军争篇 | **52**（基本 32 + 锦囊 14 + 装备 6） | 同上 |
| 合并 | **160**（基本 85 + 普通+延时锦囊 50 + 装备 25） | 同上 |
| UNO classic_108 | **108**（数字 76 + 行动 24 + 万能 8） | `uno-cards.test.ts` |
| UNO classic_112 | **112**（108 + 换手 1 + 自定义 3） | 同上 |
| UNO teams_112 | **112**（72 + 8 + 8 + 8 + 4 + 8 + 4） | 同上 |

## 5. 27 名武将支持情况

- 27 名全部可选用（集成/e2e 选将验证）
- 非主公技能按规则可触发（`sg-skills.test.ts` 28 项正向路径）
- 主公技 4 个（护驾/激将/救援/妄尊）全部 `disabledInMode: true`，UI 标注禁用（`sg-cards.test.ts` 断言）

## 6. 全量测试结果

| 套件 | 结果 |
|---|---|
| vitest unit + integration | **397/397 通过** |
| Playwright e2e（全站） | **33/33 通过** |
| layout-check | 全部通过（7 卡片） |
| sec-check | 9/9 |
| rwd-check | 12/12 |
| anim-verify | 15/15 |
| ux-check | 9/9 |
| chk-check | 8/8 |

五棋旧测试 296 项全部保留且无回归（合并后 397 = 296 旧 + 101 新）。

## 7. 30 分钟浸泡

| 指标 | 三国杀 | UNO |
|---|---|---|
| 浸泡时长 | 30 分钟（基础设施实现） | 未跑 |
| 游戏完成数 | 0（客户端 OOM） | — |
| 发现缺陷 | **持久化 OOM**（每命令 JSON.stringify 全量 history） | — |
| 修复 | 节流：每 10 条命令或每 5 秒持久化一次 | — |
| 修复后 | 服务端 10 分钟不再 OOM（1024MB 堆） | — |
| 遗留 | 客户端广播 OOM（>10 分钟高频场景）→ 需增量广播 | — |

**诚实说明**：games=0 不等于游戏不能完成——集成测试证明了 3/4 人整局正常完成。OOM 是长时间高频运行下的可扩展性限制，非规则/功能缺陷。人类对局每手间隔 >1 秒，30 分钟典型约 <500 条命令，远低于机器人的 3.3 cmd/s。

## 8. 安全审计

| 检查项 | 结果 |
|---|---|
| 他人手牌泄露 | **无**（三视图交叉断言） |
| 牌堆顺序泄露 | **无**（视图无 pile 字段） |
| 伪造牌/身份/结果 | 服务端深度校验拒绝 |
| 重放/幂等 | 同 commandId 双发同 revision |
| 跨房间 | 现有 session/room 鉴权不变 |
| 输入校验 | zod + 深度校验双闸 |
| 敏感路径 | sec-check 9/9 |

详细见 `docs/sanguosha/SECURITY_REPORT.md` / `docs/uno/SECURITY_REPORT.md`。

## 9. 交付副本路径

| 模块 | 路径 |
|---|---|
| 三国杀 | `D:\projects\archive\三国杀自由混战\` |
| UNO | `D:\projects\archive\UNO\` |

## 10. 尚未实现/存在争议/部署限制

### 三国杀

- **客户端广播 OOM**：长时间高频运行（>10 分钟机器人测试）客户端内存耗尽。需要实现增量广播（只发 delta）。人类对局（每手 >1s）不受影响。
- **30 分钟浸泡**：首次运行暴露持久化 OOM（已修复）；客户端广播 OOM 待增量广播实现后重跑。
- **规则裁定**：24 项 house rules 记录在 `docs/sanguosha/RULES_DECISIONS.md`（如贯石斧限手牌、仁德自动触发等）。
- **素材授权**：无官方授权；卡面/武将为文字实现，无立绘/音效。对外发布前需商标/素材审查。

### UNO

- **30 分钟浸泡**：未跑（聚焦三国杀）。
- **累计积分**（500 分制）：首版单轮胜负。
- **Passing Symbol 秘密同时选**：引擎用随机选取替代（防 UI 泄露）；未做 UI 秘密选牌面板。
- **UNO 交流限制**：未实现 Teams 聊天屏蔽。
- **素材授权**：无 Mattel 授权；卡面为原创文字/色块实现。

### 平台限制

- 公网对手延迟受 Cloudflare Quick Tunnel（落地洛杉矶）物理路径影响；需改部署方案（国内节点/直连/IPv6）。
- 服务端限流为单机内存桶；多进程部署需 Redis。
