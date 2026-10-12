"""Fantasy Front Office cross-check: FantasyCalc (market) vs DynastyProcess / FantasyPros dynasty ECR,
ffopportunity expected fantasy points (buy-low / sell-high), Sleeper trending adds/drops."""
import json, os, sys, collections, time
sys.path.insert(0, os.path.dirname(__file__))
from xlib import Src, js, rows, f, norm, write
D = os.path.join(os.path.dirname(__file__), "..", "data")
S = Src()
yr = int(time.strftime("%Y")) - (1 if int(time.strftime("%m")) < 8 else 0)
vm = json.load(open(os.path.join(D, "values_market.json")))["data"].get("dyn1ppr") or json.load(open(os.path.join(D, "values_market.json")))["data"]["dyn"]
dp = S.get("DynastyProcess values (FantasyPros dynasty ECR)", "https://raw.githubusercontent.com/dynastyprocess/data/master/files/values-players.csv", "Second dynasty value/rank next to FantasyCalc's trade-market values", lambda: rows("https://raw.githubusercontent.com/dynastyprocess/data/master/files/values-players.csv"), link="https://github.com/dynastyprocess/data") or []
ep = S.get("ffopportunity expected fantasy points (ffverse)", "https://github.com/ffverse/ffopportunity/releases/download/latest-data/ep_weekly_%d.csv" % yr, "Points a player 'should' have scored from his usage vs what he scored: buy-low / sell-high", lambda: rows("https://github.com/ffverse/ffopportunity/releases/download/latest-data/ep_weekly_%d.csv" % yr), link="https://github.com/ffverse/ffopportunity") or []
def trend():
    a = js("https://api.sleeper.app/v1/players/nfl/trending/add?lookback_hours=24&limit=50")
    d = js("https://api.sleeper.app/v1/players/nfl/trending/drop?lookback_hours=24&limit=50")
    return [("add", x) for x in a] + [("drop", x) for x in d]
tr = S.get("Sleeper trending adds/drops (24h)", "https://api.sleeper.app/v1/players/nfl/trending/add", "Waiver-wire momentum across Sleeper leagues", trend, link="https://docs.sleeper.com/") or []
S.list = [dict(name="Already used: Sleeper + ESPN leagues, FantasyCalc, nflverse stats/injuries, ESPN news", status="ok", what="Core inputs (unchanged)", new=False)] + S.list
fc = sorted(vm, key=lambda x: -x["v"]); fcr = {norm(x["n"]): (i + 1, x) for i, x in enumerate(fc)}
dpv = sorted([r for r in dp if r["pos"] in ("QB", "RB", "WR", "TE")], key=lambda r: -f(r["value_1qb"], 0))
dpr = {norm(r["player"]): (i + 1, r) for i, r in enumerate(dpv)}
vt, nag, ncmp = [], 0, 0
for nm, (r1, x) in fcr.items():
    if r1 > 250 or nm not in dpr: continue
    r2, y = dpr[nm]; d = r2 - r1; ncmp += 1
    tol = max(8, 0.25 * min(r1, r2)); v = "agree" if abs(d) <= tol else ("watch" if abs(d) <= 2 * tol else "disagree"); nag += v == "agree"
    vt.append([x["n"], x["p"], y["team"], r1, x["v"], r2, f(y["ecr_1qb"]), f(y["value_1qb"]), d, "FantasyCalc market higher → sell window" if d > 0 and v != "agree" else ("Experts higher → buy window" if v != "agree" else "—"), v])
vt.sort(key=lambda r: r[3])
agg = collections.defaultdict(lambda: dict(n=0, a=0.0, e=0.0, t="", p="", nm=""))
for r in ep:
    if r.get("position") not in ("QB", "RB", "WR", "TE"): continue
    a = agg[r["player_id"]]; a["n"] += 1; a["a"] += f(r["total_fantasy_points"], 0); a["e"] += f(r["total_fantasy_points_exp"], 0); a["t"] = r["posteam"]; a["p"] = r["position"]; a["nm"] = r["full_name"]
et = []
for a in agg.values():
    if a["n"] < 2 or a["e"] / a["n"] < 6: continue
    d = (a["a"] - a["e"]) / a["n"]
    et.append([a["nm"], a["p"], a["t"], a["n"], round(a["a"] / a["n"], 1), round(a["e"] / a["n"], 1), round(d, 1), "sell high (scoring above usage)" if d > 3 else ("buy low (usage > results)" if d < -3 else "in line")])
et.sort(key=lambda r: -abs(r[6]))
tt = []
for kind, x in tr:
    sid = str(x.get("player_id")); m = next((v for v in vm if str(v.get("s")) == sid), None)
    tt.append([kind, m["n"] if m else "Sleeper id " + sid, m["p"] if m else "—", x.get("count"), fcr.get(norm(m["n"]), (None,))[0] if m else "—"])
tables = [dict(title="Dynasty values: FantasyCalc (trade market) vs FantasyPros ECR (via DynastyProcess)", note="Overall rank among QB/RB/WR/TE in 1-QB PPR. Where the two disagree, the trade market and the experts see the player differently: that's where trades get won.", cols=["Player", "Pos", "Team", "FC rank", "FC value", "ECR rank", "ECR (FantasyPros)", "DP value", "Rank gap", "Read", "Verdict"], rows=vt, flag=10),
          dict(title="Expected vs actual fantasy points (ffopportunity, this season)", note="Expected points come from each player's targets, carries and where on the field they happen. 'Buy low' = usage is there but results lag; 'sell high' = scoring above what usage supports.", cols=["Player", "Pos", "Team", "Games", "PPR pts/g", "Expected pts/g", "Diff/g", "Read"], rows=et),
          dict(title="Sleeper trending (last 24 hours)", note="Most-added and most-dropped players across all Sleeper leagues.", cols=["Move", "Player", "Pos", "Adds/drops", "FC rank"], rows=tt)]
summ = [["Players cross-checked", ncmp, "FantasyCalc vs FantasyPros ECR"], ["Agree", "%d%%" % round(100 * nag / max(ncmp, 1)), "within tolerance"], ["Buy-low / sell-high", sum(1 for r in et if r[7] != "in line"), "from expected points"], ["Sources OK", "%d/%d" % (sum(s["status"] == "ok" for s in S.list), len(S.list)), "this refresh"]]
write(os.path.join(D, "xcheck.json"), "Fantasy Front Office · data sources & cross-check", S, tables, summ)
print([(s["name"][:30], s["status"], s.get("rows")) for s in S.list], summ, vt[:3], et[:3], tt[:2])
