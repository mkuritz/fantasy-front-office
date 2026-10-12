#!/usr/bin/env python3
"""Tiny change detector (stdlib only, ~2 small requests). Reads ESPN NFL news + nflverse injury report,
flags significant fantasy events (trade, signing, release, IR, starter Out, depth change) not seen before,
appends them to data/changes.json and sets GitHub output changed=true so the full recompute runs."""
import csv, hashlib, io, json, os, re, sys, urllib.request
from datetime import datetime, timezone
from zoneinfo import ZoneInfo

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
STATE = os.path.join(ROOT, "data", "check_state.json"); LOG = os.path.join(ROOT, "data", "changes.json")
UA = {"User-Agent": "fantasy-front-office-check/1.0"}
KW = [("Trade", r"\btrade[sd]?\b|\bacquir"), ("Signing", r"\bsign(s|ed|ing)\b"), ("Release", r"\breleas|\bwaive[sd]?\b|\bcut\b"),
      ("IR", r"\binjured reserve\b|\bIR\b|season-ending|torn|ACL|Achilles"), ("Injury", r"\bout\b|\bruled out\b|doubtful|inactive|concussion|hamstring|ankle|knee"),
      ("Depth", r"\bstart(s|ing|er)\b|\bbenched\b|depth chart|\bRB1\b|\bWR1\b|takes over|named the starter")]
FPOS = {"QB", "RB", "WR", "TE", "K"}


def get(u):
    with urllib.request.urlopen(urllib.request.Request(u, headers=UA), timeout=40) as r:
        return r.read()


def now():
    return datetime.now(timezone.utc).astimezone(ZoneInfo("America/New_York")).isoformat(timespec="seconds")


def main():
    st = json.load(open(STATE)) if os.path.exists(STATE) else {"seen": []}
    seen = set(st["seen"]); new = []
    try:
        j = json.loads(get("https://site.api.espn.com/apis/site/v2/sports/football/nfl/news?limit=50"))
        for a in j.get("articles", []):
            text = f'{a.get("headline","")} {a.get("description","")}'
            kinds = [k for k, rx in KW if re.search(rx, text, re.I)]
            ath = [c.get("description") for c in a.get("categories", []) if c.get("type") == "athlete"]
            key = "n:" + str(a.get("id") or hashlib.md5(text.encode()).hexdigest())
            if kinds and ath and key not in seen:
                new.append({"t": a.get("published"), "kind": kinds[0], "src": "ESPN news", "text": a.get("headline"), "players": ath[:4], "url": ((a.get("links") or {}).get("web") or {}).get("href")})
            seen.add(key)
    except Exception as e:
        print("news check failed:", e, file=sys.stderr)
    try:
        rows = list(csv.DictReader(io.StringIO(get("https://github.com/nflverse/nflverse-data/releases/download/injuries/injuries_2026.csv").decode())))
        wk = max(int(r["week"]) for r in rows)
        for r in rows:
            if int(r["week"]) == wk and r["position"] in FPOS and r["report_status"] in ("Out", "Doubtful"):
                key = f'i:{wk}:{r["gsis_id"]}:{r["report_status"]}'
                if key not in seen:
                    new.append({"t": now(), "kind": "Injury", "src": "Official injury report", "text": f'{r["full_name"]} ({r["position"]}, {r["team"]}) {r["report_status"]} for Week {wk}: {r["report_primary_injury"] or "undisclosed"}', "players": [r["full_name"]]})
                seen.add(key)
    except Exception as e:
        print("injury check failed:", e, file=sys.stderr)
    first_run = not st["seen"]
    st["seen"] = sorted(seen)[-3000:]; st["lastCheck"] = now(); st["lastNew"] = len(new)
    changed = bool(new) and not first_run
    if new:
        log = json.load(open(LOG)) if os.path.exists(LOG) else []
        log = [{"detected": now(), **x} for x in new] + log
        json.dump(log[:150], open(LOG, "w"), indent=1)
    json.dump(st, open(STATE, "w"))
    print(f"new significant events: {len(new)} (first_run={first_run}) -> changed={changed}")
    if os.environ.get("GITHUB_OUTPUT"):
        open(os.environ["GITHUB_OUTPUT"], "a").write(f"changed={'true' if changed or first_run else 'false'}\n")


if __name__ == "__main__":
    main()
