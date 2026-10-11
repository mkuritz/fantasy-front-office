#!/usr/bin/env python3
"""Fantasy Front Office data pipeline -> data/*.json (each source independent; failures keep old file).
Sleeper (public), nflverse weekly stats (public), FantasyCalc market values (public), ESPN news (public),
ESPN private leagues ONLY if env ESPN_S2 and ESPN_SWID are set (GitHub Actions secrets; never written to disk)."""
import csv, io, json, os, re, sys, urllib.request, statistics
from collections import defaultdict
from datetime import datetime, timezone
from zoneinfo import ZoneInfo

ET = ZoneInfo("America/New_York")
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
DATA = os.path.join(ROOT, "data")
SEASON = 2026
UA = {"User-Agent": "fantasy-front-office/1.0 (Sports Labs; github.com/mkuritz)"}
NFLV = "https://github.com/nflverse/nflverse-data/releases/download/stats_player"
CACHE = os.environ.get("NFLV_CACHE")
SLEEPER = {"id": "dynasty", "league_id": "1312096420118958080", "prev": "1186031764866408448", "my_roster": 12, "user": "MKuritz6695"}
ESPN_LEAGUES = [
    {"id": "kal", "leagueId": 186682, "teamId": 5, "name": "KAL", "mode": "keeper"},
    {"id": "dcigs", "leagueId": 98006124, "teamId": 16, "name": "D CIGS", "mode": "redraft"},
    {"id": "lomo", "leagueId": 262970, "teamId": 4, "name": "LOMOFAGS", "mode": "redraft"},
]
# Scoring per league (Sleeper read live; ESPN = stated settings until ESPN settings are fetched)
SCORING = {
    "dynasty": {"rec": 0.5, "pass_td": 4, "pass_int": -1, "pass_cmp": 0},
    "kal": {"rec": 1, "pass_td": 4, "pass_int": -2, "pass_cmp": 0},
    "dcigs": {"rec": 1, "pass_td": 4, "pass_int": -2, "pass_cmp": 0},
    "lomo": {"rec": 1, "pass_td": 4, "pass_int": -2, "pass_cmp": 0.2},
}


def get(url, headers=None, timeout=60):
    req = urllib.request.Request(url, headers={**UA, **(headers or {})})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read()


def jget(url, headers=None):
    return json.loads(get(url, headers))


def now_et():
    return datetime.now(timezone.utc).astimezone(ET).isoformat(timespec="seconds")


def write(name, payload):
    p = os.path.join(DATA, name)
    try:
        if json.load(open(p)).get("data") == json.loads(json.dumps(payload)):
            return False
    except Exception:
        pass
    json.dump({"updated": now_et(), "data": payload}, open(p, "w"), separators=(",", ":"))
    return True


def norm(n):
    n = re.sub(r"[^a-z ]", "", (n or "").lower().replace("-", " ").replace(".", ""))
    return re.sub(r"\b(jr|sr|ii|iii|iv|v)\b", "", n).replace("  ", " ").strip()


# ---------- shared player universe ----------
_PL = None
def sleeper_players():
    global _PL
    if _PL is None:
        _PL = jget("https://api.sleeper.app/v1/players/nfl")
    return _PL


def nflv_rows(y):
    name = f"stats_player_week_{y}.csv"
    if CACHE and os.path.exists(os.path.join(CACHE, name)):
        t = open(os.path.join(CACHE, name), encoding="utf-8").read()
    else:
        t = get(f"{NFLV}/{name}", timeout=120).decode("utf-8")
    return [r for r in csv.DictReader(io.StringIO(t)) if r.get("season_type", "REG") == "REG"]


def f(x):
    try:
        return float(x) if x not in ("", "NA", None) else 0.0
    except ValueError:
        return 0.0


def fpts(r, sc):
    return (f(r["passing_yards"]) * 0.04 + f(r["passing_tds"]) * sc["pass_td"] + f(r["passing_interceptions"]) * sc["pass_int"]
            + f(r["completions"]) * sc["pass_cmp"] + f(r["rushing_yards"]) * 0.1 + f(r["rushing_tds"]) * 6
            + f(r["receptions"]) * sc["rec"] + f(r["receiving_yards"]) * 0.1 + f(r["receiving_tds"]) * 6
            + (f(r["passing_2pt_conversions"]) + f(r["rushing_2pt_conversions"]) + f(r["receiving_2pt_conversions"])) * 2
            - 2 * (f(r["rushing_fumbles_lost"]) + f(r["receiving_fumbles_lost"]) + f(r["sack_fumbles_lost"]))
            + f(r.get("fg_made")) * 3 + f(r.get("fg_made_50_59")) * 2 + f(r.get("fg_made_60_")) * 2 + f(r.get("pat_made")) - f(r.get("fg_missed")))


