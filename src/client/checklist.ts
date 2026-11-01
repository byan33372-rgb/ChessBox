/**
 * 功能确认卡数据源 —— 如实绑定验收记录。
 *
 * 诚实声明（界面与本注释同步展示）：
 * 1. 这些状态是【人工维护的验收记录】，来自本会话真实执行的自动化测试与浏览器手工验证，
 *    不是实时自动化监控系统，测试通过也不代表任何时刻都必然通过。
 * 2. 每一项的证据（测试编号、命令、真实输出）在 docs/visual-and-functional-audit.md 可查。
 * 3. 未验证 / 失败的项会如实显示为"未验证"/"未通过"，不会默认全绿。
 */

export type CheckStatus = 'pass' | 'unverified' | 'fail';

export interface CheckItem {
  label: string;
  status: CheckStatus;
  /** 证据：测试编号或命令（简要） */
  evidence: string;
}

export interface CheckGroup {
  kind: 'xiangqi' | 'chess' | 'checkers';
  title: string;
  items: CheckItem[];
}

/**
 * 状态更新规则（维护者须知）：
 * 只有在对应测试真实执行并通过后才能改为 pass；测试失败改为 fail 并写明原因；
 * 没跑过的保持 unverified。每轮回归后同步更新本文件与 docs/visual-and-functional-audit.md。
 */
export const CHECKLIST: CheckGroup[] = [
  {
    kind: 'xiangqi',
    title: '功能确认（中国象棋）',
    items: [
      { label: '棋盘和棋子显示正确，坐标清晰', status: 'pass', evidence: 'UI-002/UI-005 浏览器实测 + layout-check' },
      { label: '走法/吃子/将军/将死/困毙规则', status: 'pass', evidence: 'XI-003~XI-014：unit xiangqi-engine 37 项' },
      { label: '可创建房间并分享链接，另一位玩家能加入', status: 'pass', evidence: 'NET-001~NET-004 + NET-028 步骤①②③：integration rooms + 双客户端实测' },
      { label: '走棋实时同步，上一步/下一步导航正常', status: 'pass', evidence: 'NET-006 + REC-003/REC-004 + NET-028 步骤⑤⑥⑦⑩：e2e + 双客户端实测' },
      { label: '导出中文棋谱 / 自定义 JSON 功能正常', status: 'pass', evidence: 'REC-007：unit exporters + e2e 用例 7 下载校验' },
      { label: '聊天功能可用，消息实时同步', status: 'pass', evidence: 'UX-004~UX-006 + integration chat 5 项 + NET-028 步骤⑪' },
      { label: '刷新页面后能恢复当前对局状态', status: 'pass', evidence: 'NET-014 + NET-028 步骤⑫：integration 重启恢复 + 刷新实测' },
      { label: '页面在不同屏幕尺寸下均能正常显示', status: 'pass', evidence: 'RWD-01~RWD-09：真实视口矩阵 1440~375 无溢出 + 翻转实测' },
    ],
  },
  {
    kind: 'chess',
    title: '功能确认（国际象棋）',
    items: [
      { label: '棋盘和棋子显示正确，坐标清晰', status: 'pass', evidence: 'UI-003/UI-005 浏览器实测 + layout-check' },
      { label: '走法/易位/吃过路兵/升变等规则', status: 'pass', evidence: 'CH-004~CH-018：unit chess-rules-deep + chess-adapter 47 项' },
      { label: '可创建房间并分享链接，另一位玩家能加入', status: 'pass', evidence: 'NET-001~NET-004 + NET-028 步骤①②③：integration rooms + 双客户端实测' },
      { label: '走棋实时同步，上一步/下一步导航正常', status: 'pass', evidence: 'NET-012 + REC-003/REC-004 + NET-028 步骤⑤⑥⑦⑩：e2e + 双客户端实测' },
      { label: '导出 FEN / PGN 功能正常', status: 'pass', evidence: 'REC-006：unit exporters + e2e 用例 6 下载校验' },
      { label: '聊天功能可用，消息实时同步', status: 'pass', evidence: 'UX-004~UX-006 + integration chat 5 项 + NET-028 步骤⑪' },
      { label: '刷新页面后能恢复当前对局状态', status: 'pass', evidence: 'NET-014 + NET-028 步骤⑫：integration 重启恢复 + 刷新实测' },
      { label: '页面在不同屏幕尺寸下均能正常显示', status: 'pass', evidence: 'RWD-01~RWD-12：真实视口矩阵 1440~375 无溢出 + 翻转实测' },
    ],
  },
  {
    kind: 'checkers',
    title: '功能确认（中国跳棋）',
    items: [
      { label: '六角星棋盘 121 孔位与棋子显示正确', status: 'pass', evidence: 'unit 几何 121 格 + e2e 跳棋对局实测（upgrade.spec）' },
      { label: '移动/跳跃/连跳/营地约束/胜利规则', status: 'pass', evidence: 'unit checkers-engine 25 项（TEST-003~014/SEC-005/006）' },
      { label: '2/3/4/6 人房间与轮转、超员观战', status: 'pass', evidence: 'integration checkers-rooms 11 项（SERVER-001~012）' },
      { label: '连跳完整路径服务端校验与广播', status: 'pass', evidence: 'integration [e3,e5,g5] 连跳用例 + 持久化恢复 path 断言' },
      { label: '上一手起点/终点标记与连跳轨迹显示', status: 'pass', evidence: 'e2e ck-mark-from/to + polyline + LastMoveBar 断言（upgrade.spec）' },
      { label: '导出棋谱文本 / 自定义 JSON', status: 'pass', evidence: 'e2e 真实下载断言：文件名/文本内容/JSON format+moves（upgrade.spec HISTORY-009）+unit exporters 2 项' },
      { label: '刷新页面后能恢复当前对局状态', status: 'pass', evidence: 'integration 持久化恢复用例（DATA-001~004）' },
      { label: '页面在不同屏幕尺寸下均能正常显示', status: 'pass', evidence: 'e2e 三棋 375×667 无横向溢出 + RWD 既有矩阵' },
    ],
  },
];

/** 界面上明示：这是人工维护的记录，不是实时监控 */
export const CHECKLIST_NOTE =
  '以上为人工维护的验收记录（非实时自动化监控）。证据与测试编号见 docs/visual-and-functional-audit.md；未验证项不会标为通过。';
