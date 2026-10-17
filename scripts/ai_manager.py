"""AI Fantasy Manager: free, deterministic narrative engine (no LLM).
Reads the app's own data/*.json (+ public Bet Lab files) and writes data/ai_manager.json with a prioritized
weekly action list per league. Every sentence is composed from a template that is only used when the field
it cites exists, so the narrative never states a fact that is not in the data. Wording varies per player/section
via a stable hash so the same call reads the same way between refreshes unless the data changes."""
import json, math, os, re, csv, hashlib, urllib.request, datetime as dt

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
DATA = os.path.join(ROOT, "data")
BET = "https://betlab.sportslabshq.com/data/"


def load(n, default=None):
    try:
        with open(os.path.join(DATA, n)) as f:
            return json.load(f)
    except Exception:
        return default


def fetch(n):
    try:
        r = urllib.request.Request(BET + n, headers={"User-Agent": "Mozilla/5.0"})
        return json.load(urllib.request.urlopen(r, timeout=15))
    except Exception:
        return None


def norm(n):
    s = str(n or "").lower().replace(".", "").replace("'", "").replace("-", " ")
    s = re.sub(r"[^a-z ]", "", s)
    s = re.sub(r"\b(jr|sr|ii|iii|iv|v)\b", "", s)
    return re.sub(r"\s+", " ", s).strip()


LEAGUES = {
    "kal": dict(id="kal", name="KAL", short="Keeper auction", mode="keeper", platform="ESPN", perf="kal", market="red1", slots=["QB", "RB", "RB", "WR", "WR", "TE", "FLEX", "K"], teamId=5, scoring="Full PPR, $200 auction, keepers with salaries"),
    "dcigs": dict(id="dcigs", name="D CIGS", short="Redraft superflex", mode="redraft", platform="ESPN", perf="dcigs", market="red2", slots=["QB", "RB", "RB", "WR", "WR", "TE", "FLEX", "SFLEX", "K"], teamId=16, scoring="Full PPR, superflex"),
    "lomo": dict(id="lomo", name="LOMOFAGS", short="Redraft", mode="redraft", platform="ESPN", perf="lomo", market="red1", slots=["QB", "RB", "RB", "WR", "WR", "TE", "FLEX", "K"], teamId=4, scoring="Full PPR + 0.2 per completion"),
    "dynasty": dict(id="dynasty", name="Show Us Your TDs", short="Sleeper dynasty", mode="dynasty", platform="Sleeper", perf="dynasty", market="dyn", slots=["QB", "RB", "RB", "WR", "WR", "WR", "TE", "FLEX", "FLEX"], scoring="0.5 PPR, 4-pt pass TD"),
}
FLEXOK = {"FLEX": ["RB", "WR", "TE"], "SFLEX": ["QB", "RB", "WR", "TE"]}
OUT = ("Out", "IR", "PUP", "Sus", "Doubtful")
AGE = {"QB": (24, 33, 37), "RB": (22, 26, 29), "WR": (22, 28, 31), "TE": (23, 29, 32), "K": (23, 35, 40)}

P = (load("players.json") or {}).get("data", {})
PERF = (load("performance.json") or {}).get("data", {})
ADV = (load("advanced.json") or {}).get("data", {})
NEWS = (load("news.json") or {}).get("data", [])
CHANGES = load("changes.json", []) or []
KEEP = load("keeper_salaries.json")
SLEEPER = (load("sleeper_dynasty.json") or {}).get("data")
ESPN = {k: (load(f"espn_{k}.json") or {}).get("data") for k in ("kal", "dcigs", "lomo")}
MK = {}
for k, rows in ((load("values_market.json") or {}).get("data") or {}).items():
    m = {}
    for r in rows:
        if r.get("s"):
            m[r["s"]] = r
        m["n:" + norm(r["n"])] = r
    MK[k] = m
BYNAME, BYESPN = {}, {}
for pid, p in P.items():
    k = norm(p.get("n"))
    if k not in BYNAME or (p.get("r") or 9999) < (P[BYNAME[k]].get("r") or 9999):
        BYNAME[k] = pid
    if p.get("e"):
        BYESPN[str(p["e"])] = pid
USAGE, SOS, SCHED, DEPTH = ADV.get("usage", {}), ADV.get("sos", {}), ADV.get("schedule", {}), ADV.get("depth", {})
IMPACT = (fetch("impact_nfl.json") or {}).get("flags", [])
GAMES = fetch("games_nfl.json") or []
EDGE_ON = os.path.exists(os.path.join(ROOT, "..", "sports-labs", "docs", "edge-score.md"))
if not EDGE_ON:
    try:
        urllib.request.urlopen(urllib.request.Request("https://sportslabshq.com/docs/edge-score.md", method="HEAD"), timeout=10)
        EDGE_ON = True
    except Exception:
        EDGE_ON = False


# ---------------- helpers ----------------
def name(pid):
    return (P.get(pid) or {}).get("n") or (str(pid).split(":")[2] if ":" in str(pid) else f"#{pid}")


def pos(pid):
    return (P.get(pid) or {}).get("p") or (str(pid).split(":")[3] if str(pid).count(":") >= 3 else "")


def f1(x):
    return "n/a" if x is None else f"{x:.1f}"


def pct(x):
    return f"{round(x)}%"


def hpick(seed, opts):
    h = int(hashlib.md5(seed.encode()).hexdigest(), 16)
    return opts[h % len(opts)]


def ordinal(n):
    return f"{n}{'th' if 10 <= n % 100 <= 20 else {1: 'st', 2: 'nd', 3: 'rd'}.get(n % 10, 'th')}"


def perf(lg, pid):
    return (PERF.get(lg["perf"]) or {}).get(pid)


def market(lg, pid, key=None):
    m = MK.get(key or lg["market"], {})
    return m.get(pid) or m.get("n:" + norm(name(pid)))


def age_factor(p, a):
    c = AGE.get(p)
    if not c or not a:
        return 0.7
    _, b, z = c
    if a <= b:
        return 1 + (b - a) * 0.04
    if a >= z:
        return 0.15
    return 1 - 0.85 * (a - b) / (z - b)


def sos_of(opp, p):
    if not opp:
        return 1
    return (SOS.get(opp.replace("@", "")) or {}).get(p, 1)


def def_rank(opp, p):
    """1 = allows the most fantasy points to the position (softest)."""
    if not opp:
        return None
    t = opp.replace("@", "")
    vals = sorted(((v.get(p, 1), k) for k, v in SOS.items()), reverse=True)
    for i, (_, k) in enumerate(vals):
        if k == t:
            return i + 1, len(vals)
    return None


