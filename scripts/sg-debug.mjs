import { SanguoshaGame } from '../dist-server/games/sanguosha/engine.js';
let seq = 0;
const drive = (g, seat, action) => {
  const r = g.command(seat, action, null, `t-${++seq}`);
  if (!r.ok) console.log('REJECT', seat, JSON.stringify(action), JSON.stringify(r.error));
  return r;
};
const g = SanguoshaGame.create(['a','b','c'], 'standard_plus_military', 11);
for (const [s, gid] of [['a','simayi'],['b','guojia'],['c','zhouyu']]) drive(g, s, { type:'select-general', generalId: gid });
console.log('after select: phase=', g.st.phase, 'pending=', g.pending?.kind, g.pending?.playerId, 'cur=', g.st.current);
console.log('hands:', g.st.players.map(p => `${p.id}:${p.hand.length}`).join(' '));
console.log('a hand names:', g.player('a').hand.map(id => g.card(id).name).join(','));
// end-play
const cur = g.st.current;
drive(g, cur, { type: 'end-play' });
console.log('after end-play: pending=', g.pending?.kind, g.pending?.playerId, 'hand=', g.player(cur).hand.length, 'hp=', g.player(cur).hp);
if (g.pending?.kind === 'discard') {
  drive(g, cur, { type: 'discard', cards: g.player(cur).hand.slice(0, g.pending.count) });
  console.log('after discard: pending=', g.pending?.kind, g.pending?.playerId, 'cur=', g.st.current, 'turn=', g.st.turnNumber);
}
