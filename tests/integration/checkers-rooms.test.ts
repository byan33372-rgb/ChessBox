/** 跳棋联机集成（SERVER-001~014/DATA-001~004）：多座位分配、轮转、path 校验、持久化恢复 */
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

beforeAll(async () => {
  s = await startServer();
});

afterAll(async () => {
  await stopServer(s);
});

interface Seat {
  socket: ClientSocket;
  token: string;
  seat: string;
  states: RoomState[];
  /** 等待至少收到 minMoves 手棋的广播后返回最新权威状态 */
  settled(minMoves?: number): Promise<RoomState>;
}

let reqSeq = 0;
function reqId(): string {
  reqSeq += 1;
  return `req-${Date.now().toString(36)}-${reqSeq.toString(36).padStart(4, '0')}`; // ≥8 位 [A-Za-z0-9-]
}

function mkSeat(socket: ClientSocket, token: string, seat: string, states: RoomState[]): Seat {
  return {
    socket,
    token,
    seat,
    states,
    async settled(minMoves = 0): Promise<RoomState> {
      await waitFor(() => {
        const st = states.at(-1);
        return st != null && st.moves.length >= minMoves;
      });
      return states.at(-1)!;
    },
  };
}

/** 创建跳棋房间并拉满 N 个玩家（含创建者）；collect 先于 emit 注册避免错过广播 */
async function setupCheckers(seatCount: 2 | 3 | 4 | 6): Promise<{ roomId: string; seats: Seat[] }> {
  const names = ['甲', '乙', '丙', '丁', '戊', '己'];
  const seats: Seat[] = [];
  let roomId = '';
  for (let i = 0; i < seatCount; i++) {
    const socket = connect(s.url);
    const states = collect(socket);
    if (i === 0) {
      const ack = await emitAck<CreateAck>(socket, 'room:create', { kind: 'checkers', seatCount, name: names[0] });
      expect(ack.ok, JSON.stringify(ack.error)).toBe(true);
      roomId = ack.roomId!;
      seats.push(mkSeat(socket, ack.token!, ack.seat!, states));
    } else {
      const ack = await emitAck<JoinAck>(socket, 'room:join', { roomId, name: names[i] });
      expect(ack.ok, JSON.stringify(ack.error)).toBe(true);
      seats.push(mkSeat(socket, ack.token!, ack.seat!, states));
    }
  }
  // 等所有成员都收到全员就位（playing）的广播，消除时序竞态
  await waitFor(() => seats.every((x) => x.states.at(-1)?.phase === 'playing'));
  return { roomId, seats };
}

/**
 * 各座位开局单步（已验证邻接）：3/6 人局为三角/满座映射；4 人局映射为 {a:0,b:1,c:3,d:4}，
 * 因此 c 复用南营步、d 用西南营步（g13 与 m13 均为六角区出营格）。
 */
const OPENERS: Record<string, { from: string; to: string }> = {
  a: { from: 'f4', to: 'f5' }, // 北营底边 → 六角区
  b: { from: 'j5', to: 'i5' }, // 东北营（3/4/6 人局 b）
  c: { from: 'n10', to: 'm10' }, // 东南营（3/6 人局 c；4 人局 c 坐南营，测试内覆盖）
  d: { from: 'm14', to: 'm13' }, // 南营（2 人局 b / 6 人局 d / 4 人局 c 同营地复用）
  e: { from: 'f11', to: 'f10' }, // 西南营 (10,5) → 六角区 (9,5)——开局营满，出营步必须落六角区
  f: { from: 'd5', to: 'e5' }, // 西北营
};
/** 4 人局专用映射（SEAT_CAMP_MAPS[4] = a:0,b:1,c:3,d:4） */
const OPENERS_4P: Record<string, { from: string; to: string }> = {
  a: OPENERS.a,
  b: OPENERS.b,
  c: OPENERS.d, // c 坐南营
  d: OPENERS.e, // d 坐西南营
};

/** 南营第二步（m13 已被第一步占用后的相邻 outward 步） */
const OPENER_D2: { from: string; to: string } = { from: 'l14', to: 'l13' };

/** 带自愈重试的走棋：STALE_REVISION 时用错误负载携带的最新权威 revision 重试一次（与真实客户端一致） */
async function emitMoveRetry(
  socket: ClientSocket,
  revision: number,
  body: { from: string; to: string; path?: string[] },
): Promise<MoveAck> {
  let r = await emitAck<MoveAck>(socket, 'game:move', { requestId: reqId(), revision, ...body });
  if (!r.ok && r.error?.code === 'STALE_REVISION' && r.state) {
    r = await emitAck<MoveAck>(socket, 'game:move', { requestId: reqId(), revision: r.state.revision, ...body });
  }
  return r;
}

