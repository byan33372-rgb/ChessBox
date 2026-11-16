/**
 * 延迟探针（阶段一基线 / 阶段二复测共用）
 *
 * 两个 socket.io 客户端在同一进程内真实对局，逐手记录：
 *  - A 点击→A 收到 ack（含服务端校验+落库）
 *  - A 点击→B 收到广播 room:state（对手可见）
 *  - 广播载荷大小（B 收到的 state JSON 字节数）
 *  - 传输方式（websocket / polling）
 *
 * 用法：
 *   node scripts/latency-probe.mjs --url http://127.0.0.1:3001 --moves 20 --label local
 *   node scripts/latency-probe.mjs --url https://xxx.trycloudflare.com --moves 20 --label tunnel
 * 输出：JSON 摘要（p50/p95/p99/max、>300/500/1000/2000ms 计数、传输方式、平均载荷）
 */
import { io } from 'socket.io-client';
import { writeFileSync, mkdirSync } from 'node:fs';

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, cur, i, arr) => {
    if (cur.startsWith('--')) acc.push([cur.slice(2), arr[i + 1] && !arr[i + 1].startsWith('--') ? arr[i + 1] : 'true']);
    return acc;
  }, []),
);
const URL = args.url || 'http://127.0.0.1:3001';
const MOVES = Math.min(Number(args.moves || 20), 30);
const LABEL = args.label || 'local';
const KIND = args.kind || 'gomoku';
const TRANSPORT = args.transport || 'auto';
const OUT = args.out || '';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const now = () => performance.now();
let seq = 0;
const reqId = () => `probe-${Date.now().toString(36)}-${(++seq).toString(36).padStart(5, '0')}`;

function connect() {
  return io(URL, {
    transports: TRANSPORT === 'polling' ? ['polling'] : ['websocket', 'polling'],
    upgrade: TRANSPORT !== 'polling',
    reconnection: false,
    timeout: 15000,
    forceNew: true,
  });
}

function emitAck(socket, event, payload, timeoutMs = 10000) {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve({ ok: false, error: { code: 'TIMEOUT' }, timeout: true }), timeoutMs);
    socket.emit(event, payload, (r) => {
      clearTimeout(timer);
      resolve(r ?? { ok: false, error: { code: 'EMPTY' } });
    });
  });
}

function waitFor(fn, ms = 10000) {
  return new Promise((resolve, reject) => {
    const started = now();
    const tick = () => {
      const v = fn();
      if (v) return resolve(v);
      if (now() - started > ms) return reject(new Error('waitFor timeout'));
      setTimeout(tick, 10);
    };
    tick();
  });
}

function pct(sorted, p) {
  if (!sorted.length) return null;
  const i = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[Math.max(0, i)];
}

function summarize(values) {
  const s = [...values].sort((a, b) => a - b);
  const bucket = (n) => values.filter((v) => v > n).length;
  return {
    n: values.length,
    p50: pct(s, 50),
    p95: pct(s, 95),
    p99: pct(s, 99),
    max: s.at(-1) ?? null,
    min: s[0] ?? null,
    mean: values.length ? Number((values.reduce((a, b) => a + b, 0) / values.length).toFixed(2)) : null,
    gt300: bucket(300),
    gt500: bucket(500),
    gt1000: bucket(1000),
    gt2000: bucket(2000),
  };
}

