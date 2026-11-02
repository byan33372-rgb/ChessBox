# 第二轮独立审计 · 基线（baseline.md）

- 日期：2026-11-03
- 审计对象：当前工作区 D:\projects\chessbox（main @ `15fa527`，工作区干净、无未提交修改）
- 压缩包一致性（A-014）：桌面包 `棋类网站-源码与全界面截图-20261103.zip` 经解压抽查 8 个关键文件与 `git show 15fa527` 内容哈希**逐字一致**（首次 0/6 系 CRLF 换行差异，规范化后 8/8）→ 工作区即包源，无分叉。

## 环境（B-001~003）

| 项 | 值 | 结论 |
|---|---|---|
| Node | v24.22.1 | ≥ engines 要求 20.19 ✅ |
| npm | 11.19.1 / win32-x64 | ✅ |
| Vitest | 3.2.7（node_modules/.bin 实测 `--version`） | 已安装 ✅ |
| Playwright | 1.64.1 + 系统 Chrome 156（channel:chrome） | 已安装 ✅ |
| better-sqlite3 | 原生模块加载成功（ABI 137，内存库读写通过） | ✅ |
| node_modules | 存在且完整（上轮安装；本轮未重装） | ✅ |

## 基线复现（A-005~006/B-008，全部本轮真实执行，证据=round-2/ 各 log 文件）

| 命令 | 退出码 | 结果 |
|---|---|---|
| `npm run typecheck` | 0 | 通过 |
| `npx vitest run --project unit` | 0 | **150 passed / 0 failed** |
| `npx vitest run --project integration` | 0 | **57 passed / 0 failed** |
| `npx playwright test` | 0 | **18 passed / 0 failed** |
| `npm run build` | 0 | 通过 |
| `npm audit --omit=dev` | 0 | 0 vulnerabilities |

## 基线失败（A-009）

1. **环境性失败（非产品缺陷）**：首轮批量跑专项脚本时 7/9 全部 exit 1 —— 根因是 3001 生产服务在上一轮收尾时已停止（脚本默认 BASE=3001）。重启服务后全部通过。原始失败日志保留在 /tmp/r2-exits.txt 会话记录，未删除。
2. 本轮新增独立推导测试初版 11 failed：经逐项探针诊断，**全部为测试构造错误**（象棋 FEN 字母集 RNBAKCP 误用、行 9 列计数错、红方前进方向为 r 递减、车/炮棋子行列错位、跳棋"跳己方合法"误判为非法、像素容差过紧），非产品缺陷；最终 20/20 通过。全部探针文件（/tmp/r2probe*.mjs）为诊断过程证据。

## 既有测试证据追溯（A-004）

前轮报告（three-games-upgrade-report.md / final-acceptance-report.md）中的数量声明：
- "vitest 188/202/207" 等为对应提交时点的真实执行结果（git 检查点可溯）；本轮在 `15fa527` 复现为 150+57=207，**与最近一次声明一致** ✅。
- "e2e 13→18" 演进与提交记录一一对应 ✅。
- 120Hz/物理设备/公网声明在原报告中本就标注 NOT_TESTED/BLOCKED，本轮维持该结论（见 final-report）。
