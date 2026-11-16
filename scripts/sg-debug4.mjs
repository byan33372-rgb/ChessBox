import { SanguoshaGame } from '../dist-server/games/sanguosha/engine.js';
let seq = 0;
const drive = (g, seat, action) => { const r = g.command(seat, action, null, `t-${++seq}`); if (!r.ok) console.log('  REJECT', seat, JSON.stringify(action).slice(0,100), JSON.stringify(r.error)); return r; };
const handlers = (g) => ({
  respond: (w) => drive(g, w.playerId, { type: 'respond-pass' }),
  discard: (w) => drive(g, w.playerId, { type: 'discard', cards: g.player(w.playerId).hand.slice(0, w.count) }),
  choose: (w) => drive(g, w.playerId, { type: 'choose', value: w.options.at(-1) }),
  cards: (w) => drive(g, w.playerId, { type: 'submit-cards', cards: g.player(w.playerId).hand.slice(0, w.min) }),
  targets: (w) => drive(g, w.playerId, { type: 'submit-targets', targets: w.candidates.slice(0, w.min) }),
  guanxing: (w) => drive(g, w.playerId, { type: 'guanxing-top', top: w.cards }),
  play: (w) => drive(g, w.playerId, { type: 'end-play' }),
});
const step = (g) => { const w = g.pending; if (!w) return false; handlers(g)[w.kind]?.(w); return true; };
const grant = (g, seat, name, suit) => {
  const id = g.st.drawPile.find(c => g.card(c).name === name && (!suit || g.card(c).suit === suit)) ?? g.st.discardPile.find(c => g.card(c).name === name && (!suit || g.card(c).suit === suit));
  if (!id) throw new Error('no card ' + name + suit);
  const di = g.st.drawPile.indexOf(id);
  if (di >= 0) g.st.drawPile.splice(di, 1); else g.st.discardPile.splice(g.st.discardPile.indexOf(id), 1);
  g.player(seat).hand.push(id); return id;
};
// —— 国色调试 ——
{
  const g = SanguoshaGame.create(['a','b','c'], 'standard_plus_military', 277);
  [['a','daqiao'],['b','caocao'],['c','simayi']].forEach(([s,gid]) => drive(g, s, { type:'select-general', generalId: gid }));
  for (let i = 0; i < 200; i++) { const w = g.pending; if (w?.kind === 'play' && w.playerId === 'a') break; step(g); }
  console.log('== guose == current=', g.st.current, 'pending=', g.pending?.kind, g.pending?.playerId);
  const dia = grant(g, 'a', 'shan', 'D');
  console.log('dia suit=', g.card(dia).suit, 'hand a=', g.player('a').hand.length);
  drive(g, 'a', { type:'play-card', cardId: dia, as: 'lebusishu', targets: ['b'] });
  console.log('after: pending=', g.pending?.kind, 'b judgments=', g.player('b').judgments.map(id => g.card(id).name));
}
// —— 枭姬调试 ——
{
  const g = SanguoshaGame.create(['a','b','c'], 'standard_plus_military', 281);
  [['a','sunshangxiang'],['b','caocao'],['c','simayi']].forEach(([s,gid]) => drive(g, s, { type:'select-general', generalId: gid }));
  for (let i = 0; i < 200; i++) { const w = g.pending; if (w?.kind === 'play' && w.playerId === 'a') break; step(g); }
  // 白盒装青龙刀
  const ql = grant(g, 'a', 'qinglongyanyuedao');
  g.player('a').hand.splice(g.player('a').hand.indexOf(ql), 1);
  g.player('a').equips.weapon = ql;
  for (let i = 0; i < 200; i++) { const w = g.pending; if (w?.kind === 'play' && w.playerId === 'a') break; step(g); }
  const n0 = g.player('a').hand.length;
  const ny = grant(g, 'a', 'zhugelianyu');
  drive(g, 'a', { type:'play-card', cardId: ny, targets: [] });
  for (let i = 0; i < 30; i++) { const w = g.pending; if (!w || (w.kind === 'play' && w.playerId === 'a')) break; step(g); }
  const log0 = g.st.log.filter(e => ['DRAW_HIDDEN','CARD_GAINED','LOSE_EQUIP'].includes(e.t)).slice(-6);
console.log('== xiaoji == n0=', n0, 'after=', g.player('a').hand.length, 'weapon=', g.card(g.player('a').equips.weapon ?? '').name, 'log xiaoji=', g.st.log.some(e => e.t === 'SKILL' && e.skill === 'xiaoji'));
for (const e of log0) console.log('LOG0', JSON.stringify(e).slice(0, 130));
for (const e of g.st.log.filter(e => ['DRAW_HIDDEN','LOSE_EQUIP'].includes(e.t)).slice(-4)) console.log('LOG1', JSON.stringify(e).slice(0, 130));
}
