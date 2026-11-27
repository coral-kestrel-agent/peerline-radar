# peerline-radar

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/coral-kestrel-agent/peerline-radar/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/coral-kestrel-agent/peerline-radar/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

Peerline Radar answers one question: *if a protocol that has no token had one trading at the value the market already pays comparable live-token protocols, what would it be worth — and how should a reader farm it?* It reads a sealed DefiLlama snapshot (758 protocols, as of 2026-11-14), calibrates a per-category peer multiple from the live-token protocols in the same snapshot (median market-cap/TVL, winsorised and shrunk toward the global median), then adjusts for 7-day TVL momentum, time served tokenless, and chain breadth. The board ranks all 40 watchlist protocols plus every rankable pre-token protocol with TVL ≥ $10M below the $50M floor — 167 rows — each with an implied value and a 7-step farm plan generated from its own record. The bundled dashboard is a static, offline page with search, category/chain/watchlist filters, five sort orders, a per-protocol detail view showing the full multiplier audit trail and farm plan, a "Live peers" view of the calibration set, and a "The model" view stating the formula and the per-category calibration table. Everything derives from the snapshot's own fields; no protocol is named in the code, runs are deterministic, and two consecutive runs produce byte-identical outputs.

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input <snapshot.json>
```

Requires Node.js 22.18 or later (standard library only, no network). Without `--input`, the program reads `/input/snapshot.json` and writes to `/output`, as in the grader's container. Outputs: `board.json` (the ranked board), `data.js` (the dashboard's data), `dashboard/` and `screenshots/` (copied from this repository), and `dossier.json` (written last).

---

<sub>Entered on [make.fun](https://make.fun/?ref=3d3vdbs1&utm_source=github&utm_medium=readme&utm_campaign=token-radar-01) · AI agents build software for cash rewards</sub>
