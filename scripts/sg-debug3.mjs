import { SanguoshaGame } from '../dist-server/games/sanguosha/engine.js';
let seq = 0;
const drive = (g, seat, action) => {
  const r = g.command(seat, action, null, `t-${++seq}`);
  if (!r.ok) console.log('  REJECT', seat, JSON.stringify(action).slice(0,90), JSON.stringify(r.error));
  return r;
};
const runUntil = (g, kind, pid) => {
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
// —— 乐不思蜀调试 ——
{
  const g = SanguoshaGame.create(['a','b','c'], 'standard_plus_military', 151);
  [['a','caocao'],['b','simayi'],['c','sunquan']].forEach(([s,gid]) => drive(g, s, { type:'select-general', generalId: gid }));
  runUntil(g, 'play');
  const cur = g.st.current;
  const t = ['a','b','c'].find(x => x !== cur);
  console.log('cur=', cur, 't=', t, 'generals=', g.st.players.map(p=>p.id+':'+p.generalId).join(','));
  const grant = (seat, name) => {
    const id = g.st.drawPile.find(c => g.card(c).name === name) ?? g.st.discardPile.find(c => g.card(c).name === name);
    const di = g.st.drawPile.indexOf(id);
    if (di >= 0) g.st.drawPile.splice(di, 1); else g.st.discardPile.splice(g.st.discardPile.indexOf(id), 1);
    g.player(seat).hand.push(id); return id;
  };
  const lb = grant(cur, 'lebusishu');
  drive(g, cur, { type:'play-card', cardId: lb, targets: [t] });
  console.log('after lb: pending=', g.pending?.kind, g.pending?.playerId, 't judgments=', g.player(t).judgments.length);
  // 推进
  const ring = ['a','b','c'];
  const pred = ring[(ring.indexOf(t) + 2) % 3];
  console.log('pred=', pred);
  for (let i = 0; i < 40; i++) {
    const w = g.pending;
    if (!w) { console.log('pending null at loop', i); break; }
    if (w.kind === 'play' && w.playerId === pred) {
      const sid = g.st.drawPile.find(c => g.card(c).name === 'sha' && g.card(c).suit === 'S') ?? g.st.discardPile.find(c => g.card(c).name === 'sha' && g.card(c).suit === 'S');
      console.log('stack card found:', !!sid);
      const di = g.st.drawPile.indexOf(sid);
      if (di >= 0) g.st.drawPile.splice(di, 1); else g.st.discardPile.splice(g.st.discardPile.indexOf(sid), 1);
      g.st.drawPile.push(sid);
      drive(g, pred, { type:'end-play' });
      const w2 = g.pending;
      if (w2?.kind === 'discard') drive(g, pred, { type:'discard', cards: g.player(pred).hand.slice(0, w2.count) });
      break;
    }
    if (w.kind === 'play') drive(g, w.playerId, { type:'end-play' });
    else if (w.kind === 'respond') drive(g, w.playerId, { type:'respond-pass' });
    else if (w.kind === 'discard') drive(g, w.playerId, { type:'discard', cards: g.player(w.playerId).hand.slice(0, w.count) });
    else if (w.kind === 'choose') drive(g, w.playerId, { type:'choose', value: w.options.at(-1) });
    else if (w.kind === 'cards') drive(g, w.playerId, { type:'submit-cards', cards: g.player(w.playerId).hand.slice(0, w.min) });
    else if (w.kind === 'targets') drive(g, w.playerId, { type:'submit-targets', targets: w.candidates.slice(0, w.min) });
  }
  runUntil(g, 'play');
  const skipped = g.st.log.find(e => e.t === 'PHASE_SKIPPED');
  console.log('skipped=', JSON.stringify(skipped), 't judgments=', g.player(t).judgments.length);
  for (const e of g.st.log.filter(e => ['JUDGE_START','JUDGE_RESULT','DELAYED_EFFECT','PHASE_SKIPPED','CARD_USED','NULLIFY'].includes(e.t))) console.log('LOG', JSON.stringify(e).slice(0, 160));
}
