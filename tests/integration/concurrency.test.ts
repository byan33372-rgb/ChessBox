/** 阶段 3：联机并发与防伪造专项 */

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

describe('并发与原子性', () => {
  it('同一 revision 并发提交两步：恰好一步成功、一步 STALE_REVISION，棋谱只有一步', async () => {
    const { roomId, playerA } = await makeRoom(server, 'xiangqi');
    const { socket: playerB } = await joinAs(server, roomId, '乙方');
    // 红方同时发出两个不同走法（相同 revision=2）
    const [r1, r2] = await Promise.all([
      emitAck<MoveAck>(playerA, 'game:move', { requestId: 'race-0001', revision: 2, from: 'h7', to: 'e7' }),
      emitAck<MoveAck>(playerA, 'game:move', { requestId: 'race-0002', revision: 2, from: 'b7', to: 'e7' }),
    ]);
    const oks = [r1, r2].filter((r) => r.ok);
    const rejected = [r1, r2].filter((r) => !r.ok);
    expect(oks.length).toBe(1);
    expect(rejected.length).toBe(1);
    // 第二步被拒的码取决于处理顺序：先成功→轮次已换（NOT_YOUR_TURN）或版本过期（STALE_REVISION）
    expect(['STALE_REVISION', 'NOT_YOUR_TURN']).toContain(rejected[0].error?.code);
    expect(server.rooms.get(roomId)!.moves.length).toBe(1);
    expect(server.rooms.get(roomId)!.revision).toBe(3);
    playerB.disconnect();
    playerA.disconnect();
  });

  it('双方同时各走一步（只有轮到的一方成功）', async () => {
    const { roomId, playerA } = await makeRoom(server, 'xiangqi');
    const { socket: playerB } = await joinAs(server, roomId, '乙方');
    const [ra, rb] = await Promise.all([
      emitAck<MoveAck>(playerA, 'game:move', { requestId: 'both-0001', revision: 2, from: 'h7', to: 'e7' }),
      emitAck<MoveAck>(playerB, 'game:move', { requestId: 'both-0002', revision: 2, from: 'h0', to: 'g2' }),
    ]);
    const oks = [ra, rb].filter((r) => r.ok).length;
    expect(oks).toBe(1);
    const failed = [ra, rb].find((r) => !r.ok)!;
    expect(['STALE_REVISION', 'NOT_YOUR_TURN']).toContain(failed.error?.code);
    expect(server.rooms.get(roomId)!.moves.length).toBe(1);
    playerB.disconnect();
    playerA.disconnect();
  });

  it('观战者伪造玩家身份走棋/认输均被拒', async () => {
    const { roomId, playerA } = await makeRoom(server, 'xiangqi');
    const { socket: playerB } = await joinAs(server, roomId, '乙方');
    const { socket: fake } = await joinAs(server, roomId, '伪造者');
    const move = await emitAck<MoveAck>(fake, 'game:move', { requestId: 'fake-0001', revision: 2, from: 'h7', to: 'e7' });
    expect(move.ok).toBe(false);
    expect(move.error?.code).toBe('NOT_PLAYER');
    const resign = await emitAck(fake, 'game:resign', {});
    expect(resign.ok).toBe(false);
    expect(resign.error?.code).toBe('NOT_PLAYER');
    expect(server.rooms.get(roomId)!.moves.length).toBe(0);
    fake.disconnect();
    playerB.disconnect();
    playerA.disconnect();
  });

  it('会话令牌跨房间不可用', async () => {
    const room1 = await makeRoom(server, 'xiangqi');
    const { roomId: id2 } = await makeRoom(server, 'xiangqi');
    const bad = connect(server.url);
    const ack = await emitAck(bad, 'room:rejoin', { roomId: id2, token: room1.token });
    expect(ack.ok).toBe(false);
    expect(ack.error?.code).toBe('SESSION_INVALID');
    bad.disconnect();
    room1.playerA.disconnect();
  });

  it('观战者进出：spectators 计数精确归零', async () => {
    const { roomId, playerA } = await makeRoom(server, 'xiangqi');
    const { socket: playerB } = await joinAs(server, roomId, '乙方'); // 先坐满双方
    const { socket: w1 } = await joinAs(server, roomId, '观众一');
    const { socket: w2 } = await joinAs(server, roomId, '观众二');
    expect(server.rooms.get(roomId)!.spectators.size).toBe(2);
    w1.disconnect();
    w2.disconnect();
    await new Promise((r) => setTimeout(r, 250));
    expect(server.rooms.get(roomId)!.spectators.size).toBe(0);
    playerB.disconnect();
    playerA.disconnect();
  });

  it('同一会话多标签页重连：席位不重复、后连者接管在线状态', async () => {
    const { roomId, playerA } = await makeRoom(server, 'xiangqi');
    const { ack: joinAck, socket: playerB } = await joinAs(server, roomId, '乙方');
    const tokenB = joinAck.token!;
    // 第二个标签页凭同一令牌重连
    const tab2 = connect(server.url);
    const rejoin = await emitAck(tab2, 'room:rejoin', { roomId, token: tokenB });
    expect(rejoin.ok).toBe(true);
    expect(rejoin.seat).toBe('b');
    expect(rejoin.state?.seats.b?.connected).toBe(true);
    // 原标签页断开后仍在在线（tab2 接管了绑定）
    playerB.disconnect();
    await new Promise((r) => setTimeout(r, 250));
    const room = server.rooms.get(roomId)!;
    expect(room.seats.b?.socketId).toBe(tab2.id);
    expect(room.spectators.size).toBe(0);
    tab2.disconnect();
    playerA.disconnect();
  });
});
