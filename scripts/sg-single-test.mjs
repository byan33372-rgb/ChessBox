import { io } from 'socket.io-client';
const sock = io('http://127.0.0.1:3211', { transports: ['websocket'], forceNew: true });
const states = [];
sock.on('sg:state', (p) => states.push({ rev: p.view.revision, phase: p.view.phase, turn: p.view.current }));
sock.on('connect', () => {
  sock.emit('room:create', { kind: 'sanguosha', seatCount: 3, name: 'T' }, (r) => {
    console.log('create', r.ok, 'seat', r.seat);
    sock.emit('sg:command', { commandId: 'sel12345678', expectedRevision: null, action: { type: 'select-general', generalId: 'zhaoyun' } }, (r2) => {
      console.log('sel12345678', r2.ok, JSON.stringify(r2.error), 'rev', r2.revision);
      setTimeout(() => { console.log('states', JSON.stringify(states)); process.exit(0); }, 2000);
    });
  });
});
