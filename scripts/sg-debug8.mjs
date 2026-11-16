// 完整 3 人局调试：输出卡住时的挂起窗口
import { io } from 'socket.io-client';
const url = 'http://127.0.0.1:3212';
let seq = 0;
const mk = (seat) => {
  const sock = io(url, { transports: ['websocket'], forceNew: true });
  let latest = null;
  sock.on('sg:state', (p) => { latest = p.view; });
  const cmd = async (action) => new Promise((res) => {
    sock.emit('sg:command', { commandId: `d-${seat}-${++seq}`, expectedRevision: latest?.revision ?? null, action }, (r) => { if (!r.ok) console.log(`  [${seat}] REJECT ${JSON.stringify(action).slice(0,90)} ${JSON.stringify(r.error)}`); res(r); });
  });
  return { sock, get v() { return latest; }, cmd };
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const gens = ['zhaoyun','guanyu','sunquan'];
const main = async () => {
  const b0 = mk('x');
  await new Promise((res) => b0.sock.emit('room:create', { kind: 'sanguosha', seatCount: 3, name: 'D' }, (r) => { console.log('create', r.ok); res(); }));
  const roomId = (await new Promise((res) => b0.sock.emit('room:noop', {}, () => res(null)), sleep(100), null)) ;
  void roomId;
  const bots = [b0];
  for (let i = 1; i < 3; i++) {
    const b = mk('x');
    await new Promise((res) => b.sock.emit('room:join', { roomId: JSON.parse(JSON.stringify(globalThis.roomId ?? '')) || undefined, name: 'x' }, res));
    void b;
  }
};
void main;
// 简化：直接用 vitest 内 bot 输出窗口——改用下面内联脚本（同集成 helper）