TEAM_ALIAS = {"LAR": "LA", "JAC": "JAX", "WSH": "WAS", "LVR": "LV"}


def opp_of(team, w):
    return (SCHED.get(TEAM_ALIAS.get(team, team)) or {}).get(str(w))


# Expected weeks missed by status (estimate). Week multipliers apply from next week on.
MISS = {"IR": 4, "PUP": 4, "Out": 1, "Sus": 2, "DNR": 1}
PARTIAL = {"Doubtful": 0.25, "Questionable": 0.85}


def avail(pid, w, nw):
    i = (P.get(pid) or {}).get("i")
    if i in MISS:
        return 0.0 if w < nw + MISS[i] else 1.0
    if i in PARTIAL and w == nw:
        return PARTIAL[i]
    return 1.0


LAST = ADV.get("lastWeek") or 0


def next_week(week):
    return max(week or 0, LAST + 1)


def proj_week(lg, pid, w, nw):
    p = P.get(pid) or {}
    pf = perf(lg, pid)
    if not pf:
        return 0.0
    o = opp_of(p.get("t"), w)
    if not o:
        return 0.0
    return pf["blend"] * (0.7 + 0.3 * sos_of(o, p.get("p"))) * avail(pid, w, nw)


def proj_ros(lg, pid, nw):
    return sum(proj_week(lg, pid, w, nw) for w in range(nw, 18))


def weeks_left(week):
    return max(1, 17 - (week or 5) + 1)


def value_of(lg, pid, week):
    p = P.get(pid) or {}
    pf = perf(lg, pid)
    vorp = pf["vorp"] if pf else -3
    mk = market(lg, pid)
    if lg["mode"] == "dynasty":
        stat = max(0, vorp + 3) * age_factor(p.get("p"), p.get("a")) * 420
        return round(0.5 * mk["v"] + 0.5 * stat if mk else stat)
    stat = max(0, vorp + 2) * weeks_left(week) * 22
    return round(0.4 * mk["v"] + 0.6 * stat if mk else stat)


def xfpg(lg, pid):
    u = USAGE.get(pid)
    if not u or not u.get("g"):
        return None
    rw = 0.5 if lg["mode"] == "dynasty" else 1
    return (u["xyds"] * 0.1 + u["xtd"] * 6 + u["tgt"] * 0.65 * rw) / u["g"]


def signal_of(lg, pid):
    p = P.get(pid) or {}
    u = USAGE.get(pid)
    pf = perf(lg, pid)
    if not u or not pf or p.get("p") == "QB" or u.get("g", 0) < 2:
        return None
    x = xfpg(lg, pid)
    diff = (pf.get("ppg") or 0) - x
    up = (u["tsL2"] - u["ts"]) + (u["csL2"] - u["cs"]) + ((u.get("snapL2") or 0) - (u.get("snap") or 0)) / 3
    if diff <= -2.5 and up >= -2:
        return dict(k="Buy low", diff=diff, x=x)
    if diff >= 3 or u.get("tdOver", 0) >= 2.5:
        return dict(k="Sell high", diff=diff, x=x)
    return None


def norm_cdf(z):
    return 0.5 * (1 + math.erf(z / math.sqrt(2)))


def conf_label(c):
    return "High" if c >= 75 else "Medium" if c >= 60 else "Low"


# Edge / Risk (Sports Labs recipe from sports-labs/docs/edge-score.md, FFO inputs)
def pctile(vals, x):
    if not vals:
        return 0.5
    below = sum(1 for v in vals if v < x)
    tied = sum(1 for v in vals if v == x)
    return (below + 0.5 * tied) / len(vals)


def scale(p):
    return max(1, min(99, round(1 + 98 * p)))


EDGE_CACHE = {}


def edge_risk(lg, pid, nw):
    key = lg["id"]
    if key not in EDGE_CACHE:
        by = {}
        for i, pf in (PERF.get(lg["perf"]) or {}).items():
            if pf.get("g", 0) < 2 or not pf.get("blend"):
                continue
            wk = proj_week(lg, i, nw, nw)
            ros = proj_ros(lg, i, nw)
            cv = (pf.get("sd") or 0) / max(pf["blend"], 1)
            fl = min([w[1] for w in pf.get("weeks", [])] or [0]) / max(pf["blend"], 1)
            by.setdefault(pf["pos"], []).append((i, wk, ros, cv, fl))
        EDGE_CACHE[key] = by
    pf = perf(lg, pid)
    if not pf or pf.get("g", 0) < 2:
        return None
    rows = EDGE_CACHE[key].get(pf["pos"], [])
    me = next((r for r in rows if r[0] == pid), None)
    if not me:
        return None
    col = lambda k: [r[k] for r in rows]
    edge = scale(0.6 * pctile(col(1), me[1]) + 0.4 * pctile(col(2), me[2]))
    risk = scale(0.7 * pctile(col(3), me[3]) + 0.3 * (1 - pctile(col(4), me[4])))
    return dict(edge=edge, risk=risk)


# ---------------- league models ----------------
ESPN_SLOT = {0: "QB", 2: "RB", 4: "WR", 6: "TE", 23: "FLEX", 7: "SFLEX", 17: "K"}
SLP_SLOT = {"QB": "QB", "RB": "RB", "WR": "WR", "TE": "TE", "FLEX": "FLEX", "SUPER_FLEX": "SFLEX", "K": "K"}


def real_slots(lg):
    """Starting slots from the league API (ESPN lineupSlotCounts / Sleeper roster_positions); D/ST is left out (no projection)."""
    if lg["platform"] == "Sleeper":
        rp = ((SLEEPER or {}).get("league") or {}).get("roster_positions") or []
        return [SLP_SLOT[x] for x in rp if x in SLP_SLOT] or lg["slots"]
    rs = (ESPN.get(lg["id"]) or {}).get("rosterSlots") or {}
    out = []
    for sid in (0, 2, 4, 6, 23, 7, 17):
        out += [ESPN_SLOT[sid]] * int(rs.get(str(sid), 0) or 0)
    return out or lg["slots"]