AGE_PEAK = {"QB": (24, 33, 37), "RB": (22, 26, 29), "WR": (22, 28, 31), "TE": (23, 29, 32), "K": (23, 35, 40)}
def age_factor(pos, age):
    """Dynasty age curve: remaining productive years weight (1.0 at/below peak start, decays to 0.15 at cliff)."""
    if not age or pos not in AGE_PEAK:
        return 0.7
    a, b, c = AGE_PEAK[pos]
    if age <= b:
        return 1.0 + max(0, (b - age)) * 0.04
    if age >= c:
        return 0.15
    return 1.0 - 0.85 * (age - b) / (c - b)


def perf_values():
    """Stat-based fantasy Performance Score per league scoring. Keyed by Sleeper player id."""
    P = sleeper_players()
    byname = defaultdict(list)
    for pid, p in P.items():
        if p.get("position") in ("QB", "RB", "WR", "TE", "K") and p.get("full_name"):
            byname[(norm(p["full_name"]), p["position"])].append(pid)
    def sid(r):
        pos = r["position"] if r["position"] in AGE_PEAK else ("K" if r["position"] == "PK" else r["position"])
        c = byname.get((norm(r["player_display_name"]), pos)) or []
        if len(c) > 1:
            c = [x for x in c if P[x].get("team") == r.get("team", r.get("recent_team"))] or c[:1]
        return c[0] if c else None
    cur, prev = nflv_rows(SEASON), nflv_rows(SEASON - 1)
    out = {}
    for lg, sc in SCORING.items():
        games = defaultdict(lambda: {"cur": [], "prev": []})
        for tag, rows in (("cur", cur), ("prev", prev)):
            for r in rows:
                s = sid(r)
                if s:
                    games[s][tag].append((int(r["week"]), round(fpts(r, sc), 2)))
        recs = {}
        for s, g in games.items():
            pos = P[s]["position"]
            c = [x for _, x in g["cur"]]; pv = [x for _, x in g["prev"]]
            cppg = sum(c) / len(c) if c else None; pppg = sum(pv) / len(pv) if pv else None
            # shrink current PPG toward last season (8-game prior) or toward position baseline
            if cppg is not None and pppg is not None:
                blend = (len(c) * cppg + 6 * pppg) / (len(c) + 6)
            else:
                blend = cppg if cppg is not None else (pppg * 0.9 if pppg is not None else 0)
            recs[s] = {"pos": pos, "g": len(c), "pts": round(sum(c), 1), "ppg": round(cppg, 2) if cppg is not None else None,
                       "ppg25": round(pppg, 2) if pppg is not None else None, "g25": len(pv), "blend": round(blend, 2),
                       "sd": round(statistics.pstdev(c), 2) if len(c) > 1 else None, "weeks": sorted(g["cur"])}
        bypos = defaultdict(list)
        for s, r in recs.items():
            bypos[r["pos"]].append(r)
        repl_rank = {"QB": 14, "RB": 30, "WR": 42, "TE": 14, "K": 12}
        if lg == "dcigs":
            repl_rank["QB"] = 26
        for pos, lst in bypos.items():
            lst.sort(key=lambda r: -r["blend"])
            pool = [r for r in lst if (r["g"] + r["g25"]) >= 3]
            repl = pool[min(len(pool) - 1, repl_rank.get(pos, 20))]["blend"] if pool else 0
            for i, r in enumerate(lst):
                r["rank"] = i + 1
                r["vorp"] = round(r["blend"] - repl, 2)
                r["score"] = round(max(0, min(100, 50 + 50 * (r["vorp"] / max(1, (lst[0]["blend"] - repl))))), 1) if lst else 50
        out[lg] = recs
    return out


