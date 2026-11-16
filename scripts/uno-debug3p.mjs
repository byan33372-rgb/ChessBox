// 三 bot 直连 live server 完成整轮（复现 vitest 场景）
import { io } from 'socket.io-client';
const url = 'http://127.0.0.1:3213';
const seats = ['a', 'b', 'c'];
const bots = seats.map((seat) => {
  const sock = io(url, { transports: ['websocket'], forceNew: true });
  let latest = null;
  let seq = 0;
  let lastSend = 0;
  let cmds = 0;
  sock.on('uno:state', (p) => { latest = p.view; });
  const cmd = (action) => new Promise((res) => {
    cmds++;
    sock.emit('uno:command', { commandId: `dbg-${seat}-${++seq}`, expectedRevision: latest?.revision ?? null, action }, (r) => {
      if (r?.view) latest = r.view;
      res(r);
    });
  });
  return { seat, sock, get v() { return latest; }, cmd, get cmds() { return cmds; } };
});
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
await sleep(300);
const roomId = await new Promise((res) => bots[0].sock.emit('room:create', { kind: 'uno', seatCount: 3, name: 'D' }, (r) => { console.log('create', r.ok); res(r.roomId); }));
for (const b of bots.slice(1)) {
  await new Promise((res) => b.sock.emit('room:join', { roomId, name: 'x' }, res));
}
console.log('joined');
const run = async (bot) => {
  for (let i = 0; i < 40000; i++) {
    const v = bot.v;
    if (!v) { await sleep(50); continue; }
    if (v.winner != null || v.phase === 'roundEnd') return 'finished';
    const gap = Date.now() - lastSendOf(bot);
    if (gap < 100) { await sleep(100 - gap); continue; }
    markSend(bot);
    let acted = false;
    if (v.phase === 'select') { await bot.cmd({ type: 'ready', ready: true }); acted = true; }
    else if (v.pending?.kind === 'challenge' && v.pending.playerId === bot.seat) { await bot.cmd({ type: 'challenge', challenge: Math.random() < 0.5 }); acted = true; }
    else if (v.pending?.kind === 'choose-color' && v.pending.playerId === bot.seat) { await bot.cmd({ type: 'choose-color', color: ['R','Y','G','B'][Math.floor(Math.random()*4)] }); acted = true; }
    else if (v.turn === bot.seat) {
      const playable = v.playableIds ?? [];
      if (playable.length > 0) await bot.cmd({ type: 'play-card', cardId: playable[Math.floor(Math.random()*playable.length)], chosenColor: ['R','Y','G','B'][Math.floor(Math.random()*4)] });
      else await bot.cmd({ type: 'draw' });
      acted = true;
    }
    if (!acted) await sleep(60);
  }
  return 'steps';
};
const lastMap = new Map();
const lastSendOf = (b) => lastMap.get(b.seat) ?? 0;
const markSend = (b) => lastMap.set(b.seat, Date.now());
const winner = await Promise.race([Promise.all(bots.map(run)), sleep(300000).then(() => 'TIMEOUT')]);
console.log('result:', winner, 'cmds:', bots.map((b) => b.cmds));
const v = bots[0].v;
console.log('final: turn', v?.turn, 'winner', v?.winner, 'phase', v?.phase, 'pendingDraw', v?.pendingDraw, 'pending', JSON.stringify(v?.pending), 'cmds', bots.map(b => b.cmds));
process.exit(0);
