import { io } from 'socket.io-client';
const url = process.argv[2] ?? 'http://127.0.0.1:3213';
const sock = io(url, { transports: ['websocket'], forceNew: true });
const views = [];
sock.on('uno:state', (p) => views.push(p.view.phase));
sock.on('connect', async () => {
  sock.emit('room:create', { kind: 'uno', seatCount: 3, name: 'T' }, (r) => {
    console.log('create', r.ok, r.error?.message ?? '');
    setTimeout(() => {
      console.log('uno:state events:', JSON.stringify(views));
      process.exit(0);
    }, 600);
  });
});