# ---------- Sleeper dynasty ----------
def sleeper_league():
    L = SLEEPER["league_id"]; base = "https://api.sleeper.app/v1"
    st = jget(f"{base}/state/nfl"); week = int(st.get("leg") or st.get("week") or 1)
    lg = jget(f"{base}/league/{L}"); users = jget(f"{base}/league/{L}/users"); rosters = jget(f"{base}/league/{L}/rosters")
    weeks = {}
    for w in range(1, min(18, lg["settings"].get("playoff_week_start", 15))):
        try:
            weeks[w] = jget(f"{base}/league/{L}/matchups/{w}")
        except Exception:
            pass
    tx = []
    for w in range(max(1, week - 4), week + 1):
        try:
            tx += jget(f"{base}/league/{L}/transactions/{w}")
        except Exception:
            pass
    picks = jget(f"{base}/league/{L}/traded_picks")
    drafts = jget(f"{base}/league/{L}/drafts")
    P = sleeper_players(); ids = set()
    for r in rosters:
        ids |= set(r.get("players") or []) | set(r.get("taxi") or []) | set(r.get("reserve") or [])
    for t in tx:
        ids |= set((t.get("adds") or {}).keys()) | set((t.get("drops") or {}).keys())
    return {"league": {k: lg.get(k) for k in ("league_id", "name", "season", "status", "total_rosters", "roster_positions", "scoring_settings", "previous_league_id")} | {"settings": lg["settings"]},
            "week": week, "myRosterId": SLEEPER["my_roster"],
            "users": [{"user_id": u["user_id"], "display_name": u.get("display_name"), "team_name": (u.get("metadata") or {}).get("team_name")} for u in users],
            "rosters": [{k: r.get(k) for k in ("roster_id", "owner_id", "players", "starters", "taxi", "reserve")} | {"settings": r.get("settings")} for r in rosters],
            "matchups": {w: [{k: m.get(k) for k in ("roster_id", "matchup_id", "points", "starters")} for m in ms] for w, ms in weeks.items()},
            "transactions": sorted([{k: t.get(k) for k in ("type", "status", "created", "roster_ids", "adds", "drops", "draft_picks", "waiver_budget", "leg", "settings")} for t in tx if t.get("status") == "complete"], key=lambda t: -(t["created"] or 0))[:80],
            "tradedPicks": picks, "drafts": [{k: d.get(k) for k in ("draft_id", "season", "status", "type")} for d in drafts]}, ids


def players_slim(ids):
    P = sleeper_players()
    keep = set(ids)
    # also top fantasy-relevant free agents (for waivers): active skill players on an NFL team
    for pid, p in P.items():
        if p.get("active") and p.get("team") and p.get("position") in ("QB", "RB", "WR", "TE", "K") and (p.get("search_rank") or 9999) < 600:
            keep.add(pid)
    return {pid: {"n": P[pid].get("full_name") or f'{P[pid].get("first_name","")} {P[pid].get("last_name","")}'.strip(), "p": P[pid].get("position"), "t": P[pid].get("team"),
                  "a": P[pid].get("age"), "x": P[pid].get("years_exp"), "i": P[pid].get("injury_status"), "in": P[pid].get("injury_body_part"),
                  "e": P[pid].get("espn_id"), "r": P[pid].get("search_rank")} for pid in keep if pid in P}


def fantasycalc():
    out = {}
    for key, q in (("dyn", "isDynasty=true&numQbs=1&numTeams=12&ppr=0.5"), ("red1", "isDynasty=false&numQbs=1&numTeams=12&ppr=1"),
                   ("red2", "isDynasty=false&numQbs=2&numTeams=12&ppr=1"), ("dyn1ppr", "isDynasty=true&numQbs=1&numTeams=12&ppr=1")):
        rows = jget(f"https://api.fantasycalc.com/values/current?{q}")
        out[key] = [{"s": r["player"].get("sleeperId"), "e": r["player"].get("espnId"), "n": r["player"]["name"], "p": r["player"].get("position"),
                     "v": r["value"], "pr": r.get("positionRank"), "tr": r.get("trend30Day")} for r in rows]
    return out


def news():
    j = jget("https://site.api.espn.com/apis/site/v2/sports/football/nfl/news?limit=50")
    return [{"h": a.get("headline"), "d": a.get("description"), "t": a.get("published"), "u": ((a.get("links") or {}).get("web") or {}).get("href"),
             "ath": [c.get("description") for c in a.get("categories", []) if c.get("type") == "athlete"]} for a in j.get("articles", [])]


