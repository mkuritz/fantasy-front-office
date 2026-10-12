"""2027 rookie class prospect board (free sources).
ESPN college-football core API (public): stat leaders -> prospect pool, bios, per-season stats, team totals.
Optional CollegeFootballData.com (secret CFBD_API_KEY): player usage / target share. Degrades gracefully if absent.
FantasyCalc (public): 2027 rookie pick values. All scores are stat-based percentiles; draft capital is a labeled estimate."""
import json, os, re, urllib.request
from concurrent.futures import ThreadPoolExecutor
B = "https://sports.core.api.espn.com/v2/sports/football/leagues/college-football"
CLASS, CUR = 2027, 2026
SEASONS = [2023, 2024, 2025, 2026]


def get(url, hdr=None):
    r = urllib.request.Request(url.replace("http://", "https://"), headers={"User-Agent": "Mozilla/5.0", **(hdr or {})})
    return json.load(urllib.request.urlopen(r, timeout=20))


def safe(f, *a):
    try:
        return f(*a)
    except Exception:
        return None


def cats(d):
    return {c["name"]: {s["name"]: s.get("value") or 0 for s in c.get("stats", [])} for c in ((d or {}).get("splits") or {}).get("categories", [])}


def pool():
    ids = {}
    for yr in (CUR, CUR - 1):
        d = safe(get, f"{B}/seasons/{yr}/types/2/leaders?limit=100") or {}
        for c in d.get("categories", []):
            if c["name"] in ("passingYards", "rushingYards", "receivingYards", "receptions", "receivingTouchdowns", "rushingTouchdowns"):
                for l in c["leaders"]:
                    aid = re.search(r"athletes/(\d+)", l["athlete"]["$ref"]).group(1)
                    ids.setdefault(aid, l["team"]["$ref"] if l.get("team") else None)
    return ids


def bio(aid):
    a = get(f"{B}/seasons/{CUR}/athletes/{aid}")
    tm = re.search(r"teams/(\d+)", (a.get("team") or {}).get("$ref", "") or "")
    return {"id": aid, "name": a.get("displayName"), "pos": (a.get("position") or {}).get("abbreviation"), "yrs": (a.get("experience") or {}).get("years") or 0,
            "cls": (a.get("experience") or {}).get("displayValue"), "ht": a.get("displayHeight"), "wt": a.get("weight"), "team": tm.group(1) if tm else None}


TEAMS = {}


def team_tot(tid, yr):
    k = (tid, yr)
    if k not in TEAMS:
        c = cats(safe(get, f"{B}/seasons/{yr}/types/2/teams/{tid}/statistics"))
        TEAMS[k] = {"recYds": c.get("receiving", {}).get("receivingYards", 0), "recTD": c.get("receiving", {}).get("receivingTouchdowns", 0),
                    "rushYds": c.get("rushing", {}).get("rushingYards", 0), "rushTD": c.get("rushing", {}).get("rushingTouchdowns", 0)}
    return TEAMS[k]


def team_name(tid):
    d = safe(get, f"{B}/seasons/{CUR}/teams/{tid}") or {}
    return d.get("abbreviation") or d.get("displayName")


