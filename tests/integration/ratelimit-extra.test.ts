/** R10 SEC 补充：走棋限流与操作限流（此前仅创建/聊天/加入限流有真实测试） */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { MoveAck } from '../../src/shared/protocol';
import { connect, emitAck, joinAs, makeRoom, startServer, stopServer, type TestServer } from './helpers';

let server: TestServer;

beforeAll(async () => {
  server = await startServer();
});

afterAll(async () => {
  await stopServer(server);
});

describe('限流补充 · 走棋与操作', () => {
  it('走棋限流：容量 20，突发 25 次走棋（含非法）触发 RATE_LIMITED；限流不产生走法', async () => {
    const { roomId, playerA } = await makeRoom(server, 'xiangqi');
    const { socket: playerB } = await joinAs(server, roomId, '乙方');
    const acks: MoveAck[] = [];
    for (let i = 0; i < 25; i++) {
      acks.push(
        await emitAck<MoveAck>(playerA, 'game:move', {
          requestId: `ratelimit-move-${String(i).padStart(3, '0')}`,
          revision: 2,
          from: 'h7',
          to: 'e7',
        }),
      );
    }
    // 前 20 个消耗桶容量：可能出现少量 ok（第 1 步合法）+ STALE_REVISION/NOT_YOUR_TURN（轮次已换），之后 RATE_LIMITED
    const limited = acks.filter((a) => !a.ok && a.error?.code === 'RATE_LIMITED');
    expect(limited.length).toBeGreaterThanOrEqual(1);
    // 限流桶与走法处理解耦：25 次突发后棋谱最多 1 步（requestId 各异但轮次限制住）
    expect(server.rooms.get(roomId)!.moves.length).toBeLessThanOrEqual(1);
    playerB.disconnect();
    playerA.disconnect();
  });

  it('操作限流（悔棋/提和等）：容量 15，突发 20 次 undo:offer 后触发 RATE_LIMITED', async () => {
    const { roomId, playerA } = await makeRoom(server, 'xiangqi');
    const { socket: playerB } = await joinAs(server, roomId, '乙方');
    const acks = [];
    for (let i = 0; i < 20; i++) {
      acks.push(await emitAck(playerA, 'game:undo:offer', {}));
    }
    const limited = acks.filter((a) => !a.ok && a.error?.code === 'RATE_LIMITED');
    expect(limited.length).toBeGreaterThanOrEqual(1);
    // 清理 offer（接受无效：无走法可悔）→ 拒绝流不影响他人
    playerB.disconnect();
    playerA.disconnect();
  });
});