def build(lg):
    lg["slots"] = real_slots(lg)
    m = dict(teams=[], week=5)
    if lg["platform"] == "Sleeper":
        S = SLEEPER
        if not S:
            return None
        users = {u["user_id"]: u for u in S["users"]}
        m["week"] = S["week"]
        for r in S["rosters"]:
            u = users.get(r["owner_id"]) or {}
            st = r.get("settings") or {}
            m["teams"].append(dict(id=r["roster_id"], name=u.get("team_name") or u.get("display_name") or f"Team {r['roster_id']}", players=list(r.get("players") or []),
                                   starters=[x for x in (r.get("starters") or []) if x and x != "0"], w=st.get("wins", 0), l=st.get("losses", 0),
                                   faab=(S["league"]["settings"].get("waiver_budget") or 100) - (st.get("waiver_budget_used") or 0), me=r["roster_id"] == S["myRosterId"]))
        rounds = S["league"]["settings"].get("draft_rounds") or 5
        own = []
        for t in m["teams"]:
            for y in (2027, 2028):
                for rd in range(1, rounds + 1):
                    own.append(dict(season=y, round=rd, orig=t["id"], owner=t["id"]))
        for tp in S.get("tradedPicks", []):
            for o in own:
                if o["season"] == int(tp["season"]) and o["round"] == tp["round"] and o["orig"] == tp["roster_id"]:
                    o["owner"] = tp["owner_id"]
        m["picks"] = own
    else:
        E = ESPN.get(lg["id"])
        if not E:
            return None
        m["week"] = E.get("week") or 5
        POS = {1: "QB", 2: "RB", 3: "WR", 4: "TE", 5: "K", 16: "DST"}
        sid = lambda p: BYESPN.get(str(p["id"])) or BYNAME.get(norm(p["name"])) or f"espn:{p['id']}:{p['name']}:{POS.get(p['pos'], '')}"
        for t in E["teams"]:
            rec = t.get("record") or {}
            m["teams"].append(dict(id=t["id"], name=t["name"], players=[sid(p) for p in t["players"]], starters=[sid(p) for p in t["players"] if p.get("slot") not in (20, 21)],
                                   w=rec.get("wins", 0), l=rec.get("losses", 0), faab=(E.get("acqBudget") or 100) - (t.get("faab") or 0), me=t["id"] == lg["teamId"]))
    m["nw"] = next_week(m["week"])
    for t in m["teams"]:
        t["lineup"] = optimal(lg, t["players"], key=lambda i: (perf(lg, i) or {}).get("blend", 0), ros=True)
        t["strength"] = sum(x["v"] for x in t["lineup"])
        t["value"] = sum(value_of(lg, p, m["week"]) for p in t["players"])
    m["me"] = next((t for t in m["teams"] if t["me"]), None)
    m["owner"] = {p: t for t in m["teams"] for p in t["players"]}
    return m


def optimal(lg, ids, key, ros=False):
    bad = ("IR", "PUP", "Sus") if ros else OUT
    pool = sorted(({"id": i, "pos": pos(i), "v": key(i)} for i in ids if (P.get(i) or {}).get("i") not in bad), key=lambda x: -x["v"])
    used, out = set(), []
    for slot in sorted(lg["slots"], key=lambda s: 1 if s in FLEXOK else 0):
        ok = FLEXOK.get(slot, [slot])
        c = next((x for x in pool if x["id"] not in used and x["pos"] in ok), None)
        if c:
            used.add(c["id"])
            out.append({"slot": slot, **c})
        else:
            out.append({"slot": slot, "id": None, "v": 0, "pos": None})
    return out


def needs(lg, m, team):
    out = []
    for X in ("QB", "RB", "WR", "TE"):
        s = lambda t: sum(x["v"] for x in t["lineup"] if x["pos"] == X and x["id"])
        mine = s(team)
        avg = sum(s(t) for t in m["teams"]) / len(m["teams"])
        cnt = lg["slots"].count(X) or 1
        depth = sum(1 for p in team["players"] if pos(p) == X and (perf(lg, p) or {}).get("vorp", -9) > -2)
        gap = (avg - mine) / avg if avg else 0
        sc = max(0, min(100, round(50 + gap * 120 + (15 if depth <= cnt else 0))))
        out.append(dict(pos=X, score=sc, mine=mine, avg=avg, depth=depth))
    return sorted(out, key=lambda n: -n["score"])


# ---------------- fact gatherers ----------------
def news_for(pid):
    n = norm(name(pid))
    last = name(pid).split(" ")[-1]
    out = []
    for c in CHANGES:
        if any(norm(x) == n for x in c.get("players") or []) and (c.get("src") != "ESPN news" or last in (c.get("text") or "")):
            out.append(dict(kind=c.get("kind"), text=c.get("text"), when=c.get("detected")))
    for x in NEWS:
        if any(norm(a) == n for a in x.get("ath") or []) and last in (x.get("h", "") + x.get("d", "")):
            out.append(dict(kind="News", text=x.get("h"), when=x.get("t")))
    seen, res = set(), []
    for o in out:
        if o["text"] and o["text"] not in seen:
            seen.add(o["text"])
            res.append(o)
    return res[:2]


def vegas_for(team, opp):
    if not team or not opp:
        return None
    o = opp.replace("@", "")
    for g in GAMES:
        if {g.get("home"), g.get("away")} == {team, o}:
            home = g["home"] == team
            return dict(itt=g.get("itt_home") if home else g.get("itt_away"), total=g.get("total"), spread=g.get("details"))
    return None


def cascades_for(team, p):
    out = [f for f in IMPACT if f.get("team") == team and (not (f.get("aff") or {}).get("pos") or p in f["aff"]["pos"])]
    return out[:2]


def depth_context(pid):
    """Starter-out cascade from the depth chart: is the guy ahead of this player hurt, or is this player the injured starter?"""
    t, p = (P.get(pid) or {}).get("t"), pos(pid)
    ids = DEPTH.get(f"{t}|{p}") or []
    if pid in ids:
        i = ids.index(pid)
        ahead = [x for x in ids[:i] if (P.get(x) or {}).get("i") in OUT]
        return dict(rank=i + 1, ahead_out=ahead, behind=ids[i + 1] if i + 1 < len(ids) else None)
    return None


def has_data(lg, pid):
    pf = perf(lg, pid)
    return bool(pf and pf.get("blend") and pf.get("g", 0) >= 1 and opp_of((P.get(pid) or {}).get("t"), LAST + 1) is not None or (pf and pf.get("blend") and any(opp_of((P.get(pid) or {}).get("t"), w) for w in range(LAST + 1, 18))))


