/** UNO 联机集成：3 人经典局完整完成、4 人 Teams 完整完成、隐藏手牌脱敏、幂等/过期。 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Socket as ClientSocket } from 'socket.io-client';
import { connectUnoBot } from './uno-bot';
import {
  connect,
  emitAck,
  startServer,
  stopServer,
  waitFor,
  type CreateAck,
  type JoinAck,
  type TestServer,
} from './helpers';

let s: TestServer;
let seq = 0;
const cid = () => `uit-${Date.now().toString(36)}-${++seq}`;

beforeAll(async () => {
  s = await startServer();
});
afterAll(async () => {
  await stopServer(s);
});

interface UnoView {
  revision: number;
  phase: string;
  turn: string;
  winner: string | null;
  myHand: string[];
  players: Array<{ id: string; team: string | null; handCount: number; ready: boolean }>;
  pending: { kind: string; playerId?: string } | null;
}

function collectUno(sock: ClientSocket): { views: UnoView[]; latest: () => UnoView | null } {
  const views: UnoView[] = [];
  sock.on('uno:state', (p: { view: UnoView }) => views.push(p.view));
  return { views, latest: () => views.at(-1) ?? null };
}

function unoCommand(sock: ClientSocket, action: Record<string, unknown>, expectedRevision: number | null): Promise<{ ok: boolean; error?: { code: string; message: string } }> {
  return new Promise((resolve) => {
    sock.emit('uno:command', { commandId: cid(), expectedRevision, action }, (r: { ok: boolean; error?: { code: string; message: string } }) => resolve(r));
  });
}

async function setupUnoRoom(playerCount: 3 | 4) {
  const host = connect(s.url);
  const ack = await emitAck<CreateAck>(host, 'room:create', { kind: 'uno', seatCount: playerCount, name: '甲' });
  expect(ack.ok, JSON.stringify(ack.error)).toBe(true);
  const sockets: ClientSocket[] = [host];
  const monitors = [collectUno(host)];
  for (let i = 1; i < playerCount; i++) {
    const sock = connect(s.url);
    const j = await emitAck<JoinAck>(sock, 'room:join', { roomId: ack.roomId!, name: `p${i}` });
    expect(j.ok).toBe(true);
    sockets.push(sock);
    monitors.push(collectUno(sock));
  }
  return { roomId: ack.roomId!, sockets, monitors };
}

describe('UNO 房间流程', () => {
  it('3 人经典局：全部 ready 自动开局；隐藏手牌脱敏；完成整轮', async () => {
    const { sockets, monitors } = await setupUnoRoom(3);
    const bots = sockets.map((sock, i) => connectUnoBot(s.url, ['a', 'b', 'c'][i], sock));
    for (let i = 0; i < 3; i++) await unoCommand(sockets[i], { type: 'ready', ready: true }, null);
    await waitFor(() => bots.every((b) => (b.views.at(-1) as UnoView | null)?.phase === 'playing'), 8000);
    // 脱敏：他人手牌内容绝不出现
    for (let i = 0; i < 3; i++) {
      const v = monitors[i].latest()!;
      const json = JSON.stringify(v);
      for (let k = 0; k < 3; k++) {
        if (k === i) continue;
        for (const cardId of monitors[k].latest()!.myHand) {
          expect(json.includes(`"${cardId}"`), `${i} 泄露 ${k} 的 ${cardId}`).toBe(false);
        }
      }
    }
    // 机器人完成整轮
    try {
      await Promise.race([
        Promise.all(bots.map((b) => b.run(30000))),
        new Promise((_, rej) => setTimeout(() => rej(new Error('整轮超时')), 400000)),
      ]);
    } catch (e) {
      const last = bots.map((b) => ({ seat: b.seat, cmds: b.commands, reject: b.lastReject, v: b.views.at(-1) }));
      throw new Error('整轮超时：' + JSON.stringify(last).slice(0, 2200));
    }
    const fin = bots.map((b) => b.views.at(-1) as UnoView);
    expect(fin.some((v) => v.winner != null)).toBe(true);
    for (const b of bots) b.stop();
  }, 420000);

  it('4 人 Teams：组队 → 全员 ready → 开局传牌 → 完成整轮（含队伍胜负或个人出完）', async () => {
    const { sockets, monitors } = await setupUnoRoom(4);
    // 组队 a,b=A c,d=B
    const bots = sockets.map((sock, i) => connectUnoBot(s.url, ['a', 'b', 'c', 'd'][i], sock));
    await unoCommand(sockets[0], { type: 'set-team', team: 'A' }, null);
    await unoCommand(sockets[1], { type: 'set-team', team: 'A' }, null);
    await unoCommand(sockets[2], { type: 'set-team', team: 'B' }, null);
    await unoCommand(sockets[3], { type: 'set-team', team: 'B' }, null);
    for (let i = 0; i < 4; i++) await unoCommand(sockets[i], { type: 'ready', ready: true }, null);
    await waitFor(() => bots.every((b) => (b.views.at(-1) as UnoView | null)?.phase === 'playing'), 8000);
    // 开局传牌窗口
    await waitFor(() => monitors[0].latest()!.pending?.kind === 'team-pass' || monitors[0].latest()!.teamPassDone === true, 8000);
    try {
      await Promise.race([
        Promise.all(bots.map((b) => b.run(40000))),
        new Promise((_, rej) => setTimeout(() => rej(new Error('整轮超时')), 240000)),
      ]);
    } catch (e) {
      const last = bots.map((b) => ({ seat: b.seat, cmds: b.commands, reject: b.lastReject, v: b.views.at(-1) }));
      throw new Error('整轮超时：' + JSON.stringify(last).slice(0, 2200));
    }
    const fin = bots.map((b) => b.views.at(-1) as UnoView);
    expect(fin.some((v) => v.winner != null)).toBe(true);
    for (const b of bots) b.stop();
  }, 420000);

  it('命令幂等与过期版本拒绝', async () => {
    const { sockets, monitors } = await setupUnoRoom(3);
    for (let i = 0; i < 3; i++) await unoCommand(sockets[i], { type: 'ready', ready: true }, null);
    await waitFor(() => (monitors[0].latest() as UnoView | null)?.phase === 'playing', 8000);
    const v = monitors[0].latest()!;
    const turnSeat = ['a', 'b', 'c'].indexOf(v.turn);
    const sock = sockets[turnSeat];
    // 过期
    const stale = await unoCommand(sock, { type: 'draw' }, v.revision - 1);
    expect(stale.ok).toBe(false);
    // 幂等
    const id = `uno-idem-${Date.now()}`;
    const send = () => new Promise<{ ok: boolean; revision?: number }>((res) => sock.emit('uno:command', { commandId: id, expectedRevision: v.revision, action: { type: 'draw' } }, (r: { ok: boolean; revision?: number }) => res(r)));
    const [r1, r2] = await Promise.all([send(), send()]);
    expect(r1.ok).toBe(true);
    expect(r2.ok).toBe(true);
    expect(r1.revision).toBe(r2.revision);
  });
});
