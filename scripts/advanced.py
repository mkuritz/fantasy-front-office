"""Advanced, stat-based fantasy signals (data/advanced.json). All public data:
nflverse weekly stats + snap counts + schedules (nfldata games.csv), Sleeper depth charts.
Outputs per Sleeper player id: usage (snap %, target share, carry share, WOPR, trends), expected
fantasy points from opportunity (xFP), TD regression, schedule/SOS, byes, and depth/handcuff info.
Every derived number is an estimate."""
import csv, io, os, urllib.request
from collections import defaultdict

SEASON = 2026
B = "https://github.com/nflverse/nflverse-data/releases/download"
CACHE = os.environ.get("NFLV_CACHE")
POS = ("QB", "RB", "WR", "TE")


def _get(url, name):
    if CACHE and os.path.exists(os.path.join(CACHE, name)):
        return open(os.path.join(CACHE, name), encoding="utf-8").read()
    req = urllib.request.Request(url, headers={"User-Agent": "fantasy-front-office/1.0"})
    with urllib.request.urlopen(req, timeout=120) as r:
        return r.read().decode("utf-8")


def rows(url, name):
    return list(csv.DictReader(io.StringIO(_get(url, name))))


def f(x):
    try:
        return float(x) if x not in ("", "NA", None) else 0.0
    except ValueError:
        return 0.0


def build(P, sid_of_row, norm):
    wk = [r for r in rows(f"{B}/stats_player/stats_player_week_{SEASON}.csv", f"stats_player_week_{SEASON}.csv") if r.get("season_type", "REG") == "REG"]
    snaps = rows(f"{B}/snap_counts/snap_counts_{SEASON}.csv", f"snap_counts_{SEASON}.csv")
    games = [g for g in rows("https://github.com/nflverse/nfldata/raw/master/data/games.csv", "games.csv") if g["season"] == str(SEASON) and g["game_type"] == "REG"]
    # team weekly carries / targets
    tc, tt = defaultdict(float), defaultdict(float)
    for r in wk:
        tc[(r["team"], r["week"])] += f(r["carries"]); tt[(r["team"], r["week"])] += f(r["targets"])
    snapw = {}
    for s in snaps:
        if s["game_type"] == "REG":
            snapw[(norm(s["player"]), s["team"], s["week"])] = f(s["offense_pct"])
    # fantasy points allowed by defense to each position (half-PPR baseline) -> SOS
    allowed = defaultdict(lambda: defaultdict(float)); dgames = defaultdict(set)
    per = defaultdict(list)
    for r in wk:
        if r["position"] not in POS:
            continue
        pts = (f(r["passing_yards"]) * .04 + f(r["passing_tds"]) * 4 - f(r["passing_interceptions"]) + f(r["rushing_yards"]) * .1 + f(r["rushing_tds"]) * 6
               + f(r["receptions"]) * .5 + f(r["receiving_yards"]) * .1 + f(r["receiving_tds"]) * 6)
        allowed[r["opponent_team"]][r["position"]] += pts; dgames[r["opponent_team"]].add(r["week"])
        s = sid_of_row(r)
        if not s:
            continue
        team, w = r["team"], r["week"]
        per[s].append({"w": int(w), "team": team, "snap": snapw.get((norm(r["player_display_name"]), team, w)),
                       "tgt": f(r["targets"]), "car": f(r["carries"]), "rec": f(r["receptions"]), "ry": f(r["receiving_yards"]),
                       "ruy": f(r["rushing_yards"]), "td": f(r["rushing_tds"]) + f(r["receiving_tds"]), "ptd": f(r["passing_tds"]),
                       "ts": f(r["target_share"]) if r["target_share"] not in ("", "NA") else (f(r["targets"]) / tt[(team, w)] if tt[(team, w)] else 0),
                       "cs": f(r["carries"]) / tc[(team, w)] if tc[(team, w)] else 0, "wopr": f(r["wopr"]), "ay": f(r["air_yards_share"]),
                       "att": f(r["attempts"]), "py": f(r["passing_yards"])})
    lg_avg = {p: sum(allowed[t][p] / max(1, len(dgames[t])) for t in allowed) / max(1, len(allowed)) for p in POS}
    sos = {t: {p: round((allowed[t][p] / max(1, len(dgames[t]))) / lg_avg[p], 3) if lg_avg[p] else 1 for p in POS} for t in allowed}
    sched = defaultdict(dict)
    for g in games:
        w = int(g["week"]); sched[g["home_team"]][w] = g["away_team"]; sched[g["away_team"]][w] = "@" + g["home_team"]
    byes = {t: [w for w in range(1, 19) if w not in s] for t, s in sched.items()}
    out = {}
    for s, gl in per.items():
        gl.sort(key=lambda x: x["w"]); n = len(gl); last = gl[-2:]
        avg = lambda k, L=gl: sum(x[k] or 0 for x in L) / max(1, len(L))
        snp = [x["snap"] for x in gl if x["snap"] is not None]
        # expected points from opportunity (rough public-data xFP; half-PPR yardage, no receptions term -> add by league)
        xtd = sum(x["tgt"] * 0.045 + x["car"] * 0.032 for x in gl)
        xyds = sum(x["tgt"] * 7.6 + x["car"] * 4.3 for x in gl)
        atd = sum(x["td"] for x in gl)
        out[s] = {"g": n, "team": gl[-1]["team"], "snap": round(sum(snp) / len(snp) * 100) if snp else None,
                  "snapL2": round(sum(x["snap"] or 0 for x in last) / len(last) * 100) if snp else None,
                  "ts": round(avg("ts") * 100, 1), "tsL2": round(avg("ts", last) * 100, 1), "cs": round(avg("cs") * 100, 1), "csL2": round(avg("cs", last) * 100, 1),
                  "wopr": round(avg("wopr"), 3), "tgtG": round(avg("tgt"), 1), "carG": round(avg("car"), 1),
                  "td": atd, "xtd": round(xtd, 1), "tdOver": round(atd - xtd, 1), "yds": round(sum(x["ry"] + x["ruy"] for x in gl)), "xyds": round(xyds),
                  "rec": sum(x["rec"] for x in gl), "tgt": sum(x["tgt"] for x in gl), "car": sum(x["car"] for x in gl)}
    # depth / handcuffs from Sleeper depth chart
    depth = defaultdict(list)
    for pid, p in P.items():
        if p.get("team") and p.get("position") in POS and p.get("depth_chart_order"):
            depth[(p["team"], p["position"])].append((p["depth_chart_order"], pid))
    dc = {f"{t}|{pos}": [pid for _, pid in sorted(v)[:4]] for (t, pos), v in depth.items()}
    return {"usage": out, "sos": sos, "schedule": sched, "byes": byes, "depth": dc, "lastWeek": max((int(r["week"]) for r in wk), default=0)}