# ---------- ESPN private leagues ----------
def espn_league(cfg):
    s2, swid = os.environ.get("ESPN_S2"), os.environ.get("ESPN_SWID")
    if not (s2 and swid):
        return None
    url = (f"https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/seasons/{SEASON}/segments/0/leagues/{cfg['leagueId']}"
           "?view=mTeam&view=mRoster&view=mMatchup&view=mSettings&view=mStandings&view=mPendingTransactions")
    j = jget(url, headers={"Cookie": f"espn_s2={s2}; SWID={swid}"})
    teams = [{"id": t["id"], "name": t.get("name") or f'{t.get("location","")} {t.get("nickname","")}'.strip(), "abbrev": t.get("abbrev"),
              "record": (t.get("record") or {}).get("overall"), "faab": (t.get("transactionCounter") or {}).get("acquisitionBudgetSpent"),
              "players": [{"id": e["playerId"], "name": e["playerPoolEntry"]["player"]["fullName"], "slot": e.get("lineupSlotId"),
                           "pos": e["playerPoolEntry"]["player"].get("defaultPositionId"), "inj": e["playerPoolEntry"]["player"].get("injuryStatus"),
                           "keeperValue": e["playerPoolEntry"].get("keeperValue"), "keeperFuture": e["playerPoolEntry"].get("keeperValueFuture"),
                           "acq": e.get("acquisitionType")} for e in (t.get("roster") or {}).get("entries", [])]} for t in j.get("teams", [])]
    sch = [{"week": m.get("matchupPeriodId"), "home": (m.get("home") or {}).get("teamId"), "away": (m.get("away") or {}).get("teamId"),
            "hp": (m.get("home") or {}).get("totalPoints"), "ap": (m.get("away") or {}).get("totalPoints"), "winner": m.get("winner")} for m in j.get("schedule", [])]
    st = j.get("settings", {})
    tx = []
    try:
        tj = jget(url.split("?")[0] + "?view=kona_league_communication", headers={"Cookie": f"espn_s2={s2}; SWID={swid}"})
        for t in (tj.get("communication") or {}).get("topics", [])[:60]:
            tx.append({"type": t.get("type"), "date": t.get("date"), "msgs": [{"type": m.get("messageTypeId"), "team": m.get("for"), "player": m.get("targetId")} for m in t.get("messages", [])]})
    except Exception:
        pass
    return {"cfg": cfg, "name": st.get("name"), "week": j.get("scoringPeriodId"), "teams": teams, "schedule": sch, "transactions": tx,
            "scoring": (st.get("scoringSettings") or {}).get("scoringItems"), "rosterSlots": (st.get("rosterSettings") or {}).get("lineupSlotCounts"),
            "acqBudget": (st.get("acquisitionSettings") or {}).get("acquisitionBudget")}


def main():
    os.makedirs(DATA, exist_ok=True)
    mp = os.path.join(DATA, "meta.json")
    meta = json.load(open(mp)) if os.path.exists(mp) else {"sources": {}}
    def run(name, label, fn):
        s = meta["sources"].setdefault(name, {}); s["label"] = label
        try:
            payload = fn()
            if payload is None:
                s.update(ok=False, pending=True, error="ESPN_S2 / ESPN_SWID secrets not set (connect pending)")
                print(f"skip  {name}: connect pending"); return
            ch = write(name, payload); s.update(ok=True, pending=False, lastSuccess=now_et(), error=None)
            if ch:
                s["lastChange"] = now_et()
            print(f"ok    {name} ({'changed' if ch else 'unchanged'})")
        except Exception as e:
            s.update(ok=False, lastAttempt=now_et(), error=f"{type(e).__name__}: {e}"[:300]); print(f"FAIL  {name}: {e}", file=sys.stderr)
    ids = set()
    def sl():
        d, i = sleeper_league(); ids.update(i); return d
    run("sleeper_dynasty.json", "Sleeper league (public API)", sl)
    run("news.json", "ESPN NFL news (public)", news)
    run("values_market.json", "FantasyCalc market values (public)", fantasycalc)
    for cfg in ESPN_LEAGUES:
        run(f"espn_{cfg['id']}.json", f"ESPN {cfg['name']} (private; needs secrets)", lambda c=cfg: espn_league(c))
    def pv():
        v = perf_values()
        for lg in v.values():
            ids.update(lg.keys())
        return v
    run("performance.json", "nflverse weekly stats → league-scored Performance Score", pv)
    run("players.json", "Sleeper player DB (rostered + relevant FAs)", lambda: players_slim(ids))
    meta["lastRun"] = now_et(); meta["timezone"] = "America/New_York"
    meta["updated"] = max([v.get("lastChange") or "" for v in meta["sources"].values()] or [""])
    meta["espnConnected"] = bool(os.environ.get("ESPN_S2") and os.environ.get("ESPN_SWID"))
    json.dump(meta, open(mp, "w"), indent=1, sort_keys=True)


if __name__ == "__main__":
    main()