def seasons(p):
    out = []
    for yr in SEASONS:
        c = cats(safe(get, f"{B}/seasons/{yr}/types/2/athletes/{p['id']}/statistics/0"))
        if not c:
            continue
        pa, ru, rc = c.get("passing", {}), c.get("rushing", {}), c.get("receiving", {})
        s = {"yr": yr, "gp": c.get("general", {}).get("gamesPlayed") or 0,
             "pAtt": pa.get("passingAttempts", 0), "pYds": pa.get("passingYards", 0), "pTD": pa.get("passingTouchdowns", 0), "int": pa.get("interceptions", 0), "cmpPct": round(pa.get("completionPct", 0), 1),
             "rAtt": ru.get("rushingAttempts", 0), "rYds": ru.get("rushingYards", 0), "rTD": ru.get("rushingTouchdowns", 0),
             "rec": rc.get("receptions", 0), "recYds": rc.get("receivingYards", 0), "recTD": rc.get("receivingTouchdowns", 0), "tgt": rc.get("receivingTargets", 0)}
        if not any([s["pAtt"], s["rAtt"], s["rec"]]):
            continue
        if p.get("team"):
            t = team_tot(p["team"], yr)  # approximation: current school (transfers noted as approximate)
            if p["pos"] in ("WR", "TE") and t["recYds"]:
                s["dom"] = round(100 * (s["recYds"] / t["recYds"] + (s["recTD"] / t["recTD"] if t["recTD"] else 0)) / 2, 1)
            elif p["pos"] == "RB" and (t["rushYds"] + t["recYds"]):
                s["dom"] = round(100 * (s["rYds"] + s["recYds"]) / (t["rushYds"] + t["recYds"]), 1)
        if (s.get("dom") or 0) > 70:
            s["dom"] = None  # stats exceed current school totals -> transfer season, share unknown
        s["estAge"] = round(18.6 + (yr - (CUR - p["yrs"] + 1)) + 1, 1)  # est. age during season from class year (no DOB in free feed)
        out.append(s)
    return out


def cfbd_usage():
    k = os.environ.get("CFBD_API_KEY")
    if not k:
        return {}, False
    u = {}
    for yr in (CUR - 1, CUR):
        for r in safe(get, f"https://api.collegefootballdata.com/player/usage?year={yr}", {"Authorization": f"Bearer {k}"}) or []:
            u[(r.get("name", "").lower(), yr)] = (r.get("usage") or {}).get("pass")
    return u, True


def pct(vals, v):
    vals = sorted(x for x in vals if x is not None)
    return 0 if not vals or v is None else round(100 * sum(1 for x in vals if x <= v) / len(vals))


