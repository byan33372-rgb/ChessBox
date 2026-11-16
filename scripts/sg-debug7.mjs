import { io } from 'socket.io-client';
const url = 'http://127.0.0.1:3211';
const mk = (seat) => {
  const sock = io(url, { transports: ['websocket'], forceNew: true });
  let latest = null; let seq = 0;
  sock.on('sg:state', (p) => { latest = p.view; });
  const cmd = (action) => new Promise((res) => {
    sock.emit('sg:command', { commandId: `d-${seat}-${++seq}-${Date.now()%1e6}`, expectedRevision: latest?.revision ?? null, action }, (r) => res(r));
  });
  return { sock, get latest() { return latest; }, cmd };
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const bots = ['a','b','c'].map((s) => mk(s));
await sleep(300);
// 建房
await new Promise((res) => bots[0].sock.emit('room:create', { kind: 'sanguosha', seatCount: 3, name: 'D' }, (r) => { console.log('create', r.ok, r.roomId); res(); }));
for (const b of bots.slice(1)) {
  await new Promise((res) => b.sock.emit('room:join', { roomId: bots[0].latest ? undefined : undefined, name: 'x' }, res));
}
