import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createServer } from 'http';
import { rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { Server } from 'socket.io';
import { io as ioClient, type Socket as ClientSocket } from 'socket.io-client';
import { createHttpApp } from '../../src/server/http';
import { RoomManager } from '../../src/server/rooms';
import { setupSocket } from '../../src/server/socket';
import { Store } from '../../src/server/store';
import { START_FEN } from '../../src/games/xiangqi/engine';
import type { AckBase, CreateAck, JoinAck, MoveAck, RoomState } from '../../src/shared/protocol';

interface TestServer {
  httpServer: ReturnType<typeof createServer>;
  io: Server;
  rooms: RoomManager;
  store: Store;
  url: string;
}

let dbCounter = 0;

async function startServer(dbPath?: string): Promise<TestServer> {
  const store = new Store(dbPath ?? join(tmpdir(), `dual-chess-test-${Date.now()}-${dbCounter++}.db`));
  const rooms = new RoomManager(store);
  rooms.loadPersisted();
  const app = createHttpApp(join(tmpdir(), 'dual-chess-no-dist'));
  const httpServer = createServer(app);
  const io = new Server(httpServer, { cors: { origin: false } });
  setupSocket(io, rooms);
  await new Promise<void>((resolve) => httpServer.listen(0, '127.0.0.1', resolve));
  const addr = httpServer.address();
  const port = typeof addr === 'object' && addr ? addr.port : 0;
  return { httpServer, io, rooms, store, url: `http://127.0.0.1:${port}` };
}

function stopServer(s: TestServer): Promise<void> {
  return new Promise((resolve) => {
    s.io.close(() => {
      s.httpServer.close(() => {
        s.store.close();
        resolve();
      });
    });
    setTimeout(() => resolve(), 2000).unref?.();
  });
}

type Client = ClientSocket;

function connect(url: string): Client {
  return ioClient(url, { transports: ['websocket'], forceNew: true });
}

function emitAck<T>(socket: Client, event: string, payload: unknown): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`ack 超时: ${event}`)), 5000);
    socket.emit(event as never, payload as never, ((r: T) => {
      clearTimeout(timer);
      resolve(r);
    }) as never);
  });
}

/** 收集该 socket 收到的所有权威状态快照 */
function collect(socket: Client): RoomState[] {
  const out: RoomState[] = [];
  socket.on('room:state', (p) => out.push(p.state));
  return out;
}

function waitFor(cond: () => boolean, timeout = 5000): Promise<void> {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const tick = () => {
      if (cond()) return resolve();
      if (Date.now() - start > timeout) return reject(new Error('waitFor 条件超时'));
      setTimeout(tick, 20);
    };
    tick();
  });
}

async function makeRoom(s: TestServer, kind: 'xiangqi' | 'chess'): Promise<{ roomId: string; token: string; state: RoomState; playerA: Client }> {
  const playerA = connect(s.url);
  const ack = await emitAck<CreateAck>(playerA, 'room:create', { kind, name: '甲方' });
  expect(ack.ok).toBe(true);
  return { roomId: ack.roomId!, token: ack.token!, state: ack.state!, playerA };
}

async function joinAs(s: TestServer, roomId: string, name: string): Promise<{ ack: JoinAck; socket: Client }> {
  const socket = connect(s.url);
  const ack = await emitAck<JoinAck>(socket, 'room:join', { roomId, name });
  return { ack, socket };
}

let server: TestServer;

beforeAll(async () => {
  server = await startServer();
});

afterAll(async () => {
  await stopServer(server);
});

