# UNO —— 安全报告

- 日期：2026-11-07

## 1. 隐藏信息安全

| 信息 | 保护 | 验证 |
| --- | --- | --- |
| 手牌 | view(seat) 个性化；他人仅 handCount | 集成测试三视图交叉断言 |
| 牌堆顺序 | 永不下发 | 视图无 pile 字段 |
| 传牌选择 | 服务端原子交换；双方各自提交 cardId，不泄露给对方 | 引擎设计 |

## 2. 命令伪造

- 会话绑定（socket.data.session → seat）
- play-card：unoCanPlay + playableIds 服务端计算
- 伪造 teamId：set-team 仅在 select 阶段接受
- 伪造 challenge：仅 pending challenge playerId 可响应
- 观战者：NOT_PLAYER

## 3. 重放/并发

- commandId 幂等（集成测试覆盖）
- expectedRevision 过期拒绝（集成测试覆盖）
- 房间队列串行化

## 4. 输入校验

- zod：commandId 8–64 位；action.type max(24)
- 不 eval / 不动态执行字符串
- 自定义牌为预置模板（无用户代码）

## 5. 未覆盖

- 模糊测试未做
- 真机未测