async function move(seat: Seat, body: { from: string; to: string; path?: string[] }): Promise<MoveAck> {
  const st = await seat.settled();
  return emitMoveRetry(seat.socket, st.revision, body);
}

describe('跳棋联机 · 多座位分配与轮转（SERVER-001~005）', () => {
  it('2 人：创建者 a、加入者 b；全部就位后 phase=playing、seatCount/seatOrder 正确', async () => {
    const { seats } = await setupCheckers(2);
    expect(seats.map((x) => x.seat)).toEqual(['a', 'b']);
    const final = seats[1].states.at(-1)!;
    expect(final.phase).toBe('playing');
    expect(final.seatCount).toBe(2);
    expect(final.seatOrder).toEqual(['a', 'b']);
    expect(final.seats.a?.name).toBe('甲');
    expect(final.seats.b?.name).toBe('乙');
    expect(final.seats.c).toBeUndefined();
  });

  it('6 人：座位 a..f 依序分配且 phase=playing', async () => {
    const { seats } = await setupCheckers(6);
    expect(seats.map((x) => x.seat)).toEqual(['a', 'b', 'c', 'd', 'e', 'f']);
    expect(seats[5].states.at(-1)!.seatOrder).toEqual(['a', 'b', 'c', 'd', 'e', 'f']);
  });

  it('3 人：超员加入为观战，观战不能走棋', async () => {
    const { roomId, seats } = await setupCheckers(3);
    expect(seats.map((x) => x.seat)).toEqual(['a', 'b', 'c']);
    const spectator = connect(s.url);
    const states = collect(spectator);
    const j = await emitAck<JoinAck>(spectator, 'room:join', { roomId, name: '路人' });
    expect(j.ok).toBe(true);
    expect(j.seat).toBe('spectator');
    await waitFor(() => states.length > 0);
    const st = await emitAck<MoveAck>(spectator, 'game:move', {
      requestId: reqId(),
      revision: states.at(-1)!.revision,
      from: 'i10',
      to: 'i9',
    });
    expect(st.ok).toBe(false);
    expect(st.error?.code).toBe('NOT_PLAYER');
  });

  it('3 人真实对弈各一步：轮转 a→b→c→a（SERVER-004）', async () => {
    const { seats } = await setupCheckers(3);
    for (const seat of seats) {
      const ack = await move(seat, OPENERS[seat.seat]);
      expect(ack.ok, `${seat.seat}: ${JSON.stringify(ack.error)}`).toBe(true);
    }
    const final = await seats[0].settled(3);
    expect(final.turn).toBe('a');
    expect(final.moves.length).toBe(3);
    expect(final.moves.map((m) => m.side)).toEqual(['a', 'b', 'c']);
  });
});

describe('跳棋联机 · 4/6 人关键流程（CHECKERS-004/020）', () => {
  it('4 人局：a→b→c→d 各走一步，轮转回到 a', async () => {
    const { seats } = await setupCheckers(4);
    expect(seats.map((x) => x.seat)).toEqual(['a', 'b', 'c', 'd']);
    for (const seat of seats) {
      const ack = await move(seat, OPENERS_4P[seat.seat]);
      expect(ack.ok, `${seat.seat}: ${JSON.stringify(ack.error)}`).toBe(true);
    }
    const final = await seats[0].settled(4);
    expect(final.turn).toBe('a');
    expect(final.moves.length).toBe(4);
    expect(final.moves.map((m) => m.side)).toEqual(['a', 'b', 'c', 'd']);
  });

  it('6 人局：a→f 各走一步，轮转回到 a；目标营地映射互为正对', async () => {
    const { seats } = await setupCheckers(6);
    for (const seat of seats) {
      const ack = await move(seat, OPENERS[seat.seat]);
      expect(ack.ok, `${seat.seat}: ${JSON.stringify(ack.error)}`).toBe(true);
    }
    const final = await seats[0].settled(6);
    expect(final.turn).toBe('a');
    expect(final.moves.map((m) => m.side)).toEqual(['a', 'b', 'c', 'd', 'e', 'f']);
    // SEAT_CAMP_MAPS[6] 全占用且目标正对（由引擎单测覆盖；此处验证房间层座位顺序）
    expect(final.seatOrder).toEqual(['a', 'b', 'c', 'd', 'e', 'f']);
  });
});