describe('联机 · 房间与席位', () => {
  it('创建房间：红方席位、waiting 状态、房间 ID 高熵格式', async () => {
    const { roomId, token, state, playerA } = await makeRoom(server, 'xiangqi');
    expect(roomId).toMatch(/^[a-z2-9]{10}$/);
    expect(token.length).toBeGreaterThanOrEqual(24);
    expect(state.seats.a?.name).toBe('甲方');
    expect(state.seats.b).toBeNull();
    expect(state.phase).toBe('waiting');
    expect(state.turn).toBe('a');
    expect(state.revision).toBe(1);
    playerA.disconnect();
  });

  it('第二人加入：黑方席位，phase → playing；广播一致', async () => {
    const { roomId, playerA } = await makeRoom(server, 'xiangqi');
    const statesA = collect(playerA);
    const { ack, socket } = await joinAs(server, roomId, '乙方');
    expect(ack.ok).toBe(true);
    expect(ack.seat).toBe('b');
    expect(ack.state?.phase).toBe('playing');
    await waitFor(() => statesA.some((s) => s.phase === 'playing'));
    const joined = statesA.find((s) => s.phase === 'playing')!;
    expect(joined.seats.b?.name).toBe('乙方');
    expect(joined.revision).toBe(2);
    socket.disconnect();
    playerA.disconnect();
  });

  it('第三人以观战者身份加入，不能走棋', async () => {
    const { roomId, playerA } = await makeRoom(server, 'xiangqi');
    const { socket: playerB } = await joinAs(server, roomId, '乙方');
    const { ack, socket: watcher } = await joinAs(server, roomId, '路人');
    expect(ack.seat).toBe('spectator');
    expect(ack.state?.spectators).toBe(1);
    const move = await emitAck<MoveAck>(watcher, 'game:move', {
      requestId: 'spectate01',
      revision: ack.state!.revision,
      from: 'h7',
      to: 'e7',
    });
    expect(move.ok).toBe(false);
    expect(move.error?.code).toBe('NOT_PLAYER');
    expect(move.state?.moves.length).toBe(0);
    watcher.disconnect();
    playerB.disconnect();
    playerA.disconnect();
  });

  it('房间不存在时加入失败', async () => {
    const socket = connect(server.url);
    const ack = await emitAck<JoinAck>(socket, 'room:join', { roomId: 'zzzzzzzzzz' });
    expect(ack.ok).toBe(false);
    expect(ack.error?.code).toBe('ROOM_NOT_FOUND');
    socket.disconnect();
  });

  it('建房限流：快速连建 3 个房间，第 3 个被拒绝', async () => {
    const s1 = connect(server.url);
    const r1 = await emitAck<CreateAck>(s1, 'room:create', { kind: 'xiangqi' });
    const r2 = await emitAck<CreateAck>(s1, 'room:create', { kind: 'xiangqi' });
    const r3 = await emitAck<CreateAck>(s1, 'room:create', { kind: 'xiangqi' });
    expect(r1.ok).toBe(true);
    expect(r2.ok).toBe(true);
    expect(r3.ok).toBe(false);
    expect(r3.error?.code).toBe('RATE_LIMITED');
    s1.disconnect();
  });
});