def facts(lg, m, pid):
    p = P.get(pid) or {}
    pf = perf(lg, pid) or {}
    u = USAGE.get(pid) or {}
    nw = m["nw"]
    opp = opp_of(p.get("t"), nw)
    wk = proj_week(lg, pid, nw, nw)
    sd = pf.get("sd") or 0
    ratio = wk / pf["blend"] if pf.get("blend") else 1
    inj = p.get("i") if p.get("i") not in (None, "NA", "Active", "ACTIVE") else None
    f = dict(id=pid, n=p.get("n") or name(pid), last=(p.get("n") or name(pid)).split(" ")[-1], pos=p.get("p") or pos(pid), team=p.get("t"), age=p.get("a"), inj=inj, injd=p.get("in") if inj else None,
             pf=pf, u=u, opp=opp, sos=sos_of(opp, p.get("p")), drank=def_rank(opp, p.get("p")), wk=wk, ros=proj_ros(lg, pid, nw),
             lo=max(0, wk - 1.28 * sd * ratio), hi=wk + 1.28 * sd * ratio, sd=sd * ratio, news=news_for(pid), vegas=vegas_for(p.get("t"), opp),
             casc=cascades_for(p.get("t"), p.get("p")), depth=depth_context(pid), sig=signal_of(lg, pid), xf=xfpg(lg, pid), val=value_of(lg, pid, m["week"]),
             mk=market(lg, pid), er=edge_risk(lg, pid, nw) if EDGE_ON else None, nw=nw)
    f["nodata"] = not has_data(lg, pid)
    f["miss"] = MISS.get(inj) if inj else None
    if lg["mode"] == "keeper" and KEEP:
        for own, lst in KEEP["owners"].items():
            for k in lst:
                if BYNAME.get(norm(k["name"])) == pid:
                    tot = sum(x["vorp"] for x in (PERF.get(lg["perf"]) or {}).values() if x.get("vorp", 0) > 0) or 1
                    projv = max(1, round(1 + max(0, pf.get("vorp", 0)) / tot * 12 * (200 - 16)))
                    f["salary"] = dict(owner=own, salary=k["salary"], val=projv, surplus=projv - k["salary"])
    return f


# ---------------- sentence composition ----------------
def s_matchup(f, seed):
    if not f["opp"]:
        return f"{f['n']} has no game in Week {f['nw']} on the schedule we pull (bye), so the Week {f['nw']} projection is zero."
    where = "on the road at " + f["opp"][1:] if f["opp"].startswith("@") else "at home against " + f["opp"]
    t = f["opp"].replace("@", "")
    out = []
    if f["drank"]:
        r, n = f["drank"]
        soft = r <= n / 3
        hard = r > 2 * n / 3
        tone = "one of the softest matchups" if soft else "one of the toughest matchups" if hard else "a middle-of-the-pack matchup"
        out.append(hpick(seed + "m", [
            f"Week {f['nw']} puts {f['last']} {where}. {t} ranks {ordinal(r)} of {n} in fantasy points allowed to {f['pos']}s ({tone}), a {f['sos']:.2f}x multiplier against league average.",
            f"The matchup is {where}: {t} has allowed the {ordinal(r)}-most fantasy points to {f['pos']}s of {n} defenses, which our schedule model scores at {f['sos']:.2f}x average ({tone}).",
            f"{f['last']} draws {t} in Week {f['nw']} ({'road' if f['opp'].startswith('@') else 'home'}). Against {f['pos']}s that defense ranks {ordinal(r)} of {n} in points allowed, a {f['sos']:.2f}x matchup factor, {tone}.",
        ]))
    if f["vegas"] and f["vegas"].get("itt") is not None:
        v = f["vegas"]
        out.append(f"Bet Lab's market feed has {f['team']} at a {f1(v['itt'])}-point implied team total (game total {f1(v['total'])}, {v['spread']}).")
    return " ".join(out)


def s_usage(f, seed):
    u, pf = f["u"], f["pf"]
    bits = []
    if u.get("g"):
        if f["pos"] in ("WR", "TE") or (f["pos"] == "RB" and u.get("tgt")):
            if u.get("ts") is not None and f["pos"] != "QB":
                bits.append(hpick(seed + "u1", [f"{f['last']} has played {u.get('snap', 0)}% of snaps ({u.get('snapL2', 0)}% over the last two games) with a {f1(u['ts'])}% target share ({f1(u['tsL2'])}% last two)",
                                                 f"Usage: {u.get('snap', 0)}% snap rate, {u.get('snapL2', 0)}% in the last two, and {f1(u['ts'])}% of team targets ({f1(u['tsL2'])}% recently)"]))
        if f["pos"] == "RB":
            bits.append(f"a {f1(u.get('cs', 0))}% carry share ({f1(u.get('csL2', 0))}% the last two games) at {f1(u.get('carG', 0))} carries a game")
        if f["pos"] == "QB" and u.get("car"):
            bits.append(f"{f['last']} is adding {f1(u.get('carG', 0))} rushes a game")
        if u.get("tgtG"):
            bits.append(f"{f1(u['tgtG'])} targets per game")
    s = (", ".join(bits) + ".") if bits else ""
    if s:
        s = s[0].upper() + s[1:]
    w = pf.get("weeks") or []
    if w:
        last3 = ", ".join(f"Wk{x[0]} {f1(x[1])}" for x in w[-3:])
        trend = sum(x[1] for x in w[-2:]) / min(2, len(w)) - pf.get("ppg", 0)
        s += " " + hpick(seed + "w", [f"Recent scoring: {last3}.", f"The last three box scores in this league's scoring were {last3}.", f"Week by week lately: {last3}."])
        if abs(trend) >= 2:
            s += f" That is {'up' if trend > 0 else 'down'} {f1(abs(trend))} points a game against his season average of {f1(pf.get('ppg', 0))}."
    if f["xf"] is not None and u.get("g", 0) >= 2 and f["pos"] != "QB":
        d = pf.get("ppg", 0) - f["xf"]
        s += f" His opportunity (yards and TDs expected from his targets and carries) is worth {f1(f['xf'])} points a game; he has scored {f1(pf.get('ppg', 0))}, {'running hot' if d > 1.5 else 'leaving points on the table' if d < -1.5 else 'right in line'} ({'+' if d >= 0 else ''}{f1(d)})."
    if u.get("xtd") is not None and u.get("g") and f["pos"] != "QB":
        s += f" Touchdowns: {u.get('td', 0):g} scored on {f1(u['xtd'])} expected."
    return s.strip()


def s_health(f, seed):
    out = []
    if f["inj"]:
        out.append(f"Injury status: {f['inj']}" + (f" ({f['injd']})" if f["injd"] else "") + (f"; the rest-of-season projection assumes he misses about {f['miss']} week{'s' if f['miss'] > 1 else ''} (an estimate for this status)." if f.get("miss") else "; next week's projection is discounted for the risk he sits." if f['inj'] in PARTIAL else "."))
    d = f["depth"]
    if d and d["ahead_out"]:
        out.append(f"Cascade: {', '.join(name(x) + ' (' + (P.get(x) or {}).get('i', '') + ')' for x in d['ahead_out'])} is ahead of {f['last']} on the {f['team']} depth chart and is not available, which moves {f['last']} up to the top of the {f['pos']} room.")
    elif d and d["rank"] == 1 and f["inj"] in OUT and d["behind"]:
        out.append(f"With {f['last']} {f['inj']}, the next man up on the depth chart is {name(d['behind'])}.")
    for c in f["casc"]:
        out.append(f"Bet Lab injury cascade: {c.get('text')}; its read is that this {c.get('dir')}.")
    for n in f["news"]:
        out.append(hpick(seed + n["text"], ["Latest news: ", "In the news: ", "From the wire: "]) + n["text"].rstrip(".") + ".")
    if not out:
        out.append(hpick(seed + "h", [f"No injury designation and no flagged news on {f['last']} in this refresh.", f"{f['last']} carries no injury tag, and the news check found nothing new."]))
    return " ".join(out)