describe('跳棋联机 · 并发抢占（CHECKERS-017/SEC-004）', () => {
  it('同轮次两个客户端同时提交：恰好一个成功，另一个 NOT_YOUR_TURN/STALE', async () => {
    const { seats } = await setupCheckers(2);
    const [a, b] = seats;
    const st = await a.settled();
    // a、b 各自以本地视角同时提交 a 的着法——b 非本轮必被拒
    const [ra, rb] = await Promise.all([
      emitAck<MoveAck>(a.socket, 'game:move', { requestId: reqId(), revision: st.revision, ...OPENERS.a }),
      emitAck<MoveAck>(b.socket, 'game:move', { requestId: reqId(), revision: st.revision, ...OPENERS.a }),
    ]);
    expect(ra.ok !== rb.ok || ra.ok === false).toBe(true); // 不允许双双成功
    if (ra.ok) {
      expect(rb.ok).toBe(false);
      expect(['NOT_YOUR_TURN', 'STALE_REVISION']).toContain(rb.error?.code);
    } else {
      expect(ra.error?.code).toBe('NOT_YOUR_TURN');
      expect(rb.ok).toBe(true);
    }
    const after = await a.settled(1);
    expect(after.moves.length).toBe(1); // 不重复落谱
  });
});

describe('跳棋联机 · path 校验与幂等（SERVER-006~009/SEC-005/006）', () => {
  it('真实两段连跳 [e3,e5,g5] 被接受并广播完整 path（CHECKERS-027）', async () => {
    const { seats } = await setupCheckers(2);
    const [a, b] = seats;
    // 先造跳板：a f4→f5（六角区），2 人局 b 坐南营 → m14→m13
    expect((await move(a, OPENERS.a)).ok).toBe(true);
    expect((await move(b, OPENERS.d)).ok).toBe(true);
    // 连跳：e3(2,4) 越过 e4(3,4) 落 e5(4,4)，再越过 f5(4,5)（a 刚走的跳板）落 g5(4,6)
    const ack = await move(a, { from: 'e3', to: 'g5', path: ['e3', 'e5', 'g5'] });
    expect(ack.ok, JSON.stringify(ack.error)).toBe(true);
    const st = await a.settled(3);
    expect(st.lastMove?.path).toEqual(['e3', 'e5', 'g5']);
    expect(st.moves.length).toBe(3);
    // 广播到 b 的状态同样携带 path（MOVE-038 客户端恢复基础）
    const bst = await b.settled(3);
    expect(bst.lastMove?.path).toEqual(['e3', 'e5', 'g5']);
  });

  it('非法 path（途经被占格）被拒且局面不变（SEC-005/006）', async () => {
    const { seats } = await setupCheckers(2);
    const [a] = seats;
    const st = await a.settled();
    // path [e3,e4,e5]：第一段 e3→e4 落点被己方棋子占据，非跳跃非普通移动
    const bad = await emitAck<MoveAck>(a.socket, 'game:move', {
      requestId: reqId(),
      revision: st.revision,
      from: 'e3',
      to: 'e5',
      path: ['e3', 'e4', 'e5'],
    });
    expect(bad.ok).toBe(false);
    expect(bad.error?.code).toBe('ILLEGAL_MOVE');
    // 拒绝后仍是 a 的回合、棋谱为空
    const after = await a.settled();
    expect(after.moves.length).toBe(0);
    expect(after.turn).toBe('a');
  });

  it('requestId 幂等：同 ID 重放返回相同结果且不重复落谱（SERVER-008）', async () => {
    const { seats } = await setupCheckers(2);
    const [a] = seats;
    const id = reqId();
    const m1 = await emitAck<MoveAck>(a.socket, 'game:move', {
      requestId: id,
      revision: (await a.settled()).revision,
      ...OPENERS.a,
    });
    expect(m1.ok, JSON.stringify(m1.error)).toBe(true);
    const m2 = await emitAck<MoveAck>(a.socket, 'game:move', {
      requestId: id,
      revision: (await a.settled(1)).revision,
      ...OPENERS.a,
    });
    expect(m2.ok).toBe(true);
    expect(m2.revision).toBe(m1.revision);
    const st = await a.settled(1);
    expect(st.moves.length).toBe(1); // 没有重复落谱
  });
});

describe('跳棋联机 · 认输与重开（SERVER-010~012）', () => {
  it('3 人局一人认输后对局继续、轮转跳过退出者', async () => {
    const { seats } = await setupCheckers(3);
    const r = await emitAck<AckBase>(seats[1].socket, 'game:resign', {});
    expect(r.ok, JSON.stringify(r.error)).toBe(true);
    const st = await seats[0].settled();
    expect(st.outcome).toBeNull(); // 还有两人，对局继续
    expect(st.phase).toBe('playing');
    expect(st.seats.b).toBeDefined();
    // a 走一步后应轮到 c（b 已退出）
    const ack = await move(seats[0], OPENERS.a);
    expect(ack.ok, JSON.stringify(ack.error)).toBe(true);
    expect((await seats[0].settled(1)).turn).toBe('c');
  });

  it('3 人局两人认输后仅剩者获胜', async () => {
    const { seats } = await setupCheckers(3);
    await emitAck<AckBase>(seats[1].socket, 'game:resign', {});
    await emitAck<AckBase>(seats[2].socket, 'game:resign', {});
    const st = await seats[0].settled();
    expect(st.outcome?.type).toBe('resignation');
    expect(st.outcome?.winner).toBe('a');
    expect(st.phase).toBe('ended');
  });

  it('重开后局面回到初始、棋谱清空（SERVER-012）', async () => {
    const { seats } = await setupCheckers(2);
    const [a, b] = seats;
    expect((await move(a, OPENERS.a)).ok).toBe(true);
    expect((await a.settled(1)).moves.length).toBe(1);
    await emitAck<AckBase>(b.socket, 'game:restart:offer', {});
    await waitFor(() => a.states.at(-1)?.offers.restart != null);
    const done = await emitAck<AckBase>(a.socket, 'game:restart:respond', { accept: true });
    expect(done.ok).toBe(true);
    const st = await a.settled();
    expect(st.moves.length).toBe(0);
    expect(st.outcome).toBeNull();
    expect(st.phase).toBe('playing');
  });
});

