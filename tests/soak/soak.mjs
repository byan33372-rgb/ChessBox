/**
 * 30 分钟稳定性浸泡客户端（DATA-009/PERF-015）。
 * 循环执行：三棋建房 → 双客户端 → 脚本化走棋 + 非法请求（应拒） → 复盘读取 → B 重连 → 离开。
 * 记录每次操作的 ack 延迟与成败到 JSONL；不依赖任何内部函数，全部走真实 Socket 协议。
 * 用法：node tests/soak/soak.mjs <url> <durationMinutes> <outJsonl>
 */
import { io } from 'socket.io-client';
import { writeFileSync, appendFileSync } from 'fs';

const url = process.argv[2] ?? 'http://127.0.0.1:3200';
const minutes = Number(process.argv[3] ?? 30);
const out = process.argv[4] ?? '/tmp/soak.jsonl';
const deadline = Date.now() + minutes * 60_000;

const OPENERS = {
  xiangqi: [
    ['h7', 'e7'], ['h0', 'g2'], ['h7', 'e7'], ['i9', 'h9'],
    ['i9', 'i8'], ['b7', 'e7'], // 部分可能非法（局面推进后）——服务端拒绝也是有效样本
  ],
  chess: [
    ['e2', 'e4'], ['e7', 'e5'], ['g1', 'f3'], ['b8', 'c6'],
    ['f1', 'c4'], ['g8', 'f6'],
  ],
  checkers: [
    { from: 'f4', to: 'f5' }, { from: 'm14', to: 'm13' },
    { from: 'e3', to: 'g5', path: ['e3', 'e5', 'g5'] }, { from: 'k14', to: 'k13' },
  ],
  go: [
    { from: 'd4' }, { from: 'q16' }, { from: 'pass' }, { from: 'e5' },
  ],
  gomoku: [
    { from: 'h8' }, { from: 'i9' }, { from: 'h7' }, { from: 'j9' },
  ],
};

let seq = 0;
const stats = { cycles: 0, movesOk: 0, movesRejected: 0, reconnects: 0, errors: 0, latencies: [] };

function connect() {
  return io(url, { transports: ['websocket'], forceNew: true });
}
function emit(sock, event, payload) {
  return new Promise((resolve) => {
    const t0 = Date.now();
    const timer = setTimeout(() => resolve({ ok: false, timeout: true, latency: Date.now() - t0 }), 8000);
    sock.emit(event, payload, (r) => {
      clearTimeout(timer);
      resolve({ ...(r ?? { ok: false }), latency: Date.now() - t0 });
    });
  });
}
function collect(sock) {
  const states = [];
  sock.on('room:state', (p) => states.push(p.state));
  return states;
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function log(row) {
  appendFileSync(out, JSON.stringify(row) + '\n');
}

const KINDS = ['xiangqi', 'chess', 'checkers', 'go', 'gomoku'];
let kindIdx = 0;

while (Date.now() < deadline) {
  const kind = KINDS[kindIdx++ % KINDS.length];
  try {
    const A = connect();
    const created = await emit(A, 'room:create', { kind, name: `soakA${seq}`, ...(kind === 'checkers' ? { seatCount: 2 } : {}), ...(kind === 'go' ? { boardSize: 9 } : {}) });
    if (!created.ok) {
      // 建房限流（2 突发 + 每 5 s 补 1）是预期保护；退避后重试，不计错误
      if (created.error?.code === 'RATE_LIMITED') {
        A.disconnect();
        await sleep(3000);
        continue;
      }
      throw new Error(`create failed: ${JSON.stringify(created.error)}`);
    }
    if (kind === 'checkers') {
      // 自由选座：创建者/加入者先观战，各自 take-seat 后才开局
      await emit(A, 'room:take-seat', { seat: 'a' });
    }
    const seat = created.seat;
    const statesA = collect(A);
    const B = connect();
    const joined = await emit(B, 'room:join', { roomId: created.roomId, name: `soakB${seq}` });
    if (!joined.ok) throw new Error('join failed');
    if (kind === 'checkers') await emit(B, 'room:take-seat', { seat: 'b' });
    const statesB = collect(B);
    await sleep(300);

    const moves = OPENERS[kind];
    for (let i = 0; i < moves.length; i++) {
      const sock = i % 2 === 0 ? A : B;
      const states = i % 2 === 0 ? statesA : statesB;
      const cur = states.at(-1);
      const mv = moves[i];
      const body =
        kind === 'checkers'
          ? { requestId: `sk-${seq}-${i}-abcd1234`, revision: cur?.revision ?? 1, from: mv.from, to: mv.to, path: mv.path }
          : kind === 'go' || kind === 'gomoku'
            ? { requestId: `sk-${seq}-${i}-abcd1234`, revision: cur?.revision ?? 1, from: mv.from, to: mv.from }
            : { requestId: `sk-${seq}-${i}-abcd1234`, revision: cur?.revision ?? 1, from: mv[0], to: mv[1] };
      const r = await emit(sock, 'game:move', body);
      if (r.ok) stats.movesOk++;
      else if (r.error?.code === 'ILLEGAL_MOVE' || r.error?.code === 'STALE_REVISION' || r.error?.code === 'NOT_YOUR_TURN') stats.movesRejected++;
      else throw new Error(`move unexpected: ${JSON.stringify(r.error)}`);
      stats.latencies.push(r.latency);
      await sleep(150);
    }

    // 非法坐标（应拒）
    const bad = await emit(A, 'game:move', { requestId: `sk-bad-${seq}-abcd1234`, revision: statesA.at(-1)?.revision ?? 1, from: 'zz', to: 'yy' });
    if (bad.ok || bad.error?.code !== 'INVALID_INPUT') throw new Error('bad move accepted?!');

    // 复盘读取（服务端权威状态包含完整棋谱）
    const st = statesA.at(-1);
    if (!st || !Array.isArray(st.moves)) throw new Error('no state');

    // B 重连（断线恢复）
    B.disconnect();
    stats.reconnects++;
    const B2 = connect();
    const re = await emit(B2, 'room:rejoin', { roomId: created.roomId, token: joined.token });
    if (!re.ok) throw new Error('rejoin failed');
    await sleep(200);

    await emit(A, 'room:leave', {});
    await emit(B2, 'room:leave', {});
    A.disconnect();
    B2.disconnect();
    stats.cycles++;
    log({ t: new Date().toISOString(), kind, seq, ...{ movesOk: stats.movesOk, movesRejected: stats.movesRejected }, latP50: p(stats.latencies, 0.5) });
    seq++;
    await sleep(1200); // 控制建房频率，避免触发限流
  } catch (e) {
    stats.errors++;
    log({ t: new Date().toISOString(), kind, seq, error: String(e && e.message ? e.message : e) });
    await sleep(1000);
  }
}

function p(arr, q) {
  if (!arr.length) return null;
  const s = [...arr].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(q * s.length))];
}

writeFileSync(out.replace(/\.jsonl$/, '-summary.json'), JSON.stringify({ ...stats, p50: p(stats.latencies, 0.5), p95: p(stats.latencies, 0.95), p99: p(stats.latencies, 0.99), max: stats.latencies.length ? Math.max(...stats.latencies) : null }, null, 2));
console.log('soak done', JSON.stringify({ cycles: stats.cycles, movesOk: stats.movesOk, movesRejected: stats.movesRejected, reconnects: stats.reconnects, errors: stats.errors }));
process.exit(0);
