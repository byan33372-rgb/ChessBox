/** 阶段 5：聊天专项（顺序/校验/限频/XSS 载荷/历史恢复/重启持久化） */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import type { AckBase, ChatMessage } from '../../src/shared/protocol';
import { connect, emitAck, joinAs, makeRoom, startServer, stopServer, type TestServer } from './helpers';

let server: TestServer;

beforeAll(async () => {
  server = await startServer();
});

afterAll(async () => {
  await stopServer(server);
});

function onChat(socket: ReturnType<typeof connect>): ChatMessage[] {
  const out: ChatMessage[] = [];
  socket.on('chat:message', (m) => out.push(m));
  return out;
}

describe('聊天', () => {
  it('消息顺序保持，文本原样传递（含 XSS 载荷，转义由前端 React 文本节点保证）', async () => {
    const { roomId, playerA } = await makeRoom(server, 'xiangqi');
    const { socket: playerB } = await joinAs(server, roomId, '乙方');
    const received = onChat(playerB);
    for (const text of ['你好', '<script>alert(1)</script>', '第三条']) {
      const ack = await emitAck<AckBase>(playerA, 'chat:send', { text });
      expect(ack.ok).toBe(true);
    }
    await new Promise((r) => setTimeout(r, 150));
    expect(received.map((m) => m.text)).toEqual(['你好', '<script>alert(1)</script>', '第三条']);
    // 服务端存储的也是原文（未被解释执行）
    expect(server.rooms.get(roomId)!.chat[1].text).toBe('<script>alert(1)</script>');
    playerB.disconnect();
    playerA.disconnect();
  });

  it('空消息与超长消息（>200）被拒', async () => {
    const { roomId, playerA } = await makeRoom(server, 'xiangqi');
    const { socket: playerB } = await joinAs(server, roomId, '乙方');
    const empty = await emitAck<AckBase>(playerA, 'chat:send', { text: '   ' });
    expect(empty.ok).toBe(false);
    expect(empty.error?.code).toBe('INVALID_INPUT');
    const tooLong = await emitAck<AckBase>(playerA, 'chat:send', { text: 'x'.repeat(201) });
    expect(tooLong.ok).toBe(false);
    expect(tooLong.error?.code).toBe('INVALID_INPUT');
    expect(server.rooms.get(roomId)!.chat.length).toBe(0);
    playerB.disconnect();
    playerA.disconnect();
  });

  it('限频：突发 6 条后第 7 条被拒', async () => {
    const { roomId, playerA } = await makeRoom(server, 'xiangqi');
    const { socket: playerB } = await joinAs(server, roomId, '乙方');
    const acks: AckBase[] = [];
    for (let i = 0; i < 7; i++) {
      acks.push(await emitAck<AckBase>(playerA, 'chat:send', { text: `msg-${i}` }));
    }
    expect(acks.slice(0, 6).every((a) => a.ok)).toBe(true);
    expect(acks[6].ok).toBe(false);
    expect(acks[6].error?.code).toBe('RATE_LIMITED');
    playerB.disconnect();
    playerA.disconnect();
  });

  it('断线重连后收到 chat:history 恢复历史', async () => {
    const { roomId, playerA } = await makeRoom(server, 'xiangqi');
    const { ack: joinAck, socket: playerB } = await joinAs(server, roomId, '乙方');
    const tokenB = joinAck.token!;
    await emitAck<AckBase>(playerA, 'chat:send', { text: '历史消息一' });
    await emitAck<AckBase>(playerA, 'chat:send', { text: '历史消息二' });
    playerB.disconnect();
    await new Promise((r) => setTimeout(r, 200));
    // 重连
    const back = connect(server.url);
    const history: ChatMessage[] = [];
    back.on('chat:history', (p) => history.push(...p.messages));
    const rejoin = await emitAck(back, 'room:rejoin', { roomId, token: tokenB });
    expect(rejoin.ok).toBe(true);
    await new Promise((r) => setTimeout(r, 150));
    expect(history.map((m) => m.text)).toContain('历史消息一');
    expect(history.map((m) => m.text)).toContain('历史消息二');
    back.disconnect();
    playerA.disconnect();
  });

  it('服务器重启后聊天历史从 SQLite 恢复并可下发', async () => {
    const dbPath = join(tmpdir(), `chat-restart-${Date.now()}.db`);
    const s1 = await startServer(dbPath);
    const room = await makeRoom(s1, 'xiangqi');
    const b = await joinAs(s1, room.roomId, '乙方');
    await emitAck<AckBase>(room.playerA, 'chat:send', { text: '重启前的消息' });
    room.playerA.disconnect();
    b.socket.disconnect();
    await stopServer(s1);

    const s2 = await startServer(dbPath);
    const again = connect(s2.url);
    const history: ChatMessage[] = [];
    again.on('chat:history', (p) => history.push(...p.messages));
    const rejoin = await emitAck(again, 'room:rejoin', { roomId: room.roomId, token: room.token });
    expect(rejoin.ok).toBe(true);
    await new Promise((r) => setTimeout(r, 150));
    expect(history.map((m) => m.text)).toContain('重启前的消息');
    again.disconnect();
    await stopServer(s2);
    rmSync(dbPath, { force: true });
  });
});