describe('联机 · 走棋协议（中国象棋）', () => {
  it('合法走棋：双方收到一致局面、记谱正确、revision 递增', async () => {
    const { roomId, playerA } = await makeRoom(server, 'xiangqi');
    const { socket: playerB } = await joinAs(server, roomId, '乙方');
    const statesA = collect(playerA);
    const statesB = collect(playerB);
    const ack = await emitAck<MoveAck>(playerA, 'game:move', {
      requestId: 'move-0001',
      revision: 2,
      from: 'h7',
      to: 'e7',
    });
    expect(ack.ok).toBe(true);
    expect(ack.revision).toBe(3);
    expect(ack.state?.moves.length).toBe(1);
    expect(ack.state?.moves[0].notation).toBe('炮二平五');
    expect(ack.state?.turn).toBe('b');
    await waitFor(() => statesA.some((s) => s.moves.length === 1) && statesB.some((s) => s.moves.length === 1));
    const lastA = statesA.filter((s) => s.moves.length === 1).at(-1)!;
    const lastB = statesB.filter((s) => s.moves.length === 1).at(-1)!;
    expect(lastA.revision).toBe(lastB.revision);
    expect(lastA.fen).toBe(lastB.fen);
    expect(lastA.moves[0].notation).toBe('炮二平五');
    playerB.disconnect();
    playerA.disconnect();
  });

  it('非法走棋被拒：局面不变', async () => {
    const { roomId, playerA } = await makeRoom(server, 'xiangqi');
    const { socket: playerB } = await joinAs(server, roomId, '乙方');
    const ack = await emitAck<MoveAck>(playerA, 'game:move', {
      requestId: 'move-illegal',
      revision: 2,
      from: 'h7',
      to: 'h1',
    });
    expect(ack.ok).toBe(false);
    expect(ack.error?.code).toBe('ILLEGAL_MOVE');
    expect(ack.state?.revision).toBe(2);
    expect(ack.state?.moves.length).toBe(0);
    expect(server.rooms.get(roomId)!.moves.length).toBe(0);
    playerB.disconnect();
    playerA.disconnect();
  });

  it('轮次限制：黑方先走被拒', async () => {
    const { roomId, playerA } = await makeRoom(server, 'xiangqi');
    const { socket: playerB } = await joinAs(server, roomId, '乙方');
    const ack = await emitAck<MoveAck>(playerB, 'game:move', {
      requestId: 'move-noturn',
      revision: 2,
      from: 'h0',
      to: 'g2',
    });
    expect(ack.ok).toBe(false);
    expect(ack.error?.code).toBe('NOT_YOUR_TURN');
    playerB.disconnect();
    playerA.disconnect();
  });

  it('幂等：同一 requestId 重复提交不产生第二步', async () => {
    const { roomId, playerA } = await makeRoom(server, 'xiangqi');
    const { socket: playerB } = await joinAs(server, roomId, '乙方');
    const p1 = { requestId: 'move-dup-1', revision: 2, from: 'h7', to: 'e7' };
    const ack1 = await emitAck<MoveAck>(playerA, 'game:move', p1);
    const ack2 = await emitAck<MoveAck>(playerA, 'game:move', p1);
    expect(ack1.ok).toBe(true);
    expect(ack2.ok).toBe(true);
    expect(ack2.revision).toBe(ack1.revision);
    expect(ack2.state?.moves.length).toBe(1);
    expect(server.rooms.get(roomId)!.moves.length).toBe(1);
    playerB.disconnect();
    playerA.disconnect();
  });

  it('过期 revision 被拒并返回最新局面', async () => {
    const { roomId, playerA } = await makeRoom(server, 'xiangqi');
    const { socket: playerB } = await joinAs(server, roomId, '乙方');
    const okMove = await emitAck<MoveAck>(playerA, 'game:move', { requestId: 'move-rev-1', revision: 2, from: 'h7', to: 'e7' });
    expect(okMove.ok).toBe(true);
    // 轮到黑方，但带过期 revision（2），应拒绝并附最新局面
    const stale = await emitAck<MoveAck>(playerB, 'game:move', {
      requestId: 'move-rev-2',
      revision: 2,
      from: 'h0',
      to: 'g2',
    });
    expect(stale.ok).toBe(false);
    expect(stale.error?.code).toBe('STALE_REVISION');
    expect(stale.state?.revision).toBe(3);
    expect(server.rooms.get(roomId)!.moves.length).toBe(1);
    playerB.disconnect();
    playerA.disconnect();
  });

  it('走法参数校验：畸形输入被拒', async () => {
    const { roomId, playerA } = await makeRoom(server, 'xiangqi');
    const { socket: playerB } = await joinAs(server, roomId, '乙方');
    const ack = await emitAck<MoveAck>(playerA, 'game:move', {
      requestId: 'xxxxxxxx',
      revision: 2,
      from: 'z9',
      to: 'e7',
    });
    expect(ack.ok).toBe(false);
    expect(ack.error?.code).toBe('INVALID_INPUT');
    playerB.disconnect();
    playerA.disconnect();
  });
});

