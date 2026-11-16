/**
 * 五棋延迟矩阵（阶段七）：每个棋种真实建房/加入/走棋，
 * 记录单手 ack（含服务端分项）与对手可见时间。
 *
 * 走法由本地权威引擎从服务端 fen 计算（不写死开局），确保各棋种都走真实合法着法。
 * 用法：node scripts/latency-five-games.mjs --url http://127.0.0.1:3001 --moves 6 --out docs/latency/raw/five-games-local.json
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
const URL = args.url || 'http://127.0.0.1:3001';
const MOVES = Number(args.moves || 6);
const OUT = args.out || 'docs/latency/raw/five-games.json';
const LABEL = args.label || 'local';

const now = () => performance.now();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let seq = 0;
const reqId = () => `fg-${Date.now().toString(36)}-${(++seq).toString(36)}`;

function connect() {
  return io(URL, { transports: ['websocket', 'polling'], reconnection: false, timeout: 15000, forceNew: true });
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
function waitFor(fn, ms = 20000) {
  return new Promise((resolve, reject) => {
    const t0 = now();
    const tick = () => {
      const v = fn();
      if (v) return resolve(v);
      if (now() - t0 > ms) return reject(new Error('waitFor timeout'));
      setTimeout(tick, 8);
    };
    tick();
  });
}
function pctl(v, p) {
  const s = [...v].sort((a, b) => a - b);
  return s.length ? Math.round(s[Math.min(s.length - 1, Math.ceil((p / 100) * s.length) - 1)] * 100) / 100 : null;
}
function summarize(v) {
  return { n: v.length, p50: pctl(v, 50), p95: pctl(v, 95), p99: pctl(v, 99), max: v.length ? Math.max(...v) : null };
}

const POINTS = [];
for (const c of 'abcdefghijklmno') for (let r = 1; r <= 15; r++) POINTS.push(c + r);
const GO_POINTS = (size) => {
  const cols = 'abcdefghijklmnopqrs'.slice(0, size);
  const out = [];
  for (const c of cols) for (let r = 1; r <= size; r++) out.push(c + r);
  return out;
};

function pickMove(kind, fen, turn) {
  const eng = createEngine(kind, fen);
  if (kind === 'go') {
    const size = Number(/^go(\d+)\|/.exec(fen)?.[1] ?? 19);
    for (const pt of GO_POINTS(size)) {
      if (eng.isLegal({ from: pt, to: pt })) return { from: pt, to: pt };
    }
    return { from: 'pass', to: 'pass' };
  }
  if (kind === 'gomoku') {
    for (const pt of POINTS) {
      if (eng.isLegal({ from: pt, to: pt })) return { from: pt, to: pt };
    }
    return null;
  }
  const moves = eng.legalMoves();
  if (!moves.length) return { from: 'pass', to: 'pass' };
  // 优先普通步，便于观察；跳棋优先单步（无 path）
  const normal = moves.find((m) => !m.path) ?? moves[0];
  return { from: normal.from, to: normal.to, ...(normal.promotion ? { promotion: normal.promotion } : {}), ...(normal.path ? { path: normal.path } : {}) };
  void turn;
}

async function play(kind, seatCount) {
  const a = connect();
  const b = connect();
  const states = { a: [], b: [] };
  a.on('room:state', (p) => states.a.push({ at: now(), state: p.state }));
  b.on('room:state', (p) => states.b.push({ at: now(), state: p.state }));
  const createAck = await emitAck(a, 'room:create', { kind, name: '甲', ...(kind === 'checkers' ? { seatCount } : {}) });
  if (!createAck.ok) throw new Error(`${kind} create: ${JSON.stringify(createAck.error)}`);
  const joinAck = await emitAck(b, 'room:join', { roomId: createAck.roomId, name: '乙' });
  if (!joinAck.ok) throw new Error(`${kind} join: ${JSON.stringify(joinAck.error)}`);
  if (kind === 'checkers') {
    const s1 = await emitAck(a, 'room:take-seat', { seat: 'a' });
    if (!s1.ok) throw new Error(`checkers seat a: ${JSON.stringify(s1.error)}`);
    const s2 = await emitAck(b, 'room:take-seat', { seat: 'b' });
    if (!s2.ok) throw new Error(`checkers seat b: ${JSON.stringify(s2.error)}`);
  }
  await sleep(200);

  const ackTimes = [];
  const peerTimes = [];
  const rows = [];
  let stateA = createAck.state;
  let stateB = joinAck.state;
  for (let i = 0; i < MOVES; i++) {
    const mover = i % 2 === 0 ? a : b;
    const peer = i % 2 === 0 ? b : a;
    stateA = states.a.at(-1)?.state ?? stateA;
    stateB = states.b.at(-1)?.state ?? stateB;
    const st = i % 2 === 0 ? stateA : stateB;
    if (!st) throw new Error(`${kind}: no state at move ${i}`);
    if (st.outcome) break;
    const mv = pickMove(kind, st.fen, st.turn);
    if (!mv) break;
    const beforePeer = states[i % 2 === 0 ? 'b' : 'a'].length;
    const t0 = now();
    let ack = await emitAck(mover, 'game:move', { requestId: reqId(), revision: st.revision, ...mv });
    if (!ack.ok && ack.error?.code === 'STALE_REVISION' && ack.state) {
      ack = await emitAck(mover, 'game:move', { requestId: reqId(), revision: ack.state.revision, ...mv });
    }
    const tAck = now();
    if (!ack.ok) {
      rows.push({ i, move: mv, error: ack.error?.code, msg: ack.error?.message });
      break;
    }
    if (i % 2 === 0) stateA = ack.state;
    else stateB = ack.state;
    const n = ack.state?.moves?.length ?? -1;
    let peerMs = null;
    try {
      const rec = await waitFor(() => states[i % 2 === 0 ? 'b' : 'a'].slice(beforePeer).find((x) => x.state.moves?.length === n));
      peerMs = rec.at - t0;
    } catch {
      rows.push({ i, move: mv, error: 'PEER_TIMEOUT' });
      break;
    }
    // 等双方都收到，避免下一次 revision 过期
    await waitFor(() => (states.a.at(-1)?.state.moves?.length ?? 0) >= n && (states.b.at(-1)?.state.moves?.length ?? 0) >= n);
    const ackMs = tAck - t0;
    ackTimes.push(ackMs);
    peerTimes.push(peerMs);
    rows.push({
      i,
      move: `${mv.from}${mv.to === mv.from ? '' : '→' + mv.to}`,
      ackMs: Math.round(ackMs * 100) / 100,
      peerMs: Math.round(peerMs * 100) / 100,
      payload: JSON.stringify(ack.state).length,
      serverTiming: ack.serverTiming ?? null,
    });
    await sleep(30);
  }
  a.disconnect();
  b.disconnect();
  const st = rows.filter((r) => r.serverTiming).map((r) => r.serverTiming);
  const avg = (k) => (st.length ? Math.round((st.reduce((x, y) => x + y[k], 0) / st.length) * 100) / 100 : null);
  return {
    kind,
    ack: summarize(ackTimes),
    peer: summarize(peerTimes),
    serverAvg: {
      queueMs: avg('queueMs'),
      validateMs: avg('validateMs'),
      applyMs: avg('applyMs'),
      persistMs: avg('persistMs'),
      stateMs: avg('stateMs'),
      broadcastMs: avg('broadcastMs'),
      totalMs: avg('totalMs'),
    },
    rows,
  };
}

async function main() {
  const result = { label: LABEL, url: URL, moves: MOVES, games: [], ranAt: new Date().toISOString() };
  for (const [kind, seatCount] of [['xiangqi', undefined], ['chess', undefined], ['checkers', 2], ['go', undefined], ['gomoku', undefined]]) {
    try {
      const r = await play(kind, seatCount);
      result.games.push(r);
      console.log(`[${kind}] ack p50=${r.ack.p50} p95=${r.ack.p95} peer p50=${r.peer.p50} server=${r.serverAvg.totalMs}`);
    } catch (e) {
      result.games.push({ kind, error: e.message });
      console.log(`[${kind}] FAILED: ${e.message}`);
    }
  }
  mkdirSync(OUT.replace(/[\\/][^\\/]+$/, ''), { recursive: true });
  writeFileSync(OUT, JSON.stringify(result, null, 2));
  console.log('saved', OUT);
  process.exit(0);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