def s_range(f, seed):
    if not f["pf"]:
        return f"We have no 2025-26 stat sample for {f['n']}, so there is no projection range."
    if not f["pf"].get("sd"):
        s = f"We project {f1(f['wk'])} points for Week {f['nw']} from a {f1(f['pf'].get('blend'))} ppg blend adjusted for the matchup (not enough weekly games for a range)."
    else:
      s = hpick(seed + "r", [
        f"The projection is {f1(f['wk'])} points for Week {f['nw']}, with an 80% range of roughly {f1(f['lo'])} to {f1(f['hi'])} based on his week-to-week spread ({f1(f['pf'].get('sd', 0))} pt standard deviation).",
        f"We project {f1(f['wk'])} points (80% band {f1(f['lo'])}-{f1(f['hi'])}), built from a {f1(f['pf']['blend'])} ppg blend of this year and last year adjusted for the matchup.",
    ])
    s += f" Rest of season: {f1(f['ros'])} projected points through Week 17."
    if f["er"]:
        s += f" Lab Score {f['er']['edge']} (SportsLabs Edge Score family), SportsLabs Risk Score {f['er']['risk']} (1-99, ranked against every {f['pos']} in this league's scoring)."
    return s


def risks(f):
    r = []
    u = f["u"]
    if f["pf"] and f["pf"].get("blend") and (f["pf"].get("sd") or 0) / f["pf"]["blend"] > 0.6:
        r.append(f"his weekly scoring is volatile (standard deviation {f1(f['pf']['sd'])} on a {f1(f['pf']['blend'])} ppg base)")
    if f["drank"] and f["drank"][0] > 2 * f["drank"][1] / 3:
        r.append(f"the {f['opp'].replace('@', '')} defense is a tough draw for {f['pos']}s")
    if u.get("snapL2") is not None and u.get("snap") and u["snapL2"] < u["snap"] - 8:
        r.append(f"his snap rate dipped from {u['snap']}% to {u['snapL2']}% over the last two games")
    if u.get("tdOver", 0) >= 1.5:
        r.append(f"he has scored {u.get('td', 0):g} TDs on {f1(u.get('xtd', 0))} expected, so some touchdown regression is likely")
    if f["inj"] in ("Questionable", "Doubtful"):
        r.append(f"he is listed {f['inj']}, so check the inactive list before kickoff")
    if f["age"] and f["pos"] in AGE and f["age"] >= AGE[f["pos"]][1]:
        r.append(f"at {f['age']} he is past the typical {f['pos']} peak")
    return r


def para_counter(f, other=None, seed=""):
    r = risks(f)
    lead = hpick(seed + "c", ["The counter-case:", "What could go wrong:", "The risk on this call:"])
    if r:
        s = f"{lead} " + "; ".join(r) + "."
    else:
        s = f"{lead} nothing in the data flags {f['last']} as unusually risky this week, so the main risk is ordinary game-to-game variance."
    if other:
        o = risks(other)
        s += f" On the other side, {other['last']} " + (("has his own flags: " + "; ".join(o) + ".") if o else "has no specific red flags, so he is a reasonable fallback if news changes.")
    return s


# ---------------- recommendation builders ----------------
def conf_from(gap, sd):
    return max(51, min(95, round(100 * norm_cdf(gap / max(sd, 1)))))


def rec(section, call, conf, headline, paras, metrics, ids, pri):
    return dict(section=section, call=call, conf=conf, confLabel=conf_label(conf), headline=headline, narrative=[p for p in paras if p], metrics=metrics, players=ids, priority=round(pri, 2))


def start_sit(lg, m):
    me, nw = m["me"], m["nw"]
    key = lambda i: proj_week(lg, i, nw, nw)
    opt = optimal(lg, me["players"], key)
    cur_ids = [i for i in me["starters"] if pos(i) in set(lg['slots']) | set(sum(FLEXOK.values(), []))]
    cur = sum(key(i) for i in cur_ids)
    best = sum(x["v"] for x in opt)
    opt_ids = [x["id"] for x in opt if x["id"]]
    ins = sorted([i for i in opt_ids if i not in cur_ids], key=lambda i: -key(i))
    outs = sorted([i for i in cur_ids if i not in opt_ids], key=key)
    res = []
    pairs, left = [], list(outs)
    for a in ins:
        b = next((o for o in left if pos(o) == pos(a)), None) or (left[0] if left else None)
        if b:
            left.remove(b)
            pairs.append((a, b))
    m["ss_ids"] = {x for ab in pairs for x in ab} | set(opt_ids)
    for a, b in pairs:
        fa, fb = facts(lg, m, a), facts(lg, m, b)
        gap = fa["wk"] - fb["wk"]
        conf = 95 if fb["wk"] == 0 else conf_from(gap, math.hypot(fa["sd"], fb["sd"]))
        seed = lg["id"] + a + b
        why_b = (f"{fb['n']} is {fb['inj']}" + (f" ({fb['injd']})" if fb["injd"] else "") + " and projects for zero") if fb["inj"] in OUT else (f"{fb['n']} is on bye" if not fb["opp"] else f"{fb['n']} projects for {f1(fb['wk'])}")
        p1 = hpick(seed, [
            f"Start {fa['n']} ({fa['pos']}, {fa['team']}) over {fb['n']}. {why_b}, while {fa['last']} projects for {f1(fa['wk'])}, a gain of {f1(gap)} points for this one swap.",
            f"The call is {fa['n']} in, {fb['n']} out. {why_b}; {fa['last']} is at {f1(fa['wk'])}, so the swap is worth about {f1(gap)} projected points.",
        ]) + f" Across the whole lineup, your saved lineup projects {f1(cur)} and the optimal one projects {f1(best)} (+{f1(best - cur)})."
        paras = [p1, s_matchup(fa, seed), s_usage(fa, seed), s_health(fa, seed), s_range(fa, seed),
                 (s_matchup(fb, seed + "b") + " " + s_health(fb, seed + "b")).strip() if fb["opp"] or fb["inj"] else s_matchup(fb, seed + "b"),
                 para_counter(fa, fb, seed),
                 f"What you give up: {fb['last']}'s ceiling this week is about {f1(fb['hi'])} points against {f1(fa['hi'])} for {fa['last']}." if fb["wk"] > 0 else f"What you give up: nothing this week, because {fb['last']} cannot score for you in Week {nw}."]
        res.append(rec("startsit", f"Start {fa['n']}, bench {fb['n']}", conf, f"+{f1(gap)} pts", paras,
                       dict(gain=round(gap, 1), lineupNow=round(cur, 1), lineupBest=round(best, 1), proj=round(fa["wk"], 1), lo=round(fa["lo"], 1), hi=round(fa["hi"], 1), **(fa["er"] or {})), [a, b], 3 + gap / 3))
    if not res:
        lock = sorted(opt_ids, key=lambda i: -key(i))[:1]
        if lock:
            fa = facts(lg, m, lock[0])
            seed = lg["id"] + lock[0] + "lock"
            res.append(rec("startsit", "Your saved lineup is already optimal", 80, f"{f1(best)} proj", [
                f"Every slot in your saved lineup matches the optimal lineup for Week {nw} ({f1(best)} projected points). No change needed.",
                f"Your anchor is {fa['n']} at {f1(fa['wk'])} projected. " + s_matchup(fa, seed), s_usage(fa, seed), s_health(fa, seed), s_range(fa, seed), para_counter(fa, None, seed)],
                dict(lineupNow=round(cur, 1), lineupBest=round(best, 1)), lock, 1))
    return res


