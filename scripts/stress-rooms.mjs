/**
 * 多房间并发压力（阶段十 STRESS-001/003/004/005）：
 * 同时创建 N 个房间（五棋轮转），每房间 2 个真实客户端，持续走棋 D 秒，
 * 记录 ack 分位、服务端 queue/persist、错误与每房间手数。
 *
 * 用法：node scripts/stress-rooms.mjs --url http://127.0.0.1:3003 --rooms 8 --seconds 45
 */
import { io } from 'socket.io-client';
import { createEngine } from '../dist-server/games/index.js';
import { mkdirSync, writeFileSync } from 'node:fs';

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, cur, i, arr) => {
    if (cur.startsWith('--')) acc.push([cur.slice(2), arr[i + 1] && !arr[i + 1].startsWith('--') ? arr[i + 1] : 'true']);
    return acc;
  }, []),
);
const URL = args.url || 'http://127.0.0.1:3003';
const ROOMS = Number(args.rooms || 8);
const SECONDS = Number(args.seconds || 45);
const GAP = Number(args.gap || 60);
const OUT = args.out || 'docs/latency/raw/stress-rooms.json';
const KINDS = ['xiangqi', 'chess', 'checkers', 'go', 'gomoku'];

const now = () => performance.now();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let seq = 0;
const reqId = () => `st-${Date.now().toString(36)}-${(++seq).toString(36)}`;

function connect() {
  return io(URL, { transports: ['websocket'], reconnection: false, timeout: 15000, forceNew: true });
}
function emitAck(socket, event, payload, timeoutMs = 15000) {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve({ ok: false, error: { code: 'TIMEOUT' } }), timeoutMs);
    socket.emit(event, payload, (r) => {
      clearTimeout(timer);
      resolve(r ?? { ok: false, error: { code: 'EMPTY' } });
    });
  });
}
const POINTS = [];
for (const c of 'abcdefghijklmno') for (let r = 1; r <= 15; r++) POINTS.push(c + r);
function pickMove(kind, fen) {
  const eng = createEngine(kind, fen);
  if (kind === 'go') {
    const size = Number(/^go(\d+)\|/.exec(fen)?.[1] ?? 19);
    const cols = 'abcdefghijklmnopqrs'.slice(0, size);
    for (const c of cols) for (let r = 1; r <= size; r++) {
      const pt = c + r;
      if (eng.isLegal({ from: pt, to: pt })) return { from: pt, to: pt };
    }
    return { from: 'pass', to: 'pass' };
  }
  if (kind === 'gomoku') {
    for (const pt of POINTS) if (eng.isLegal({ from: pt, to: pt })) return { from: pt, to: pt };
    return null;
  }
  const moves = eng.legalMoves();
  if (!moves.length) return { from: 'pass', to: 'pass' };
  const m = moves.find((x) => !x.path) ?? moves[0];
  return { from: m.from, to: m.to, ...(m.promotion ? { promotion: m.promotion } : {}), ...(m.path ? { path: m.path } : {}) };
}

async function runRoom(idx) {
  const kind = KINDS[idx % KINDS.length];
  const a = connect();
  const b = connect();
  const st = { a: null, b: null };
  a.on('room:state', (p) => (st.a = p.state));
  b.on('room:state', (p) => (st.b = p.state));
  const ca = await emitAck(a, 'room:create', { kind, name: `甲${idx}`, ...(kind === 'checkers' ? { seatCount: 2 } : {}) });
  if (!ca.ok) return { idx, kind, error: 'create', detail: ca.error };
  const jb = await emitAck(b, 'room:join', { roomId: ca.roomId, name: `乙${idx}` });
  if (!jb.ok) return { idx, kind, error: 'join', detail: jb.error };
  if (kind === 'checkers') {
    const s1 = await emitAck(a, 'room:take-seat', { seat: 'a' });
    const s2 = await emitAck(b, 'room:take-seat', { seat: 'b' });
    if (!s1.ok || !s2.ok) return { idx, kind, error: 'seat', detail: s1.error ?? s2.error };
  }
  await sleep(150);
  const deadline = now() + SECONDS * 1000;
  const ackTimes = [];
  const queue = [];
  const persist = [];
  let moves = 0;
  let rejected = 0;
  let lastErr = null;
  let i = 0;
  while (now() < deadline) {
    const mover = i % 2 === 0 ? a : b;
    const stt = i % 2 === 0 ? st.a ?? ca.state : st.b ?? jb.state;
    if (!stt || stt.outcome) break;
    // 等双方都收到上一手（避免人为 revision 冲突）
    if (moves > 0) {
      const need = moves;
      const t0 = now();
      while ((st.a?.moves.length ?? 0) < need || (st.b?.moves.length ?? 0) < need) {
        if (now() - t0 > 5000) break;
        await sleep(8);
      }
    }
    const mv = pickMove(kind, stt.fen);
    if (!mv) break;
    const t0 = now();
    const ack = await emitAck(mover, 'game:move', { requestId: reqId(), revision: stt.revision, ...mv });
    ackTimes.push(now() - t0);
    if (!ack.ok) {
      rejected++;
      lastErr = ack.error?.code ?? 'ERR';
      if (ack.state) {
        if (i % 2 === 0) st.a = ack.state;
        else st.b = ack.state;
      }
      await sleep(30);
      i++;
      continue;
    }
    moves++;
    if (ack.serverTiming) {
      queue.push(ack.serverTiming.queueMs);
      persist.push(ack.serverTiming.persistMs);
    }
    if (i % 2 === 0) st.a = ack.state;
    else st.b = ack.state;
    i++;
    await sleep(GAP);
  }
  a.disconnect();
  b.disconnect();
  return { idx, kind, roomId: ca.roomId, moves, rejected, lastErr, ackTimes, queue, persist };
}

function pctl(v, p) {
  const s = [...v].sort((x, y) => x - y);
  return s.length ? Math.round(s[Math.min(s.length - 1, Math.ceil((p / 100) * s.length) - 1)] * 100) / 100 : null;
}
function sum(v) {
  return { n: v.length, p50: pctl(v, 50), p95: pctl(v, 95), p99: pctl(v, 99), max: v.length ? Math.max(...v) : null };
}

async function main() {
  const t0 = Date.now();
  const results = await Promise.all(Array.from({ length: ROOMS }, (_, i) => runRoom(i)));
  const ack = results.flatMap((r) => r.ackTimes ?? []);
  const queue = results.flatMap((r) => r.queue ?? []);
  const persist = results.flatMap((r) => r.persist ?? []);
  const out = {
    url: URL,
    rooms: ROOMS,
    seconds: SECONDS,
    gapMs: GAP,
    durationMs: Date.now() - t0,
    totalMoves: results.reduce((a, r) => a + (r.moves ?? 0), 0),
    totalRejected: results.reduce((a, r) => a + (r.rejected ?? 0), 0),
    ack: sum(ack),
    queue: sum(queue),
    persist: sum(persist),
    rooms_detail: results.map((r) => ({ idx: r.idx, kind: r.kind, moves: r.moves, rejected: r.rejected, lastErr: r.lastErr, error: r.error })),
    ranAt: new Date().toISOString(),
  };
  console.log(JSON.stringify(out, null, 2));
  mkdirSync(OUT.replace(/[\\/][^\\/]+$/, ''), { recursive: true });
  writeFileSync(OUT, JSON.stringify(out, null, 2));
  process.exit(0);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
