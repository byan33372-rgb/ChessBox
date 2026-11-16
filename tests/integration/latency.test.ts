/** 延迟插桩与安全回归（阶段二/十三/十四）：分项计时、ping、幂等、过期版本、广播一致性、无令牌泄露。 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Socket as ClientSocket } from 'socket.io-client';
import {
  collect,
  connect,
  emitAck,
  startServer,
  stopServer,
  waitFor,
  type AckBase,
  type CreateAck,
  type JoinAck,
  type MoveAck,
  type RoomState,
  type TestServer,
} from './helpers';

let s: TestServer;
let seq = 0;
const reqId = () => `lat-${Date.now().toString(36)}-${(++seq).toString(36).padStart(4, '0')}`;

beforeAll(async () => {
  s = await startServer();
});
afterAll(async () => {
  await stopServer(s);
});

async function setupGomoku(): Promise<{ a: ClientSocket; b: ClientSocket; statesA: RoomState[]; statesB: RoomState[]; roomId: string }> {
  const a = connect(s.url);
  const b = connect(s.url);
  const statesA = collect(a);
  const statesB = collect(b);
  const ca = await emitAck<CreateAck>(a, 'room:create', { kind: 'gomoku', name: '甲' });
  expect(ca.ok).toBe(true);
  const jb = await emitAck<JoinAck>(b, 'room:join', { roomId: ca.roomId!, name: '乙' });
  expect(jb.ok).toBe(true);
  await waitFor(() => statesA.at(-1)?.phase === 'playing' && statesB.at(-1)?.phase === 'playing');
  return { a, b, statesA, statesB, roomId: ca.roomId! };
}

describe('延迟插桩（MEASURE-001~006）', () => {
  it('走棋 ack 携带 serverTiming 全分项，且均为有限非负数', async () => {
    const { a, statesA } = await setupGomoku();
    const st = statesA.at(-1)!;
    const ack = await emitAck<MoveAck>(a, 'game:move', { requestId: reqId(), revision: st.revision, from: 'h8', to: 'h8' });
    expect(ack.ok).toBe(true);
    const t = ack.serverTiming!;
    expect(t).toBeTruthy();
    for (const k of ['queueMs', 'validateMs', 'applyMs', 'persistMs', 'stateMs', 'broadcastMs', 'totalMs'] as const) {
      expect(Number.isFinite(t[k]), k).toBe(true);
      expect(t[k], k).toBeGreaterThanOrEqual(0);
    }
    // 正常路径总耗时应远小于 1 秒（异常环境除外；失败会暴露性能退化）
    expect(t.totalMs).toBeLessThan(1000);
  });

  it('latency:ping 只回环时间，不改变房间状态', async () => {
    const { a, statesA } = await setupGomoku();
    const before = statesA.at(-1)!.revision;
    const r = await emitAck<{ ok: boolean; t: number }>(a, 'latency:ping', {});
    expect(r.ok).toBe(true);
    expect(typeof r.t).toBe('number');
    expect(statesA.at(-1)!.revision).toBe(before);
  });

  it('serverTiming 只出现在 ack，不进入广播（不增加对手载荷）', async () => {
    const { a, b, statesA, statesB } = await setupGomoku();
    const st = statesA.at(-1)!;
    const ack = await emitAck<MoveAck>(a, 'game:move', { requestId: reqId(), revision: st.revision, from: 'h8', to: 'h8' });
    expect(ack.ok).toBe(true);
    await waitFor(() => statesB.at(-1)?.moves.length === 1);
    expect(JSON.stringify(statesB.at(-1))).not.toContain('serverTiming');
    expect((statesB.at(-1) as unknown as { serverTiming?: unknown }).serverTiming).toBeUndefined();
  });
});

describe('移动安全回归（SEC-001~007 / SOCKET-012/019）', () => {
  it('过期 revision 被拒并返回最新状态；用新 revision 重试成功且只落一子', async () => {
    const { a, statesA } = await setupGomoku();
    const st = statesA.at(-1)!;
    const stale = await emitAck<MoveAck>(a, 'game:move', { requestId: reqId(), revision: st.revision - 1, from: 'h8', to: 'h8' });
    expect(stale.ok).toBe(false);
    expect(stale.error?.code).toBe('STALE_REVISION');
    expect(stale.state?.revision).toBe(st.revision);
    const retry = await emitAck<MoveAck>(a, 'game:move', { requestId: reqId(), revision: stale.state!.revision, from: 'h8', to: 'h8' });
    expect(retry.ok).toBe(true);
    await waitFor(() => statesA.at(-1)?.moves.length === 1);
    const after = statesA.at(-1)!;
    expect(after.moves.filter((m) => m.from === 'h8').length).toBe(1);
  });

  it('同 requestId 重复提交幂等：两次 ok、只落一子、返回同一 revision', async () => {
    const { a, statesA } = await setupGomoku();
    const st = statesA.at(-1)!;
    const id = reqId();
    const body = { requestId: id, revision: st.revision, from: 'h8', to: 'h8' };
    const [r1, r2] = await Promise.all([
      emitAck<MoveAck>(a, 'game:move', body),
      emitAck<MoveAck>(a, 'game:move', body),
    ]);
    expect(r1.ok && r2.ok).toBe(true);
    expect(r1.revision).toBe(r2.revision);
    await waitFor(() => statesA.at(-1)?.moves.length === 1);
    expect(statesA.at(-1)!.moves.length).toBe(1);
  });

  it('非法坐标被 INVALID_INPUT 拒绝且不落子', async () => {
    const { a, statesA } = await setupGomoku();
    const st = statesA.at(-1)!;
    const r = await emitAck<MoveAck>(a, 'game:move', { requestId: reqId(), revision: st.revision, from: 'zz99', to: 'zz99' });
    expect(r.ok).toBe(false);
    expect(r.error?.code).toBe('INVALID_INPUT');
    expect(statesA.at(-1)!.moves.length).toBe(0);
  });

  it('ack 不含会话令牌；广播状态与 ack 版本/手数一致', async () => {
    const { a, b, statesA, statesB } = await setupGomoku();
    const st = statesA.at(-1)!;
    const ack = await emitAck<MoveAck>(a, 'game:move', { requestId: reqId(), revision: st.revision, from: 'h8', to: 'h8' });
    expect(ack.ok).toBe(true);
    expect(JSON.stringify(ack)).not.toMatch(/token/i);
    await waitFor(() => statesB.at(-1)?.moves.length === 1);
    const bState = statesB.at(-1)!;
    expect(bState.revision).toBe(ack.revision);
    expect(bState.moves.length).toBe(1);
    void b;
  });
});
