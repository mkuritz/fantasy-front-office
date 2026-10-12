/* Fantasy Front Office — a Sports Labs product. Static app; data/*.json refreshed by GitHub Actions. */
'use strict';
const U = {
  esc: (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])),
  fmt: (x, d = 1) => x == null || isNaN(x) ? '—' : Number(x).toFixed(d),
  et: (t) => { try { return new Date(t).toLocaleString('en-US', { timeZone: 'America/New_York', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) + ' ET'; } catch (e) { return ''; } },
  ago: (t) => { const m = (Date.now() - new Date(t)) / 6e4; return isNaN(m) ? '' : m < 60 ? `${Math.max(1, Math.round(m))}m ago` : m < 2880 ? `${Math.round(m / 60)}h ago` : `${Math.round(m / 1440)}d ago`; },
  norm: (n) => String(n || '').toLowerCase().replace(/[.']/g, '').replace(/-/g, ' ').replace(/[^a-z ]/g, '').replace(/\b(jr|sr|ii|iii|iv|v)\b/g, '').replace(/\s+/g, ' ').trim(),
  randn: () => { let u = 0, v = 0; while (!u) u = Math.random(); while (!v) v = Math.random(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); },
};
const SL_MARK = `<a class="sl-mark" href="https://mkuritz.github.io/sports-labs/" title="Sports Labs — all suites"><svg width="16" height="16" viewBox="0 0 32 32" aria-hidden="true"><rect width="32" height="32" rx="8" fill="#0b1220"/><path d="M9 21c2 2 4.5 3 7 3 3.3 0 6-1.6 6-4.4 0-5.6-12-3.4-12-8.6C10 8.6 12.6 7 15.6 7c2.2 0 4.2.8 5.6 2.2" stroke="#22d3ee" stroke-width="2.6" fill="none" stroke-linecap="round"/></svg>A Sports Labs product</a>`;
const LOGO = `<svg width="34" height="34" viewBox="0 0 34 34" fill="none" aria-label="Fantasy Front Office" role="img"><rect x="1" y="1" width="32" height="32" rx="8" fill="#0b3a4a"/><path d="M10 24V10h11M10 17h8" stroke="#2cc1b0" stroke-width="2.6" stroke-linecap="round"/><circle cx="24" cy="23" r="2.4" fill="#f5b942"/></svg>`;
const LEAGUES = {
  dynasty: { id: 'dynasty', name: 'Show Us Your TDs', short: 'Dynasty', mode: 'dynasty', platform: 'Sleeper', perf: 'dynasty', market: 'dyn', slots: ['QB', 'RB', 'RB', 'WR', 'WR', 'WR', 'TE', 'FLEX', 'FLEX'], color: '#5b3cc4', scoring: '0.5 PPR · 4-pt pass TD · −1 INT', faab: 100 },
  kal: { id: 'kal', name: 'KAL', short: 'Keeper', mode: 'keeper', platform: 'ESPN', perf: 'kal', market: 'red1', slots: ['QB', 'RB', 'RB', 'WR', 'WR', 'TE', 'FLEX', 'K'], color: '#9a6d0b', scoring: 'Full PPR · $200 auction · 18 keepers · $100 FAAB', faab: 100, cap: 200, keepers: 18, teamId: 5 },
  dcigs: { id: 'dcigs', name: 'D CIGS', short: 'Redraft SF', mode: 'redraft', platform: 'ESPN', perf: 'dcigs', market: 'red2', slots: ['QB', 'RB', 'RB', 'WR', 'WR', 'TE', 'FLEX', 'SFLEX', 'K'], color: '#a8322a', scoring: 'Full PPR · Superflex', faab: 100, teamId: 16 },
  lomo: { id: 'lomo', name: 'LOMOFAGS', short: 'Redraft', mode: 'redraft', platform: 'ESPN', perf: 'lomo', market: 'red1', slots: ['QB', 'RB', 'RB', 'WR', 'WR', 'TE', 'FLEX', 'K'], color: '#1f7a4d', scoring: 'Full PPR + 0.2 / completion · $100 FAAB', faab: 100, teamId: 4 },
};
const FLEXOK = { FLEX: ['RB', 'WR', 'TE'], SFLEX: ['QB', 'RB', 'WR', 'TE'] };
const D = { meta: null, players: {}, perf: {}, market: {}, news: [], keeper: null, sleeper: null, espn: {}, plan: '', rookies: [] };

/* ---------------- data ---------------- */
async function getJson(n) { const r = await fetch(`data/${n}?v=${Date.now()}`, { cache: 'no-store' }); if (!r.ok) throw new Error(n + ' ' + r.status); return r.json(); }
async function getText(n) { const r = await fetch(`data/${n}?v=${Date.now()}`); if (!r.ok) throw new Error(n); return r.text(); }
async function loadData() {
  const names = ['meta.json', 'players.json', 'performance.json', 'values_market.json', 'news.json', 'keeper_salaries.json', 'sleeper_dynasty.json', 'espn_kal.json', 'espn_dcigs.json', 'espn_lomo.json', 'advanced.json', 'changes.json'];
  const res = await Promise.allSettled(names.map(getJson)); const g = {}; res.forEach((r, i) => { if (r.status === 'fulfilled') g[names[i]] = r.value; });
  D.meta = g['meta.json'] || null; D.players = (g['players.json'] || {}).data || {}; D.perf = (g['performance.json'] || {}).data || {};
  D.news = (g['news.json'] || {}).data || []; D.keeper = g['keeper_salaries.json'] || null; D.sleeper = (g['sleeper_dynasty.json'] || {}).data || null; D.adv = (g['advanced.json'] || {}).data || { usage: {}, sos: {}, schedule: {}, byes: {}, depth: {} }; D.changes = Array.isArray(g['changes.json']) ? g['changes.json'] : [];
  ['kal', 'dcigs', 'lomo'].forEach((k) => { if (g[`espn_${k}.json`]) D.espn[k] = g[`espn_${k}.json`].data; });
  const mk = (g['values_market.json'] || {}).data || {}; Object.entries(mk).forEach(([k, rows]) => { const m = {}; rows.forEach((r) => { if (r.s) m[r.s] = r; m['n:' + U.norm(r.n)] = r; }); D.market[k] = m; });
  D.byName = {}; Object.entries(D.players).forEach(([id, p]) => { const k = U.norm(p.n); if (!D.byName[k] || (p.r || 9999) < (D.players[D.byName[k]].r || 9999)) D.byName[k] = id; });
  D.byEspn = {}; Object.entries(D.players).forEach(([id, p]) => { if (p.e) D.byEspn[String(p.e)] = id; });
  try { D.plan = await getText('rebuild_plan.md'); } catch (e) { /* optional */ }
  try { D.rookies = parseCSV(await getText('rookie_report_2027_2028.csv')); } catch (e) { /* optional */ }
}
function parseCSV(t) { const rows = []; let row = [], f = '', q = false; for (let i = 0; i < t.length; i++) { const c = t[i]; if (q) { if (c === '"' && t[i + 1] === '"') { f += '"'; i++; } else if (c === '"') q = false; else f += c; } else if (c === '"') q = true; else if (c === ',') { row.push(f); f = ''; } else if (c === '\n') { row.push(f); rows.push(row); row = []; f = ''; } else if (c !== '\r') f += c; } if (f || row.length) { row.push(f); rows.push(row); } const h = rows.shift() || []; return rows.filter((r) => r.length > 3).map((r) => Object.fromEntries(h.map((k, i) => [k, r[i]]))); }

/* ---------------- league model ---------------- */
const pname = (id) => (D.players[id] || {}).n || String(id).split(':')[2] || `#${id}`;
function perfOf(lg, id) { return (D.perf[lg.perf] || {})[id] || null; }
function marketOf(lg, id, key) { const m = D.market[key || lg.market] || {}; return m[id] || m['n:' + U.norm(pname(id))] || null; }
const AGE = { QB: [24, 33, 37], RB: [22, 26, 29], WR: [22, 28, 31], TE: [23, 29, 32], K: [23, 35, 40] };
function ageFactor(pos, age) { const c = AGE[pos]; if (!c || !age) return 0.7; const [, b, z] = c; if (age <= b) return 1 + (b - age) * 0.04; if (age >= z) return 0.15; return 1 - 0.85 * (age - b) / (z - b); }
function lgData(lg) { return lg.platform === 'Sleeper' ? D.sleeper : D.espn[lg.id] || null; }
function connected(lg) { return !!lgData(lg); }
function weeksLeft(lg) { const w = (lgData(lg) || {}).week || (D.sleeper || {}).week || 5; return Math.max(1, 17 - w + 1); }
/** Stat-based value in the league's own mode. Every number here is an estimate. */
function valueOf(lg, id) {
  const p = D.players[id] || {}; const pf = perfOf(lg, id); const vorp = pf ? pf.vorp : -3; const mk = marketOf(lg, id);
  if (lg.mode === 'dynasty') { const stat = Math.max(0, vorp + 3) * ageFactor(p.p, p.a) * 420; return { v: Math.round(mk ? 0.5 * mk.v + 0.5 * stat : stat), stat: Math.round(stat), mkt: mk ? mk.v : null }; }
  const stat = Math.max(0, vorp + 2) * weeksLeft(lg) * 22; return { v: Math.round(mk ? 0.4 * mk.v + 0.6 * stat : stat), stat: Math.round(stat), mkt: mk ? mk.v : null };
}
let stateVersion = 0;
function model(lg) {
  if (lg._m && lg._mv === stateVersion) return lg._m;
  const m = { teams: [], schedule: [], tx: [], week: 1, pending: !connected(lg), playoffTeams: 6, lastReg: 14 };
  if (lg.platform === 'Sleeper' && D.sleeper) {
    const S = D.sleeper; const users = Object.fromEntries(S.users.map((u) => [u.user_id, u]));
    m.week = S.week; m.playoffTeams = S.league.settings.playoff_teams || 6; m.lastReg = (S.league.settings.playoff_week_start || 15) - 1;
    m.teams = S.rosters.map((r) => { const u = users[r.owner_id] || {}; const st = r.settings || {}; return { id: r.roster_id, name: u.team_name || u.display_name || `Team ${r.roster_id}`, owner: u.display_name || '', players: [...(r.players || [])], taxi: r.taxi || [], starters: r.starters || [], w: st.wins || 0, l: st.losses || 0, t: st.ties || 0, pf: (st.fpts || 0) + (st.fpts_decimal || 0) / 100, pa: (st.fpts_against || 0) + (st.fpts_against_decimal || 0) / 100, faabLeft: (S.league.settings.waiver_budget || 100) - (st.waiver_budget_used || 0), me: r.roster_id === S.myRosterId }; });
    Object.entries(S.matchups).forEach(([w, ms]) => { const g = {}; ms.forEach((x) => { if (x.matchup_id == null) return; (g[x.matchup_id] = g[x.matchup_id] || []).push(x); }); Object.values(g).forEach((p) => { if (p.length === 2) m.schedule.push({ week: +w, a: p[0].roster_id, b: p[1].roster_id, pa: p[0].points, pb: p[1].points, done: +w < S.week }); }); });
    const tn = (rid) => (m.teams.find((t) => t.id === rid) || {}).name || rid;
    m.tx = S.transactions.filter((t) => ['free_agent', 'waiver', 'trade', 'commissioner'].includes(t.type) && t.created).map((t) => { const parts = (t.roster_ids || []).map((rid) => ({ team: rid, adds: Object.entries(t.adds || {}).filter(([, r]) => r === rid).map(([p]) => p), drops: Object.entries(t.drops || {}).filter(([, r]) => r === rid).map(([p]) => p), picks: (t.draft_picks || []).filter((d) => d.owner_id === rid).map((d) => `${d.season} R${d.round}`) })).filter((x) => x.adds.length || x.drops.length || x.picks.length); return { t: t.created < 1e12 ? t.created * 1000 : t.created, kind: t.type === 'commissioner' ? 'commish' : t.type, bid: (t.settings || {}).waiver_bid || 0, parts }; }).filter((x) => x.parts.length);
    m.picks = rookiePicks(S, m);
  } else if (D.espn[lg.id]) {
    const E = D.espn[lg.id]; m.week = E.week || 5; const POS = { 1: 'QB', 2: 'RB', 3: 'WR', 4: 'TE', 5: 'K', 16: 'DST' };
    const sid = (p) => D.byEspn[String(p.id)] || D.byName[U.norm(p.name)] || `espn:${p.id}:${p.name}:${POS[p.pos] || ''}`;
    m.teams = E.teams.map((t) => ({ id: t.id, name: t.name, owner: t.abbrev, players: t.players.map(sid), starters: t.players.filter((p) => ![20, 21].includes(p.slot)).map(sid), w: (t.record || {}).wins || 0, l: (t.record || {}).losses || 0, t: (t.record || {}).ties || 0, pf: (t.record || {}).pointsFor || 0, pa: (t.record || {}).pointsAgainst || 0, faabLeft: (E.acqBudget || lg.faab) - (t.faab || 0), me: t.id === lg.teamId }));
    m.schedule = E.schedule.filter((s) => s.away != null).map((s) => ({ week: s.week, a: s.home, b: s.away, pa: s.hp, pb: s.ap, done: !!s.winner && s.winner !== 'UNDECIDED' }));
    m.tx = (E.transactions || []).filter((t) => t.items && t.kind).map((t) => { const sid = (it) => it.sid || D.byEspn[String(it.espn)] || `espn:${it.espn}:${it.name}:${it.pos || ''}`; const by = {}; t.items.forEach((it) => { const team = it.act === 'drop' ? it.from : (it.to ?? t.team); const P = (by[team] = by[team] || { team, adds: [], drops: [], picks: [] }); (it.act === 'drop' ? P.drops : P.adds).push(sid(it)); }); return { t: t.t, kind: t.kind, bid: t.bid, parts: Object.values(by).filter((x) => x.team != null) }; }).filter((x) => x.parts.length);
  }
  (state.trades[lg.id] || []).forEach((tr) => { const A = m.teams.find((t) => t.me); const B = m.teams.find((t) => t.id === tr.partner); if (!A || !B) return; tr.give.forEach((p) => { A.players = A.players.filter((x) => x !== p); B.players.push(p); }); tr.get.forEach((p) => { B.players = B.players.filter((x) => x !== p); A.players.push(p); }); });
  m.teams.forEach((t) => { t.lineup = optimalLineup(lg, t.players); t.strength = t.lineup.reduce((s, x) => s + (x.blend || 0), 0); t.value = t.players.reduce((s, p) => s + valueOf(lg, p).v, 0); t.ages = t.players.map((p) => (D.players[p] || {}).a).filter(Boolean); });
  m.me = m.teams.find((t) => t.me) || null; lg._m = m; lg._mv = stateVersion; return m;
}
function rookiePicks(S, m) {
  const rounds = S.league.settings.draft_rounds || 5; const own = [];
  m.teams.forEach((t) => [2027, 2028].forEach((y) => { for (let r = 1; r <= rounds; r++) own.push({ season: y, round: r, orig: t.id, owner: t.id }); }));
  S.tradedPicks.forEach((tp) => { const p = own.find((o) => o.season === +tp.season && o.round === tp.round && o.orig === tp.roster_id); if (p) p.owner = tp.owner_id; });
  return own;
}
function optimalLineup(lg, ids, ros) {
  const pool = ids.map((id) => ({ id, pos: (D.players[id] || {}).p || String(id).split(':')[3], blend: (perfOf(lg, id) || {}).blend || 0, inj: (D.players[id] || {}).i })).filter((x) => !(ros ? ['IR', 'PUP', 'Sus'] : ['Out', 'IR', 'PUP', 'Sus', 'Doubtful']).includes(x.inj)).sort((a, b) => b.blend - a.blend);
  const used = new Set(); const out = []; const order = [...lg.slots].sort((a, b) => (FLEXOK[a] ? 1 : 0) - (FLEXOK[b] ? 1 : 0));
  order.forEach((slot) => { const ok = FLEXOK[slot] || [slot]; const p = pool.find((x) => !used.has(x.id) && ok.includes(x.pos)); if (p) { used.add(p.id); out.push({ slot, ...p }); } else out.push({ slot, id: null, blend: 0 }); });
  return out;
}
function needs(lg, m, team) {
  return ['QB', 'RB', 'WR', 'TE'].map((P) => {
    const sum = (t) => t.lineup.filter((x) => x.pos === P && x.id).reduce((a, x) => a + x.blend, 0); const mine = sum(team); const avg = m.teams.reduce((s, t) => s + sum(t), 0) / m.teams.length;
    const cnt = lg.slots.filter((s) => s === P).length || 1; const depth = team.players.filter((p) => (D.players[p] || {}).p === P && ((perfOf(lg, p) || {}).vorp ?? -9) > -2).length;
    const gap = avg ? (avg - mine) / avg : 0; const score = Math.max(0, Math.min(100, Math.round(50 + gap * 120 + (depth <= cnt ? 15 : 0))));
    return { pos: P, score, urgency: score >= 75 ? 'Critical' : score >= 58 ? 'High' : score >= 40 ? 'Medium' : 'Low', why: `starters ${U.fmt(mine)} ppg vs league ${U.fmt(avg)} · ${depth} usable` };
  }).sort((a, b) => b.score - a.score);
}

/* ---------------- state / scenarios ---------------- */
const KEY = 'ffo-state-v1';
const state = Object.assign({ league: 'dynasty', module: 'hub', trades: {}, keepers: {}, bids: {}, tm: { partner: null, give: [], get: [] }, saved: [] }, JSON.parse(localStorage.getItem(KEY) || '{}'));
let dirty = false;
function set(fn) { fn(state); stateVersion++; dirty = true; render(); }
function persist() { localStorage.setItem(KEY, JSON.stringify(state)); }
function save(name) { state.saved = [{ name: name || `Scenario ${new Date().toLocaleString('en-US', { timeZone: 'America/New_York' })}`, at: Date.now(), trades: state.trades, keepers: state.keepers, bids: state.bids }, ...(state.saved || [])].slice(0, 20); persist(); dirty = false; toast('Saved locally', 'ok'); render(); }
setInterval(() => { if (dirty) persist(); }, 4000);

/* ---------------- UI helpers ---------------- */
function toast(msg, kind = '', ms = 2600) { const h = document.getElementById('toasts'); const t = document.createElement('div'); t.className = 'toast ' + kind; t.textContent = msg; h.appendChild(t); setTimeout(() => t.remove(), ms); }
function modal(html) { document.getElementById('modalBox').innerHTML = html; document.getElementById('modal').classList.add('open'); }
function closeModal() { document.getElementById('modal').classList.remove('open'); }
const urg = (u) => u === 'Critical' ? 'crit' : u === 'High' ? 'med' : u === 'Medium' ? 'hi' : 'low';
const injTag = (id) => { const i = (D.players[id] || {}).i; return i ? `<span class="tag ${['Out', 'IR', 'Sus', 'PUP'].includes(i) ? 'crit' : 'med'}">${U.esc(i)}</span>` : ''; };
function scoreBadge(lg, id) { const pf = perfOf(lg, id); if (!pf) return `<span class="ps na" title="No 2025–26 stat sample">—<small>no data</small></span>`; return `<span class="ps ${pf.score >= 85 ? 't1' : pf.score >= 65 ? 't2' : ''}" title="Performance Score ${pf.score} (estimate) · ${pf.pos}${pf.rank} · ${U.fmt(pf.blend)} blended ppg · VORP ${U.fmt(pf.vorp)}">${Math.round(pf.score)}<small>${pf.pos}${pf.rank}</small></span>`; }
function pcard(lg, id, { compact = false, extra = '' } = {}) { const p = D.players[id] || { n: pname(id), p: String(id).split(':')[3] }; const pf = perfOf(lg, id); const v = valueOf(lg, id); return `<button class="pcard2 ${compact ? 'compact' : ''} ${['Out', 'IR'].includes(p.i) ? 'inj' : ''}" data-action="player" data-id="${U.esc(id)}"><span class="avatar">${U.esc(p.p || '?')}</span><span class="pinfo"><span class="pname">${U.esc(p.n)}</span><span class="pmeta">${p.t || 'FA'} · ${p.a || '–'} yrs · ${pf ? `${U.fmt(pf.ppg)} ppg (${pf.g}g)` : 'no 2026 sample'} · val ${v.v.toLocaleString()}</span>${compact && !extra ? '' : `<span class="ptags">${injTag(id)}${extra}</span>`}</span>${scoreBadge(lg, id)}</button>`; }
const needBar = (n) => `<div class="need-row"><span class="need-pos">${n.pos}</span><div class="need-bar"><div class="need-fill ${urg(n.urgency)}" style="width:${n.score}%"></div></div><span class="need-score num">${n.score}</span><span class="tag ${urg(n.urgency)}">${n.urgency}</span><span class="need-why small muted">${U.esc(n.why)}</span></div>`;
const pendingCard = (lg) => `<div class="card" style="margin-bottom:14px"><div class="card-head"><h2>${U.esc(lg.name)} · ESPN connect pending</h2><span class="tag med">Private league</span></div><p class="small" style="margin:0;color:var(--text-2);line-height:1.6">This ESPN league is private. Rosters, standings, matchups and activity load once the <code>ESPN_S2</code> and <code>ESPN_SWID</code> repository secrets are set; the scheduled workflow then pulls them server-side. The cookies are never stored in the site or sent to your browser. ${lg.mode === 'keeper' ? 'The keeper board and cap planner already work from the league salary sheet.' : 'Stat-based player values, news and waiver rankings by league scoring already work.'}</p></div>`;
const KIND = { free_agent: 'Free agent', waiver: 'Waiver', trade: 'Trade', keeper: 'Keeper', commish: 'Commissioner' };
function txText(m, t) { const tn = (id) => ((m.teams.find((x) => x.id === id) || {}).name) || 'Unknown team'; const pl = (id) => { const p = D.players[id]; return p ? `${p.n} (${p.p}${p.t ? ', ' + p.t : ''})` : pname(id); }; const list = (a) => a.map(pl).join(', ');
  if (t.kind === 'trade') return 'Trade: ' + t.parts.map((x) => `${tn(x.team)} get ${[...x.adds.map(pl), ...x.picks].join(', ') || 'nothing'}`).join(' · ');
  return t.parts.map((x) => { const a = []; if (x.adds.length) a.push(t.kind === 'waiver' ? `claimed ${list(x.adds)} off waivers${t.bid ? ` ($${t.bid} FAAB)` : ''}` : t.kind === 'keeper' ? `kept ${list(x.adds)}` : `added ${list(x.adds)}`); if (x.drops.length) a.push(`dropped ${list(x.drops)}`); return `${tn(x.team)} ${a.join(', ')}`; }).join(' · '); }
const recentTx = (m) => m.tx.filter((t) => Date.now() - t.t < 14 * 864e5).slice(0, 15);
const txRowM = (m) => (t) => `<div class="wire-row"><span class="wire-date num" title="${U.et(t.t)}">${U.ago(t.t)}</span><span class="tag ${t.kind === 'trade' ? 'hi' : t.kind === 'waiver' ? 'med' : ''}">${KIND[t.kind] || t.kind}</span><span>${U.esc(txText(m, t))}</span></div>`;
const txRowLegacy = (t) => `<div class="wire-row"><span class="wire-date num">${t.t ? U.ago(t.t) : ''}</span><span class="tag ${t.type === 'Trade' ? 'hi' : ''}">${t.type}</span><span>${U.esc(t.text)}</span></div>`;
const newsRow = (n, mine) => { const hit = mine && (n.ath || []).some((a) => mine.has(U.norm(a))); return `<div class="wire-row"><span class="wire-date num">${U.ago(n.t)}</span>${hit ? '<span class="tag hi">My player</span>' : ''}<span><a href="${U.esc(n.u || '#')}" target="_blank" rel="noopener"><b>${U.esc(n.h)}</b></a><div class="small muted">${U.esc((n.d || '').slice(0, 160))}</div></span></div>`; };
function ordinal(n) { if (!n) return '—'; const s = ['th', 'st', 'nd', 'rd'], v = n % 100; return n + (s[(v - 20) % 10] || s[v] || s[0]); }

/* ---------------- analytics ---------------- */
const SIGMA = 22;
function winProb(A, B) { const z = (A.strength - B.strength) / (SIGMA * Math.SQRT2); return 0.5 * (1 + Math.tanh(z * 1.128)); }
const _sim = {};
function simulate(lg, m, n, tag = '') {
  const key = lg.id + tag + ':' + stateVersion + ':' + n; if (_sim[key]) return _sim[key];
  const res = Object.fromEntries(m.teams.map((t) => [t.id, { playoffs: 0, top: 0, title: 0, wins: 0 }])); const rem = m.schedule.filter((s) => !s.done && s.week <= m.lastReg);
  const T = Object.fromEntries(m.teams.map((t) => [t.id, t]));
  for (let i = 0; i < n; i++) {
    const w = Object.fromEntries(m.teams.map((t) => [t.id, t.w])), pf = Object.fromEntries(m.teams.map((t) => [t.id, t.pf]));
    rem.forEach((s) => { const a = T[s.a].strength + SIGMA * U.randn(), b = T[s.b].strength + SIGMA * U.randn(); pf[s.a] += a; pf[s.b] += b; if (a > b) w[s.a]++; else w[s.b]++; });
    const order = m.teams.map((t) => t.id).sort((x, y) => w[y] - w[x] || pf[y] - pf[x]); const po = order.slice(0, m.playoffTeams);
    po.forEach((id) => res[id].playoffs++); res[order[0]].top++; m.teams.forEach((t) => { res[t.id].wins += w[t.id]; });
    let alive = po.slice(); while (alive.length > 1) { const half = Math.floor(alive.length / 2); const nx = alive.length % 2 ? [alive[0]] : []; const rest = alive.length % 2 ? alive.slice(1) : alive; for (let k = 0; k < rest.length / 2; k++) { const a = rest[k], b = rest[rest.length - 1 - k]; nx.push(T[a].strength + SIGMA * U.randn() > T[b].strength + SIGMA * U.randn() ? a : b); } alive = nx; if (half === 0) break; }
    res[alive[0]].title++;
  }
  Object.values(res).forEach((r) => { r.playoffs /= n; r.top /= n; r.title /= n; r.wins /= n; }); return (_sim[key] = res);
}
function evalTrade(lg, m, partner, give, get) {
  const giveV = give.reduce((s, p) => s + valueOf(lg, p).v, 0), getV = get.reduce((s, p) => s + valueOf(lg, p).v, 0);
  const rs = (ids) => optimalLineup(lg, ids, true).reduce((s, x) => s + x.blend, 0); const meBase = rs(m.me.players), themBase = rs(partner.players); const meAfter = rs(m.me.players.filter((p) => !give.includes(p)).concat(get));
  const themAfter = rs(partner.players.filter((p) => !get.includes(p)).concat(give));
  const fitMe = meAfter - meBase, fitThem = themAfter - themBase; const before = simulate(lg, m, 1000)[m.me.id].playoffs; let after = before;
  if (give.length || get.length) { const mm = { ...m, teams: m.teams.map((t) => t.me ? { ...t, strength: t.strength + fitMe } : t.id === partner.id ? { ...t, strength: t.strength + fitThem } : t) }; after = simulate(lg, mm, 1000, 'x' + give.join() + '|' + get.join())[m.me.id].playoffs; }
  const avg = m.teams.reduce((s, t) => s + t.strength, 0) / m.teams.length; const contend = partner.strength >= avg;
  const balance = Math.max(giveV, getV) ? (giveV - getV) / Math.max(giveV, getV) : 0;
  let accept = 50 + balance * 120 + (fitThem > 0 ? 12 : -8); if (!give.length || !get.length) accept = 0; accept = Math.max(0, Math.min(99, Math.round(accept)));
  return { giveV, getV, fitMe, fitThem, oddsBefore: before, oddsAfter: after, accept, verdict: !give.length || !get.length ? 'Incomplete' : accept >= 70 ? 'Likely accept' : accept >= 45 ? 'Coin flip' : 'Likely reject', note: lg.mode === 'dynasty' ? `Dynasty value includes the age curve. ${partner.name} is ${contend ? 'an above-average lineup (values points now)' : 'below average (values youth and picks)'}.` : 'Value = rest-of-season VORP blended with market; fit = change in each optimal lineup (ppg).' };
}
function windowOf(lg, m, me) {
  const strRank = [...m.teams].sort((a, b) => b.strength - a.strength).indexOf(me) + 1; const valRank = [...m.teams].sort((a, b) => b.value - a.value).indexOf(me) + 1;
  const tot = me.players.reduce((s, p) => s + valueOf(lg, p).v, 0) || 1; const old = me.players.filter((p) => ((D.players[p] || {}).a || 0) >= 28).reduce((s, p) => s + valueOf(lg, p).v, 0) / tot;
  const odds = simulate(lg, m, 1500)[me.id].playoffs; const label = strRank <= 4 && odds > 0.55 ? 'Contend' : valRank >= 9 || (odds < 0.3 && old > 0.5) ? 'Rebuild' : 'Retool';
  return { label, strRank, valRank, oldShare: old, odds, why: `${Math.round(odds * 100)}% playoff odds · ${Math.round(old * 100)}% of value in players 28+` };
}
function topWaivers(lg, m, n) { const rostered = new Set(m.teams.flatMap((t) => t.players)); return Object.entries(D.perf[lg.perf] || {}).filter(([id, p]) => !rostered.has(id) && D.players[id] && D.players[id].t && p.g >= 1 && lg.slots.some((s) => s === p.pos || (FLEXOK[s] || []).includes(p.pos))).map(([id, p]) => ({ id, ...p })).sort((a, b) => b.vorp - a.vorp).slice(0, n); }
function kv(lg, p) {
  const id = D.byName[U.norm(p.name)]; const pf = id ? perfOf(lg, id) : null; const tot = Object.values(D.perf[lg.perf] || {}).filter((x) => x.vorp > 0).reduce((s, x) => s + x.vorp, 0) || 1;
  const proj = Math.max(1, Math.round(1 + (pf ? Math.max(0, pf.vorp) : 0) / tot * 12 * (lg.cap - 16))); const surplus = proj - p.salary;
  return { ...p, id, proj, surplus, score: pf ? pf.score : null, age: id ? (D.players[id] || {}).a : null, call: surplus >= 5 ? 'Keep' : surplus >= -4 ? 'Consider' : 'Release' };
}
function keeperSel(lg) { const list = D.keeper.owners[D.keeper.myOwner] || []; return state.keepers[lg.id] || Object.fromEntries(list.map((p) => [p.name, true])); }
function keeperSummary(lg) { if (!D.keeper) return { kept: 0, spend: 0, surplus: 0 }; const sel = keeperSel(lg); const kept = (D.keeper.owners[D.keeper.myOwner] || []).filter((p) => sel[p.name]); return { kept: kept.length, spend: kept.reduce((s, p) => s + p.salary, 0), surplus: kept.reduce((s, p) => s + kv(lg, p).surplus, 0) }; }
function inbox(lg, m) {
  const a = []; if (m.pending) a.push({ level: 'warning', title: 'ESPN connection pending', msg: 'Set the ESPN_S2 / ESPN_SWID repo secrets to load this private league.' });
  if (lg.mode === 'keeper' && D.keeper) { const bad = (D.keeper.owners[D.keeper.myOwner] || []).map((p) => kv(lg, p)).filter((r) => r.call === 'Release'); if (bad.length) a.push({ level: 'warning', title: `${bad.length} keeper${bad.length > 1 ? 's' : ''} underwater`, msg: bad.map((r) => `${r.name} ($${r.salary} salary vs $${r.proj} value)`).join(', ') }); }
  if (!m.me) return a;
  m.me.players.forEach((p) => { const pl = D.players[p] || {}; if (['Out', 'IR', 'Doubtful'].includes(pl.i) && (m.me.starters || []).includes(p)) a.push({ level: 'critical', title: `${pl.n} is ${pl.i} and in your lineup`, msg: 'Swap him out (see Start / Sit).' }); });
  needs(lg, m, m.me).filter((n) => n.urgency === 'Critical').forEach((n) => a.push({ level: 'critical', title: `${n.pos} is a critical need`, msg: n.why }));
  const w = topWaivers(lg, m, 1)[0]; if (w && w.vorp > 0) a.push({ level: 'info', title: `Waiver target: ${pname(w.id)}`, msg: `${w.pos} · ${U.fmt(w.ppg)} ppg · VORP ${U.fmt(w.vorp)} · unrostered` });
  if (lg.mode === 'dynasty') { const sells = m.me.players.filter((p) => { const pl = D.players[p] || {}; return ageFactor(pl.p, pl.a) < 0.6 && valueOf(lg, p).v > 1200; }); if (sells.length) a.push({ level: 'warning', title: `${sells.length} aging assets to sell before the Week 12 deadline`, msg: sells.slice(0, 5).map(pname).join(', ') }); }
  return a;
}
function scatter(m) {
  const W = 640, H = 260, xs = m.teams.map((t) => t.strength), ys = m.teams.map((t) => t.value); const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  const X = (v) => 40 + (v - x0) / ((x1 - x0) || 1) * (W - 140), Y = (v) => H - 30 - (v - y0) / ((y1 - y0) || 1) * (H - 60);
  return `<svg viewBox="0 0 ${W} ${H}" style="width:100%;height:auto"><text x="${W - 10}" y="16" fill="#7d8a87" font-size="11" text-anchor="end">↑ more dynasty value</text><text x="${W - 10}" y="${H - 8}" fill="#7d8a87" font-size="11" text-anchor="end">stronger lineup now →</text>${m.teams.map((t) => `<circle cx="${X(t.strength)}" cy="${Y(t.value)}" r="${t.me ? 8 : 5}" fill="${t.me ? '#f5b942' : '#2cc1b0'}" opacity=".9"/><text x="${X(t.strength) + 10}" y="${Y(t.value) + 4}" fill="${t.me ? '#f5b942' : '#aab6b3'}" font-size="10">${U.esc(t.name.slice(0, 20))}</text>`).join('')}</svg>`;
}
function md(t) { const inl = (s) => s.replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/\*(.+?)\*/g, '<i>$1</i>'); let html = '', inT = false; t.split('\n').forEach((l) => { if (/^\|/.test(l)) { const cells = l.split('|').slice(1, -1).map((c) => c.trim()); if (cells.every((c) => /^-+$/.test(c))) return; html += (inT ? '' : '<div class="table-wrap"><table>') + '<tr>' + cells.map((c) => `<td>${inl(U.esc(c))}</td>`).join('') + '</tr>'; inT = true; return; } if (inT) { html += '</table></div>'; inT = false; } if (/^#{1,3} /.test(l)) { const n = l.match(/^#+/)[0].length; html += `<h${n + 1}>${inl(U.esc(l.replace(/^#+ /, '')))}</h${n + 1}>`; } else if (/^\s*[-*] /.test(l)) html += `<div class="small" style="padding:2px 0 2px 12px">• ${inl(U.esc(l.replace(/^\s*[-*] /, '')))}</div>`; else if (l.trim()) html += `<p class="small" style="line-height:1.6">${inl(U.esc(l))}</p>`; }); if (inT) html += '</table></div>'; return html; }

/* ---------------- modules ---------------- */
const COMMON = [
  { id: 'hub', label: 'Front Office', title: 'Front Office' }, { id: 'roster', label: 'My Team', title: 'My Team · performance-based values' },
  { id: 'league', label: 'League Rosters', title: 'All Teams · rosters & needs' }, { id: 'standings', label: 'Standings', title: 'Standings' },
  { id: 'matchups', label: 'Matchups', title: 'Matchups' }, { id: 'activity', label: 'Activity', title: 'Recent Activity' }, { id: 'txlog', label: 'Transaction Log', title: 'Transaction Log' },
  { id: 'trade', label: 'Trade Simulator', title: 'Trade Simulator' }, { id: 'news', label: 'News', title: 'Fantasy News & Injuries' },
];
const MODE = {
  dynasty: [{ id: 'values', label: 'Dynasty Values', title: 'Dynasty Values' }, { id: 'ages', label: 'Age Curves', title: 'Age Curves' }, { id: 'picks', label: 'Rookie Picks', title: 'Rookie Picks & 2027–28 Classes' }, { id: 'window', label: 'Contend / Rebuild', title: 'Contention Window' }, { id: 'plan', label: 'Rebuild Plan', title: 'Rebuild Plan' }, { id: 'startsit', label: 'Start / Sit', title: 'Start / Sit' }, { id: 'waivers', label: 'Waivers', title: 'Waivers & FAAB' }],
  keeper: [{ id: 'keepers', label: 'Keeper Board', title: 'Keeper Decision Board' }, { id: 'cap', label: 'Cap Planning', title: 'Auction Cap Planning' }, { id: 'startsit', label: 'Start / Sit', title: 'Start / Sit' }, { id: 'waivers', label: 'Waivers', title: 'Waivers & FAAB' }],
  redraft: [{ id: 'startsit', label: 'Start / Sit', title: 'Start / Sit' }, { id: 'waivers', label: 'Waivers / FAAB', title: 'Waivers & FAAB Bids' }, { id: 'playoffs', label: 'Playoff Odds', title: 'Playoff Odds' }, { id: 'analyzer', label: 'Trade Analyzer', title: 'Trade Analyzer' }],
};
const EDGE = [{ id: 'edges', label: 'Edges Feed', title: 'Edges · actionable alerts' }, { id: 'finder', label: 'Trade Finder', title: 'Trade Recommendations' }, { id: 'usage', label: 'Usage & Opportunity', title: 'Opportunity / Usage Dashboard' }, { id: 'proj', label: 'Projections & SOS', title: 'Weekly & Rest-of-Season Projections' }, { id: 'signals', label: 'Buy Low / Sell High', title: 'Buy-Low / Sell-High Signals' }, { id: 'handcuffs', label: 'Handcuffs', title: 'Handcuff & Backup Value Map' }, { id: 'byes', label: 'Bye & Playoff Planner', title: 'Bye-Week & Playoff Schedule Planner' }, { id: 'power', label: 'Power Index', title: 'League Power Index' }, { id: 'changes', label: 'What Changed', title: 'What Changed · news-driven refreshes' }];
const TOOLS = [{ id: 'montecarlo', label: 'Monte Carlo', title: 'Monte Carlo Season Simulator' }, { id: 'scenarios', label: 'Scenarios', title: 'Scenario Manager' }, { id: 'method', label: 'Data & Method', title: 'Data Sources & Methodology' }];
const DETAIL = { team: { title: 'Team Detail' } };
const modules = (lg) => [...COMMON.map((x) => ({ ...x, group: 'My league' })), ...MODE[lg.mode].map((x) => ({ ...x, group: lg.short + ' tools' })), ...EDGE.map((x) => ({ ...x, group: 'Edge tools' })), ...TOOLS.map((x) => ({ ...x, group: 'More' }))];
const ICO = '<svg class="ico" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="10" cy="10" r="5.5"/></svg>';

const V = {
  hub(lg, m) {
    const me = m.me; const st = [...m.teams].sort((a, b) => b.w - a.w || b.pf - a.pf); const rank = me ? st.indexOf(me) + 1 : null; const ns = me ? needs(lg, m, me) : [];
    const odds = me ? simulate(lg, m, 2000)[me.id] : null; const valRank = me ? [...m.teams].sort((a, b) => b.value - a.value).indexOf(me) + 1 : null;
    const myInj = me ? me.players.filter((p) => ['Out', 'IR', 'Questionable', 'Doubtful'].includes((D.players[p] || {}).i)) : []; const alerts = inbox(lg, m); const ks = keeperSummary(lg);
    const tile = (id, t, k, s) => `<button class="tile" data-action="module" data-id="${id}"><span class="tile-title">${t}</span><span class="tile-kpi">${U.esc(k)}</span><span class="tile-sub">${U.esc(s)}</span></button>`;
    const modeTile = lg.mode === 'dynasty' ? tile('window', 'Contend / Rebuild', me ? windowOf(lg, m, me).label : '—', 'Window, age curves, picks') : lg.mode === 'keeper' ? tile('keepers', 'Keeper Board', `${ks.kept} kept · $${ks.spend}`, `Surplus $${ks.surplus} vs projected value`) : tile('waivers', 'Waivers / FAAB', (topWaivers(lg, m, 1).map((x) => pname(x.id))[0]) || '—', 'Best available by VORP');
    return `${m.pending ? pendingCard(lg) : ''}
    <section class="fm-hero" style="--team:${lg.color}"><div class="fm-hero-main"><div class="fm-crest">${LOGO.replace('width="34" height="34"', 'width="60" height="60"')}</div><div>
      <div class="fm-kicker">${lg.short} · ${lg.platform} · Week ${m.week || (D.sleeper || {}).week || ''} · ${U.esc(lg.scoring)}</div><h2 class="fm-team">${U.esc(me ? me.name : 'My team')} <span>${U.esc(lg.name)}</span></h2>
      <div class="fm-line">${me ? `<span class="num">${me.w}-${me.l}${me.t ? '-' + me.t : ''}</span> · ${ordinal(rank)} of ${m.teams.length} · PF ${U.fmt(me.pf)} / PA ${U.fmt(me.pa)}` : 'League connection pending'}</div>
      <div class="fm-line small muted">${lg.mode === 'dynasty' && me ? `Window: <b>${windowOf(lg, m, me).label}</b> · ${windowOf(lg, m, me).why}` : lg.mode === 'keeper' ? `$${lg.cap} cap · ${lg.keepers} keepers · ${ks.kept} selected ($${ks.spend})` : ''}</div></div></div>
      <div class="fm-hero-stats">
        <div class="hstat"><span>Playoff odds</span><b class="num">${odds ? Math.round(odds.playoffs * 100) + '%' : '—'}</b></div>
        <div class="hstat"><span>Lineup strength</span><b class="num">${me ? U.fmt(me.strength) : '—'}<small> ppg</small></b></div>
        <div class="hstat"><span>Roster value rank</span><b class="num">${valRank ? '#' + valRank : '—'}</b></div>
        <div class="hstat"><span>FAAB left</span><b class="num">${me ? '$' + me.faabLeft : '—'}</b></div>
        <div class="hstat"><span>Injured / Q</span><b class="num ${myInj.length ? 'warn' : ''}">${me ? myInj.length : '—'}</b></div>
        <div class="hstat"><span>Avg age</span><b class="num">${me && me.ages.length ? U.fmt(me.ages.reduce((a, b) => a + b, 0) / me.ages.length) : '—'}</b></div>
      </div></section>
    <div class="fm-tiles">${tile('roster', 'My Roster', me ? me.players.length + ' players' : '—', 'Scored to this league')}${tile('trade', 'Trade Machine', (state.trades[lg.id] || []).length + ' executed', 'Value + fit for both sides')}${modeTile}${tile('standings', 'Standings', rank ? ordinal(rank) : '—', 'Matchups & schedule')}${tile('montecarlo', 'Monte Carlo', odds ? (odds.title * 100).toFixed(1) + '% title' : '—', '10,000 simulated seasons')}${tile('news', 'News', D.news.length + ' stories', 'ESPN + injury report')}</div>
    <div class="grid sidebar-right"><div class="stack">
      <div class="card"><div class="card-head"><h2>Positional needs</h2><span class="sub">Starter ppg vs league average → 0–100</span></div><div class="needs">${ns.map(needBar).join('') || '<div class="small muted">Available once league rosters load.</div>'}</div></div>
      <div class="card"><div class="card-head"><h2>League wire</h2><button class="btn sm" data-action="module" data-id="activity">All</button></div><div class="wire">${recentTx(m).slice(0, 8).map(txRowM(m)).join('') || '<div class="small muted">No activity loaded.</div>'}</div></div>
    </div><div class="stack">
      <div class="card"><div class="card-head"><h2>GM inbox</h2><span class="sub">${alerts.length} alerts</span></div><div class="alerts">${alerts.map((a) => `<div class="alert ${a.level}"><div class="bar"></div><div><b>${U.esc(a.title)}</b><span>${U.esc(a.msg)}</span></div></div>`).join('') || '<div class="small muted">All quiet.</div>'}</div></div>
      ${typeof edges === 'function' ? `<div class="card"><div class="card-head"><h2>Top edges</h2><button class="btn sm" data-action="module" data-id="edges">All</button></div><div class="alerts">${edges(lg, m).slice(0, 4).map((e) => `<div class="alert ${e.cls === 'crit' ? 'critical' : e.cls === 'hi' ? 'info' : 'warning'}"><div class="bar"></div><div><b>${U.esc(e.title)}</b><span>${U.esc(e.msg)}</span></div></div>`).join('') || '<div class="small muted">None right now.</div>'}</div></div>` : ''}<div class="card"><div class="card-head"><h2>Latest news</h2><button class="btn sm" data-action="module" data-id="news">Open</button></div>${D.news.slice(0, 5).map((n) => newsRow(n)).join('')}</div>
    </div></div>`;
  },
  roster(lg, m) {
    const me = m.me; if (!me) return pendingCard(lg) + (lg.mode === 'keeper' ? V.keepers(lg, m) : '');
    const rows = me.players.map((id) => ({ id, p: D.players[id] || {}, pf: perfOf(lg, id), v: valueOf(lg, id), start: me.lineup.some((x) => x.id === id) })).sort((a, b) => b.v.v - a.v.v);
    return `<div class="card"><div class="card-head"><h2>${U.esc(me.name)}</h2><span class="sub">Score = stat-based Performance Score in ${U.esc(lg.scoring)} (estimate) · Value = ${lg.mode === 'dynasty' ? '50% FantasyCalc dynasty market + 50% stat value × age curve' : '60% rest-of-season stat value + 40% market'}</span></div>
      <div class="table-wrap"><table><thead><tr><th>Player</th><th>Pos</th><th>Team</th><th class="num">Age</th><th class="num">Score</th><th class="num">2026 ppg</th><th class="num">2025 ppg</th><th class="num">Blended</th><th class="num">VORP</th><th class="num">Value</th><th>Lineup</th></tr></thead><tbody>
      ${rows.map((r) => `<tr><td><button class="link-btn" data-action="player" data-id="${r.id}"><b>${U.esc(r.p.n || pname(r.id))}</b></button> ${injTag(r.id)}${(me.taxi || []).includes(r.id) ? ' <span class="tag">taxi</span>' : ''}</td><td>${r.p.p || ''}</td><td>${r.p.t || 'FA'}</td><td class="num">${r.p.a || '–'}</td><td class="num">${r.pf ? Math.round(r.pf.score) : '—'}</td><td class="num">${r.pf ? U.fmt(r.pf.ppg) : '—'}</td><td class="num">${r.pf ? U.fmt(r.pf.ppg25) : '—'}</td><td class="num">${r.pf ? U.fmt(r.pf.blend) : '—'}</td><td class="num ${r.pf && r.pf.vorp > 0 ? 'pos' : 'neg'}">${r.pf ? U.fmt(r.pf.vorp) : '—'}</td><td class="num"><b>${r.v.v.toLocaleString()}</b></td><td>${r.start ? '<span class="tag hi">Start</span>' : '<span class="tag">Bench</span>'}</td></tr>`).join('')}</tbody></table></div></div>`;
  },
  league(lg, m) {
    if (!m.teams.length) return pendingCard(lg);
    return `<div class="depth-grid">${[...m.teams].sort((a, b) => b.value - a.value).map((t) => { const ns = needs(lg, m, t).slice(0, 2); return `<div class="card depth-col"><div class="depth-head"><div><div class="depth-pos" style="font-size:19px"><button class="link-btn" data-action="team" data-id="${t.id}" style="font:inherit;color:inherit">${U.esc(t.name)}</button>${t.me ? ' ★' : ''}</div><div class="small muted">${U.esc(t.owner)} · ${t.w}-${t.l} · value ${t.value.toLocaleString()} · ${U.fmt(t.strength)} ppg</div></div>${t.me ? '' : `<button class="btn sm" data-action="tmPartner" data-id="${t.id}">Trade</button>`}</div>
      <div class="small" style="margin:6px 0">Needs: ${ns.map((n) => `<span class="tag ${urg(n.urgency)}">${n.pos} ${n.score}</span>`).join(' ')}</div><div class="depth-label">Optimal lineup</div>${t.lineup.filter((x) => x.id).map((x) => pcard(lg, x.id, { compact: true })).join('')}</div>`; }).join('')}</div>`;
  },
  standings(lg, m) {
    if (!m.teams.length) return pendingCard(lg);
    const st = [...m.teams].sort((a, b) => b.w - a.w || b.pf - a.pf); const sim = simulate(lg, m, 2000); const T = (id) => m.teams.find((t) => t.id === id);
    const wk = m.schedule.filter((s) => s.week === m.week);
    return `<div class="grid sidebar-right"><div class="card"><div class="card-head"><h2>Standings</h2><span class="sub">Top ${m.playoffTeams} make the playoffs · odds from 2,000 sims</span></div><div class="table-wrap"><table><thead><tr><th>#</th><th>Team</th><th class="num">W-L</th><th class="num">PF</th><th class="num">PA</th><th class="num">Strength</th><th class="num">Playoffs</th></tr></thead><tbody>${st.map((t, i) => `<tr ${t.me ? 'style="background:rgba(44,193,176,.08)"' : ''}><td>${i + 1}</td><td><button class="link-btn" data-action="team" data-id="${t.id}"><b>${U.esc(t.name)}</b></button> <span class="muted small">${U.esc(t.owner)}</span></td><td class="num">${t.w}-${t.l}</td><td class="num">${U.fmt(t.pf)}</td><td class="num">${U.fmt(t.pa)}</td><td class="num">${U.fmt(t.strength)}</td><td class="num">${Math.round(sim[t.id].playoffs * 100)}%</td></tr>`).join('')}</tbody></table></div></div>
      <div class="card"><div class="card-head"><h2>Week ${m.week} matchups</h2><span class="sub">Live score · projection from blended ppg</span></div>${wk.map((s) => { const A = T(s.a), B = T(s.b); const pa = winProb(A, B); return `<div class="wire-row"><span style="flex:1"><b>${U.esc(A.name)}</b> <span class="num">${U.fmt(s.pa)}</span><div class="small muted">proj ${U.fmt(A.strength)} · ${Math.round(pa * 100)}%</div></span><span class="muted">vs</span><span style="flex:1;text-align:right"><b>${U.esc(B.name)}</b> <span class="num">${U.fmt(s.pb)}</span><div class="small muted">proj ${U.fmt(B.strength)} · ${Math.round((1 - pa) * 100)}%</div></span></div>`; }).join('') || '<div class="small muted">No matchups.</div>'}</div></div>`;
  },
  activity(lg, m) { if (m.pending) return pendingCard(lg); const r = recentTx(m); return `<div class="card"><div class="card-head"><h2>Recent moves</h2><span class="sub">Last 14 days · ${r.length} of ${m.tx.length} this season</span></div><div class="wire">${r.map(txRowM(m)).join('') || '<div class="small muted">No moves in the last 14 days.</div>'}</div><div style="margin-top:12px"><button class="btn" data-action="module" data-id="txlog">See all transactions →</button></div></div>`; },
  txlog(lg, m) {
    if (m.pending) return pendingCard(lg); const f = state.txf || {}; const per = 25; const list = m.tx.filter((t) => (!f.team || t.parts.some((x) => String(x.team) === String(f.team))) && (!f.kind || t.kind === f.kind)); const pages = Math.max(1, Math.ceil(list.length / per)); const pg = Math.min(f.page || 1, pages);
    return `<div class="card"><div class="card-head"><h2>Transaction log · ${U.esc(String((lgData(lg) || {}).league ? lgData(lg).league.season : 2026))} season</h2><span class="sub">${list.length} moves · adds, drops, waiver claims, trades${lg.mode === 'keeper' ? ', keepers' : ''} · lineup moves excluded</span></div>
      <div class="row" style="gap:8px;flex-wrap:wrap;margin-bottom:10px"><select data-txf="team" aria-label="Team"><option value="">All teams</option>${m.teams.map((t) => `<option value="${t.id}" ${String(f.team) === String(t.id) ? 'selected' : ''}>${U.esc(t.name)}</option>`).join('')}</select><select data-txf="kind" aria-label="Type"><option value="">All types</option>${Object.entries(KIND).map(([k, v]) => `<option value="${k}" ${f.kind === k ? 'selected' : ''}>${v}</option>`).join('')}</select></div>
      <div class="wire">${list.slice((pg - 1) * per, pg * per).map(txRowM(m)).join('') || '<div class="small muted">No matching transactions.</div>'}</div>
      <div class="row between" style="margin-top:12px"><button class="btn sm" data-action="txPage" data-id="${pg - 1}" ${pg <= 1 ? 'disabled' : ''}>← Newer</button><span class="small muted">Page ${pg} of ${pages}</span><button class="btn sm" data-action="txPage" data-id="${pg + 1}" ${pg >= pages ? 'disabled' : ''}>Older →</button></div></div>`;
  },
  news(lg, m) {
    const mine = m.me ? new Set(m.me.players.map((p) => U.norm(pname(p)))) : new Set(); const inj = (m.me ? m.me.players : []).filter((p) => (D.players[p] || {}).i).map((p) => ({ id: p, ...D.players[p] }));
    const leagueInj = Object.entries(D.players).filter(([, p]) => p.i && (p.r || 9999) < 200).map(([id, p]) => ({ id, ...p })).sort((a, b) => a.r - b.r).slice(0, 30);
    return `<div class="grid sidebar-right"><div class="card"><div class="card-head"><h2>ESPN NFL news</h2><span class="sub">pipeline pulls ESPN every 30 min on game days; page re-checks every 5 min</span></div>${D.news.map((n) => newsRow(n, mine)).join('')}</div>
      <div class="stack"><div class="card"><div class="card-head"><h2>My injury report</h2></div>${inj.map((p) => `<div class="wire-row">${injTag(p.id)}<span><b>${U.esc(p.n)}</b> <span class="muted small">${p.p} · ${p.t || 'FA'}</span><div class="small muted">${U.esc(p.in || '')}</div></span></div>`).join('') || '<div class="small muted">No injuries on your roster (or roster pending).</div>'}</div>
      <div class="card"><div class="card-head"><h2>Notable injuries league-wide</h2><span class="sub">Sleeper injury status</span></div>${leagueInj.map((p) => `<div class="wire-row">${injTag(p.id)}<span>${U.esc(p.n)} <span class="muted small">${p.p} · ${p.t} ${p.in ? '· ' + U.esc(p.in) : ''}</span></span></div>`).join('')}</div></div></div>`;
  },
  matchups(lg, m) {
    if (!m.teams.length) return pendingCard(lg); const weeks = [...new Set(m.schedule.map((s) => s.week))].sort((a, b) => a - b); const wk = state.mweek && weeks.includes(state.mweek) ? state.mweek : m.week; const T = (id) => m.teams.find((t) => t.id === id);
    return `<div class="seg" style="margin-bottom:14px;flex-wrap:wrap">${weeks.map((w) => `<button data-action="mweek" data-id="${w}" aria-pressed="${w === wk}">W${w}</button>`).join('')}</div><div class="depth-grid">${m.schedule.filter((s) => s.week === wk).map((s) => { const A = T(s.a), B = T(s.b); if (!A || !B) return ''; const pa = winProb(A, B); return `<div class="card"><div class="row between"><button class="link-btn" data-action="team" data-id="${A.id}"><b>${U.esc(A.name)}</b></button><span class="num">${U.fmt(s.pa)}</span></div><div class="row between" style="margin-top:6px"><button class="link-btn" data-action="team" data-id="${B.id}"><b>${U.esc(B.name)}</b></button><span class="num">${U.fmt(s.pb)}</span></div><div class="meter" style="margin-top:10px"><div class="meter-fill ok" style="width:${Math.round(pa * 100)}%"></div><span class="meter-txt">${s.done ? 'Final' : 'Proj'} · ${Math.round(pa * 100)}% / ${Math.round((1 - pa) * 100)}%</span></div><div class="small muted" style="margin-top:6px">Lineup strength ${U.fmt(A.strength)} vs ${U.fmt(B.strength)} ppg${A.me || B.me ? ' · <b>your matchup</b>' : ''}</div></div>`; }).join('')}</div>`;
  },
  values(lg, m) {
    const rostered = Object.fromEntries(m.teams.flatMap((t) => t.players.map((p) => [p, t]))); const ids = Object.keys(D.perf[lg.perf] || {}).filter((id) => D.players[id]).map((id) => ({ id, v: valueOf(lg, id) })).sort((a, b) => b.v.v - a.v.v).slice(0, 150);
    return `<div class="card"><div class="card-head"><h2>Top 150 dynasty values</h2><span class="sub">50% FantasyCalc market + 50% stat value × age curve (estimate)</span></div><div class="table-wrap"><table><thead><tr><th>#</th><th>Player</th><th>Pos</th><th class="num">Age</th><th class="num">Score</th><th class="num">Market</th><th class="num">Stat</th><th class="num">Value</th><th>Owner</th></tr></thead><tbody>${ids.map((x, i) => { const p = D.players[x.id]; const t = rostered[x.id]; return `<tr ${t && t.me ? 'style="background:rgba(44,193,176,.08)"' : ''}><td>${i + 1}</td><td><button class="link-btn" data-action="player" data-id="${x.id}"><b>${U.esc(p.n)}</b></button> ${injTag(x.id)}</td><td>${p.p}</td><td class="num">${p.a || '–'}</td><td class="num">${(perfOf(lg, x.id) || {}).score != null ? Math.round(perfOf(lg, x.id).score) : '—'}</td><td class="num">${x.v.mkt ? x.v.mkt.toLocaleString() : '—'}</td><td class="num">${x.v.stat.toLocaleString()}</td><td class="num"><b>${x.v.v.toLocaleString()}</b></td><td>${t ? `<button class="link-btn" data-action="team" data-id="${t.id}">${U.esc(t.name)}</button>` : '<span class="tag">FA</span>'}</td></tr>`; }).join('')}</tbody></table></div></div>`;
  },
  ages(lg, m) { const h = V.window(lg, m); const i = h.indexOf('<div class="tier-grid">'); return i < 0 ? h : h.slice(i); },
  analyzer(lg, m) { return V.trade(lg, m); },
  team(lg, m) {
    const t = m.teams.find((x) => String(x.id) === String(state.detail)); if (!t) return '<div class="card">Team not found.</div>'; const ns = needs(lg, m, t); const sim = m.teams.length ? simulate(lg, m, 2000)[t.id] : null;
    const rows = t.players.map((id) => ({ id, v: valueOf(lg, id), start: t.lineup.some((x) => x.id === id) })).sort((a, b) => b.v.v - a.v.v);
    return `<div class="stats" style="margin-bottom:14px"><div class="stat"><div class="stat-label">${U.esc(t.owner || 'Owner')}</div><div class="stat-value">${t.w}-${t.l}</div><div class="stat-sub">PF ${U.fmt(t.pf)} · PA ${U.fmt(t.pa)}</div></div><div class="stat"><div class="stat-label">Lineup strength</div><div class="stat-value">${U.fmt(t.strength)}</div><div class="stat-sub">ppg</div></div><div class="stat"><div class="stat-label">Roster value</div><div class="stat-value">${t.value.toLocaleString()}</div></div><div class="stat"><div class="stat-label">Playoff odds</div><div class="stat-value">${sim ? Math.round(sim.playoffs * 100) + '%' : '—'}</div></div></div>
      <div class="grid sidebar-right"><div class="card"><div class="card-head"><h2>${U.esc(t.name)}${t.me ? ' ★' : ''}</h2>${t.me ? '' : `<button class="btn sm primary" data-action="tmPartner" data-id="${t.id}">Trade with them</button>`}</div>${rows.map((r) => pcard(lg, r.id, { compact: true, extra: r.start ? '<span class="tag hi">Start</span>' : '' })).join('')}</div>
      <div class="card"><div class="card-head"><h2>Needs</h2></div><div class="needs">${ns.map(needBar).join('')}</div></div></div>`;
  },
  window(lg, m) {
    const me = m.me; if (!me) return pendingCard(lg); const w = windowOf(lg, m, me);
    const buckets = ['QB', 'RB', 'WR', 'TE'].map((P) => ({ P, list: me.players.filter((p) => (D.players[p] || {}).p === P).map((p) => ({ id: p, a: (D.players[p] || {}).a, v: valueOf(lg, p).v, f: ageFactor(P, (D.players[p] || {}).a) })).sort((a, b) => b.v - a.v) }));
    return `<div class="stats" style="margin-bottom:14px"><div class="stat"><div class="stat-label">Window</div><div class="stat-value">${w.label}</div><div class="stat-sub">${U.esc(w.why)}</div></div><div class="stat"><div class="stat-label">Lineup strength rank</div><div class="stat-value">#${w.strRank}</div><div class="stat-sub">of ${m.teams.length}</div></div><div class="stat"><div class="stat-label">Dynasty value rank</div><div class="stat-value">#${w.valRank}</div><div class="stat-sub">market + stat × age</div></div><div class="stat"><div class="stat-label">Value in 28+</div><div class="stat-value">${Math.round(w.oldShare * 100)}%</div><div class="stat-sub">aging-cliff exposure</div></div></div>
      <div class="card" style="margin-bottom:14px"><div class="card-head"><h2>League map: now vs future</h2><span class="sub">You are gold</span></div>${scatter(m)}</div>
      <div class="tier-grid">${buckets.map((b) => `<div class="card"><h3 style="margin:0 0 8px">${b.P} age curve</h3>${b.list.map((x) => `<div class="pz-row"><span class="grow"><button class="link-btn" data-action="player" data-id="${x.id}"><b>${U.esc(pname(x.id))}</b></button> <span class="muted small">age ${x.a || '–'} · value ${x.v.toLocaleString()}</span><div class="pz-bar"><i style="width:${Math.min(100, x.f * 80)}%;background:${x.f >= 1 ? 'var(--accent)' : x.f > 0.5 ? 'var(--warn)' : 'var(--neg)'}"></i></div><div class="small muted">${x.f >= 1 ? 'Pre-peak / peak' : x.f > 0.5 ? 'Post-peak · sell window' : 'At the cliff · sell now'}</div></span></div>`).join('') || '<div class="small muted">None</div>'}</div>`).join('')}</div>`;
  },
  picks(lg, m) {
    if (!m.picks || !m.me) return pendingCard(lg); const me = m.me; const mine = m.picks.filter((p) => p.owner === me.id); const tn = (id) => (m.teams.find((t) => t.id === id) || {}).name;
    const proj = (orig) => { const i = [...m.teams].sort((a, b) => a.strength - b.strength).findIndex((t) => t.id === orig); return i < 4 ? 'early' : i < 8 ? 'mid' : 'late'; };
    return `<div class="grid sidebar-right"><div class="card"><div class="card-head"><h2>My rookie picks</h2><span class="sub">${mine.length} picks · slot projected from lineup strength (estimate)</span></div><div class="table-wrap"><table><thead><tr><th>Pick</th><th>Original team</th><th>Projected</th></tr></thead><tbody>${mine.sort((a, b) => a.season - b.season || a.round - b.round).map((p) => `<tr><td><b>${p.season} R${p.round}</b></td><td>${U.esc(tn(p.orig))}${p.orig === me.id ? ' (own)' : ''}</td><td>${p.round <= 2 ? `<span class="tag ${proj(p.orig) === 'early' ? 'hi' : ''}">${proj(p.orig)}</span>` : ''}</td></tr>`).join('')}</tbody></table></div>
        <div class="small muted" style="margin-top:8px">Traded away: ${m.picks.filter((p) => p.orig === me.id && p.owner !== me.id).map((p) => `${p.season} R${p.round} → ${U.esc(tn(p.owner))}`).join(' · ') || 'none'}</div></div>
      <div class="card"><div class="card-head"><h2>Rookie classes 2027–28</h2><span class="sub">From the prior rookie report (sources in file)</span></div>${D.rookies.slice(0, 40).map((r) => `<div class="wire-row"><span class="tag">${U.esc(r.draft_class)} ${U.esc(r.position)}${U.esc(r.rank)}</span><span><b>${U.esc(r.name)}</b> <span class="muted small">${U.esc(r.school)} · ${U.esc(r.tier_12tm_1QB || '')}</span><div class="small muted">${U.esc((r.stats_2026 || '').slice(0, 90))}</div></span></div>`).join('') || '<div class="small muted">No rookie report found.</div>'}</div></div>`;
  },
  plan() { return `<div class="card"><div class="card-head"><h2>Rebuild plan</h2><span class="sub">Prior analysis (Oct 8, before Week 5) · values have moved since</span></div><div class="md">${md(D.plan || 'No plan file.')}</div></div>`; },
  startsit(lg, m) {
    const me = m.me; if (!me) return pendingCard(lg); const opt = me.lineup; const cur = new Set((me.starters || []).filter(Boolean));
    const bench = me.players.filter((p) => !opt.some((x) => x.id === p)).sort((a, b) => ((perfOf(lg, b) || {}).blend || 0) - ((perfOf(lg, a) || {}).blend || 0));
    const swaps = opt.filter((x) => x.id && cur.size && !cur.has(x.id)); const benchedStarters = [...cur].filter((p) => !opt.some((x) => x.id === p));
    return `${swaps.length ? `<div class="alert warning" style="margin-bottom:14px"><div class="bar"></div><div><b>${swaps.length} suggested change${swaps.length > 1 ? 's' : ''} vs your current lineup</b><span>Start ${swaps.map((x) => pname(x.id)).join(', ')} · sit ${benchedStarters.map(pname).join(', ') || '—'}</span></div></div>` : ''}
      <div class="grid sidebar-right"><div class="card"><div class="card-head"><h2>Recommended lineup</h2><span class="sub">Highest blended ppg · skips Out / IR / Doubtful</span></div>${opt.map((x) => `<div class="wire-row"><span class="tag" style="min-width:52px;text-align:center">${x.slot}</span>${x.id ? pcard(lg, x.id, { compact: true, extra: cur.size && !cur.has(x.id) ? '<span class="tag hi">Swap in</span>' : '' }) : '<span class="muted">Empty</span>'}</div>`).join('')}</div>
      <div class="card"><div class="card-head"><h2>Bench</h2></div>${bench.map((b) => pcard(lg, b, { compact: true, extra: cur.has(b) ? '<span class="tag crit">Currently starting</span>' : '' })).join('')}</div></div>`;
  },
  waivers(lg, m) {
    if (!m.me) return pendingCard(lg) + `<div class="card"><div class="card-head"><h2>Top performers in ${U.esc(lg.name)} scoring</h2><span class="sub">Rostered status unknown until ESPN connects</span></div>${Object.entries(D.perf[lg.perf] || {}).sort((a, b) => b[1].vorp - a[1].vorp).slice(0, 25).map(([id]) => pcard(lg, id, { compact: true })).join('')}</div>`;
    const list = topWaivers(lg, m, 40); const left = m.me.faabLeft; const ns = needs(lg, m, m.me);
    return `<div class="card"><div class="card-head"><h2>Best available</h2><span class="sub">Unrostered · ranked by VORP · FAAB left $${left} · bids are suggestions (estimate)</span></div><div class="table-wrap"><table><thead><tr><th>Player</th><th>Pos</th><th>Team</th><th class="num">Score</th><th class="num">2026 ppg</th><th class="num">Games</th><th class="num">VORP</th><th class="num">Need</th><th class="num">Suggested bid</th><th>My bid</th></tr></thead><tbody>${list.map((x) => { const n = ns.find((y) => y.pos === x.pos); const bid = Math.max(0, Math.round(left * Math.min(0.4, Math.max(0, x.vorp + 2) / 25) * (n && n.score > 60 ? 1.4 : 1))); return `<tr><td><button class="link-btn" data-action="player" data-id="${x.id}"><b>${U.esc(pname(x.id))}</b></button> ${injTag(x.id)}</td><td>${x.pos}</td><td>${(D.players[x.id] || {}).t || ''}</td><td class="num">${Math.round(x.score)}</td><td class="num">${U.fmt(x.ppg)}</td><td class="num">${x.g}</td><td class="num">${U.fmt(x.vorp)}</td><td class="num">${n ? n.score : '—'}</td><td class="num">$${bid}</td><td><input type="number" min="0" max="${left}" value="${(state.bids[lg.id] || {})[x.id] ?? ''}" data-bid="${x.id}" style="width:64px" aria-label="Bid for ${U.esc(pname(x.id))}"></td></tr>`; }).join('')}</tbody></table></div></div>`;
  },
  playoffs(lg, m) { return V.montecarlo(lg, m); },
  keepers(lg, m) {
    const K = D.keeper; if (!K) return '<div class="card">Keeper salary sheet not loaded.</div>'; const sel = keeperSel(lg); const s = keeperSummary(lg);
    const rows = (K.owners[K.myOwner] || []).map((p) => kv(lg, p)).sort((a, b) => b.surplus - a.surplus);
    const all = Object.entries(K.owners).filter(([o, l]) => l.length && o !== K.myOwner).flatMap(([o, l]) => l.map((p) => ({ o, ...kv(lg, p) }))).sort((a, b) => b.surplus - a.surplus);
    return `${connected(lg) ? '' : pendingCard(lg)}<div class="stats" style="margin-bottom:14px"><div class="stat"><div class="stat-label">Keepers selected</div><div class="stat-value">${s.kept}</div><div class="stat-sub">league max ${lg.keepers}</div></div><div class="stat"><div class="stat-label">Committed</div><div class="stat-value">$${s.spend}</div><div class="stat-sub">of $${lg.cap}</div></div><div class="stat"><div class="stat-label">Auction $ left</div><div class="stat-value pos">$${lg.cap - s.spend}</div></div><div class="stat"><div class="stat-label">Keeper surplus</div><div class="stat-value ${s.surplus >= 0 ? 'pos' : 'neg'}">${s.surplus >= 0 ? '+' : ''}$${s.surplus}</div><div class="stat-sub">projected $ − salary</div></div></div>
      <div class="card"><div class="card-head"><h2>My keeper decisions (Mikey)</h2><span class="sub">Salary: league sheet, 2026 tab · Proj. $ = auction value from league-scored VORP (estimate)</span></div><div class="table-wrap"><table><thead><tr><th>Keep</th><th>Player</th><th>Pos</th><th class="num">Salary</th><th class="num">Proj. $</th><th class="num">Surplus</th><th class="num">Score</th><th class="num">Age</th><th>Call</th></tr></thead><tbody>${rows.map((r) => `<tr><td><input type="checkbox" data-keep="${U.esc(r.name)}" ${sel[r.name] ? 'checked' : ''} aria-label="Keep ${U.esc(r.name)}"></td><td>${r.id ? `<button class="link-btn" data-action="player" data-id="${r.id}"><b>${U.esc(r.name)}</b></button> ${injTag(r.id)}` : `<b>${U.esc(r.name)}</b>`}</td><td>${r.pos}</td><td class="num">$${r.salary}</td><td class="num">$${r.proj}</td><td class="num ${r.surplus >= 0 ? 'pos' : 'neg'}"><b>${r.surplus >= 0 ? '+' : ''}${r.surplus}</b></td><td class="num">${r.score != null ? Math.round(r.score) : '—'}</td><td class="num">${r.age || '–'}</td><td><span class="tag ${r.call === 'Keep' ? 'hi' : r.call === 'Release' ? 'crit' : 'med'}">${r.call}</span></td></tr>`).join('')}</tbody></table></div></div>
      <div class="card" style="margin-top:14px"><div class="card-head"><h2>League keeper bargains</h2><span class="sub">Other owners' best salary-vs-value keepers · trade targets</span></div><div class="table-wrap"><table><thead><tr><th>Owner</th><th>Player</th><th class="num">Salary</th><th class="num">Proj. $</th><th class="num">Surplus</th></tr></thead><tbody>${all.slice(0, 20).map((r) => `<tr><td>${U.esc(r.o)}</td><td>${U.esc(r.name)} <span class="muted small">${r.pos} · ${r.nfl}</span></td><td class="num">$${r.salary}</td><td class="num">$${r.proj}</td><td class="num ${r.surplus >= 0 ? 'pos' : 'neg'}">${r.surplus >= 0 ? '+' : ''}${r.surplus}</td></tr>`).join('')}</tbody></table></div></div>`;
  },
  cap(lg) {
    const K = D.keeper; if (!K) return ''; const s = keeperSummary(lg);
    const owners = Object.entries(K.owners).filter(([, l]) => l.length).map(([o, l]) => ({ o, spend: l.reduce((a, p) => a + p.salary, 0), n: l.length, val: l.reduce((a, p) => a + kv(lg, p).proj, 0) })).sort((a, b) => a.spend - b.spend);
    return `<div class="card"><div class="card-head"><h2>League cap table</h2><span class="sub">Kept salary per owner (league sheet) · auction $ left = $${lg.cap} − kept</span></div>${owners.map((o) => `<div class="need-row"><span class="need-pos" style="width:64px">${U.esc(o.o)}</span><div class="need-bar"><div class="need-fill ${o.o === K.myOwner ? 'crit' : 'low'}" style="width:${o.spend / lg.cap * 100}%"></div></div><span class="need-score num">$${o.spend}</span><span class="tag">${o.n} kept</span><span class="need-why small muted">$${lg.cap - o.spend} to spend · kept value $${o.val} (${o.val - o.spend >= 0 ? '+' : ''}${o.val - o.spend})</span></div>`).join('')}</div>
      <div class="card" style="margin-top:14px"><div class="card-head"><h2>My auction plan</h2></div><p class="small" style="margin:0;line-height:1.6">Selected keepers cost <b>$${s.spend}</b>, leaving <b>$${lg.cap - s.spend}</b> for ${Math.max(0, 16 - s.kept)} open roster spots (about $${Math.round((lg.cap - s.spend) / Math.max(1, 16 - s.kept))} a spot). Toggle keepers on the Keeper Board to re-plan. The sheet's "27-28 If Kept" column is blank, so next-year salary escalation isn't modeled yet.</p></div>`;
  },
  trade(lg, m) {
    if (!m.me) return pendingCard(lg) + '<p class="small muted">The trade machine needs league rosters.</p>';
    const others = m.teams.filter((t) => !t.me); const partner = m.teams.find((t) => t.id === state.tm.partner && !t.me) || others[0]; const tm = state.tm;
    const give = tm.give.filter((p) => m.me.players.includes(p)), get = tm.get.filter((p) => partner.players.includes(p)); const ev = evalTrade(lg, m, partner, give, get);
    const row = (p, s, add) => `<div class="asset"><span>${U.esc(pname(p))} <span class="muted small">${(D.players[p] || {}).p || ''} · ${valueOf(lg, p).v.toLocaleString()}</span></span><button class="btn sm ${add ? '' : 'ghost'}" data-action="${add ? 'tmAdd' : 'tmRemove'}" data-side="${s}" data-id="${p}">${add ? '+' : '✕'}</button></div>`;
    const side = (team, chosen, s) => `<div class="asset-list">${chosen.map((p) => row(p, s, false)).join('') || '<div class="empty small">Add players below</div>'}</div><div class="depth-label">Roster</div><div class="asset-scroll">${team.players.filter((p) => !chosen.includes(p)).sort((a, b) => valueOf(lg, b).v - valueOf(lg, a).v).map((p) => row(p, s, true)).join('')}</div>`;
    return `<div class="tm-grid"><div class="card tm-col"><div class="card-head"><h2>You send</h2><span class="num small">${ev.giveV.toLocaleString()}</span></div>${side(m.me, give, 'give')}</div>
      <div class="card tm-col" style="align-self:start"><div class="card-head"><h2>Analyzer</h2></div>
        <div class="meter"><div class="meter-fill ${ev.accept >= 70 ? 'ok' : ev.accept >= 45 ? 'warn' : 'bad'}" style="width:${ev.accept}%"></div><span class="meter-txt">${ev.verdict} · ${ev.accept}%</span></div>
        <div class="stats" style="margin-top:12px"><div class="stat"><div class="stat-label">Value Δ (you)</div><div class="stat-value ${ev.getV - ev.giveV >= 0 ? 'pos' : 'neg'}">${(ev.getV - ev.giveV).toLocaleString()}</div></div><div class="stat"><div class="stat-label">Your lineup Δ</div><div class="stat-value ${ev.fitMe >= 0 ? 'pos' : 'neg'}">${ev.fitMe >= 0 ? '+' : ''}${U.fmt(ev.fitMe)}</div><div class="stat-sub">ppg</div></div><div class="stat"><div class="stat-label">Their lineup Δ</div><div class="stat-value ${ev.fitThem >= 0 ? 'pos' : 'neg'}">${ev.fitThem >= 0 ? '+' : ''}${U.fmt(ev.fitThem)}</div><div class="stat-sub">ppg</div></div><div class="stat"><div class="stat-label">Your playoff odds</div><div class="stat-value">${Math.round(ev.oddsBefore * 100)}→${Math.round(ev.oddsAfter * 100)}%</div></div></div>
        <p class="small muted">${U.esc(ev.note)}</p><div class="row between"><button class="btn ghost" data-action="tmClear">Clear</button><button class="btn primary" data-action="tmExecute" ${give.length && get.length ? '' : 'disabled'}>Execute in scenario</button></div>
        <div class="small muted" style="margin-top:10px">Executed trades only change this app's scenario. Nothing is sent to ${lg.platform}.</div></div>
      <div class="card tm-col"><div class="card-head"><h2>${U.esc(partner.name)} sends</h2><span class="num small">${ev.getV.toLocaleString()}</span></div><div class="field" style="margin-bottom:8px"><select data-action="tmPartnerSel" aria-label="Trade partner">${others.map((t) => `<option value="${t.id}" ${t.id === partner.id ? 'selected' : ''}>${U.esc(t.name)} · ${t.w}-${t.l}</option>`).join('')}</select></div><div class="small" style="margin-bottom:6px">Their needs: ${needs(lg, m, partner).slice(0, 2).map((n) => `<span class="tag ${urg(n.urgency)}">${n.pos} ${n.score}</span>`).join(' ')}</div>${side(partner, get, 'get')}</div></div>
      ${(state.trades[lg.id] || []).length ? `<div class="card" style="margin-top:14px"><div class="card-head"><h2>Executed (scenario)</h2></div>${state.trades[lg.id].map((t, i) => `<div class="wire-row"><span style="flex:1">With ${U.esc((m.teams.find((x) => x.id === t.partner) || {}).name)}: ${t.give.map(pname).join(', ')} ⇄ ${t.get.map(pname).join(', ')}</span><button class="btn sm ghost" data-action="tmUndo" data-id="${i}">Undo</button></div>`).join('')}</div>` : ''}`;
  },
  montecarlo(lg, m) {
    if (!m.teams.length) return pendingCard(lg); const sim = simulate(lg, m, 10000); const st = [...m.teams].sort((a, b) => sim[b.id].playoffs - sim[a.id].playoffs || sim[b.id].wins - sim[a.id].wins);
    return `<div class="card"><div class="card-head"><h2>10,000 simulated seasons</h2><span class="sub">Weekly score ~ Normal(optimal-lineup blended ppg, σ ${SIGMA}) over the real remaining schedule · includes scenario trades (estimate)</span></div><div class="table-wrap"><table><thead><tr><th>Team</th><th class="num">Now</th><th class="num">Proj. wins</th><th class="num">Playoffs</th><th class="num">#1 seed</th><th class="num">Title</th><th style="width:28%"></th></tr></thead><tbody>${st.map((t) => `<tr ${t.me ? 'style="background:rgba(44,193,176,.08)"' : ''}><td><b>${U.esc(t.name)}</b></td><td class="num">${t.w}-${t.l}</td><td class="num">${U.fmt(sim[t.id].wins)}</td><td class="num"><b>${Math.round(sim[t.id].playoffs * 100)}%</b></td><td class="num">${Math.round(sim[t.id].top * 100)}%</td><td class="num">${(sim[t.id].title * 100).toFixed(1)}%</td><td><div class="pz-bar"><i style="width:${sim[t.id].playoffs * 100}%"></i></div></td></tr>`).join('')}</tbody></table></div></div>`;
  },
  scenarios() {
    return `<div class="card"><div class="card-head"><h2>Saved scenarios</h2><span class="sub">Trades, keepers and FAAB bids across all four leagues · stored in this browser</span></div>${(state.saved || []).map((s, i) => `<div class="wire-row"><span style="flex:1"><b>${U.esc(s.name)}</b><div class="small muted">${Object.values(s.trades || {}).flat().length} trades · ${Object.keys(s.keepers || {}).length ? 'custom keepers' : 'default keepers'}</div></span><button class="btn sm" data-action="loadScen" data-id="${i}">Load</button><button class="btn sm ghost" data-action="delScen" data-id="${i}">Delete</button></div>`).join('') || '<div class="small muted">None yet. Use Save in the header.</div>'}
      <div class="row" style="margin-top:12px;gap:8px"><button class="btn" data-action="exportJson">Export JSON</button><button class="btn" data-action="importJson">Import JSON</button><button class="btn ghost" data-action="resetScen">Reset current</button></div></div>`;
  },
  method() {
    const src = D.meta ? Object.entries(D.meta.sources || {}) : [];
    return `<div class="card"><div class="card-head"><h2>Data sources</h2><span class="sub">Last pipeline run ${D.meta ? U.et(D.meta.lastRun) : '—'}</span></div><div class="table-wrap"><table><thead><tr><th>File</th><th>Source</th><th>Status</th><th>Last success</th></tr></thead><tbody>${src.map(([k, s]) => `<tr><td>${k}</td><td>${U.esc(s.label)}</td><td>${s.ok ? '<span class="tag hi">ok</span>' : s.pending ? '<span class="tag med">connect pending</span>' : `<span class="tag crit" title="${U.esc(s.error)}">failed</span>`}</td><td>${s.lastSuccess ? U.et(s.lastSuccess) : '—'}</td></tr>`).join('')}<tr><td>keeper_salaries.json</td><td>${U.esc(D.keeper ? D.keeper.source : '')}</td><td><span class="tag hi">seeded</span></td><td>Oct 11</td></tr></tbody></table></div></div>
      <div class="card" style="margin-top:14px"><div class="card-head"><h2>Performance Score</h2></div><p class="small" style="line-height:1.6;margin:0">Every NFL skill player's weekly box score (nflverse) is re-scored with <b>each league's own settings</b> (${Object.values(LEAGUES).map((l) => `${l.name}: ${l.scoring}`).join('; ')}). 2026 points per game are pulled toward 2025 ppg with a 6-game prior, so early-season noise and injury-shortened samples don't swing values. VORP = blended ppg minus the replacement-level player at the position in a 12-team league (QB14 / RB30 / WR42 / TE14; QB26 in superflex). Score = 50 + 50 × VORP ÷ the position leader's VORP (0–100). Dynasty value blends FantasyCalc's market value with stat value × an age curve. Redraft and keeper value use rest-of-season VORP. Keeper Proj. $ spreads the league's auction dollars over positive VORP. All are estimates, not paid projections. ESPN scoring is assumed from your stated settings until the ESPN connection is live.</p></div>`;
  },
};

/* ---------------- player modal ---------------- */
function playerModal(id) {
  const lg = LEAGUES[state.league]; const p = D.players[id] || { n: pname(id) }; const v = valueOf(lg, id); const pf = perfOf(lg, id); const wk = pf ? pf.weeks : [];
  modal(`<button class="btn sm ghost" data-action="closeModal" style="margin-bottom:8px">← Back</button><div class="row between"><h3 style="margin:0">${U.esc(p.n)} <span class="muted" style="font-weight:400">${p.p || ''} · ${p.t || 'FA'} · age ${p.a || '–'}</span></h3>${scoreBadge(lg, id)}</div>
    <div class="small muted" style="margin:4px 0 12px">${injTag(id)} ${U.esc(p.in || '')}</div>
    <div class="stats"><div class="stat"><div class="stat-label">Value (${lg.short})</div><div class="stat-value">${v.v.toLocaleString()}</div><div class="stat-sub">stat ${v.stat.toLocaleString()} · market ${v.mkt ? v.mkt.toLocaleString() : '—'}</div></div><div class="stat"><div class="stat-label">2026 ppg</div><div class="stat-value">${pf ? U.fmt(pf.ppg) : '—'}</div><div class="stat-sub">${pf ? pf.g + ' games · σ ' + U.fmt(pf.sd) : ''}</div></div><div class="stat"><div class="stat-label">2025 ppg</div><div class="stat-value">${pf ? U.fmt(pf.ppg25) : '—'}</div><div class="stat-sub">${pf ? pf.g25 + ' games' : ''}</div></div><div class="stat"><div class="stat-label">Age curve</div><div class="stat-value">${U.fmt(ageFactor(p.p, p.a), 2)}</div><div class="stat-sub">1.00 = peak</div></div></div>
    <div class="table-wrap" style="margin-top:12px"><table class="tight"><thead><tr><th>League</th><th class="num">Score</th><th class="num">Rank</th><th class="num">Blended ppg</th><th class="num">Value</th></tr></thead><tbody>${Object.values(LEAGUES).map((l) => { const x = perfOf(l, id); return `<tr><td>${l.name} <span class="muted small">${l.scoring.split('·')[0]}</span></td><td class="num">${x ? Math.round(x.score) : '—'}</td><td class="num">${x ? x.pos + x.rank : '—'}</td><td class="num">${x ? U.fmt(x.blend) : '—'}</td><td class="num">${valueOf(l, id).v.toLocaleString()}</td></tr>`; }).join('')}</tbody></table></div>
    ${wk.length ? `<div class="small muted" style="margin-top:10px">2026 weekly points (${lg.short} scoring): ${wk.map(([w, x]) => `W${w} <b>${x}</b>`).join(' · ')}</div>` : ''}
    <div class="row between" style="margin-top:14px"><button class="btn" data-action="tmShop" data-id="${U.esc(id)}">Open in Trade Machine</button><button class="btn ghost" data-action="closeModal">Close</button></div>`);
}

/* ---------------- shell & render ---------------- */
function mount() {
  document.getElementById('app').innerHTML = `<aside class="sidebar" id="sidebar"><div class="brand">${LOGO}<div><div class="brand-name">Fantasy Front Office</div><div class="brand-sub">GM Mode · Live</div></div></div>
    <div style="padding:0 14px 10px"><label class="small muted" for="lgSel">League</label><select id="lgSel" data-action="leagueSel" style="width:100%;margin-top:4px">${Object.values(LEAGUES).map((l) => `<option value="${l.id}">${l.short} · ${l.name}${connected(l) ? '' : ' (pending)'}</option>`).join('')}</select></div>
    <nav class="nav" id="nav"></nav><div class="sidebar-foot">Sleeper · ESPN · nflverse · FantasyCalc<br>Values are estimates. Nothing is ever sent to your leagues.<br>${SL_MARK}</div></aside>
    <div class="scrim" data-action="closeSidebar"></div>
    <header class="header"><button class="btn ghost menu-btn" data-action="toggleSidebar" aria-label="Open navigation" aria-controls="sidebar"><svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M3 5h14M3 10h14M3 15h14"/></svg></button><button class="btn sm ghost" id="backBtn" data-action="back" aria-label="Back" title="Back (Alt+←)" hidden>← Back</button><div><h1 id="pageTitle"></h1><div class="crumb" id="crumb"></div></div>
      <div class="header-actions"><div class="seg" id="lgSeg" role="group" aria-label="League"></div><span class="save-state" id="saveState"></span><button class="btn sm hide-m" data-action="exportJson">Export</button><button class="btn sm hide-m" data-action="importJson">Import</button><button class="btn sm primary" data-action="save">Save</button></div></header>
    <main class="main" id="main" tabindex="-1"></main><div class="toasts" id="toasts" aria-live="polite"></div><div class="modal-bg" id="modal" role="dialog" aria-modal="true"><div class="modal" id="modalBox"></div></div><input type="file" id="fileInput" accept=".json,application/json" class="hidden">`;
}
function render() {
  const lg = LEAGUES[state.league] || LEAGUES.dynasty; state.league = lg.id; const mods = modules(lg); if (!mods.some((x) => x.id === state.module) && state.module !== 'team') state.module = 'hub'; const mod = state.module === 'team' ? { id: 'team', title: 'Team · ' + (((model(lg).teams.find((x) => String(x.id) === String(state.detail))) || {}).name || '') } : mods.find((x) => x.id === state.module);
  document.getElementById('nav').innerHTML = [...new Set(mods.map((x) => x.group))].map((g) => `<div class="nav-label">${g}</div>` + mods.filter((x) => x.group === g).map((x) => `<button class="nav-btn" data-action="module" data-id="${x.id}" ${x.id === (state.module === 'team' ? 'league' : state.module) ? 'aria-current="page"' : ''}>${ICO}<span>${x.label}</span></button>`).join('')).join('');
  document.getElementById('lgSeg').innerHTML = Object.values(LEAGUES).map((l) => `<button data-action="league" data-id="${l.id}" aria-pressed="${l.id === lg.id}" title="${U.esc(l.name)}${connected(l) ? '' : ' · connect pending'}">${l.short}${connected(l) ? '' : ' ◌'}</button>`).join('');
  document.getElementById('lgSel').value = lg.id;
  document.getElementById('pageTitle').textContent = mod.title; document.getElementById('crumb').textContent = `${lg.name} · ${lg.platform} · ${lg.scoring}${D.meta ? ' · data ' + U.ago(D.meta.lastRun) : ''}`;
  document.getElementById('saveState').textContent = dirty ? '● Unsaved changes' : '● Saved locally';
  const m = model(lg); let html; try { html = V[state.module](lg, m); } catch (e) { console.error(e); html = `<div class="card">This view failed to render: ${U.esc(e.message)}</div>`; }
  document.getElementById('main').innerHTML = html; document.getElementById('backBtn').hidden = !(navDepth > 0 || state.module !== 'hub');
}
const actions = {
  module: (id) => go({ module: id }),
  league: (id) => { state.tm = { partner: null, give: [], get: [] }; state.txf = {}; go({ league: id, module: modules(LEAGUES[id]).some((x) => x.id === state.module) ? state.module : 'hub' }); },
  team: (id) => go({ module: 'team', detail: id }),
  player: (id) => go({ player: id }),
  txPage: (id) => { state.txf = { ...(state.txf || {}), page: +id }; render(); window.scrollTo(0, 0); },
  mweek: (id) => { state.mweek = +id; render(); },
  back: () => { if (navDepth > 0) history.back(); else go({ module: 'hub' }, true); },
  closeModal: () => { if (parseRoute().player) history.back(); else closeModal(); },
  toggleSidebar: () => document.body.classList.toggle('sidebar-open'), closeSidebar: () => document.body.classList.remove('sidebar-open'),
  tmPartner: (id) => { state.tm = { partner: isNaN(+id) ? id : +id, give: [], get: [] }; actions.module('trade'); },
  tmAdd: (id, el) => { state.tm[el.dataset.side].push(id); render(); }, tmRemove: (id, el) => { state.tm[el.dataset.side] = state.tm[el.dataset.side].filter((x) => x !== id); render(); },
  tmClear: () => { state.tm.give = []; state.tm.get = []; render(); },
  tmShop: (id) => { if (parseRoute().player) history.replaceState({ d: navDepth }, '', routeHash({ league: state.league, module: state.module, detail: state.detail })); closeModal(); const m = model(LEAGUES[state.league]); if (m.me && m.me.players.includes(id)) state.tm.give = [id]; else { const t = m.teams.find((x) => x.players.includes(id)); if (t) state.tm = { partner: t.id, give: state.tm.give, get: [id] }; } actions.module('trade'); },
  tmExecute: () => { const lg = LEAGUES[state.league]; const m = model(lg); const partner = m.teams.find((t) => t.id === state.tm.partner && !t.me) || m.teams.find((t) => !t.me); set((s) => { (s.trades[lg.id] = s.trades[lg.id] || []).push({ partner: partner.id, give: s.tm.give.slice(), get: s.tm.get.slice() }); s.tm.give = []; s.tm.get = []; }); toast('Trade executed in scenario', 'ok'); },
  tmUndo: (i) => set((s) => { s.trades[s.league].splice(+i, 1); }),
  save: () => save(),
  exportJson: () => { const b = new Blob([JSON.stringify({ app: 'fantasy-front-office', v: 1, trades: state.trades, keepers: state.keepers, bids: state.bids, saved: state.saved }, null, 1)], { type: 'application/json' }); const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = 'fantasy-front-office-scenario.json'; a.click(); toast('Exported', 'ok'); },
  importJson: () => document.getElementById('fileInput').click(),
  loadScen: (i) => { const s = state.saved[+i]; set((st) => { st.trades = JSON.parse(JSON.stringify(s.trades || {})); st.keepers = JSON.parse(JSON.stringify(s.keepers || {})); st.bids = JSON.parse(JSON.stringify(s.bids || {})); }); toast('Scenario loaded', 'ok'); },
  delScen: (i) => { state.saved.splice(+i, 1); persist(); render(); },
  resetScen: () => set((s) => { s.trades = {}; s.keepers = {}; s.bids = {}; }),
};
document.addEventListener('click', (e) => { if (e.target.id === 'modal') return actions.closeModal(); const el = e.target.closest('[data-action]'); if (!el || el.tagName === 'SELECT') return; const a = actions[el.dataset.action]; if (a) { e.preventDefault(); a(el.dataset.id, el); } });
document.addEventListener('change', (e) => {
  const t = e.target; if (t.dataset.action === 'leagueSel') actions.league(t.value);
  if (t.dataset.txf) { state.txf = { ...(state.txf || {}), [t.dataset.txf]: t.value, page: 1 }; render(); }
  if (t.dataset.action === 'tmPartnerSel') { state.tm = { partner: isNaN(+t.value) ? t.value : +t.value, give: state.tm.give, get: [] }; render(); }
  if (t.dataset.keep) { const lg = LEAGUES[state.league]; set((s) => { s.keepers[lg.id] = { ...keeperSel(lg), [t.dataset.keep]: t.checked }; }); }
  if (t.dataset.bid) { const lg = LEAGUES[state.league]; state.bids[lg.id] = state.bids[lg.id] || {}; state.bids[lg.id][t.dataset.bid] = +t.value; dirty = true; }
  if (t.id === 'fileInput' && t.files[0]) { t.files[0].text().then((x) => { const j = JSON.parse(x); if (j.app !== 'fantasy-front-office') throw new Error('Not a Fantasy Front Office file'); set((s) => { s.trades = j.trades || {}; s.keepers = j.keepers || {}; s.bids = j.bids || {}; s.saved = j.saved || s.saved; }); toast('Imported', 'ok'); }).catch((err) => toast(err.message, 'error')); t.value = ''; }
});
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && document.getElementById('modal').classList.contains('open')) actions.closeModal(); if ((e.metaKey || e.ctrlKey) && e.key === 's') { e.preventDefault(); save(); } });
/* Hash routing: #/<league>/<module>[/<detail>][?p=<playerId>] — every drill-in is a history entry, so browser Back works. */
let navDepth = 0;
function routeHash(r) { return `#/${r.league}/${r.module}${r.detail != null && r.detail !== '' ? '/' + encodeURIComponent(r.detail) : ''}${r.player ? '?p=' + encodeURIComponent(r.player) : ''}`; }
function parseRoute() { const h = location.hash.replace(/^#\/?/, ''); const [path, q] = h.split('?'); const [league, module, detail] = path.split('/').map((x) => x && decodeURIComponent(x)); const player = q ? new URLSearchParams(q).get('p') : null; if (!path.includes('/') && V[path]) return { league: state.league, module: path, player }; return { league, module, detail, player }; }
function go(r, replace) { const cur = { league: state.league, module: state.module, detail: state.detail }; const nr = { ...cur, ...(r.module && r.module !== 'team' ? { detail: null } : {}), ...r }; if (!r.player) nr.player = null; const h = routeHash(nr); if (h === location.hash) return applyRoute(); if (replace) { history.replaceState({ d: navDepth }, '', h); applyRoute(); } else { navDepth++; history.pushState({ d: navDepth }, '', h); applyRoute(); } }
function applyRoute() {
  const r = parseRoute(); if (r.league && LEAGUES[r.league]) state.league = r.league; if (r.module && (V[r.module])) state.module = r.module; state.detail = r.detail || null;
  document.body.classList.remove('sidebar-open'); const prevMod = document.getElementById('main').dataset.mod; render(); document.getElementById('main').dataset.mod = state.module + state.detail;
  if (r.player) playerModal(r.player); else closeModal(); if (prevMod !== state.module + state.detail) window.scrollTo(0, 0);
}
window.addEventListener('popstate', (e) => { navDepth = (e.state && e.state.d) || 0; applyRoute(); });
document.addEventListener('keydown', (e) => { if (e.altKey && e.key === 'ArrowLeft') actions.back(); });
async function refreshNews() { try { const j = await getJson('news.json'); if (!j.data || !j.data.length) return; D.news = j.data; if (['news', 'hub'].includes(state.module) && !document.getElementById('modal').classList.contains('open')) render(); } catch (e) { /* keep current */ } }
(async () => {
  mount(); try { await loadData(); } catch (e) { console.warn(e); }
  const q = new URLSearchParams(location.search).get('league'); if (q && LEAGUES[q]) state.league = q;
  mount(); if (!location.hash || !parseRoute().module) history.replaceState({ d: 0 }, '', routeHash({ league: state.league, module: state.module || 'hub' })); else history.replaceState({ d: 0 }, '', location.hash); applyRoute(); refreshNews(); setInterval(refreshNews, 5 * 60 * 1000);
  window.FFO = { D, state, LEAGUES, model, valueOf, simulate };
})();