describe('联机 · 国际象棋走棋与升变', () => {
  it('完整小流程：e4 e5 Nf3，SAN 正确', async () => {
    const { roomId, playerA } = await makeRoom(server, 'chess');
    const { socket: playerB } = await joinAs(server, roomId, '乙方');
    const r1 = await emitAck<MoveAck>(playerA, 'game:move', { requestId: 'chess0001', revision: 2, from: 'e2', to: 'e4' });
    expect(r1.ok).toBe(true);
    const r2 = await emitAck<MoveAck>(playerB, 'game:move', { requestId: 'chess0002', revision: 3, from: 'e7', to: 'e5' });
    expect(r2.ok).toBe(true);
    const r3 = await emitAck<MoveAck>(playerA, 'game:move', { requestId: 'chess0003', revision: 4, from: 'g1', to: 'f3' });
    expect(r3.ok).toBe(true);
    const state = r3.state!;
    expect(state.moves.map((m) => m.notation)).toEqual(['e4', 'e5', 'Nf3']);
    expect(state.turn).toBe('b');
    playerB.disconnect();
    playerA.disconnect();
  });

  it('升变走法带 promotion 字段并校验', async () => {
    const { roomId, playerA } = await makeRoom(server, 'chess');
    const { socket: playerB } = await joinAs(server, roomId, '乙方');
    // 兵链：a4 / b5 → axb5 / a6 → bxa6 / Nf6 → a7 / h6 → a7xb8=Q
    const seq: Array<[string, string, string]> = [
      ['chessp001', 'a2', 'a4'],
      ['chessp002', 'b7', 'b5'],
      ['chessp003', 'a4', 'b5'],
      ['chessp004', 'a7', 'a6'],
      ['chessp005', 'b5', 'a6'],
      ['chessp006', 'g8', 'f6'],
      ['chessp007', 'a6', 'a7'],
      ['chessp008', 'h7', 'h6'],
      ['chessp009', 'a7', 'b8'],
    ];
    let rev = 2;
    let last: MoveAck | null = null;
    for (let i = 0; i < seq.length; i++) {
      const [requestId, from, to] = seq[i];
      const socket = i % 2 === 0 ? playerA : playerB;
      last = await emitAck<MoveAck>(socket, 'game:move', { requestId, revision: rev++, from, to });
      if (i < seq.length - 1) {
        expect(last.ok, `第 ${i + 1} 步应成功`).toBe(true);
      }
    }
    // 最后一步 a7xb8 无 promotion → 非法（升变必须选子）
    expect(last?.ok).toBe(false);
    expect(last?.error?.code).toBe('ILLEGAL_MOVE');
    // 带 promotion 合法（失败不递增 revision，从 ack 里取当前值）
    const okMove = await emitAck<MoveAck>(playerA, 'game:move', {
      requestId: 'chessp010',
      revision: last?.state?.revision ?? rev,
      from: 'a7',
      to: 'b8',
      promotion: 'q',
    });
    expect(okMove.ok).toBe(true);
    expect(okMove.state?.moves.at(-1)?.notation).toBe('axb8=Q');
    playerB.disconnect();
    playerA.disconnect();
  });
});

