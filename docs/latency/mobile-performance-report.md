# 阶段十一–十二：移动端与帧率报告

- 时间：2026-11-05 13:13–13:20
- 方法：Playwright 设备仿真（真实 Chrome）+ CDP CPU 4× 降速；不是真机。
- 原始数据：`docs/latency/raw/mobile.json`

## 1. 设备与条件

| 设备 | 视口 | DPR | CPU | 说明 |
| --- | --- | ---: | --- | --- |
| iPhone SE | 320×568 | 2 | 4× 降速 | 最小主流视口，覆盖 320px 边界 |
| Pixel 7 | 412×839 | 2.625 | 4× 降速 | Android 中屏 |
| iPhone 13 | 390×664 | 3 | 4× 降速 | iOS 中屏 |

> Playwright 设备描述符与真机并非完全一致；本节结论只代表「仿真 + 4× CPU 降速」，不等同真机。

## 2. 加载

| 设备 | 首页可用 | 进入房间（建房/加入/开局） | 资源传输 |
| --- | ---: | ---: | ---: |
| iPhone SE | 753 ms | 2 414 ms | 439 KB |
| Pixel 7 | 781 ms | 2 368 ms | 439 KB |
| iPhone 13 | 775 ms | 2 242 ms | 439 KB |

- 首页可用 = DOMContentLoaded + 五张卡片可见；房间可用 = 点击创建 → 加入 → 首个 authoritative state。
- 439 KB 为本机未压缩传输总量（含 JS/CSS/字体图标）；生产 gzip 后首屏 JS 98 KB。
- 房间 2.2–2.4 s 包含：CPU 4× 下的 React 初始化、两次 socket 连接、建房/加入/选座、SQLite 落库；本机网络 RTT <1 ms，因此主要是 CPU 降速成本。

## 3. 落子响应（触摸）

| 设备 | 点击→本机可见 P50 | P95 | Max | 点击→ack P50 | 长任务 |
| --- | ---: | ---: | ---: | ---: | ---: |
| iPhone SE | 2.8 ms | **15.1 ms** | 16.4 ms | 5.7 ms | 0 |
| Pixel 7 | 3.4 ms | **13.1 ms** | 15.7 ms | 5.5 ms | 0 |
| iPhone 13 | 3.0 ms | **13.6 ms** | 16.1 ms | 5.8 ms | 0 |

- 全部低于任务书「本机点击→可见 P50/P95 ≤50 ms」。
- 4× CPU 降速下仍在 1 帧左右；乐观 UI 只做一次本地引擎 apply + 一次 React 状态更新。
- 长任务为 0（`PerformanceObserver('longtask')`；headless 下若浏览器不派发该类型，会显示 0，属于观测限制）。

## 4. 帧率

| 设备 | 采样帧数 | 平均 FPS | >33.4 ms 帧 |
| --- | ---: | ---: | ---: |
| iPhone SE | 165 | 165 | 0 |
| Pixel 7 | 165 | 165 | 0 |
| iPhone 13 | 165 | 165 | 0 |

- 本机 Chrome 的 rAF 与 165 Hz 显示器同步（既有验收记录同样为 165–167 Hz），**不是手机 60 Hz 的实测**。
- 0 帧超过 33.4 ms 说明即使按 30 FPS 预算也没有长帧；按 60 Hz 预算（16.67 ms）在既有 PERF-008 五棋采样中同样为 0。
- 代码未把 rAF 锁到 120 Hz；动画由 CSS `transform` 过渡驱动，时长由 `--anim-move-ms` 控制（普通 180 ms / 快速 90 ms / 关闭 0）。

## 5. 布局与触控

| 检查 | 结果 |
| --- | --- |
| 320 px 首页横向溢出 | **修复前 365 px（溢出 45 px）→ 修复后 320 px（0）** |
| 412 / 390 px 首页 | 无溢出 |
| 房间棋盘宽度 | 268 / 392 / 364 px，均在视口内 |
| 操作按钮触控高度 | 42 px（layout-check） |
| 棋盘命中热区 | ≥30 px（layout-check 移动端） |
| 五棋 375×812 无横向溢出 | 既有 e2e PASS |

### 本轮修复：DEF-LAT-001（P2，320 px 横向溢出）

- 现象：320×568 首页 `scrollWidth=365`，可横向拖动 45 px。
- 定位：`#nickname` 输入框（`.name-row input` 固定 `width:170px`，标签 `white-space:nowrap`，flex 不允许收缩）。
- 根因：flex item 默认 `min-width:auto` + 固定宽度，窄屏下撑破卡片。
- 修复：`.name-row { flex-wrap: wrap }`；`.name-row input { flex: 0 1 170px; min-width: 0; max-width: 100% }`；同时给 `.join-row input` 加 `min-width: 0`。
- 验证：320 px `scrollWidth=320`，三设备 `overflowX=false`；layout/rwd/viewport 脚本全绿。

## 6. 未验证（诚实标注）

- **真机**：未在真实 iPhone/Android 上测；仿真不能替代真机触控延迟、GPU、内存压力。
- **120 Hz 真机**：未测；只确认代码不锁帧、动画基于时间。
- **后台/前台切换**：未单独测；`useMoveFlight` 有 `visibilitychange` 立即落位兜底，但未在真机验证。
- **横竖屏切换**：未测。
- **移动网络 ↔ WiFi 切换**：无真机；用代理中断近似（见多客户端报告），不等同。
- **低端机内存/发热**：未测。

## 7. 结论

- 移动端仿真下，落子响应 P95 13–15 ms（4× CPU 降速），满足 50 ms 目标。
- 320 px 横向溢出已修复；三设备无溢出。
- 帧率在 165 Hz 环境无长帧；60 Hz 预算由既有 PERF-008 覆盖（0 超预算帧）。
- 真机/120 Hz/网络切换仍是未验证项，最终报告将标注 PARTIAL。
