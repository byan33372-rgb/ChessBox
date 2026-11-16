/**
 * 三国杀 30 分钟浸泡：真实 3/4 人房间 × 自动机器人。
 * 用法：node scripts/sg-soak.mjs <url> <minutes> <players> <outJson>
 */
import { io } from 'socket.io-client';

const url = process.argv[2] || 'http://127.0.0.1:3211';
const minutes = Number(process.argv[3] || 30);
const playerCount = Number(process.argv[4] || 3);
const out = process.argv[5] || 'docs/sanguosha/soak-results.json';
const deadline = Date.now() + minutes * 60000;

const stats = { games: 0, commands: 0, rejected: 0, errors: 0, reconnects: 0, maxRevision: 0 };
let seq = 0;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function mkBot(seat, sock) {
  const state = { latest: null, lastSend: 0 };
  sock.on('sg:state', (p) => {
    state.latest = p.view;
    stats.maxRevision = Math.max(stats.maxRevision, p.view.revision);
  });
  const cmd = async (action) => {
    stats.commands++;
    const gap = Date.now() - state.lastSend;
    if (gap < 900) await sleep(900 - gap);
    state.lastSend = Date.now();
    return new Promise((resolve) => {
      sock.emit('sg:command', {
        commandId: `soak-${seat}-${Date.now().toString(36)}-${++seq}`,
        expectedRevision: action.type === 'select-general' ? null : (state.latest ? state.latest.revision : null),
        action,
      }, (r) => {
        if (r?.view) state.latest = r.view;
        if (!r?.ok) stats.rejected++;
        resolve(r);
      });
    });
  };
  return {
    seat,
    cmd,
    step: async () => {
      const v = state.latest;
      if (!v) return;
      if (v.winner != null) { stats.games++; return; }
      const pend = v.pending;
      if (!pend || pend.playerId !== seat) return;
      if (pend.kind === 'play') {
        const hints = (v.hints || []).filter((h) => h.ok);
        if (hints.length > 0 && Math.random() < 0.55) {
          const h = hints[Math.floor(Math.random() * hints.length)];
          await cmd({ type: 'play-card', cardId: h.cardId, as: h.as, targets: h.multi ? [] : h.targets.slice(0, Math.max(h.minTargets, h.targets.length ? 1 : 0)) });
        } else {
          await cmd({ type: 'end-play' });
        }
      } else if (pend.kind === 'respond') {
        const legal = pend.legalCards || [];
        if (legal.length > 0 && Math.random() < (pend.need === 'tao' ? 0.8 : 0.5)) {
          await cmd({ type: 'respond-play', cardId: legal[Math.floor(Math.random() * legal.length)] });
        } else {
          await cmd({ type: 'respond-pass' });
        }
      } else if (pend.kind === 'discard') {
        await cmd({ type: 'discard', cards: (v.myHand || []).slice(0, pend.count || 0) });
      } else if (pend.kind === 'choose') {
        const o = pend.options || [];
        if (o.length) await cmd({ type: 'choose', value: o[Math.floor(Math.random() * o.length)] });
      } else if (pend.kind === 'cards') {
        await cmd({ type: 'submit-cards', cards: (v.myHand || []).slice(0, pend.min || 0) });
      } else if (pend.kind === 'targets') {
        await cmd({ type: 'submit-targets', targets: (pend.candidates || []).slice(0, Math.max(pend.min || 1, 1)) });
      } else if (pend.kind === 'guanxing') {
        await cmd({ type: 'guanxing-top', top: (pend.cards || []).slice(0, 1) });
      }
    },
    get latestView() { return state.latest; },
  };
}

async function playGame(playerCount) {
  const seats = ['a', 'b', 'c', 'd'].slice(0, playerCount);
  const gens = ['zhaoyun', 'guanyu', 'sunquan', 'caocao'];
  const socks = [];
  for (let i = 0; i < playerCount; i++) {
    const sock = io(url, { transports: ['websocket'], forceNew: true });
    sock.on('connect_error', () => { stats.errors++; });
    socks.push(sock);
  }
  await sleep(300);
  const createResult = await new Promise((res) => {
    socks[0].emit('room:create', { kind: 'sanguosha', seatCount: playerCount, name: `soak${++seq}` }, (r) => {
      if (!r.ok) console.log('[soak] create FAIL', JSON.stringify(r.error));
      res(r);
    });
  });
  if (!createResult.ok) { stats.errors++; for (const s of socks) s.disconnect(); return false; }
  const roomId = createResult.roomId;
  for (let i = 1; i < playerCount; i++) {
    await new Promise((res) => {
      socks[i].emit('room:join', { roomId, name: `p${i}` }, (r) => {
        if (!r.ok) { stats.errors++; console.log('[soak] join FAIL', JSON.stringify(r.error)); }
        res();
      });
    });
  }
  const bots = seats.map((seat, i) => mkBot(seat, socks[i]));
  for (let i = 0; i < playerCount; i++) {
    const r = await bots[i].cmd({ type: 'select-general', generalId: gens[i] }); // expectedRevision null: select 不需要版本
    if (!r.ok) console.log(`[soak] sg ${seats[i]} FAIL`, JSON.stringify(r.error));
  }
  // 等开局
  const t0 = Date.now();
  while (Date.now() - t0 < 15000) {
    if (bots.every((b) => b.latestView && b.latestView.phase !== 'select')) break;
    await sleep(100);
  }
  // 主循环
  while (Date.now() < deadline) {
    if (bots.some((b) => b.latestView?.winner != null)) break;
    await Promise.race([Promise.all(bots.map((b) => b.step())), sleep(150)]);
  }
  const finished = bots.some((b) => b.latestView?.winner != null);
  if (finished) stats.games++;
  for (const s of socks) s.disconnect();
  return finished;
}

async function main() {
  while (Date.now() < deadline) {
    await playGame(playerCount);
    await sleep(300);
  }
  const { writeFileSync, mkdirSync } = await import('node:fs');
  mkdirSync(out.replace(/[\\/][^\\/]+$/, ''), { recursive: true });
  writeFileSync(out, JSON.stringify({ ...stats, durationMs: minutes * 60000 }, null, 2));
  console.log(JSON.stringify(stats));
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
