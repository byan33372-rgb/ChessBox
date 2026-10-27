/** 阶段 6：安全专项（敏感路径 404 / 安全响应头 / 事件输入校验 / 伪造与畸形载荷） */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { existsSync } from 'fs';
import { join } from 'path';
import type { CreateAck, JoinAck } from '../../src/shared/protocol';
import { connect, emitAck, joinAs, makeRoom, startServer, stopServer, type TestServer } from './helpers';

let server: TestServer;
const distExists = existsSync(join(process.cwd(), 'dist-client'));

beforeAll(async () => {
  server = await startServer();
});

afterAll(async () => {
  await stopServer(server);
});

async function get(path: string): Promise<{ status: number; headers: Record<string, string> }> {
  const res = await fetch(`${server.url}${path}`);
  const headers: Record<string, string> = {};
  res.headers.forEach((v, k) => (headers[k] = v));
  return { status: res.status, headers };
}

describe('HTTP 安全', () => {
  it('敏感路径探测全部 404：/.env、/package.json、/data/app.db、/node_modules', async () => {
    for (const p of ['/.env', '/package.json', '/data/app.db', '/node_modules', '/src/server/index.ts']) {
      const r = await get(p);
      expect(r.status, p).toBe(404);
    }
  });

  it('SPA 路由正常：/ 与 /r/房间号 返回页面（需 dist 构建存在）', async () => {
    if (!distExists) return; // 环境未构建时跳过（构建产物不入库）
    expect((await get('/')).status).toBe(200);
    expect((await get('/r/abcdefghij')).status).toBe(200);
  });

  it('安全响应头齐备', async () => {
    const r = await get('/');
    const h = r.headers;
    expect(h['x-content-type-options']).toBe('nosniff');
    expect(h['x-frame-options']).toBe('SAMEORIGIN');
    expect(h['referrer-policy']).toBe('no-referrer');
    expect(h['permissions-policy']).toContain('camera=()');
    expect(h['content-security-policy']).toContain("default-src 'self'");
    expect(h['content-security-policy'] ?? '').not.toContain('unsafe-eval');
  });

  it('/api 路径 404 且为 JSON，不泄露内部信息', async () => {
    const res = await fetch(`${server.url}/api/secret`);
    expect(res.status).toBe(404);
    expect(res.headers.get('content-type')).toContain('application/json');
    const body = (await res.json()) as { error?: string };
    expect(body.error).toBe('not found');
  });
});

describe('Socket 输入校验', () => {
  it('畸形房间号（长度/字符集）被拒', async () => {
    const socket = connect(server.url);
    const bad1 = await emitAck<JoinAck>(socket, 'room:join', { roomId: 'abcdefghijk' }); // 11 位
    expect(bad1.ok).toBe(false);
    expect(bad1.error?.code).toBe('INVALID_INPUT');
    const bad2 = await emitAck<JoinAck>(socket, 'room:join', { roomId: 'ABCDefgh12' }); // 大写非法字符
    expect(bad2.error?.code).toBe('INVALID_INPUT');
    const bad3 = await emitAck<JoinAck>(socket, 'room:join', { roomId: '123', extra: 'x' }); // 未知字段+短
    expect(bad3.error?.code).toBe('INVALID_INPUT');
    socket.disconnect();
  });

  it('非对象/缺字段载荷不崩溃且被拒', async () => {
    const socket = connect(server.url);
    // 直接发畸形对象（绕过类型系统）
    const r = await emitAck<JoinAck>(socket, 'room:join', null);
    expect(r.ok).toBe(false);
    const r2 = await emitAck<JoinAck>(socket, 'room:join', { roomId: 1234567890 });
    expect(r2.ok).toBe(false);
    expect(r2.error?.code).toBe('INVALID_INPUT');
    // 服务器仍在运行
    const health = await fetch(`${server.url}/healthz`);
    expect(health.status).toBe(200);
    socket.disconnect();
  });

  it('走棋载荷字段类型伪造被拒（from 传对象）', async () => {
    const { roomId, playerA } = await makeRoom(server, 'xiangqi');
    const { socket: playerB } = await joinAs(server, roomId, '乙方');
    const r = await emitAck(playerA, 'game:move', {
      requestId: 'attack0001',
      revision: 2,
      from: { toString: () => 'h7' },
      to: 'e7',
    });
    expect(r.ok).toBe(false);
    expect(r.error?.code).toBe('INVALID_INPUT');
    expect(server.rooms.get(roomId)!.moves.length).toBe(0);
    playerB.disconnect();
    playerA.disconnect();
  });

  it('聊天载荷注入对象/超长属性被拒', async () => {
    const { roomId, playerA } = await makeRoom(server, 'xiangqi');
    const { socket: playerB } = await joinAs(server, roomId, '乙方');
    const r = await emitAck(playerA, 'chat:send', { text: { __proto__: 'x' } });
    expect(r.ok).toBe(false);
    const r2 = await emitAck(playerA, 'chat:send', { text: 'ok', extra: '字段' });
    expect(r2.ok).toBe(true); // 未知字段被 zod 忽略（strip），不影响
    playerB.disconnect();
    playerA.disconnect();
  });

  it('创建房间的棋种枚举外值被拒', async () => {
    const socket = connect(server.url);
    const r = await emitAck<CreateAck>(socket, 'room:create', { kind: 'weiqi' as never });
    expect(r.ok).toBe(false);
    expect(r.error?.code).toBe('INVALID_INPUT');
    socket.disconnect();
  });
});