def waivers(lg, m):
    me, nw = m["me"], m["nw"]
    rostered = set(m["owner"])
    cands = {}
    for k, ids in DEPTH.items():
        t, X = k.split("|")
        if X not in ("RB", "WR", "TE", "QB") or len(ids) < 2:
            continue
        top = P.get(ids[0])
        if top and top.get("i") in OUT and ids[1] in P and ids[1] not in rostered:
            cands[ids[1]] = ("Their shot", f"{top['n']} is {top['i']}" + (f" ({top.get('in')})" if top.get("in") else "") + f", and {name(ids[1])} is next on the {t} {X} depth chart")
    for i, u in USAGE.items():
        if i in rostered or i not in P or u.get("g", 0) < 3:
            continue
        jump = (u["tsL2"] - u["ts"]) + (u["csL2"] - u["cs"]) + ((u.get("snapL2") or 0) - (u.get("snap") or 0)) / 2
        if jump >= 8 and (u.get("snapL2") or 0) >= 40 and i not in cands:
            cands[i] = ("Opportunity spike", f"his usage jumped over the last two games (snaps {u['snap']}% to {u['snapL2']}%, targets {f1(u['ts'])}% to {f1(u['tsL2'])}%, carries {f1(u['cs'])}% to {f1(u['csL2'])}%)")
    for i, pf in (PERF.get(lg["perf"]) or {}).items():
        if i not in rostered and i in P and P[i].get("t") and P[i].get("i") not in OUT and pf.get("g", 0) >= 1 and pf.get("vorp", -9) > 0 and i not in cands and any(s == pf["pos"] or pf["pos"] in FLEXOK.get(s, []) for s in lg["slots"]):
            cands[i] = ("Best available", f"he is the type of producer rarely left on waivers: {f1(pf['ppg'])} ppg and positive value over replacement ({f1(pf['vorp'])})")
    eligible = [i for i in cands if (P.get(i) or {}).get('i') not in OUT and pos(i) in [s for s in lg["slots"]] + sum((FLEXOK.get(s, []) for s in lg["slots"]), []) and pos(i) != "K"]
    ranked = sorted(eligible, key=lambda i: -(proj_ros(lg, i, nw) + (25 if cands[i][0] == "Their shot" else 12 if cands[i][0] == "Opportunity spike" else 0)))[:3]
    protect = {x["id"] for x in me["lineup"]} | m.get("ss_ids", set())
    # Lowest-value bench players first; never drop a player we have no data on, or one in a start/sit call.
    dval = lambda p: proj_ros(lg, p, nw) + (value_of(lg, p, m["week"]) / 300 if lg["mode"] == "dynasty" else 0)
    droppable = sorted([p for p in me["players"] if p not in protect and pos(p) not in ("K", "DST", "") and (P.get(p) or {}).get("i") != "IR" and has_data(lg, p)], key=dval)
    m["drops"] = set()
    m["bench_vals"] = [(name(p), round(dval(p), 1)) for p in droppable]
    res = []
    for n_, a in enumerate(ranked):
        kind, why = cands[a]
        fa = facts(lg, m, a)
        drop = droppable[n_] if n_ < len(droppable) else None
        if drop:
            m["drops"].add(drop)
        fd = facts(lg, m, drop) if drop else None
        seed = lg["id"] + a + "w"
        gain = fa["ros"] - (fd["ros"] if fd else 0)
        conf = max(52, min(90, round(55 + gain / 3 + (12 if kind == "Their shot" else 6 if kind == "Opportunity spike" else 0))))
        p1 = hpick(seed, [f"Add {fa['n']} ({fa['pos']}, {fa['team'] or 'FA'}). {kind}: {why}.", f"{kind} add: {fa['n']} ({fa['pos']}, {fa['team'] or 'FA'}) is unrostered in {lg['name']}, and {why}."])
        p1 += f" You have ${me['faab']} of FAAB left." if lg["platform"] == "ESPN" or lg["mode"] == "dynasty" else ""
        pd = (f"Drop {fd['n']}: he is not in your optimal lineup and projects {f1(fd['ros'])} rest-of-season points against {f1(fa['ros'])} for {fa['last']}, a net {'+' if gain >= 0 else ''}{f1(gain)}."
              + (f" In dynasty terms his value is {fd['val']:,} on our blended scale, so check that you are not cutting a long-term asset." if lg["mode"] == "dynasty" else "")) if fd else "You have no clear drop candidate; make room by dropping your kicker or defense if you must."
        if fd and fd.get("salary"):
            pd += f" (Keeper note: {fd['last']} carries a ${fd['salary']['salary']} salary.)"
        paras = [p1, s_usage(fa, seed), s_matchup(fa, seed), s_health(fa, seed), s_range(fa, seed), pd, para_counter(fa, None, seed),
                 f"What you give up: {fd['n']}'s {f1(fd['ros'])} projected rest-of-season points and his roster spot." if fd else ""]
        res.append(rec("waivers", f"Add {fa['n']}" + (f", drop {fd['n']}" if fd else ""), conf, kind, paras,
                       dict(kind=kind, ros=round(fa["ros"], 1), proj=round(fa["wk"], 1), net=round(gain, 1), **(fa["er"] or {})), [a] + ([drop] if drop else []), 2 + gain / 20 + (1 if kind == "Their shot" else 0)))
    return res


