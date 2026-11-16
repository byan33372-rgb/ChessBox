import { SanguoshaGame } from '../dist-server/games/sanguosha/engine.js';
let seq = 0;
const drive = (g, seat, action) => { const r = g.command(seat, action, null, `t-${++seq}`); if (!r.ok) console.log('  REJECT', seat, JSON.stringify(action).slice(0,110), JSON.stringify(r.error)); return r; };
const H = (g) => ({
  respond: (w) => drive(g, w.playerId, { type: 'respond-pass' }),
  discard: (w) => drive(g, w.playerId, { type: 'discard', cards: g.player(w.playerId).hand.slice(0, w.count) }),
  choose: (w) => drive(g, w.playerId, { type: 'choose', value: w.options.at(-1) }),
  cards: (w) => drive(g, w.playerId, { type: 'submit-cards', cards: g.player(w.playerId).hand.slice(0, w.min) }),
  targets: (w) => drive(g, w.playerId, { type: 'submit-targets', targets: w.candidates.slice(0, w.min) }),
  guanxing: (w) => drive(g, w.playerId, { type: 'guanxing-top', top: w.cards }),
  play: (w) => drive(g, w.playerId, { type: 'end-play' }),
});
const runUntil = (g, kind, pid) => { const h = H(g); for (let i = 0; i < 300; i++) { const w = g.pending; if (!w) return; if (w.kind === kind && (!pid || w.playerId === pid)) return; h[w.kind]?.(w); } };
const grant = (g, seat, name, suit) => {
  const id = g.st.drawPile.find(c => g.card(c).name === name && (!suit || g.card(c).suit === suit)) ?? g.st.discardPile.find(c => g.card(c).name === name && (!suit || g.card(c).suit === suit));
  if (!id) throw new Error('no ' + name + suit);
  const di = g.st.drawPile.indexOf(id);
  if (di >= 0) g.st.drawPile.splice(di, 1); else g.st.discardPile.splice(g.st.discardPile.indexOf(id), 1);
  g.player(seat).hand.push(id); return id;
};
const g = SanguoshaGame.create(['a','b','c'], 'standard_plus_military', 277);
[['a','daqiao'],['b','caocao'],['c','simayi']].forEach(([s,gid]) => drive(g, s, { type:'select-general', generalId: gid }));
runUntil(g, 'play', 'a');
console.log('pending=', g.pending?.kind, g.pending?.playerId, 'cur=', g.st.current);
const dia = grant(g, 'a', 'shan', 'D');
console.log('dia=', g.card(dia).suit, g.card(dia).name, 'convertOptions=', g.convertOptions(g.player('a'), dia, 'play'));
drive(g, 'a', { type:'play-card', cardId: dia, as: 'lebusishu', targets: ['b'] });
console.log('after drive: pending=', g.pending?.kind, g.pending?.playerId, 'need=', g.pending?.need, 'b judg=', g.player('b').judgments.length);
runUntil(g, 'play', 'a');
console.log('after runUntil: b judg=', g.player('b').judgments.map(id => g.card(id).name), 'a hand has dia=', g.player('a').hand.includes(dia));
for (const e of g.st.log.filter(e => ['CARD_USED','NULLIFY','DELAYED'].includes(e.t)).slice(-4)) console.log('LOG', JSON.stringify(e).slice(0,140));
