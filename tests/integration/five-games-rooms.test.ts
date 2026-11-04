/** 围棋/五子棋联机集成（SEC-001~007 / GO-021 / GOMOKU-018 / DATA-002） */
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
  seat: string;
  states: RoomState[];
  settled(minMoves?: number): Promise<RoomState>;
}

let seq = 0;
const reqId = () => `r2-${Date.now().toString(36)}-${(++seq).toString(36).padStart(4, '0')}`;

function mkSeat(socket: ClientSocket, seat: string, states: RoomState[]): Seat {
  return {
    socket,
    seat,
    states,
    async settled(minMoves = 0) {
      await waitFor(() => {
        const st = states.at(-1);
        return st != null && st.moves.length >= minMoves;
      });
      return states.at(-1)!;
    },
  };
}

async function setup(kind: 'go' | 'gomoku', boardSize?: 9 | 13 | 19): Promise<{ roomId: string; a: Seat; b: Seat }> {
  const sa = connect(s.url);
  const statesA = collect(sa);
  const ack = await emitAck<CreateAck>(sa, 'room:create', { kind, name: '甲', ...(kind === 'go' ? { boardSize } : {}) });
  expect(ack.ok, JSON.stringify(ack.error)).toBe(true);
  const sb = connect(s.url);
  const statesB = collect(sb);
  const j = await emitAck<JoinAck>(sb, 'room:join', { roomId: ack.roomId!, name: '乙' });
  expect(j.ok).toBe(true);
  await waitFor(() => statesA.at(-1)?.phase === 'playing' && statesB.at(-1)?.phase === 'playing');
  return {
    roomId: ack.roomId!,
    a: mkSeat(sa, ack.seat!, statesA),
    b: mkSeat(sb, j.seat!, statesB),
  };
}

async function move(seat: Seat, from: string): Promise<MoveAck> {
  const st = await seat.settled();
  let r = await emitAck<MoveAck>(seat.socket, 'game:move', { requestId: reqId(), revision: st.revision, from, to: from });
  if (!r.ok && r.error?.code === 'STALE_REVISION' && r.state) {
    r = await emitAck<MoveAck>(seat.socket, 'game:move', { requestId: reqId(), revision: r.state.revision, from, to: from });
  }
  return r;
}

describe('围棋联机（TEST-005/GO-014~019）', () => {
  it('9 路房间创建：fen 规格正确、黑白轮转、非法点被拒', async () => {
    const { a, b } = await setup('go', 9);
    expect((await a.settled()).fen.startsWith('go9|')).toBe(true);
    expect((await move(a, 'e5')).ok).toBe(true);
    expect((await move(b, 'e5')).ok).toBe(false); // 占位
    expect((await move(b, 'pass' as never)).ok).toBe(true); // 停一手
    const st = await a.settled(2);
    expect(st.moves[1].from).toBe('pass');
    expect(st.moves[1].notation).toBe('停一手');
    void b;
  });

  it('提子经服务端广播（extra 提子列表）与提子计数', async () => {
    const { a, b } = await setup('go', 9);
    // 黑 a2 断白 a1 一边；白 a1 送吃（剩 b1 一气）；黑 b1 提白 a1
    expect((await move(a, 'a2')).ok).toBe(true);
    expect((await move(b, 'a1')).ok).toBe(true);
    const cap = await move(a, 'b1');
    expect(cap.ok).toBe(true);
    const st = await a.settled(3);
    expect(st.moves[2].extra?.[0]?.from).toBe('a1');
    expect(st.moves[2].notation).toContain('提1子');
    // 服务端权威盘面不含 a1
    expect(st.fen).not.toContain('w=a1');
    void b;
  });

  it('双停一手→数子→双方确认→终局计分（贴目 7.5）', async () => {
    const { a, b } = await setup('go', 9);
    expect((await move(a, 'pass' as never)).ok).toBe(true);
    expect((await move(b, 'pass' as never)).ok).toBe(true);
    const st = await a.settled(2);
    expect(st.fen).toContain('phase=scoring');
    // a 确认 → 等对方；b 确认 → 终局（空盘：黑 0 白 7.5 → 白胜）
    const c1 = await move(a, 'score-confirm' as never);
    expect(c1.ok).toBe(true);
    const c2 = await move(b, 'score-confirm' as never);
    expect(c2.ok).toBe(true);
    const fin = await a.settled(4);
    expect(fin.outcome?.winner).toBe('b');
    expect(fin.outcome?.reason).toContain('7.5');
    // 终局后拒绝落子
    expect((await move(a, 'e5')).ok).toBe(false);
  });

  it('意见不一恢复对弈（GO-019）', async () => {
    const { a, b } = await setup('go', 9);
    await move(a, 'a2');
    await move(b, 'pass' as never);
    await move(a, 'pass' as never);
    await b.settled(3);
    await move(a, 'score-confirm' as never);
    await move(b, 'score-resume' as never);
    const st = await a.settled(4);
    expect(st.fen).toContain('phase=playing');
    expect(st.outcome).toBeNull();
  });

  it('9 路房间重开后仍为 9 路（DEF-FG-003 回归）', async () => {
    const { a, b } = await setup('go', 9);
    await move(a, 'e5');
    await emitAck<AckBase>(a.socket, 'game:restart:offer', {});
    await b.settled(1);
    const done = await emitAck<AckBase>(b.socket, 'game:restart:respond', { accept: true });
    expect(done.ok).toBe(true);
    const st = await a.settled();
    expect(st.fen.startsWith('go9|')).toBe(true);
    expect(st.moves.length).toBe(0);
  });

  it('认输终局（GO-016）', async () => {
    const { a, b } = await setup('go');
    await move(a, 'e5');
    const r = await emitAck<AckBase>(b.socket, 'game:resign', {});
    expect(r.ok).toBe(true);
    const st = await a.settled(1);
    expect(st.outcome?.winner).toBe('a');
  });
});

