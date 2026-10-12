/* Rookie Draft Board, real-time Draft Planner, and Team Future (dynasty league only). */
(function () {
  const RD = { data: null, live: null, timer: null, taken: new Set(), picksMade: [] };
  fetch('data/prospects_2027.json?v=' + Date.now()).then((r) => r.ok ? r.json() : null).then((d) => { RD.data = d; if (typeof render === 'function' && /rookie|draftplan|future/.test(location.hash)) render(); }).catch(() => {});
  const isDyn = (lg) => lg.mode === 'dynasty';
  const onlyDyn = '<div class="card"><p class="small muted">The rookie draft tools are only for the dynasty league.</p></div>';
  const loading = '<div class="card"><p class="small muted">Loading the 2027 prospect board…</p></div>';
  const tierTag = (t) => `<span class="tag ${t === 1 ? 'hi' : t === 2 ? 'med' : ''}">Tier ${t}</span>`;
  const f = (v, s = '') => (v === null || v === undefined || v === '' ? '—' : v + s);
  const lineOf = (p) => { const l = p.seasons[p.seasons.length - 1]; return p.pos === 'QB' ? `${l.pYds} pass yds, ${l.pTD} TD, ${l.int} INT · ${l.rYds} rush` : p.pos === 'RB' ? `${l.rAtt}-${l.rYds}-${l.rTD} rush · ${l.rec}-${l.recYds} rec` : `${l.rec}-${l.recYds}-${l.recTD} rec`; };

  // ADP proxy: stat score rank, with 1QB positional discount (no free consensus rookie ADP for the 2027 class yet; labeled as an estimate)
  function board(lg) {
    const sf = ((lgData(lg) || {}).league || {}).roster_positions?.includes('SUPER_FLEX');
    return RD.data.prospects.map((p) => ({ ...p, adpScore: p.score + (p.pos === 'QB' ? (sf ? 6 : -10) : p.pos === 'TE' ? -5 : p.pos === 'RB' ? 2 : 0) }))
      .sort((a, b) => b.adpScore - a.adpScore).map((p, i) => ({ ...p, adp: i + 1 }));
  }
  function lgData(lg) { return lg.mode === 'dynasty' ? { league: (D.sleeper || {}).league } : {}; }

  // Draft order for 2027: Sleeper draft order when the 2027 draft exists; else projected (worst record/strength picks first, linear like this league).
  function order(lg, m) {
    const rounds = +(((D.sleeper || {}).league || {}).settings || {}).draft_rounds || 5; const n = m.teams.length;
    let slots = null;
    if (RD.live && RD.live.slot_to_roster_id) slots = Object.entries(RD.live.slot_to_roster_id).sort((a, b) => a[0] - b[0]).map(([, r]) => r);
    if (!slots) slots = [...m.teams].sort((a, b) => (a.w - b.w) || (a.strength - b.strength)).map((t) => t.id);
    const own = {}; (m.picks || []).filter((p) => String(p.season) === '2027').forEach((p) => { own[p.round + ':' + p.orig] = p.owner; });
    const out = []; for (let r = 1; r <= rounds; r++) slots.forEach((orig, i) => out.push({ no: (r - 1) * n + i + 1, label: `${r}.${String(i + 1).padStart(2, '0')}`, round: r, orig, owner: own[r + ':' + orig] ?? orig }));
    return { picks: out, projected: !(RD.live && RD.live.slot_to_roster_id) };
  }

  function needMap(lg, m) { const o = {}; try { needs(lg, m, m.me).forEach((x) => { o[x.pos] = x.score; }); } catch (e) { /* */ } return o; }
  function fit(lg, m, p, nm, win) { let s = p.score + 0.12 * (nm[p.pos] || 0); if (/contend/i.test(win) && p.pos === 'RB') s += 3; if (/rebuild/i.test(win) && ['WR', 'QB'].includes(p.pos)) s += 3; if (p.pos === 'QB' && !((((D.sleeper || {}).league || {}).roster_positions) || []).includes('SUPER_FLEX')) s -= 6; return Math.round(s); }

  // Monte Carlo: other teams draft off noisy ADP; returns availability % per prospect at each of my picks
  function simulate(B, picks, myId, N = 1500) {
    const mine = picks.filter((p) => p.owner === myId && !p.done); const pool = B.filter((p) => !RD.taken.has(U.norm(p.name)));
    const start = RD.picksMade.length; const avail = mine.map(() => new Map());
    let seed = 7; const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    const gauss = () => Math.sqrt(-2 * Math.log(rnd() + 1e-9)) * Math.cos(6.283 * rnd());
    for (let s = 0; s < N; s++) {
      const noisy = pool.map((p, i) => ({ k: U.norm(p.name), v: (i + 1) + gauss() * (2.5 + 0.18 * (i + 1)) })).sort((a, b) => a.v - b.v); const gone = new Set(); let mi = 0, ptr = 0;
      for (const pk of picks.slice(start)) {
        if (pk.owner === myId) { const mp = avail[mi]; if (!mp) break; noisy.forEach((x) => { if (!gone.has(x.k)) mp.set(x.k, (mp.get(x.k) || 0) + 1); }); // I take best-by-ADP for the next sim step
          while (ptr < noisy.length && gone.has(noisy[ptr].k)) ptr++; if (ptr < noisy.length) gone.add(noisy[ptr].k); mi++; if (mi >= mine.length) break; continue; }
        while (ptr < noisy.length && gone.has(noisy[ptr].k)) ptr++; if (ptr < noisy.length) gone.add(noisy[ptr].k);
      }
    }
    return mine.map((pk, i) => ({ pk, avail: new Map([...avail[i]].map(([k, c]) => [k, Math.round(100 * c / N)])) }));
  }

  function profileModal(p) {
    const rows = p.seasons.map((s) => `<tr><td>${s.yr}</td><td class="num">${s.gp}</td>${p.pos === 'QB' ? `<td class="num">${s.cmpPct}%</td><td class="num">${s.pYds}</td><td class="num">${s.pTD}/${s.int}</td>` : ''}<td class="num">${s.rAtt}-${s.rYds}-${s.rTD}</td><td class="num">${s.rec}-${s.recYds}-${s.recTD}</td><td class="num">${f(s.dom, '%')}</td><td class="num">${s.estAge}</td></tr>`).join('');
    modal(`<h2 style="margin-top:0">${U.esc(p.name)} <span class="muted small">${p.pos} · ${U.esc(p.school || '')} · ${U.esc(p.cls || '')}</span></h2>
      <div class="row" style="gap:8px;flex-wrap:wrap">${tierTag(p.tier)}<span class="tag">Prospect score ${p.score}</span><span class="tag">Draft capital (est.): ${p.capitalEst}</span><span class="tag">${U.esc(p.ht || '—')}, ${p.wt ? Math.round(p.wt) + ' lb' : '—'}</span></div>
      <p class="small" style="line-height:1.6">${U.esc(p.summary)}</p>
      <div class="small muted">Percentiles vs. 2027 ${p.pos}s: ${Object.entries(p.pcts).map(([k, v]) => `${k} ${v}`).join(' · ')}</div>
      <div class="table-wrap" style="margin-top:10px"><table><thead><tr><th>Season</th><th>GP</th>${p.pos === 'QB' ? '<th>Cmp%</th><th>Pass yds</th><th>TD/INT</th>' : ''}<th>Rush</th><th>Rec</th><th>Dominator</th><th>Age (est.)</th></tr></thead><tbody>${rows}</tbody></table></div>
      <p class="small muted">Breakout age ${f(p.m.breakoutAge)} · YPC ${f(p.m.ypc)} · Yds/rec ${f(p.m.ypr)} · Yds/target ${f(p.m.ypt)}${p.m.tgtShare != null ? ` · target share ${Math.round(p.m.tgtShare * 100)}%` : ' · target share / YPRR need CFBD_API_KEY'}. Ages are estimated from class year; dominator uses current school totals.</p>
      <button class="btn" data-action="closeModal">Close</button>`);
  }
  window.RDprofile = (i) => profileModal(RD.data.prospects.find((p) => p.id === i));
  document.addEventListener('click', (e) => { const b = e.target.closest('[data-rdp]'); if (b) window.RDprofile(b.dataset.rdp); const l = e.target.closest('[data-rdlive]'); if (l) toggleLive(); const fp = e.target.closest('[data-rdpos]'); if (fp) { RD.pos = fp.dataset.rdpos; render(); } });

  const row = (p, extra = '') => `<tr><td class="num">${p.rank}</td><td><button class="linkish" data-rdp="${p.id}"><b>${U.esc(p.name)}</b></button><div class="small muted">${U.esc(p.school || '')} · ${U.esc(p.cls || '')}</div></td><td>${p.pos}</td><td>${tierTag(p.tier)}</td><td class="num"><b>${p.score}</b></td><td class="num">${p.pos === 'QB' ? '—' : f(p.m.peakDom, '%')}</td><td class="num">${f(p.m.breakoutAge)}</td><td class="num">${p.pos === 'RB' ? f(p.m.ypc) : p.pos === 'QB' ? f(p.m.ypa) : f(p.m.ypr)}</td><td class="small">${lineOf(p)}</td><td class="small">${p.capitalEst}</td>${extra}</tr>`;

  V.rookieboard = (lg, m) => {
    if (!isDyn(lg)) return onlyDyn; if (!RD.data) return loading;
    const pos = RD.pos || 'ALL'; const L = RD.data.prospects.filter((p) => pos === 'ALL' || p.pos === pos).slice(0, 60);
    return `<div class="card"><div class="card-head"><h2>2027 Rookie Draft Board</h2><span class="sub">${RD.data.prospects.length} QB/RB/WR/TE prospects · stat-based prospect score (percentiles vs. class) · ${RD.data.hasCFBD ? 'CFBD usage included' : 'CFBD key not set: target share / YPRR off'}</span></div>
      <div class="row" style="gap:6px;margin-bottom:10px">${['ALL', 'QB', 'RB', 'WR', 'TE'].map((x) => `<button class="btn sm ${x === pos ? 'primary' : ''}" data-rdpos="${x}">${x}</button>`).join('')}</div>
      <div class="table-wrap"><table><thead><tr><th>#</th><th>Prospect</th><th>Pos</th><th>Tier</th><th>Score</th><th>Peak dom.</th><th>Breakout age (est.)</th><th>Eff.</th><th>2026 line</th><th>Draft capital (est.)</th></tr></thead><tbody>${L.map((p) => row(p)).join('')}</tbody></table></div>
      <p class="small muted" style="margin-top:8px">Eff. = YPC (RB), yds/att (QB), yds/rec (WR/TE). ${U.esc(RD.data.notes)} Click a name for the full profile and scouting summary.</p></div>`;
  };

  V.draftplan = (lg, m) => {
    if (!isDyn(lg)) return onlyDyn; if (!RD.data) return loading; if (!m.me) return pendingCard(lg);
    const B = board(lg); const O = order(lg, m); const tn = (id) => (m.teams.find((t) => t.id === id) || {}).name || `Team ${id}`;
    RD.picksMade.forEach((x, i) => { if (O.picks[i]) O.picks[i].done = x; });
    const nm = needMap(lg, m); let win = ''; try { win = (windowOf(lg, m, m.me) || {}).label || ''; } catch (e) { /* */ }
    const sims = simulate(B, O.picks, m.me.id);
    const recs = sims.map(({ pk, avail }) => { const opts = B.filter((p) => (avail.get(U.norm(p.name)) || 0) >= 25).map((p) => ({ p, a: avail.get(U.norm(p.name)), fit: fit(lg, m, p, nm, win) })).sort((a, b) => b.fit - a.fit).slice(0, 5); return { pk, opts }; });
    const live = RD.waiting && RD.timer ? '<span class="tag med">Watching: Sleeper hasn\'t created the 2027 draft yet · switches to the real order automatically</span>' : RD.live ? `<span class="tag hi">LIVE · ${RD.live.status}${RD.timer ? ' · polling every 15s' : ''}</span>` : '';
    return `<div class="card" style="margin-bottom:14px"><div class="card-head"><h2>Draft planner · 2027 rookie draft</h2><span class="sub">${O.projected ? 'Order projected from record + lineup strength (estimate) until Sleeper posts the 2027 draft' : 'Order from Sleeper'} · traded picks included · ${sims.length} pick(s) for you</span></div>
      <div class="row" style="gap:8px;flex-wrap:wrap"><button class="btn ${RD.timer ? '' : 'primary'}" data-rdlive="1">${RD.timer ? 'Stop live draft mode' : 'Start live draft mode'}</button>${live}<span class="small muted">Needs: ${Object.entries(nm).map(([k, v]) => `${k} ${v}`).join(' · ')} · Window: ${U.esc(win || '—')}</span></div></div>
      ${recs.map(({ pk, opts }) => `<div class="card" style="margin-bottom:12px"><div class="card-head"><h2>Pick ${pk.label} <span class="muted small">(#${pk.no}${pk.orig !== m.me.id ? ' · via ' + U.esc(tn(pk.orig)) : ''})</span></h2><span class="sub">Likely available (1,500 sims of ADP + noise) · ranked by fit</span></div>
        <div class="table-wrap"><table><thead><tr><th>Target</th><th>Pos</th><th>Score</th><th>Avail.</th><th>Fit</th><th>Why</th></tr></thead><tbody>${opts.map((o) => `<tr><td><button class="linkish" data-rdp="${o.p.id}"><b>${U.esc(o.p.name)}</b></button> <span class="small muted">${U.esc(o.p.school || '')}</span></td><td>${o.p.pos}</td><td class="num">${o.p.score}</td><td class="num">${o.a}%</td><td class="num"><b>${o.fit}</b></td><td class="small">${(nm[o.p.pos] || 0) >= 60 ? `fills ${o.p.pos} need · ` : ''}Tier ${o.p.tier}, ${U.esc(o.p.summary.split(';')[0])}</td></tr>`).join('') || '<tr><td colspan="6" class="small muted">Board too thin to project.</td></tr>'}</tbody></table></div></div>`).join('') || '<div class="card small muted">You own no 2027 picks right now.</div>'}
      <div class="card"><div class="card-head"><h2>Full 2027 order</h2><span class="sub">${O.projected ? 'Projected' : 'Sleeper'}</span></div><div class="wire">${O.picks.map((p) => `<div class="wire-row"><span class="wire-date num">${p.label}</span><span class="${p.owner === m.me.id ? 'tag hi' : ''}">${U.esc(tn(p.owner))}${p.owner !== p.orig ? ` <span class="small muted">(from ${U.esc(tn(p.orig))})</span>` : ''}</span><span class="small muted">${p.done ? '✓ ' + U.esc(p.done) : ''}</span></div>`).join('')}</div></div>`;
  };

  async function poll() {
    try {
      const L = (D.sleeper || {}).league || {}; const ds = await (await fetch(`https://api.sleeper.app/v1/league/${L.league_id}/drafts`)).json();
      const d = ds.find((x) => String(x.season) === '2027'); if (!d) { RD.waiting = true; if (/draftplan/.test(location.hash)) render(); return; } RD.waiting = false;
      RD.live = await (await fetch(`https://api.sleeper.app/v1/draft/${d.draft_id}`)).json();
      const pk = await (await fetch(`https://api.sleeper.app/v1/draft/${d.draft_id}/picks`)).json();
      RD.picksMade = pk.sort((a, b) => a.pick_no - b.pick_no).map((x) => `${(x.metadata || {}).first_name || ''} ${(x.metadata || {}).last_name || ''}`.trim());
      RD.taken = new Set(RD.picksMade.map(U.norm)); if (/draftplan/.test(location.hash)) render();
    } catch (e) { toast('Sleeper draft poll failed', 'err'); }
  }
  function toggleLive() { if (RD.timer) { clearInterval(RD.timer); RD.timer = null; render(); return; } poll(); RD.timer = setInterval(poll, 15000); toast('Live draft mode on: polling Sleeper every 15s'); render(); }

  // 1-3 year outlook from dynasty value × age curve, plus incoming rookie picks
  function ageMult(pos, age, y) { const c = AGE[pos] || [23, 28, 31]; let m = 1; for (let k = 1; k <= y; k++) { const a = age + k; m *= a <= c[0] ? 1.1 : a <= c[1] ? 1.0 : a <= c[2] ? 0.78 : 0.5; } return m; }
  function outlook(lg, m, team, y) {
    const by = { QB: 0, RB: 0, WR: 0, TE: 0, Picks: 0 }; team.players.forEach((id) => { const p = D.players[id] || {}; const v = valueOf(lg, id).v || 0; if (by[p.p] !== undefined && p.a) by[p.p] += v * ageMult(p.p, p.a, y); });
    const pv = (RD.data || {}).pickValues || {}; (m.picks || []).filter((p) => p.owner === team.id && +p.season <= 2026 + y && +p.season >= 2027).forEach((p) => { const r = p.round; by.Picks += pv[`2027 ${r === 1 ? '1st' : r === 2 ? '2nd' : r === 3 ? '3rd' : r + 'th'}`] || (r === 1 ? 4000 : r === 2 ? 1800 : 700); });
    by.total = Object.values(by).reduce((a, b) => a + b, 0); return by;
  }
  V.future = (lg, m) => {
    if (!isDyn(lg)) return onlyDyn; if (!m.me) return pendingCard(lg);
    const yrs = [0, 1, 2, 3]; const all = yrs.map((y) => m.teams.map((t) => ({ t, o: outlook(lg, m, t, y) })).sort((a, b) => b.o.total - a.o.total));
    const mine = yrs.map((y, i) => ({ y, o: all[i].find((x) => x.t.me).o, rank: all[i].findIndex((x) => x.t.me) + 1 })); const mx = Math.max(...mine.map((x) => x.o.total)) || 1;
    const col = { QB: '#7aa2ff', RB: '#4fd1a5', WR: '#f6c453', TE: '#f78fb3', Picks: '#9aa4b2' };
    const top = (y) => m.me.players.map((id) => ({ id, v: (valueOf(lg, id).v || 0) * ageMult((D.players[id] || {}).p, (D.players[id] || {}).a || 25, y) })).sort((a, b) => b.v - a.v).slice(0, 6);
    const rising = m.me.players.map((id) => { const p = D.players[id] || {}; const v = valueOf(lg, id).v || 0; return { id, d: v * ageMult(p.p, p.a || 25, 2) - v }; }).sort((a, b) => a.d - b.d);
    return `<div class="card" style="margin-bottom:14px"><div class="card-head"><h2>Future of your team · 1–3 year outlook</h2><span class="sub">FantasyCalc dynasty value × positional age curve + 2027+ rookie picks (FantasyCalc pick values) · estimate</span></div>
      ${mine.map((x) => `<div class="need-row"><span class="need-pos" style="width:70px">${x.y === 0 ? 'Now' : '+' + x.y + ' yr'}</span><div class="need-bar" style="display:flex">${Object.keys(col).map((k) => `<div title="${k} ${Math.round(x.o[k])}" style="width:${100 * x.o[k] / mx}%;background:${col[k]}"></div>`).join('')}</div><span class="need-score num">#${x.rank}</span><span class="small muted">of ${m.teams.length}</span></div>`).join('')}
      <div class="small muted" style="margin-top:6px">${Object.entries(col).map(([k, c]) => `<span style="color:${c}">■</span> ${k}`).join(' &nbsp; ')}</div></div>
      <div class="grid sidebar-right"><div class="card"><div class="card-head"><h2>Core in 2 years</h2><span class="sub">Highest projected value</span></div>${top(2).map((x) => pcard(lg, x.id, { compact: true, extra: `<span class="small muted">${Math.round(x.v)}</span>` })).join('')}</div>
      <div class="card"><div class="card-head"><h2>Value at risk</h2><span class="sub">Biggest projected 2-yr declines: sell windows</span></div>${rising.slice(0, 6).map((x) => pcard(lg, x.id, { compact: true, extra: `<span class="small" style="color:var(--bad,#f87171)">${Math.round(x.d)}</span>` })).join('')}
      <p class="small muted">Incoming rookies: see the <button class="linkish" data-action="module" data-id="draftplan">Draft Planner</button> for who's likely at your picks.</p></div></div>`;
  };
})();
