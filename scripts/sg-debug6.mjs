import { io } from 'socket.io-client';
const sock = io('http://127.0.0.1:3210', { transports: ['websocket'], forceNew: true });
const events = [];
sock.on('sg:state', (p) => events.push(['sg:state', p.view?.phase]));
sock.on('room:state', (p) => events.push(['room:state', p.reason]));
sock.on('connect', async () => {
  sock.emit('room:create', { kind: 'sanguosha', seatCount: 3, name: 'T' }, (r) => {
    console.log('create', r.ok, r.error?.message ?? '', 'seat', r.seat);
    if (!r.ok) { process.exit(1); }
    setTimeout(() => {
      console.log('events:', JSON.stringify(events.slice(0, 10)));
      process.exit(0);
    }, 800);
  });
});