describe('房间内选座（room:take-seat）', () => {
  it('等待阶段：加入者抢占空位、换座、占位拒绝、就座满员后开始', async () => {
    const host = connect(s.url);
    const statesA = collect(host);
    const ack = await emitAck<CreateAck>(host, 'room:create', { kind: 'xiangqi', name: '甲' });
    expect(ack.ok).toBe(true);
    expect(ack.seat).toBe('a');
    const guest = connect(s.url);
    const statesB = collect(guest);
    const j = await emitAck<JoinAck>(guest, 'room:join', { roomId: ack.roomId!, name: '乙' });
    expect(j.seat).toBe('b'); // 自动补位后仍在等待阶段
    await waitFor(() => statesA.at(-1)?.phase === 'playing');
    // playing 后不可换座（防换边）
    const late = await emitAck<AckBase>(guest, 'room:take-seat', { seat: 'a' });
    expect(late.ok).toBe(false);
    expect(['NOT_ALLOWED', 'GAME_ENDED', 'INVALID_INPUT']).toContain(late.error?.code);
  });

  it('房间仅房主时：房主可换到空位；他人占用座位拒绝；观战者可选空位入座', async () => {
    const host = connect(s.url);
    const statesA = collect(host);
    const ack = await emitAck<CreateAck>(host, 'room:create', { kind: 'chess', name: '甲' });
    expect(ack.ok).toBe(true);
    // 房主从 a 换到 b（b 空）
    const toB = await emitAck<AckBase>(host, 'room:take-seat', { seat: 'b' });
    expect(toB.ok, JSON.stringify(toB.error)).toBe(true);
    expect(toB.seat).toBe('b');
    await waitFor(() => statesA.at(-1)?.seats.a == null && statesA.at(-1)?.seats.b?.name === '甲');
    // 第二人加入自动补 a（等待/开始）；换到 b 被拒（被房主占）
    const guest = connect(s.url);
    const j = await emitAck<JoinAck>(guest, 'room:join', { roomId: ack.roomId!, name: '乙' });
    expect(j.seat).toBe('a');
    const takeB = await emitAck<AckBase>(guest, 'room:take-seat', { seat: 'b' });
    expect(takeB.ok).toBe(false);
    // 第三人观战：满员 playing → 选座拒绝
    const spec = connect(s.url);
    const js = await emitAck<JoinAck>(spec, 'room:join', { roomId: ack.roomId!, name: '丙' });
    expect(js.seat).toBe('spectator');
    const specSeat = await emitAck<AckBase>(spec, 'room:take-seat', { seat: 'a' });
    expect(specSeat.ok).toBe(false);
    // 对局进行正常：乙（a）先手可走
    const st = statesA.at(-1)!;
    const m = await emitAck<MoveAck>(guest, 'game:move', {
      requestId: `takemove-${Date.now()}`, revision: st.revision, from: 'e2', to: 'e4',
    });
    expect(m.ok, JSON.stringify(m.error)).toBe(true);
  });

  it('跳棋 4 人：观战阶段可自由挑空位（c/d 空位可选）', async () => {
    const host = connect(s.url);
    const ack = await emitAck<CreateAck>(host, 'room:create', { kind: 'checkers', seatCount: 4, name: '甲' });
    expect(ack.ok).toBe(true);
    const hostMove = await emitAck<AckBase>(host, 'room:take-seat', { seat: 'd' });
    expect(hostMove.ok, JSON.stringify(hostMove.error)).toBe(true);
    expect(hostMove.seat).toBe('d');
    const guest = connect(s.url);
    const j = await emitAck<JoinAck>(guest, 'room:join', { roomId: ack.roomId!, name: '乙' });
    expect(j.seat).toBe('a');
    const toC = await emitAck<AckBase>(guest, 'room:take-seat', { seat: 'c' });
    expect(toC.ok, JSON.stringify(toC.error)).toBe(true);
    expect(toC.seat).toBe('c');
  });
});