async function main() {
  const a = connect();
  const b = connect();
  const bStates = [];
  const aStates = [];
  b.on('room:state', (p) => bStates.push({ at: now(), state: p.state, reason: p.reason }));
  a.on('room:state', (p) => aStates.push({ at: now(), state: p.state, reason: p.reason }));

  const createAck = await emitAck(a, 'room:create', { kind: KIND, name: '探针甲' });
  if (!createAck.ok) throw new Error(`create failed: ${JSON.stringify(createAck)}`);
  const joinAck = await emitAck(b, 'room:join', { roomId: createAck.roomId, name: '探针乙' });
  if (!joinAck.ok) throw new Error(`join failed: ${JSON.stringify(joinAck)}`);
  await sleep(150);

  const transportA = a.io.engine.transport.name;
  const transportB = b.io.engine.transport.name;

  // 轮流行棋：a 先手。五子棋在空位顺序落子；象棋用固定开局序列（若 kind=xiangqi）
  // 双方都以最近一次广播（或 ack）为准：与页面 stateRef 行为一致
  let stateA = createAck.state;
  let stateB = null;
  const ackTimes = [];
  const peerTimes = [];
  const payloadBytes = [];
  const rows = [];
  const errors = [];

  for (let i = 0; i < MOVES; i++) {
    const sock = i % 2 === 0 ? a : b;
    stateB = bStates.at(-1)?.state ?? stateB;
    stateA = aStates.at(-1)?.state ?? stateA;
    const st = sock === a ? stateA : stateB;
    if (!st) throw new Error(`no state before move ${i}`);

    let from;
    let to;
    if (KIND === 'gomoku') {
      // 固定散点（斜率 2，不会形成五连），保证全部手数都能真实落子
      const A_PTS = ['a1','b3','c5','d7','e9','f11','g13','h15','i2','j4','k6','l8','m10','n12','o14'];
      const B_PTS = ['a8','b10','c12','d14','e1','f3','g5','h7','i9','j11','k13','l15','m2','n4','o6'];
      const idx = Math.floor(i / 2);
      from = (i % 2 === 0 ? A_PTS : B_PTS)[idx % 15];
      to = from;
    } else {
      // 象棋：红黑各走一步固定序列（非法则跳过）
      const seqA = [['b2', 'e2'], ['h2', 'e2'], ['b0', 'c2'], ['h0', 'g2'], ['a0', 'a1'], ['i0', 'i1']];
      const n = Math.floor(i / 2) % 6;
      from = seqA[n][0];
      to = seqA[n][1];
    }

    const beforeA = aStates.length;
    const beforeB = bStates.length;
    const t0 = now();
    const req = reqId();
    const ack = await emitAck(sock, 'game:move', { requestId: req, revision: st.revision, from, to });
    const tAck = now();
    if (!ack.ok) {
      errors.push({ move: i, from, to, error: ack.error?.code, msg: ack.error?.message });
      // 换手重试一次：用 ack.state 的 revision（或对方最新）
      if (ack.state) {
        if (sock === a) stateA = ack.state;
        continue;
      }
      continue;
    }
    if (sock === a) stateA = ack.state;
    const ackMs = tAck - t0;
    const n = ack.state?.moves?.length ?? -1;
    // 等待双方都收到这一手（避免下一手用到过期 revision）
    let peerMs = null;
    let selfMs = null;
    let payload = null;
    try {
      const peerRec = await waitFor(
        () => (sock === a ? bStates : aStates).slice(sock === a ? beforeB : beforeA).find((x) => x.state.moves?.length === n),
        15000,
      );
      peerMs = peerRec.at - t0;
      payload = JSON.stringify(peerRec.state).length;
      payloadBytes.push(payload);
      const selfRec = await waitFor(
        () => (sock === a ? aStates : bStates).slice(sock === a ? beforeA : beforeB).find((x) => x.state.moves?.length === n),
        15000,
      );
      selfMs = selfRec.at - t0;
    } catch {
      errors.push({ move: i, from, to, error: 'PEER_TIMEOUT' });
    }
    if (ackMs > 7000) errors.push({ move: i, from, to, error: 'ACK_TIMEOUT' });
    ackTimes.push(ackMs);
    if (peerMs != null) peerTimes.push(peerMs);
    rows.push({
      i,
      from,
      to,
      ackMs: Number(ackMs.toFixed(2)),
      peerMs: peerMs == null ? null : Number(peerMs.toFixed(2)),
      selfMs: selfMs == null ? null : Number(selfMs.toFixed(2)),
      payload,
      serverTiming: ack.serverTiming ?? null,
    });
  }

  const result = {
    label: LABEL,
    url: URL,
    kind: KIND,
    moves: MOVES,
    transportMode: TRANSPORT,
    transportA,
    transportB,
    ack: summarize(ackTimes),
    peer: summarize(peerTimes),
    payloadBytes: {
      first: payloadBytes[0] ?? null,
      last: payloadBytes.at(-1) ?? null,
      mean: payloadBytes.length ? Math.round(payloadBytes.reduce((x, y) => x + y, 0) / payloadBytes.length) : null,
    },
    errors,
    rows,
    ranAt: new Date().toISOString(),
  };
  const text = JSON.stringify(result, null, 2);
  console.log(text);
  if (OUT) {
    mkdirSync(OUT.replace(/[\\/][^\\/]+$/, ''), { recursive: true });
    writeFileSync(OUT, text);
  }
  a.disconnect();
  b.disconnect();
  process.exit(0);
}

main().catch((e) => {
  console.error('PROBE FAILED:', e?.stack || e);
  process.exit(1);
});
