/* One-way weekly DFS snapshot from Fantasy Frontier (display-only). Nothing from Front Office is sent back. */
'use strict';
(function(){
const URL_='https://fantasyfrontier.sportslabshq.com/data/weekly_snapshot.json';
let SNAP=null;
const tbl=(rows)=>`<div class="table-wrap"><table><thead><tr><th>Player</th><th>Pos</th><th>Team</th><th>Opp</th><th class="num">DFS proj (est.)</th><th>Why</th></tr></thead><tbody>${rows.map(r=>`<tr><td>${U.esc(r.name)}</td><td>${U.esc(r.pos)}</td><td>${U.esc(r.team)}</td><td>${U.esc(r.opp||'')}</td><td class="num">${r.proj}</td><td>${U.esc(r.note)}</td></tr>`).join('')}</tbody></table></div>`;
function fill(){const el=document.getElementById('dfsSnap');if(!el)return;
 if(!SNAP){el.innerHTML='<div class="card">DFS snapshot unavailable right now.</div>';return;}
 const s=SNAP;el.innerHTML=`<div class="card"><div class="card-head"><h2>Weekly DFS snapshot</h2><span class="sub">Fantasy Frontier · ${U.esc(s.slate||'')} slate · updated ${U.esc(s.generated)} · ${U.esc(s.disclaimer)}</span></div><p class="sub">A weekly lens for start/sit and waiver calls: who the DFS crowd is on, who anchors the optimal lineups, and where matchups line up.</p></div>
 <div class="card"><div class="card-head"><h2>Most popular DFS picks</h2></div>${tbl(s.popular)}</div>
 <div class="card"><div class="card-head"><h2>Optimal-lineup core</h2></div>${tbl(s.core)}</div>
 <div class="card"><div class="card-head"><h2>Matchup advantages</h2></div>${tbl(s.matchups)}</div>`;}
V.dfs=function(){setTimeout(()=>{if(SNAP!==null)return fill();fetch(URL_+'?t='+Date.now()).then(r=>r.ok?r.json():null).catch(()=>null).then(j=>{SNAP=j||false;fill();});},0);return '<div id="dfsSnap"><div class="card">Loading weekly DFS snapshot…</div></div>';};
})();