def build():
    ids = pool()
    with ThreadPoolExecutor(16) as ex:
        bios = [b for b in ex.map(lambda a: safe(bio, a), ids) if b]
    P = [b for b in bios if b["pos"] in ("QB", "RB", "WR", "TE") and b["yrs"] >= 3]  # 3+ years in college -> eligible for 2027 NFL draft
    with ThreadPoolExecutor(16) as ex:
        for p, s in zip(P, ex.map(seasons, P)):
            p["seasons"] = s
    names = {}
    with ThreadPoolExecutor(8) as ex:
        tids = list({p["team"] for p in P if p["team"]})
        names = dict(zip(tids, ex.map(team_name, tids)))
    usage, has_cfbd = cfbd_usage()
    P = [p for p in P if p.get("seasons") and p["seasons"][-1]["yr"] == CUR]  # must be playing college ball this season (drops players who already turned pro)
    for p in P:
        S = p["seasons"]; last = S[-1]; tot = lambda k: sum(s[k] for s in S)
        p["school"] = names.get(p["team"]); doms = [s.get("dom") or 0 for s in S] or [0]
        thr = 20 if p["pos"] in ("WR", "TE") else 15
        bo = next((s for s in S if (s.get("dom") or 0) >= thr), None)
        p["m"] = {"peakDom": max(doms), "lastDom": doms[-1], "breakoutAge": bo["estAge"] if bo else None, "breakoutYr": bo["yr"] if bo else None,
                  "ypc": round(tot("rYds") / tot("rAtt"), 2) if tot("rAtt") else None, "ypr": round(tot("recYds") / tot("rec"), 1) if tot("rec") else None,
                  "ypt": round(tot("recYds") / tot("tgt"), 1) if tot("tgt") else None, "ypa": round(tot("pYds") / tot("pAtt"), 2) if tot("pAtt") else None,
                  "tdInt": round(tot("pTD") / max(1, tot("int")), 2) if tot("pAtt") else None, "scrimPG": round((last["rYds"] + last["recYds"]) / max(1, last["gp"]), 1),
                  "tgtShare": usage.get((p["name"].lower(), last["yr"]))}
    for pos in ("QB", "RB", "WR", "TE"):
        G = [p for p in P if p["pos"] == pos]
        if pos == "QB":
            feats = {"ypa": 0.3, "tdInt": 0.2, "pYdsPG": 0.25, "rushPG": 0.15, "cmp": 0.1}
            for p in G:
                l = p["seasons"][-1]; p["f"] = {"ypa": p["m"]["ypa"], "tdInt": p["m"]["tdInt"], "pYdsPG": l["pYds"] / max(1, l["gp"]), "rushPG": l["rYds"] / max(1, l["gp"]), "cmp": l["cmpPct"]}
        else:
            feats = {"peakDom": 0.35, "breakout": 0.2, "eff": 0.2, "scrimPG": 0.25}
            for p in G:
                p["f"] = {"peakDom": p["m"]["peakDom"], "breakout": -(p["m"]["breakoutAge"] or 24), "eff": (p["m"]["ypc"] if pos == "RB" else p["m"]["ypr"]), "scrimPG": p["m"]["scrimPG"]}
        for p in G:
            p["pcts"] = {k: pct([q["f"][k] for q in G], p["f"][k]) for k in feats}
            p["score"] = round(sum(w * p["pcts"][k] for k, w in feats.items()))
            # size bonus/penalty vs. positional norms (free bio data only)
            wt = p.get("wt") or 0; norm = {"QB": 215, "RB": 205, "WR": 195, "TE": 245}[pos]
            if wt and pos != "QB" and wt < norm - 20:
                p["score"] -= 4
        for p in G:
            del p["f"]
    P.sort(key=lambda p: -p["score"])
    P = P[:200]
    for i, p in enumerate(P):
        s = p["score"]; p["tier"] = 1 if s >= 82 else 2 if s >= 70 else 3 if s >= 58 else 4 if s >= 45 else 5
        p["rank"] = i + 1
        p["capitalEst"] = "Rd 1" if s >= 85 else "Rd 1-2" if s >= 75 else "Rd 2-3" if s >= 63 else "Rd 3-5" if s >= 50 else "Day 3 / UDFA"
        m = p["m"]; bits = []
        if p["pos"] == "QB":
            bits.append(f"{m['ypa']} yds/att, {m['tdInt']} TD:INT career")
            if p["pcts"]["rushPG"] >= 75: bits.append("adds real rushing value")
        else:
            if m["peakDom"]: bits.append(f"peak dominator {m['peakDom']}% ({'elite' if p['pcts']['peakDom'] >= 85 else 'strong' if p['pcts']['peakDom'] >= 65 else 'modest'} vs. class)")
            bits.append(f"broke out ~age {m['breakoutAge']} ({m['breakoutYr']})" if m["breakoutAge"] else "no clear breakout season yet")
            if p["pos"] == "RB" and m["ypc"]: bits.append(f"{m['ypc']} YPC")
            if p["pos"] != "RB" and m["ypr"]: bits.append(f"{m['ypr']} yds/rec")
        bits.append(f"{p['seasons'][-1]['yr']}: {m['scrimPG'] if p['pos'] != 'QB' else round(p['seasons'][-1]['pYds'] / max(1, p['seasons'][-1]['gp']))} yds/g")
        if p.get("wt"): bits.append(f"{p['ht']}, {int(p['wt'])} lb")
        p["summary"] = "; ".join(bits) + "."
    fc = safe(get, "https://api.fantasycalc.com/values/current?isDynasty=true&numQbs=2&numTeams=12&ppr=1") or []
    picks = {x["player"]["name"]: x["value"] for x in fc if x["player"]["name"].startswith(f"{CLASS} ")}
    return {"class": CLASS, "hasCFBD": has_cfbd, "pickValues": picks, "prospects": P,
            "notes": "Pool = ESPN college stat leaders with 3+ college years. Dominator uses current school's team totals (approximate for transfers). Ages are estimated from class year. Draft capital is a stat-based estimate, not a mock draft."}


if __name__ == "__main__":
    d = build(); print(len(d["prospects"]), [(p["name"], p["pos"], p["score"]) for p in d["prospects"][:10]])
    json.dump(d, open(os.path.join(os.path.dirname(__file__), "..", "data", "prospects_2027.json"), "w"), separators=(",", ":"))
