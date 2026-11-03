# 五棋升级 · 规则报告（game-rules-report.md）

| 棋类 | 测试文件 | 数量 | 关键覆盖 | 结果 |
|---|---|---|---|---|
| 中国象棋 | xiangqi-engine.test.ts + round2-independent | 37+5 | 九宫/蹩马腿/炮架/照面/困毙/将死/重复/长将/44 着公认值 | PASS |
| 国际象棋 | chess-rules-deep/adapter/extras + round2-independent | 62+3 | perft 20/400/8902 + Kiwipete 2039（公认值）/易位全条件/过路兵/升变/50步/重复 | PASS |
| 中国跳棋 | checkers-engine + checkers-ui | 28+9 | 121 位几何/营内互走/连跳防循环/劫…（无劫）/胜利 | PASS |
| 围棋 | go-engine.test.ts | 21 | 9/13/19 星位天元/气提子/多块同提/禁自杀/打劫回提禁止/隔手 superko/双停数子/死子交集确认/恢复对弈/贴目 7.5/认输/SGF 子集 | PASS |
| 五子棋 | gomoku-engine.test.ts | 17 | 四向五连/长连 fen 预置/四连负例/边界角/终局锁/满盘和棋（BBWW 移位模式构造 224 子无五连）/加载即胜/extra 胜利线 | PASS |

规则声明一致性（GO-011/013、GOMOKU-009/016）：
- 围棋：中国规则（区域计分+贴目 7.5 白方）——房间徽章展示；superko 含行棋方（situational，严于 position-only），引擎注释/报告一致。
- 五子棋：自由规则（≥5 胜，无禁手）；Renju 未实现（GOMOKU-016 预留独立模式，未宣传支持）。

服务端权威（SEC-001/002）：所有走法/落子由服务端引擎校验后才广播；客户端仅提交意图（from/to），无棋盘提交面——集成测试（非法点/占位/终局拒绝）实证。