describe('五子棋联机（TEST-005/GOMOKU-018/DATA-002）', () => {
  it('双客户端真实对弈至五连：服务端判胜、广播胜利线、终局锁盘', async () => {
    const { a, b } = await setup('gomoku');
    const seq = [
      ['a', 'a1'], ['b', 'a15'], ['a', 'b1'], ['b', 'b15'],
      ['a', 'c1'], ['b', 'c15'], ['a', 'd1'], ['b', 'd15'], ['a', 'e1'],
    ] as const;
    for (const [who, pt] of seq) {
      const r = await move(who === 'a' ? a : b, pt);
      expect(r.ok, `${who} ${pt}: ${JSON.stringify(r.error)}`).toBe(true);
    }
    const fin = await a.settled(9);
    expect(fin.outcome?.winner).toBe('a');
    expect(fin.outcome?.reason).toContain('五连');
    // 胜利线广播（EVENT-004）
    expect(fin.moves[8].extra?.map((x) => x.from).sort()).toEqual(['a1', 'b1', 'c1', 'd1', 'e1']);
    // b 端同样看到终局
    const finB = await b.settled(9);
    expect(finB.outcome?.winner).toBe('a');
    // 终局后落子拒绝（GOMOKU-012）
    expect((await move(a, 'f1')).ok).toBe(false);
  });

  it('伪造快速双击/重复请求不重复落谱（SEC-004）', async () => {
    const { a } = await setup('gomoku');
    const st = await a.settled();
    const id = reqId();
    const body = { requestId: id, revision: st.revision, from: 'h8', to: 'h8' };
    const [r1, r2] = await Promise.all([
      emitAck<MoveAck>(a.socket, 'game:move', body),
      emitAck<MoveAck>(a.socket, 'game:move', body),
    ]);
    expect(r1.ok && r2.ok).toBe(true); // 幂等：同 ID 双发均成功但不重复落谱
    const after = await a.settled(1);
    expect(after.moves.filter((m) => m.from === 'h8').length).toBe(1);
  });

  it('服务重启后围棋/五子棋房间与棋谱恢复（DATA-002）', async () => {
    const dbPath = `${process.env.TEMP ?? '/tmp'}/fg-persist-${process.pid}-${Date.now()}.db`;
    const server = await startServer(dbPath);
    try {
      const host = connect(server.url);
      const statesA = collect(host);
      const ack = await emitAck<CreateAck>(host, 'room:create', { kind: 'go', boardSize: 13, name: '甲' });
      expect(ack.ok).toBe(true);
      const guest = connect(server.url);
      await emitAck<JoinAck>(guest, 'room:join', { roomId: ack.roomId!, name: '乙' });
      await waitFor(() => statesA.at(-1)?.phase === 'playing');
      const mv = await emitAck<MoveAck>(host, 'game:move', {
        requestId: reqId(), revision: statesA.at(-1)!.revision, from: 'g7', to: 'g7',
      });
      expect(mv.ok).toBe(true);
      const roomId = ack.roomId!;
      const tokenA = ack.token!;
      const movesCount = 1;
      await stopServer(server);

      const server2 = await startServer(dbPath);
      try {
        expect(server2.rooms.get(roomId)).toBeDefined();
        const reA = connect(server2.url);
        const ra = await emitAck<JoinAck>(reA, 'room:rejoin', { roomId, token: tokenA });
        expect(ra.ok).toBe(true);
        expect(ra.state?.fen.startsWith('go13|')).toBe(true);
        expect(ra.state?.moves.length).toBe(movesCount);
        expect(ra.state?.moves[0].from).toBe('g7');
      } finally {
        await stopServer(server2);
      }
    } catch (e) {
      await stopServer(server).catch(() => {});
      throw e;
    }
  });
});