describe('联机 · 断线重连与持久化', () => {
  it('断线后重连：凭令牌恢复席位与局面，陌生人不能抢座', async () => {
    const { roomId, playerA } = await makeRoom(server, 'xiangqi');
    const { ack: joinAck, socket: playerB } = await joinAs(server, roomId, '乙方');
    expect(joinAck.ok).toBe(true);
    const tokenB = joinAck.token!;
    const okMove = await emitAck<MoveAck>(playerA, 'game:move', { requestId: 'reconn0001', revision: 2, from: 'h7', to: 'e7' });
    expect(okMove.ok).toBe(true);
    // 模拟黑方断线
    playerB.disconnect();
    await new Promise((r) => setTimeout(r, 200));
    const left = server.rooms.get(roomId)!;
    expect(left.seats.b).not.toBeNull(); // 席位仍保留
    expect(left.seats.b?.socketId).toBeNull(); // 连接已断开
    // 陌生人无法抢座
    const stranger = await joinAs(server, roomId, '路人');
    expect(stranger.ack.seat).toBe('spectator');
    stranger.socket.disconnect();
    // 黑方凭令牌重连并继续走棋
    const back = connect(server.url);
    const rejoin = await emitAck<JoinAck>(back, 'room:rejoin', { roomId, token: tokenB });
    expect(rejoin.ok).toBe(true);
    expect(rejoin.seat).toBe('b');
    expect(rejoin.state?.moves.length).toBe(1);
    expect(rejoin.state?.seats.b?.connected).toBe(true);
    const mv = await emitAck<MoveAck>(back, 'game:move', { requestId: 'reconn0002', revision: 3, from: 'h0', to: 'g2' });
    expect(mv.ok).toBe(true);
    expect(mv.state?.moves.length).toBe(2);
    expect(mv.state?.moves[1].notation).toBe('马8进7');
    back.disconnect();
    playerA.disconnect();
  });

  it('令牌错误时 rejoin 失败', async () => {
    const { roomId, playerA } = await makeRoom(server, 'xiangqi');
    const bad = connect(server.url);
    const ack = await emitAck<JoinAck>(bad, 'room:rejoin', { roomId, token: 'invalid-token-abcdefghijklmnop' });
    expect(ack.ok).toBe(false);
    expect(ack.error?.code).toBe('SESSION_INVALID');
    bad.disconnect();
    playerA.disconnect();
  });

  it('服务重启后房间、棋谱与会话均恢复', async () => {
    const dbPath = join(tmpdir(), `dual-chess-restart-${Date.now()}.db`);
    const s1 = await startServer(dbPath);
    const room = await makeRoom(s1, 'xiangqi');
    const b = await joinAs(s1, room.roomId, '乙方');
    expect(b.ack.ok).toBe(true);
    const okMove = await emitAck<MoveAck>(room.playerA, 'game:move', { requestId: 'restart0001', revision: 2, from: 'h7', to: 'e7' });
    expect(okMove.ok).toBe(true);
    const tokenA = room.token;
    room.playerA.disconnect();
    b.socket.disconnect();
    await stopServer(s1);

    // 重启
    const s2 = await startServer(dbPath);
    expect(s2.rooms.get(room.roomId)).toBeTruthy();
    const restored = s2.rooms.get(room.roomId)!;
    expect(restored.moves.length).toBe(1);
    expect(restored.moves[0].notation).toBe('炮二平五');
    expect(restored.seats.a?.name).toBe('甲方');
    expect(restored.seats.a?.socketId).toBeNull();
    // 凭原令牌重连成功
    const again = connect(s2.url);
    const rejoin = await emitAck<JoinAck>(again, 'room:rejoin', { roomId: room.roomId, token: tokenA });
    expect(rejoin.ok).toBe(true);
    expect(rejoin.seat).toBe('a');
    expect(rejoin.state?.moves.length).toBe(1);
    // 轮到黑方，红方走棋被拒
    const mv = await emitAck<MoveAck>(again, 'game:move', { requestId: 'restart0002', revision: 3, from: 'b7', to: 'e7' });
    expect(mv.error?.code).toBe('NOT_YOUR_TURN');
    again.disconnect();
    await stopServer(s2);
    rmSync(dbPath, { force: true });
  });
});