def trades(lg, m):
    me, wk = m["me"], m["week"]
    val = lambda i: value_of(lg, i, wk)
    strength = lambda ids: sum(x["v"] for x in optimal(lg, ids, key=lambda i: (perf(lg, i) or {}).get("blend", 0), ros=True))
    myN = needs(lg, m, me)
    needP = [n["pos"] for n in myN if n["score"] >= 50]
    surP = [n["pos"] for n in myN if n["score"] < 45]
    myStart = {x["id"] for x in me["lineup"]}
    give_pool = [p for p in me["players"] if val(p) > 150 and p not in m.get("drops", set()) and p not in m.get("ss_ids", set()) and (pos(p) in surP or p not in myStart)]
    base_me = strength(me["players"])
    out = []
    for t in m["teams"]:
        if t["me"]:
            continue
        tn = needs(lg, m, t)
        tneed = [n["pos"] for n in tn if n["score"] >= 50]
        tget = [p for p in t["players"] if val(p) > 150 and pos(p) in needP]
        gives = [p for p in give_pool if pos(p) in tneed]
        combos = [[a] for a in gives] + [[a, b] for a in gives for b in gives if b > a]
        base_t = strength(t["players"])
        for g in combos:
            for r in tget:
                gv, rv = sum(val(x) for x in g), val(r)
                bal = (rv - gv) / max(gv, rv, 1)
                if abs(bal) > 0.22:
                    continue
                ma = strength([x for x in me["players"] if x not in g] + [r]) - base_me
                ta = strength([x for x in t["players"] if x != r] + g) - base_t
                if ma <= 0.3 or ta < -0.5:
                    continue
                out.append(dict(t=t, give=g, get=r, gv=gv, rv=rv, bal=bal, ma=ma, ta=ta, tn=tn, score=ma + max(0, ta) * 0.6 - abs(bal) * 3))
    out.sort(key=lambda x: -x["score"])
    seen, res = set(), []
    for x in out:
        if x["get"] in seen or len(res) >= 2:
            continue
        seen.add(x["get"])
        fr = facts(lg, m, x["get"])
        fg = [facts(lg, m, g) for g in x["give"]]
        seed = lg["id"] + x["get"] + "t"
        acc = max(0, min(99, round(50 - x["bal"] * 120 + (12 if x["ta"] > 0 else -8))))
        conf = max(50, min(88, round(48 + x["ma"] * 6 + (acc - 50) / 4)))
        gname = " + ".join(f["n"] for f in fg)
        their = ", ".join(f"{n['pos']} need score {n['score']}/100" for n in x["tn"] if n["pos"] in {f['pos'] for f in fg})
        mine_need = next(n for n in myN if n["pos"] == fr["pos"])
        p1 = hpick(seed, [f"Offer {x['t']['name']} {gname} for {fr['n']}.", f"Propose this to {x['t']['name']}: you send {gname}, you get {fr['n']}."]) + \
            f" {fr['pos']} is a need for you (need score {mine_need['score']}/100: your starters average {f1(mine_need['mine'])} ppg there vs a league average of {f1(mine_need['avg'])}). {x['t']['name']} is thin where you are deep ({their})."
        p2 = f"The numbers: on our blended value scale you send {x['gv']:,} and receive {x['rv']:,} ({'+' if x['rv'] >= x['gv'] else ''}{x['rv'] - x['gv']:,}). Your optimal lineup improves by {f1(x['ma'])} points a week and theirs changes by {'+' if x['ta'] >= 0 else ''}{f1(x['ta'])}, which is why it is pitchable: both sides start better players. Estimated acceptance: {acc}%."
        if lg["mode"] == "keeper":
            ks = [f for f in [fr] + fg if f.get("salary")]
            if ks:
                p2 += " Keeper salaries: " + "; ".join(f"{f['n']} ${f['salary']['salary']} (projected worth ${f['salary']['val']}, {'+' if f['salary']['surplus'] >= 0 else ''}{f['salary']['surplus']} surplus)" for f in ks) + "."
        paras = [p1, p2, s_usage(fr, seed), s_health(fr, seed), s_range(fr, seed)]
        for f in fg:
            paras.append(f"What you give up: {f['n']} ({f['pos']}, {f['team']}) projects {f1(f['ros'])} rest-of-season points. " + s_usage(f, seed + f["id"]))
        paras.append(para_counter(fr, fg[0], seed))
        res.append(rec("trades", f"Trade {gname} to {x['t']['name']} for {fr['n']}", conf, f"+{f1(x['ma'])} ppg", paras,
                       dict(give=x["gv"], get=x["rv"], lineupGain=round(x["ma"], 1), accept=acc, **(fr["er"] or {})), [x["get"]] + x["give"], 1.5 + x["ma"] / 2))
    return res


def sell_hold(lg, m):
    me = m["me"]
    res = []
    for p in me["players"]:
        s = signal_of(lg, p)
        f = None
        if s:
            f = facts(lg, m, p)
            seed = lg["id"] + p + "s"
            if s["k"] == "Sell high":
                call = f"Sell high on {f['n']}"
                p1 = hpick(seed, [f"Shop {f['n']} while the box scores look great.", f"{f['n']} is a sell-high candidate."]) + f" He is scoring {f1(f['pf'].get('ppg', 0))} points a game, but his opportunity is worth {f1(s['x'])} a game ({'+' if s['diff'] >= 0 else ''}{f1(s['diff'])})."
            else:
                call = f"Hold {f['n']} (do not sell low)"
                p1 = hpick(seed, [f"Hold {f['n']}. His production lags his usage, which usually corrects.", f"Keep {f['n']}; this is the wrong time to sell."]) + f" He is scoring {f1(f['pf'].get('ppg', 0))} a game on opportunity worth {f1(s['x'])} ({f1(s['diff'])})."
            conf = max(55, min(85, round(55 + abs(s["diff"]) * 5)))
            paras = [p1, s_usage(f, seed), s_health(f, seed), s_range(f, seed),
                     f"Market check: {f['n']} is valued at {f['mk']['v']:,} in the public trade market (position rank {f['mk']['pr']})." if f["mk"] else "",
                     para_counter(f, None, seed) if s["k"] == "Buy low" else "The counter-case: talent can sustain efficiency for a while, and if he is your only reliable starter at the position, selling creates a hole. Only sell for a starter you need.",
                     f"What you give up by holding: the chance to cash in his current {f1(f['pf'].get('ppg', 0))} ppg reputation." if s["k"] == "Buy low" else f"What you give up by selling: {f1(f['ros'])} projected rest-of-season points."]
            res.append(rec("sellhold", call, conf, s["k"], paras, dict(ppg=f["pf"].get("ppg"), xfp=round(s["x"], 1), **(f["er"] or {})), [p], 1 + abs(s["diff"]) / 4))
        elif lg["mode"] == "dynasty":
            pl = P.get(p) or {}
            v = value_of(lg, p, m["week"])
            if age_factor(pl.get("p"), pl.get("a")) < 0.6 and v > 1200:
                f = facts(lg, m, p)
                seed = lg["id"] + p + "age"
                paras = [f"Sell {f['n']} before the age curve does it for you. He is {f['age']}, past the usual {f['pos']} peak of {AGE[f['pos']][1]}, and still carries a dynasty value of {v:,} on our blended scale" + (f" ({f['mk']['v']:,} in the public market)." if f["mk"] else "."),
                         s_usage(f, seed), s_health(f, seed), s_range(f, seed),
                         "The counter-case: if you are contending this year his weekly points matter more than his future value, so only sell for a younger player of similar current production or a 1st-round pick.",
                         f"What you give up: {f1(f['ros'])} projected rest-of-season points."]
                res.append(rec("sellhold", f"Sell aging asset {f['n']}", 66, "Age curve", paras, dict(value=v, age=f["age"], **(f["er"] or {})), [p], 1.2))
    return sorted(res, key=lambda r: -r["priority"])[:3]


