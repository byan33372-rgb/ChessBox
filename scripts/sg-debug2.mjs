import { SanguoshaGame } from '../dist-server/games/sanguosha/engine.js';
let seq = 0;
const drive = (g, seat, action) => {
  const r = g.command(seat, action, null, `t-${++seq}`);
  if (!r.ok) { console.log('REJECT', seat, JSON.stringify(action), JSON.stringify(r.error)); return false; }
  return true;
};
const g = SanguoshaGame.create(['a','b','c'], 'standard_plus_military', 43);
[['a','lvbu'],['b','simayi'],['c','sunquan']].forEach(([s, gid]) => drive(g, s, { type:'select-general', generalId: gid }));
// runUntil play
const runUntil = (kind, pid) => {
  for (let i = 0; i < 200; i++) {
    const w = g.pending;
    if (!w) return;
    if (w.kind === kind && (!pid || w.playerId === pid)) return;
    if (w.kind === 'respond') drive(g, w.playerId, { type: 'respond-pass' });
    else if (w.kind === 'discard') drive(g, w.playerId, { type: 'discard', cards: g.player(w.playerId).hand.slice(0, w.count) });
    else if (w.kind === 'choose') drive(g, w.playerId, { type: 'choose', value: w.options.at(-1) });
    else if (w.kind === 'cards') drive(g, w.playerId, { type: 'submit-cards', cards: g.player(w.playerId).hand.slice(0, w.min) });
    else if (w.kind === 'targets') drive(g, w.playerId, { type: 'submit-targets', targets: w.candidates.slice(0, w.min) });
    else if (w.kind === 'guanxing') drive(g, w.playerId, { type: 'guanxing-top', top: w.cards });
    else if (w.kind === 'play') drive(g, w.playerId, { type: 'end-play' });
  }
};
runUntil('play');
const strip = (seat, names) => {
  const p = g.player(seat);
  for (const id of [...p.hand]) if (names.includes(g.card(id).name)) { p.hand.splice(p.hand.indexOf(id),1); g.st.discardPile.push(id); }
};
const grant = (seat, name) => {
  const id = g.st.drawPile.find(c => g.card(c).name === name) ?? g.st.discardPile.find(c => g.card(c).name === name);
  if (!id) throw new Error('no ' + name);
  const di = g.st.drawPile.indexOf(id);
  if (di >= 0) g.st.drawPile.splice(di, 1); else g.st.discardPile.splice(g.st.discardPile.indexOf(id), 1);
  g.player(seat).hand.push(id);
  return id;
};
for (const p of ['a','b','c']) strip(p, ['tao','jiu','shan','baguazhen']);
const cur = g.st.current;
const v1 = ['a','b','c'].find(x => x !== cur);
g.player(v1).hp = 1;
const sha = grant(cur, 'sha');
console.log('killer=', cur, 'victim=', v1, 'shaUsed=', g.player(cur).flags.shaUsed);
drive(g, cur, { type:'play-card', cardId: sha, targets: [v1] });
runUntil('play');
console.log('v1 alive=', g.player(v1).alive, 'winner=', g.st.winner, 'pending=', g.pending?.kind, g.pending?.playerId, 'cur=', g.st.current, 'shaUsed=', g.player(cur).flags.shaUsed);
for (let i = 0; i < 100 && g.st.winner === null; i++) {
  const c = g.st.current;
  const enemies = ['a','b','c'].filter(x => x !== c && g.player(x).alive);
  if (enemies.length === 1) {
    console.log('final attack: cur=', c, 'enemy=', enemies[0], 'shaUsed=', g.player(c).flags.shaUsed, 'hand=', g.player(c).hand.map(id => g.card(id).name).join(','));
    g.player(enemies[0]).hp = 1;
    strip(enemies[0], ['shan','tao','baguazhen']);
    const s = grant(c, 'sha');
    const ok = drive(g, c, { type:'play-card', cardId: s, targets: [enemies[0]] });
    runUntil('play');
    console.log('after final: winner=', g.st.winner, 'alive=', g.st.players.filter(p=>p.alive).map(p=>p.id).join(','), 'pending=', g.pending?.kind);
    break;
  }
  drive(g, c, { type:'end-play' });
  const w = g.pending;
  if (w?.kind === 'discard') drive(g, c, { type:'discard', cards: g.player(c).hand.slice(0, w.count) });
}
