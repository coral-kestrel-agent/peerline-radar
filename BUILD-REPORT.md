# BUILD REPORT — token-radar-01 entry "Peerline Radar"

Built locally in this repository. **Not submitted, not pushed anywhere.** Kit used under the
user's explicit approval of 2026-11-27 ("Boleh, jalanin build-nya pakai konten kit").
No conflict with `requirements.json` was found; where the brief and the kit differed in
emphasis, the kit's `RULES.txt` gate text was followed.

## Layout (as the grader's harness expects)

- `main.ts` — entry program (Node ≥22.18 stdlib only, runs as-is under Node v24.22.1 here).
  Reads `/input/snapshot.json` (or `--input`), writes `/output/board.json`, `/output/data.js`,
  copies `dashboard/` + `screenshots/` to `/output`, writes `/output/dossier.json` last via
  `buildDossier` from `vendor/makefun-board.ts`. `MAKEFUN_OUTPUT_DIR` stands in for `/output`
  outside the container. Pass 2 added a post-write self-check: the written `board.json` is
  re-read and refused unless ranks are 1..N and values descend; dossier size is cap-checked.
- `lib/model.ts` — the model (original code, this session's authorship; see revision rule below).
- `vendor/makefun-board.ts` — kit library, byte-for-byte, SHA-256
  `9ca51b6e5cd84fe46cb0efa61e2ea99365a1fb0e21f2b75e6007f977f0dc326e` = `kit.json` manifest.
- `dashboard/` — `index.html` (966 B), `app.css` (4,897 B), `app.js` (~14.5 KB). Own design:
  dark radar theme; board with search/category/chain/watchlist filters and 5 sort orders;
  per-protocol detail view with the full multiplier audit trail and farm plan; a "Live peers"
  view showing the calibration set; a "The model" view stating the formula and the full
  per-category calibration table. Hash-routed (`#/`, `#/live`, `#/model`, `#/p/<slug>`,
  `#/?cat=…&watch=1`) so every view is directly linkable/screenshotable. No fetch, no network,
  no `http(s)` string anywhere in the dashboard source.
- `screenshots/` — 3 PNGs of this dashboard, taken with the Playwright-cache
  `chrome-headless-shell` (Chrome for Testing 143) at 1440×1000 against the program's own
  `/output` copy: `1-board.png` (board), `2-detail.png` (Steakhouse Financial detail),
  `3-filtered.png` (Risk Curators + watchlist-only filter). Note: `/opt/meta-chromium/chrome`
  refuses headless CLI startup in this VM ("Hatch WebGL domain policy is required"), so the
  headless shell from `~/.cache/ms-playwright` was used instead.
- `LICENSE` — MIT, from the kit starter.

## The model (peerline-2) — design and rationale

Question answered: *if a protocol that records no token had one trading at the value the
market already pays comparable live-token protocols, what would it be worth, and how should a
reader farm it?* Everything derives from the snapshot's ten fields; no protocol is named in
the code, so the calibration re-derives itself on any snapshot.

```
implied = round( TVL × peer_multiple(category) × momentum × seasoning × breadth )
peer_multiple(c) = clamp( (n·median_c + 4·G) / (n+4), 0.02, 3 )
  G = median mcap/TVL over all live peers (ratios winsorised at 5)
momentum  = 1 + 0.4 × clamp(change_7d, −50, 100)/100        (one week is weather, damped)
seasoning = 0.85 + 0.30 × min(age_days, 1460)/1460          (time served tokenless, ≤ +15%)
breadth   = 1 + 0.03 × min(chains − 1, 6)                    (distribution, ≤ +18%)
unknown listed_at → median age of the dated pre-token protocols, computed per run
```

- **Peer multiple, not a constant** (the house starter uses a flat 0.25 × TVL): categories
  trade at different shares of the value they custody. On this snapshot the live median is
  0.1689 overall, but Lending calibrates to ≈0.13, Dexs ≈0.30, Risk Curators ≈0.73 — a flat
  multiple misprices all three. Shrinkage (k=4) keeps small categories honest.
- **Pass-2 guards, added after a real failure:** pass 1 priced Predict Fun at a multiple of
  80.176 ($925.8M implied on $10.6M TVL) because the prediction-market peer set is thin and
  rich. Winsorising each peer ratio at 5 before medians + the published 0.02–3 band fix it:
  Predict Fun now scores multiple 1.1351, implied $13,107,738, rank 55; the largest multiple
  anywhere on the final board is 1.1351.
- **Board composition:** all 40 watchlist slugs + every rankable pre-token protocol below the
  $50M floor with TVL ≥ $10M (127 early rows) = **167 rows**. Live-token protocols are never
  ranked; the top 24 are shown separately as the calibration set.
- **Farm plans:** 7 steps per row, generated from the row's own record — category-specific
  core action (lend/DEX/perps/bridge/staking/vault/stable/RWA/prediction/insurance/privacy
  variants), capital tiered by TVL ($50–$300), hold window by age (30–75 days), and a shorter
  leash (biweekly re-check, no adding) when the protocol's TVL fell ≥10% on the week. Plans
  never invent a points programme: they tell the reader where to look and to trust only the
  protocol's own page.

## Gate checklist — measured on the final run

| Gate (RULES.txt) | Requirement | Measured |
| --- | --- | --- |
| board_file | 100–4,000 rows, ≤8 MiB | **167 rows**, 305,733 bytes |
| coverage | every watchlist slug present | **40 / 40** |
| sorted_by_value | ranks exactly 1..N, implied non-increasing | verified by `boardIssue` in-program + post-write re-read self-check |
| farm steps | 3–12 strings, each 20–600 chars trimmed | **7 per row**, lengths **137–275** chars |
| implied values | positive integers ≤ 1e14, not all equal | $704,506 … $2,261,420,771 |
| dashboard_files | index.html + ≥1 css + ≥1 js, ≤400 files, ≤4 MiB, no http(s) in attributes/CSS/JS | **3 files, 20,354 bytes total** (source 20.4 KB < 64 KB guidance), zero http(s) strings |
| screenshots | 3–4 images, each ≤512 KiB, long side ≤1440, short side ≥800 | **3 PNGs, 1440×1000**, 193,708 / 239,328 / 233,120 bytes |
| dossier_matches | byte-identical to `buildDossier(output, {text_max_bytes: 65536})`, ≤1.5 MiB | **909,901 bytes**; independently rebuilt from the output dir with the vendored library and compared — **byte-equal** |
| run_completes | finishes in sandbox limits | ~0.4 s wall locally, stdlib only, no network |
| run_deterministic | two runs, identical outputs | **yes — see hashes below** |

Screenshot sizes (194–239 KB) sit under the kit's 300–350 KB per-image guidance; that guidance
exists to keep the dossier under its cap, and the final dossier is 910 KB of the 1.5 MiB cap.

## Determinism — sha256 of every output file, two consecutive runs

Both runs produced identical hashes for all 9 files (`diff` clean). Run B hashes:

```
ac6156342359ca5a2a247ca408319175d393b99b442f46ff2b3caf1cb13964b8  board.json
dc60571c3e49b90c3c756171ed67ce9c7c89957feb30f935dca617e4d22b0df0  dashboard/app.css
e1543fcf0eb18d50db174461adbe10685da51a3e2d0200dd7d0b507450085ba5  dashboard/app.js
0b66956b5519ab895b8eca3a5439426ee8ebc1eac1b57a2764938553874103fb  dashboard/index.html
16e92e7b3344756e8a1376571ad3811012c43f43ee51edd67603c0233f68c258  data.js
3d578a55b203475d10cf9537d641f7bea3d36064edc92302918cbd3b684707a5  dossier.json
e57be42e45898cd4b1d6c10358ad87222a6fdd1c20c96726bdbc8a35bed79d33  screenshots/1-board.png
c99f069400a9ae68ce0ecf312cc1f4365552cfd40d5bc592272e351e3d4d278b  screenshots/2-detail.png
86dbb06605e00c42f4fa07de1775c25ac7e4c299fff930fb44888d3a023e1bfa  screenshots/3-filtered.png
```

No `Date.now`, no `Math.random`, no locale-dependent formatting anywhere in the program;
all sorts carry slug tie-breaks and all medians are taken over sorted copies.

## Authorship / revision rule

The kit's `thinking_revised` check requires a counted file (`main.ts` or code it runs) to
reach its final content through ≥2 assistant messages that write or edit it. Satisfied by
construction: pass 1 wrote `main.ts` and `lib/model.ts` in full; pass 2 edited both again
(model: winsorise + band + fallback clamp + version bump; main.ts: dossier cap check +
post-write self-check), plus two `dashboard/app.js` edits. The dashboard files were written
by the agent, not copied from the starter; only `vendor/makefun-board.ts` and `LICENSE`
come from the kit, as the rules require/instruct.

## Git log

```
f2bb7a9 pass 2: winsorised calibration, multiple band, output self-check
18065ee pass 1: peerline radar — peer-calibrated model, dashboard, screenshots
(+ this report's commit)
```

## Remaining before any submission (not done here, per brief)

Push to a public GitHub repo created after the competition opened (2026-11-14T10:00:00Z),
link a Solana wallet to the account, bundle the recorded sessions with the kit CLI
(`node cli/makefun.mjs bundle …`, with the run-record flags and `--muse-usage`), run
`check`, then `submit` before **2026-12-14T10:00:00Z**.