def dynasty_future(lg, m):
    me = m["me"]
    S = SLEEPER
    picks = [p for p in m.get("picks", []) if p["owner"] == me["id"]]
    tn = {t["id"]: t["name"] for t in m["teams"]}
    str_rank = sorted(m["teams"], key=lambda t: -t["strength"]).index(me) + 1
    val_rank = sorted(m["teams"], key=lambda t: -t["value"]).index(me) + 1
    window = "Contend" if str_rank <= 4 else "Rebuild" if val_rank >= 9 else "Retool"
    myN = needs(lg, m, me)
    top_need = myN[0]
    board = []
    try:
        with open(os.path.join(DATA, "rookie_report_2027_2028.csv")) as f:
            board = [r for r in csv.DictReader(f) if r.get("draft_class") == "2027"]
    except Exception:
        pass
    pros = {norm(x["name"]): x for x in (load("prospects_2027.json") or {}).get("prospects", [])}
    p27 = [p for p in picks if p["season"] == 2027]
    pick_txt = ", ".join(f"R{p['round']}" + (f" (via {tn.get(p['orig'])})" if p["orig"] != me["id"] else "") for p in sorted(p27, key=lambda p: p["round"])) or "none"
    tgt = [r for r in board if r["position"] == top_need["pos"]][:3] or board[:3]
    res = []
    if tgt:
        r0 = tgt[0]
        pr = pros.get(norm(r0["name"]))
        seed = "dyn" + r0["name"]
        paras = [f"Rookie draft plan: you own these 2027 picks: {pick_txt}. Your biggest positional need is {top_need['pos']} (need score {top_need['score']}/100; your starters average {f1(top_need['mine'])} ppg there vs {f1(top_need['avg'])} league-wide), so the board points to {r0['name']} ({r0['school']}, {r0['position']}{r0['rank']}), projected to go {r0['tier_12tm_1QB']} in 12-team leagues.",
                 f"2026 production: {r0['stats_2026']}. Scouting note: {r0['note']}" + (f" Age at the draft: {r0['age_at_draft']}." if r0.get("age_at_draft") else ""),
                 (f"Our prospect model scores him {pr['score']}/100 (tier {pr['tier']}): {pr['summary']}" if pr else ""),
                 "Other fits at the position: " + "; ".join(f"{r['name']} ({r['school']}, {r['tier_12tm_1QB']})" for r in tgt[1:]) + "." if len(tgt) > 1 else "",
                 f"Your window reads as {window}: lineup strength ranks {ordinal(str_rank)} and total roster value ranks {ordinal(val_rank)} of {len(m['teams'])}. " + ("Contenders can trade a future pick for a proven starter; rebuilders should collect more 2027 firsts." if window != "Retool" else "A retooling team should keep its own 1st and package depth for an extra 2nd."),
                 "The counter-case: college production in October is a small sample, and NFL draft capital in April will move these rankings more than anything else. Treat the board as a starting point."]
        res.append(rec("rookie", f"Target {r0['name']} ({r0['position']}) with your top 2027 pick", 60, f"{top_need['pos']} need", paras, dict(picks=len(p27), window=window), [], 1.3))
    sell = sell_hold(lg, m)
    for r in sell:
        if r["metrics"].get("age"):
            r2 = dict(r)
            r2["section"] = "future"
            res.append(r2)
            break
    return res


def summarize(lg, m, items):
    me = m["me"]
    return dict(team=me["name"], record=f"{me['w']}-{me['l']}", week=m["nw"])


def main():
    out = dict(updated=dt.datetime.now(dt.timezone(dt.timedelta(hours=-4))).isoformat(timespec="seconds"), trigger=os.environ.get("TRIGGER") or "manual", edgeScore=EDGE_ON,
               betlab=dict(lines=len(GAMES), cascades=len(IMPACT)), leagues={})
    for k, lg in LEAGUES.items():
        m = build(lg)
        if not m or not m.get("me"):
            out["leagues"][k] = dict(pending=True)
            continue
        secs = dict(startsit=start_sit(lg, m), waivers=waivers(lg, m), trades=trades(lg, m), sellhold=sell_hold(lg, m))
        if lg["mode"] == "dynasty":
            secs["rookie"] = dynasty_future(lg, m)
        allr = [r for v in secs.values() for r in v]
        top = sorted(allr, key=lambda r: -r["priority"])
        for i, r in enumerate(top):
            r["rank"] = i + 1
        print(k, "bench drop order:", m.get("bench_vals"))
        out["leagues"][k] = dict(name=lg["name"], short=lg["short"], scoring=lg["scoring"], **summarize(lg, m, allr), sections=secs, actions=[dict(rank=r["rank"], section=r["section"], call=r["call"], conf=r["conf"], confLabel=r["confLabel"]) for r in top])
    path = os.path.join(DATA, "ai_manager.json")
    old = load("ai_manager.json") or {}
    strip = lambda d: {k: v for k, v in d.items() if k not in ("updated", "trigger")}
    if strip(old) == strip(json.loads(json.dumps(out))):
        print("AI manager content unchanged; leaving file as is")
    else:
        with open(path, "w") as f:
            json.dump(out, f, indent=1)
    for k, v in out["leagues"].items():
        print(k, (v.get("actions") or [{}])[0].get("call"))


if __name__ == "__main__":
    main()
