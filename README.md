# Fantasy Front Office · a Sports Labs product

GM-mode app for fantasy football, built on the Eagles GM Lab Live layout. A league switcher covers three formats:

| League | Platform | Mode |
|---|---|---|
| Show Us Your TDs | Sleeper (public) | Dynasty: dynasty value, age curves, rookie picks, contend/rebuild window, rebuild plan |
| KAL | ESPN (private) | Keeper auction: salary vs projected value, keeper board, cap planning (salaries seeded from the league sheet) |
| D CIGS, LOMOFAGS | ESPN (private) | Redraft: start/sit, waivers/FAAB, playoff odds, trade analyzer |

Every league also gets: my roster with performance-based values, all teams' rosters and needs, league activity, standings and matchups, a trade machine (value and fit for both sides), Monte Carlo, scenarios (Save/Export/Import) and a news feed.

## Data
`scripts/fetch_data.py` runs in GitHub Actions (every 30 min Sun/Mon, every 2 h otherwise): Sleeper API, nflverse weekly stats (re-scored with each league's settings), FantasyCalc values, ESPN news.
**ESPN private leagues** read `ESPN_S2` and `ESPN_SWID` from repository secrets only. They are never committed or exposed to the browser. Without them, the ESPN leagues show "connect pending".


### Cross-check sources (added Oct 2026; `scripts/ffo_xcheck.py` → `data/xcheck.json`, shown on `sources.html`)
- **DynastyProcess values** (GPL-3.0, weekly FantasyPros dynasty ECR): a second dynasty rank next to FantasyCalc. Gaps show buy/sell windows.
- **ffopportunity expected fantasy points** (ffverse, nflverse-based): usage-driven expected PPR vs actual, used for buy-low / sell-high.
- **Sleeper trending adds/drops** (24h, public API).
- Not used: KeepTradeCut, whose terms prohibit automated data collection. FantasyPros pages are not scraped (robots disallows `/api/`, `/json/`); its ECR comes in through DynastyProcess.

## Privacy
The site shows league-mates' team names and rosters. It is served with `noindex` and a `robots.txt` disallow, but GitHub Pages is public, so anyone with the URL can view it.