describe('联机 · 认输 / 提和 / 悔棋 / 重开', () => {
  it('认输：对方胜利，对局结束，不能再走棋', async () => {
    const { roomId, playerA } = await makeRoom(server, 'xiangqi');
    const { socket: playerB } = await joinAs(server, roomId, '乙方');
    const resign = await emitAck<AckBase>(playerA, 'game:resign', {});
    expect(resign.ok).toBe(true);
    expect(resign.state?.outcome).toEqual({ type: 'resignation', winner: 'b', reason: '红方/白方认输' });
    expect(resign.state?.phase).toBe('ended');
    const mv = await emitAck<MoveAck>(playerA, 'game:move', { requestId: 'resign0001', revision: resign.state!.revision, from: 'h7', to: 'e7' });
    expect(mv.ok).toBe(false);
    expect(mv.error?.code).toBe('GAME_ENDED');
    playerB.disconnect();
    playerA.disconnect();
  });

  it('提和 → 对方同意 → 和棋', async () => {
    const { roomId, playerA } = await makeRoom(server, 'xiangqi');
    const { socket: playerB } = await joinAs(server, roomId, '乙方');
    const offer = await emitAck<AckBase>(playerA, 'game:draw:offer', {});
    expect(offer.ok).toBe(true);
    expect(offer.state?.offers.draw).toBe('a');
    const accept = await emitAck<AckBase>(playerB, 'game:draw:respond', { accept: true });
    expect(accept.ok).toBe(true);
    expect(accept.state?.outcome).toEqual({ type: 'agreement', winner: null, reason: '双方同意和棋' });
    playerB.disconnect();
    playerA.disconnect();
  });

  it('悔棋：请求 → 同意 → 回退两步并恢复对局', async () => {
    const { roomId, playerA } = await makeRoom(server, 'xiangqi');
    const { socket: playerB } = await joinAs(server, roomId, '乙方');
    const m1 = await emitAck<MoveAck>(playerA, 'game:move', { requestId: 'undomove01', revision: 2, from: 'h7', to: 'e7' });
    expect(m1.ok).toBe(true);
    const m2 = await emitAck<MoveAck>(playerB, 'game:move', { requestId: 'undomove02', revision: 3, from: 'h0', to: 'g2' });
    expect(m2.ok).toBe(true);
    // 轮到红方，请求悔棋 → 应回退 2 步（自己的炮二平五 + 对方马8进7）
    const offer = await emitAck<AckBase>(playerA, 'game:undo:offer', {});
    expect(offer.ok).toBe(true);
    expect(offer.state?.offers.undo).toEqual({ by: 'a', plies: 2 });
    const accept = await emitAck<AckBase>(playerB, 'game:undo:respond', { accept: true });
    expect(accept.ok).toBe(true);
    expect(accept.state?.moves.length).toBe(0);
    expect(accept.state?.turn).toBe('a');
    expect(accept.state?.revision).toBeGreaterThan(4);
    expect(server.store.loadMoves(roomId).length).toBe(0);
    playerB.disconnect();
    playerA.disconnect();
  });

  it('重开：双方同意后回到初始局面', async () => {
    const { roomId, playerA } = await makeRoom(server, 'xiangqi');
    const { socket: playerB } = await joinAs(server, roomId, '乙方');
    const m1 = await emitAck<MoveAck>(playerA, 'game:move', { requestId: 'restartmv1', revision: 2, from: 'h7', to: 'e7' });
    expect(m1.ok).toBe(true);
    const offer = await emitAck<AckBase>(playerB, 'game:restart:offer', {});
    expect(offer.ok).toBe(true);
    expect(offer.state?.offers.restart).toBe('b');
    const accept = await emitAck<AckBase>(playerA, 'game:restart:respond', { accept: true });
    expect(accept.ok).toBe(true);
    expect(accept.state?.moves.length).toBe(0);
    expect(accept.state?.phase).toBe('playing');
    expect(accept.state?.fen).toBe(START_FEN);
    playerB.disconnect();
    playerA.disconnect();
  });

  it('聊天：双方收到消息，内容被校验', async () => {
    const { roomId, playerA } = await makeRoom(server, 'xiangqi');
    const { socket: playerB } = await joinAs(server, roomId, '乙方');
    const gotB = new Promise<string>((resolve) => {
      playerB.once('chat:message', (m) => resolve(m.text));
    });
    const ok = await emitAck<AckBase>(playerA, 'chat:send', { text: '你好，请多指教' });
    expect(ok.ok).toBe(true);
    expect(await gotB).toBe('你好，请多指教');
    const bad = await emitAck<AckBase>(playerA, 'chat:send', { text: '' });
    expect(bad.ok).toBe(false);
    expect(bad.error?.code).toBe('INVALID_INPUT');
    playerB.disconnect();
    playerA.disconnect();
  });
});