describe('跳棋联机 · 持久化恢复（DATA-001~004）', () => {
  it('服务重启后：房间/棋谱(含 path)/座位会话恢复，rejoin 后可继续走棋', async () => {
    const dbPath = `${process.env.TEMP ?? '/tmp'}/dc-checkers-persist-${process.pid}-${Date.now()}.db`;
    const server = await startServer(dbPath);
    try {
      const host = connect(server.url);
      const statesA = collect(host);
      const ack = await emitAck<CreateAck>(host, 'room:create', { kind: 'checkers', seatCount: 2, name: '甲' });
      expect(ack.ok).toBe(true);
      const guest = connect(server.url);
      const statesB = collect(guest);
      const j = await emitAck<JoinAck>(guest, 'room:join', { roomId: ack.roomId!, name: '乙' });
      expect(j.ok).toBe(true);
      // 等双方都收到全员就位（playing）广播
      await waitFor(
        () => statesA.at(-1)?.phase === 'playing' && statesB.at(-1)?.phase === 'playing',
      );
      // 三步：a 造跳板 → b 应步 → a 两段连跳（path 落库）
      const m1 = await emitMoveRetry(host, statesA.at(-1)!.revision, OPENERS.a);
      expect(m1.ok, JSON.stringify(m1.error)).toBe(true);
      await waitFor(() => (statesB.at(-1)?.moves.length ?? 0) >= 1);
      const m2 = await emitMoveRetry(guest, statesB.at(-1)!.revision, OPENERS.d);
      expect(m2.ok, JSON.stringify(m2.error)).toBe(true);
      await waitFor(() => (statesA.at(-1)?.moves.length ?? 0) >= 2);
      const mv = await emitMoveRetry(host, statesA.at(-1)!.revision, {
        from: 'e3',
        to: 'g5',
        path: ['e3', 'e5', 'g5'],
      });
      expect(mv.ok, JSON.stringify(mv.error)).toBe(true);
      await waitFor(() => (statesA.at(-1)?.moves.length ?? 0) >= 3);
      expect(statesA.at(-1)!.moves[2].path).toEqual(['e3', 'e5', 'g5']);
      const roomId = ack.roomId!;
      const tokenA = ack.token!;
      const tokenB = j.token!;
      const movesCount = statesA.at(-1)!.moves.length;
      await stopServer(server);

      // 重启：同一路径数据库 + loadPersisted
      const server2 = await startServer(dbPath);
      try {
        expect(server2.rooms.get(roomId)).toBeDefined();
        const reA = connect(server2.url);
        const reB = connect(server2.url);
        // collect 必须先于 rejoin 注册：reconnect 广播与 ack 背靠背到达
        const statesA2 = collect(reA);
        const statesB2 = collect(reB);
        const ra = await emitAck<JoinAck>(reA, 'room:rejoin', { roomId, token: tokenA });
        const rb = await emitAck<JoinAck>(reB, 'room:rejoin', { roomId, token: tokenB });
        expect(ra.ok, JSON.stringify(ra.error)).toBe(true);
        expect(rb.ok, JSON.stringify(rb.error)).toBe(true);
        expect(ra.seat).toBe('a');
        expect(rb.seat).toBe('b');
        expect(ra.state?.moves.length).toBe(movesCount);
        expect(ra.state?.moves[2].path).toEqual(['e3', 'e5', 'g5']);
        // 轮到 b：恢复后可继续走棋
        await waitFor(() => statesB2.length > 0);
        const next = await emitMoveRetry(reB, statesB2.at(-1)!.revision, OPENER_D2);
        expect(next.ok, JSON.stringify(next.error)).toBe(true);
        expect(statesB2.at(-1)!.moves.length).toBe(movesCount + 1);
      } finally {
        await stopServer(server2);
      }
    } catch (e) {
      await stopServer(server).catch(() => {});
      throw e;
    }
  });
});
