/* Edge tools for Fantasy Front Office — all stat-based, public data, estimates labeled. Loaded after app.js. */
'use strict';
const recW = (lg) => lg.id === 'dynasty' ? 0.5 : 1;
const usageOf = (id) => (D.adv.usage || {})[id] || null;
const nextWeek = (m) => Math.max(m.week || 0, (D.adv.lastWeek || 0) + 1);
const TEAM_ALIAS = { LAR: 'LA', JAC: 'JAX', WSH: 'WAS', LVR: 'LV' };
const oppOf = (team, w) => ((D.adv.schedule || {})[TEAM_ALIAS[team] || team] || {})[w] || null;
const sosOf = (opp, pos) => { if (!opp) return 1; const t = opp.replace('@', ''); return ((D.adv.sos || {})[t] || {})[pos] || 1; };
function xfpg(lg, id) { const u = usageOf(id); if (!u || !u.g) return null; return (u.xyds * 0.1 + u.xtd * 6 + u.tgt * 0.65 * recW(lg)) / u.g; }
function projWeek(lg, id, w) { const p = D.players[id] || {}; const pf = perfOf(lg, id); if (!pf) return 0; const opp = oppOf(p.t, w); if (!opp) return 0; if (['Out', 'IR', 'PUP', 'Sus'].includes(p.i) && w === nextWeek(model(lg))) return 0; return pf.blend * (0.7 + 0.3 * sosOf(opp, p.p)); }
function projROS(lg, id, from) { let s = 0; for (let w = from; w <= 17; w++) s += projWeek(lg, id, w); return s; }
const posTag = (id) => (D.players[id] || {}).p || '';
const trend = (a, b) => a == null || b == null ? '' : `<span class="${b - a >= 0 ? 'pos' : 'neg'} small">${b - a >= 0 ? '▲' : '▼'}${Math.abs(b - a).toFixed(1)}</span>`;
function signalOf(lg, id) {
  const p = D.players[id] || {}; const u = usageOf(id); const pf = perfOf(lg, id); if (!u || !pf || p.p === 'QB' || u.g < 2) return null; const x = xfpg(lg, id); const diff = (pf.ppg || 0) - x;
  const upUsage = (u.tsL2 - u.ts) + (u.csL2 - u.cs) + ((u.snapL2 || 0) - (u.snap || 0)) / 3;
  if (diff <= -2.5 && upUsage >= -2) return { k: 'Buy low', cls: 'hi', diff, x, why: `${U.fmt(pf.ppg)} ppg on ${U.fmt(x)} expected from usage · ${u.td} TD vs ${u.xtd} expected` };
  if (diff >= 3 || u.tdOver >= 2.5) return { k: 'Sell high', cls: 'crit', diff, x, why: `${U.fmt(pf.ppg)} ppg vs ${U.fmt(x)} expected · ${u.td} TD vs ${u.xtd} expected (regression risk)` };
  return null;
}
function powerIndex(lg, m) {
  const weeks = {}; m.schedule.filter((s) => s.done && s.pa != null && s.pb != null && (s.pa || s.pb)).forEach((s) => { (weeks[s.week] = weeks[s.week] || []).push([s.a, s.pa], [s.b, s.pb]); });
  const R = Object.fromEntries(m.teams.map((t) => [t.id, { aw: 0, al: 0, pts: 0, n: 0 }]));
  Object.values(weeks).forEach((sc) => sc.forEach(([id, p]) => { if (!R[id]) return; R[id].pts += p; R[id].n++; sc.forEach(([o, q]) => { if (o !== id) { if (p > q) R[id].aw++; else if (p < q) R[id].al++; } }); }));
  return m.teams.map((t) => { const r = R[t.id]; const g = r.n || 1; const ap = r.aw + r.al ? r.aw / (r.aw + r.al) : 0.5; const exp = ap * (t.w + t.l); return { t, ap, allPlay: `${r.aw}-${r.al}`, ppg: r.pts / g, luck: t.w - exp, power: Math.round(100 * (0.45 * ap + 0.35 * (r.pts / g) / Math.max(...Object.values(R).map((x) => x.pts / (x.n || 1)), 1) + 0.2 * t.strength / Math.max(...m.teams.map((x) => x.strength), 1))) }; }).sort((a, b) => b.power - a.power);
}
function keeperAdj(lg, id) { if (lg.mode !== 'keeper' || !D.keeper) return 0; for (const l of Object.values(D.keeper.owners)) { const k = l.find((p) => D.byName[U.norm(p.name)] === id); if (k) return kv(lg, k).surplus * 40; } return 0; }
function tradeRecs(lg, m) {
  if (!m.me) return []; const me = m.me; const win = lg.mode === 'dynasty' ? windowOf(lg, m, me).label : 'Contend';
  const val = (id) => valueOf(lg, id).v + keeperAdj(lg, id); const myNeeds = needs(lg, m, me); const needPos = myNeeds.filter((n) => n.score >= 50).map((n) => n.pos);
  const surplusPos = myNeeds.filter((n) => n.score < 45).map((n) => n.pos); const strength = (ids) => optimalLineup(lg, ids, true).reduce((s, x) => s + x.blend, 0); const base = Object.fromEntries(m.teams.map((t) => [t.id, strength(t.players)]));
  const myGive = me.players.filter((p) => val(p) > 150 && (surplusPos.includes(posTag(p)) || !me.lineup.some((x) => x.id === p) || (win === 'Rebuild' && ageFactor(posTag(p), (D.players[p] || {}).a) < 0.7)));
  const out = [];
  m.teams.filter((t) => !t.me).forEach((t) => {
    const tn = needs(lg, m, t); const theirNeed = tn.filter((n) => n.score >= 50).map((n) => n.pos);
    const theirGive = t.players.filter((p) => val(p) > 150 && (needPos.includes(posTag(p)) || (win === 'Rebuild' && ageFactor(posTag(p), (D.players[p] || {}).a) >= 1)));
    const gives = myGive.filter((p) => theirNeed.includes(posTag(p)) || win === 'Rebuild');
    const combos = []; gives.forEach((a) => { combos.push([a]); gives.forEach((b) => { if (b > a) combos.push([a, b]); }); });
    combos.forEach((give) => theirGive.forEach((get) => {
      const gv = give.reduce((s, p) => s + val(p), 0), rv = val(get); const bal = (rv - gv) / Math.max(gv, rv); if (Math.abs(bal) > 0.22) return;
      const meAfter = strength(me.players.filter((p) => !give.includes(p)).concat(get)) - base[me.id]; const themAfter = strength(t.players.filter((p) => p !== get).concat(give)) - base[t.id];
      const ageGain = win === 'Rebuild' ? ageFactor(posTag(get), (D.players[get] || {}).a) - give.reduce((s, p) => s + ageFactor(posTag(p), (D.players[p] || {}).a), 0) / give.length : 0;
      const mine = win === 'Rebuild' ? ageGain * 6 + bal * 4 : meAfter; if (mine <= 0.3 || themAfter < -0.5) return;
      const news = D.changes.find((c) => (c.players || []).some((n) => [get, ...give].some((p) => U.norm(pname(p)) === U.norm(n))));
      out.push({ t, give, get, gv, rv, bal, meAfter, themAfter, score: mine + Math.max(0, themAfter) * 0.6 - Math.abs(bal) * 3, why: `${posTag(get)} is ${win === 'Rebuild' ? 'a younger long-term asset for your rebuild' : 'your biggest lineup need'}; ${t.name} needs ${give.map(posTag).join('/')} (${tn.filter((n) => theirNeed.includes(n.pos)).map((n) => `${n.pos} ${n.score}`).join(', ') || 'depth'}).${news ? ` News: ${news.text}` : ''}` });
    }));
  });
  const seen = new Set(); return out.sort((a, b) => b.score - a.score).filter((r) => { const k = r.get + '|' + r.t.id; if (seen.has(k)) return false; seen.add(k); return true; }).slice(0, 15);
}
function edges(lg, m) {
  const E = []; const roster = Object.fromEntries(m.teams.flatMap((t) => t.players.map((p) => [p, t]))); const mineSet = new Set(m.me ? m.me.players : []);
  Object.entries(D.adv.depth || {}).forEach(([k, ids]) => { const [team, pos] = k.split('|'); if (!['RB', 'WR', 'TE', 'QB'].includes(pos) || ids.length < 2) return; const top = D.players[ids[0]]; if (!top || !['Out', 'IR', 'Doubtful', 'PUP', 'Sus'].includes(top.i)) return; const nx = ids[1]; if (!D.players[nx]) return; const o = roster[nx]; const u = usageOf(nx);
    const act = !o ? 'Pick up' : o.me ? 'Start' : 'Buy'; const relevant = (perfOf(lg, ids[0]) || {}).vorp > 0 || mineSet.has(ids[0]);
    if (relevant) E.push({ pri: act === 'Pick up' ? 3 : act === 'Start' ? 3 : 2, kind: act, cls: 'hi', title: `${act}: ${pname(nx)} (${team} ${pos})`, msg: `${top.n} is ${top.i}. ${pname(nx)} is next on the depth chart${u ? ` (snap ${u.snap ?? '–'}%, ${pos === 'RB' ? 'carry share ' + u.cs + '%' : 'target share ' + u.ts + '%'})` : ''}${o && !o.me ? ` · owned by ${o.name}` : ''}.`, id: nx }); });
  const recent = D.changes.filter((c) => Date.now() - new Date(c.detected) < 72 * 36e5);
  const seenTxt = new Set(); recent.forEach((c) => (c.players || []).forEach((n) => { const id = D.byName[U.norm(n)]; if (!id || !roster[id]) return; const o = roster[id]; const ln = n.split(' ').slice(-1)[0]; if (c.src === 'ESPN news' && !(c.text || '').includes(ln)) return; if (seenTxt.has(c.text)) return; seenTxt.add(c.text); E.push({ pri: o.me ? 3 : 1, kind: c.kind, cls: o.me ? 'crit' : '', title: `${c.kind}: ${n}${o.me ? ' (your player)' : ` (${o.name})`}`, msg: c.text, id }); }));
  if (m.me) { const myNeeds = needs(lg, m, m.me); m.teams.filter((t) => !t.me).forEach((t) => needs(lg, m, t).filter((n) => n.urgency === 'Critical').forEach((n) => { const mine = myNeeds.find((x) => x.pos === n.pos); if (mine && mine.score < 45) { const spare = m.me.players.filter((p) => posTag(p) === n.pos && !m.me.lineup.some((x) => x.id === p)).sort((a, b) => valueOf(lg, b).v - valueOf(lg, a).v)[0]; if (spare) E.push({ pri: 2, kind: 'Sell', cls: 'med', title: `Sell to ${t.name}: thin at ${n.pos}`, msg: `${t.name} ${n.why}. Your spare ${n.pos} ${pname(spare)} (value ${valueOf(lg, spare).v.toLocaleString()}) is surplus.`, id: spare }); } })); }
  Object.entries(D.adv.usage || {}).forEach(([id, u]) => { if (roster[id] || !D.players[id] || u.g < 3) return; const jump = (u.tsL2 - u.ts) + (u.csL2 - u.cs) + ((u.snapL2 || 0) - (u.snap || 0)) / 2; if (jump >= 8 && (u.snapL2 || 0) >= 40) E.push({ pri: 2, kind: 'Waiver', cls: 'hi', title: `Add before others react: ${pname(id)} (${posTag(id)})`, msg: `Usage spike last 2 weeks: snaps ${u.snap}%→${u.snapL2}%, targets ${u.ts}%→${u.tsL2}%, carries ${u.cs}%→${u.csL2}%. Unrostered here.`, id }); });
  m.teams.forEach((t) => t.players.forEach((id) => { const s = signalOf(lg, id); if (!s) return; if (t.me && s.k === 'Sell high') E.push({ pri: 1, kind: 'Sell high', cls: 'crit', title: `Sell high: ${pname(id)}`, msg: s.why, id }); if (!t.me && s.k === 'Buy low' && (perfOf(lg, id) || {}).score >= 55) E.push({ pri: 1, kind: 'Buy low', cls: 'hi', title: `Buy low: ${pname(id)} from ${t.name}`, msg: s.why, id }); }));
  return E.sort((a, b) => b.pri - a.pri);
}
const plink = (id) => `<button class="link-btn" data-action="player" data-id="${U.esc(id)}"><b>${U.esc(pname(id))}</b></button>`;
const usageNote = '<span class="sub">nflverse weekly stats & snap counts · L2 = last 2 games · estimates</span>';
Object.assign(V, {
  edges(lg, m) {
    const E = edges(lg, m); const tn = new Date(D.meta && D.meta.lastFull || D.meta && D.meta.lastRun || Date.now());
    return `<div class="card"><div class="card-head"><h2>${E.length} edges for ${U.esc(m.me ? m.me.name : lg.name)}</h2><span class="sub">Recomputed ${U.et(tn)} · injuries, depth charts, usage spikes, news, needs</span></div><div class="alerts">${E.slice(0, 60).map((e) => `<div class="alert ${e.cls === 'crit' ? 'critical' : e.cls === 'hi' ? 'info' : 'warning'}"><div class="bar"></div><div><b>${U.esc(e.title)}</b> <span class="tag ${e.cls}">${U.esc(e.kind)}</span><span>${U.esc(e.msg)} ${e.id ? `<button class="link-btn" data-action="player" data-id="${U.esc(e.id)}">details</button>` : ''}</span></div></div>`).join('') || '<div class="small muted">No edges right now.</div>'}</div></div>`;
  },
  finder(lg, m) {
    if (!m.me) return pendingCard(lg); const R = tradeRecs(lg, m); const win = lg.mode === 'dynasty' ? windowOf(lg, m, m.me).label : null;
    return `<div class="card"><div class="card-head"><h2>Suggested offers</h2><span class="sub">Scans every roster for trades that help both lineups${win ? ` · tuned for your ${win} window` : ''}${lg.mode === 'keeper' ? ' · values include keeper salary surplus' : ''} · values within ±22%</span></div>
      ${R.map((r, i) => `<div class="pz-row" style="align-items:flex-start"><span class="tag" style="min-width:28px;text-align:center">${i + 1}</span><span class="grow"><b>To ${U.esc(r.t.name)}:</b> give ${r.give.map(plink).join(' + ')} for ${plink(r.get)}<div class="small muted">Value ${r.gv.toLocaleString()} → ${r.rv.toLocaleString()} (${r.rv - r.gv >= 0 ? '+' : ''}${(r.rv - r.gv).toLocaleString()}) · your lineup ${r.meAfter >= 0 ? '+' : ''}${U.fmt(r.meAfter)} ppg · theirs ${r.themAfter >= 0 ? '+' : ''}${U.fmt(r.themAfter)} ppg</div><div class="small">${U.esc(r.why)}</div></span><button class="btn sm" data-action="loadRec" data-id="${i}">Open in simulator</button></div>`).join('') || '<div class="small muted">No mutually beneficial 1-for-1 or 2-for-1 deals found right now.</div>'}</div>`;
  },
  usage(lg, m) {
    const mine = new Set(m.me ? m.me.players : []); const f = state.uPos || 'ALL';
    const rows = Object.entries(D.adv.usage || {}).filter(([id, u]) => D.players[id] && u.g >= 2 && (f === 'ALL' ? true : f === 'MINE' ? mine.has(id) : posTag(id) === f) && posTag(id) !== 'QB').sort((a, b) => (b[1].wopr + b[1].cs / 100) - (a[1].wopr + a[1].cs / 100)).slice(0, 120);
    return `<div class="seg" style="margin-bottom:12px">${['MINE', 'ALL', 'RB', 'WR', 'TE'].map((p) => `<button data-action="uPos" data-id="${p}" aria-pressed="${p === f}">${p === 'MINE' ? 'My team' : p}</button>`).join('')}</div><div class="card"><div class="card-head"><h2>Opportunity dashboard</h2>${usageNote}</div><div class="table-wrap"><table><thead><tr><th>Player</th><th>Pos</th><th class="num">Snap %</th><th class="num">L2</th><th class="num">Tgt share</th><th class="num">L2</th><th class="num">Carry share</th><th class="num">L2</th><th class="num">WOPR</th><th class="num">Tgt/g</th><th class="num">Car/g</th><th class="num">xFP/g</th><th class="num">Actual</th></tr></thead><tbody>${rows.map(([id, u]) => `<tr ${mine.has(id) ? 'style="background:rgba(44,193,176,.08)"' : ''}><td>${plink(id)} <span class="muted small">${(D.players[id] || {}).t || ''}</span></td><td>${posTag(id)}</td><td class="num">${u.snap ?? '—'}</td><td class="num">${trend(u.snap, u.snapL2)}</td><td class="num">${u.ts}</td><td class="num">${trend(u.ts, u.tsL2)}</td><td class="num">${u.cs}</td><td class="num">${trend(u.cs, u.csL2)}</td><td class="num">${U.fmt(u.wopr, 2)}</td><td class="num">${u.tgtG}</td><td class="num">${u.carG}</td><td class="num">${U.fmt(xfpg(lg, id))}</td><td class="num">${U.fmt((perfOf(lg, id) || {}).ppg)}</td></tr>`).join('')}</tbody></table></div><p class="small muted" style="margin:8px 0 0">Red-zone usage isn't in the free weekly feed; xFP uses league-average yards and TD rates per target/carry (estimate).</p></div>`;
  },
  proj(lg, m) {
    if (!m.me) return pendingCard(lg); const w = nextWeek(m); const ids = m.me.players.filter((p) => perfOf(lg, p));
    const rows = ids.map((id) => ({ id, opp: oppOf((D.players[id] || {}).t, w), wk: projWeek(lg, id, w), ros: projROS(lg, id, w), po: [15, 16, 17].reduce((s, x) => s + projWeek(lg, id, x), 0) })).sort((a, b) => b.ros - a.ros);
    return `<div class="card"><div class="card-head"><h2>Week ${w} & rest of season</h2><span class="sub">Blended ppg × opponent's fantasy points allowed to the position (SOS) · byes = 0 · ${U.esc(lg.scoring)} · estimates</span></div><div class="table-wrap"><table><thead><tr><th>Player</th><th>Pos</th><th>Wk ${w} opp</th><th class="num">SOS</th><th class="num">Wk ${w} proj</th><th class="num">ROS proj</th><th class="num">Playoffs W15–17</th></tr></thead><tbody>${rows.map((r) => { const s = sosOf(r.opp, posTag(r.id)); return `<tr><td>${plink(r.id)} ${injTag(r.id)}</td><td>${posTag(r.id)}</td><td>${r.opp || 'BYE'}</td><td class="num ${s > 1.08 ? 'pos' : s < 0.92 ? 'neg' : ''}">${U.fmt(s, 2)}</td><td class="num"><b>${U.fmt(r.wk)}</b></td><td class="num">${U.fmt(r.ros, 0)}</td><td class="num">${U.fmt(r.po)}</td></tr>`; }).join('')}</tbody></table></div><p class="small muted" style="margin:8px 0 0">SOS > 1 = defense allows more fantasy points than average to that position this season (small sample early in the year).</p></div>`;
  },
  signals(lg, m) {
    const roster = Object.fromEntries(m.teams.flatMap((t) => t.players.map((p) => [p, t]))); const list = Object.keys(D.adv.usage || {}).map((id) => ({ id, s: signalOf(lg, id) })).filter((x) => x.s && D.players[x.id]).sort((a, b) => Math.abs(b.s.diff) - Math.abs(a.s.diff));
    const tbl = (k) => `<div class="card"><div class="card-head"><h2>${k}</h2><span class="sub">${k === 'Buy low' ? 'Producing below what their usage predicts' : 'Producing above usage, or TD-heavy'}</span></div>${list.filter((x) => x.s.k === k).slice(0, 25).map((x) => `<div class="wire-row"><span class="tag ${x.s.cls}">${x.s.diff >= 0 ? '+' : ''}${U.fmt(x.s.diff)}</span><span style="flex:1">${plink(x.id)} <span class="muted small">${posTag(x.id)} · ${roster[x.id] ? (roster[x.id].me ? '<b>your team</b>' : U.esc(roster[x.id].name)) : 'FA'}</span><div class="small muted">${U.esc(x.s.why)}</div></span></div>`).join('') || '<div class="small muted">None.</div>'}</div>`;
    return `<div class="grid two" style="grid-template-columns:1fr 1fr">${tbl('Buy low')}${tbl('Sell high')}</div>`;
  },
  handcuffs(lg, m) {
    const roster = Object.fromEntries(m.teams.flatMap((t) => t.players.map((p) => [p, t]))); const mine = new Set(m.me ? m.me.players : []);
    const rows = Object.entries(D.adv.depth || {}).filter(([k, ids]) => k.endsWith('|RB') && ids.length >= 2).map(([k, ids]) => ({ team: k.split('|')[0], rb1: ids[0], rb2: ids[1] })).filter((r) => D.players[r.rb1]).sort((a, b) => (mine.has(b.rb1) ? 1 : 0) - (mine.has(a.rb1) ? 1 : 0) || ((perfOf(lg, b.rb1) || {}).blend || 0) - ((perfOf(lg, a.rb1) || {}).blend || 0));
    const own = (id) => roster[id] ? (roster[id].me ? '<span class="tag hi">You</span>' : `<span class="tag">${U.esc(roster[id].name.slice(0, 18))}</span>`) : '<span class="tag med">FA</span>';
    return `<div class="card"><div class="card-head"><h2>RB handcuff map</h2><span class="sub">Sleeper depth chart · backup's current snap/carry share · contingent value = RB1 blended ppg × 0.75 (estimate)</span></div><div class="table-wrap"><table><thead><tr><th>Team</th><th>RB1</th><th>Owner</th><th>Backup</th><th>Owner</th><th class="num">Backup snap %</th><th class="num">Carry share</th><th class="num">Contingent ppg</th></tr></thead><tbody>${rows.map((r) => { const u = usageOf(r.rb2) || {}; return `<tr ${mine.has(r.rb1) ? 'style="background:rgba(44,193,176,.08)"' : ''}><td>${r.team}</td><td>${plink(r.rb1)} ${injTag(r.rb1)}</td><td>${own(r.rb1)}</td><td>${D.players[r.rb2] ? plink(r.rb2) : '—'}</td><td>${own(r.rb2)}</td><td class="num">${u.snap ?? '—'}</td><td class="num">${u.cs ?? '—'}</td><td class="num">${U.fmt(((perfOf(lg, r.rb1) || {}).blend || 0) * 0.75)}</td></tr>`; }).join('')}</tbody></table></div></div>`;
  },
  byes(lg, m) {
    if (!m.me) return pendingCard(lg); const w0 = nextWeek(m); const weeks = []; for (let w = w0; w <= 17; w++) weeks.push(w); const st = m.me.players.filter((p) => perfOf(lg, p) && ((perfOf(lg, p).vorp || -9) > -3 || m.me.lineup.some((x) => x.id === p)));
    const out = (w) => st.filter((p) => !oppOf((D.players[p] || {}).t, w)); const cell = (p, w) => { const o = oppOf((D.players[p] || {}).t, w); if (!o) return '<td class="num" style="background:rgba(255,107,107,.18)">BYE</td>'; const s = sosOf(o, posTag(p)); return `<td class="num small" style="background:${s > 1.1 ? 'rgba(94,210,106,.14)' : s < 0.9 ? 'rgba(255,107,107,.08)' : 'transparent'}">${o}</td>`; };
    return `<div class="card"><div class="card-head"><h2>Bye & schedule grid</h2><span class="sub">Green = soft matchup (SOS > 1.1), red tint = tough · weeks 15–17 = fantasy playoffs</span></div><div class="table-wrap"><table class="tight"><thead><tr><th>Player</th>${weeks.map((w) => `<th class="num" ${w >= 15 ? 'style="color:var(--accent)"' : ''}>W${w}</th>`).join('')}</tr></thead><tbody>${st.map((p) => `<tr><td>${plink(p)} <span class="muted small">${posTag(p)}</span></td>${weeks.map((w) => cell(p, w)).join('')}</tr>`).join('')}<tr><td><b>Players on bye</b></td>${weeks.map((w) => { const n = out(w).length; return `<td class="num ${n >= 3 ? 'neg' : ''}"><b>${n || ''}</b></td>`; }).join('')}</tr></tbody></table></div>
      <div class="small muted" style="margin-top:8px">Problem weeks: ${weeks.filter((w) => out(w).length >= 2).map((w) => `W${w} (${out(w).map(pname).join(', ')})`).join(' · ') || 'none'}</div></div>`;
  },
  power(lg, m) {
    if (!m.teams.length) return pendingCard(lg); const P = powerIndex(lg, m);
    return `<div class="card"><div class="card-head"><h2>Power index</h2><span class="sub">All-play record (every team vs every team each week) · luck = actual wins − all-play expected wins · power = 45% all-play + 35% scoring + 20% current lineup</span></div><div class="table-wrap"><table><thead><tr><th>#</th><th>Team</th><th class="num">Record</th><th class="num">All-play</th><th class="num">True win %</th><th class="num">Pts/wk</th><th class="num">Luck</th><th class="num">Power</th></tr></thead><tbody>${P.map((r, i) => `<tr ${r.t.me ? 'style="background:rgba(44,193,176,.08)"' : ''}><td>${i + 1}</td><td><button class="link-btn" data-action="team" data-id="${r.t.id}"><b>${U.esc(r.t.name)}</b></button></td><td class="num">${r.t.w}-${r.t.l}</td><td class="num">${r.allPlay}</td><td class="num">${Math.round(r.ap * 100)}%</td><td class="num">${U.fmt(r.ppg)}</td><td class="num ${r.luck >= 0.5 ? 'pos' : r.luck <= -0.5 ? 'neg' : ''}">${r.luck >= 0 ? '+' : ''}${U.fmt(r.luck)}</td><td class="num"><b>${r.power}</b></td></tr>`).join('')}</tbody></table></div></div>`;
  },
  changes() {
    const meta = D.meta || {};
    return `<div class="stats" style="margin-bottom:14px"><div class="stat"><div class="stat-label">Last full recompute</div><div class="stat-value" style="font-size:20px">${meta.lastFull ? U.et(meta.lastFull) : U.et(meta.lastRun)}</div><div class="stat-sub">trigger: ${U.esc(meta.trigger || 'schedule')}</div></div><div class="stat"><div class="stat-label">Check cadence</div><div class="stat-value" style="font-size:20px">Every 2h</div><div class="stat-sub">8 AM–midnight ET · hourly Sunday afternoon</div></div><div class="stat"><div class="stat-label">Events logged</div><div class="stat-value">${D.changes.length}</div></div></div>
      <div class="card"><div class="card-head"><h2>What changed</h2><span class="sub">Significant events found by the light check (ESPN news + official injury report). Each one triggers a full recompute of values, edges and trade recs.</span></div>${D.changes.slice(0, 80).map((c) => `<div class="wire-row"><span class="wire-date num">${U.et(c.detected)}</span><span class="tag ${c.kind === 'Trade' || c.kind === 'IR' ? 'crit' : c.kind === 'Injury' ? 'med' : 'hi'}">${U.esc(c.kind)}</span><span>${c.url ? `<a href="${U.esc(c.url)}" target="_blank" rel="noopener">${U.esc(c.text)}</a>` : U.esc(c.text)}<div class="small muted">${U.esc(c.src)} · ${(c.players || []).map(U.esc).join(', ')}</div></span></div>`).join('') || '<div class="small muted">Nothing logged yet.</div>'}</div>`;
  },
});
Object.assign(actions, {
  uPos: (id) => { state.uPos = id; render(); },
  loadRec: (i) => { const lg = LEAGUES[state.league]; const r = tradeRecs(lg, model(lg))[+i]; if (!r) return; state.tm = { partner: r.t.id, give: r.give.slice(), get: [r.get] }; go({ module: lg.mode === 'redraft' ? 'analyzer' : 'trade' }); },
});
