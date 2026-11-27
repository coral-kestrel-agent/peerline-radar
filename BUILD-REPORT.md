# Improvement passes 3–4 (2026-11-27, after the first accepted submission)

The first submission of this entry (submission `01a21c64-5372-729a-be8e-99642dd85696`,
commit `63a8920`) passed every validity check. These passes exist to win more of the
pairwise games that decide the places; a re-submission before the deadline supersedes it.

## What the judge actually sees, and its criteria (RULES.txt, "The judge", verbatim)

The judge (an AI model, reasoning effort high) reads **only the dossier**: the three
screenshots (board, a protocol's detail view, a filtered view) and the dashboard's source
text (≤65,536 bytes, files in path order, whole while they fit). It never sees board.json
or lib/model.ts directly — the model reaches it through the dashboard's model view, the
detail view's audit trail, and the numbers visible in the screenshots. Its criteria,
most important first, decided at the first criterion where two entries differ:

1. A working radar: full watchlist coverage, pre-token protocols ranked by a stated
   implied value, screenshots and code in agreement.
2. The value model: implied value follows from the snapshot's own figures — TVL,
   seven-day growth, time run with no token — not a hardcoded list of names; live-token
   protocols separated from pre-token ones.
3. Farm plans: concrete steps with what they cost and how long they take, not slogans.
4. The dashboard as a page: sortable and filterable, readable at a glance, a detail
   view for each protocol.
5. It looks made: chosen palette, consistent spacing, type that reads.

## Weaknesses found in the peerline-2 entry, ranked by expected impact

1. **Thin peer sets priced the top of the board (criteria 2 and 1).** Eight categories
   calibrate off ≤2 live peers. Risk Curators has exactly **one** live peer — Api3 at a
   winsorised 2.97x — and the flat prior of 4 pseudo-peers still let it set a 0.730
   multiple: Steakhouse Financial was priced at $2.26B and Gauntlet at $1.34B, the top
   of the board was seven Risk Curators in the top ten, and the detail screenshot itself
   read "Median mcap/TVL of 1 live Risk Curators peer". Chain (1 peer) priced at 0.740
   and Collateral Management / Prediction Market (1 peer each, at the winsorise cap)
   at 1.135 — the board's maximum multiple. A judge weighing criterion 2 sees a model
   whose loudest prices rest on single anecdotes.
2. **Farm plans were near-identical across rows (criterion 3).** Steps 1, 5, 6 and 7
   differed only in the protocol's name and figures; the second action fell back to a
   generic "use one more feature" line for curators, allocators, RWA, stables and
   chains; and gas was priced off the capital tier, not the chain — the plan quoted
   "about $10 of gas on Base", where a transaction costs cents, and would have quoted
   the same on Ethereum, where it costs more.
3. **The filtered screenshot spent its slot on the weakest view (criteria 1 and 4).**
   It showed the Risk Curators + watchlist filter — the same one-category story as the
   board — instead of demonstrating the filter across the board's breadth.
4. **The detail view showed multipliers but no thesis (criteria 1 and 2 at a glance).**
   Nothing on the page said where the protocol stands among its own category, or how
   its week compares with the board's, in the snapshot's own figures.

## Pass 3 — the model (`lib/model.ts`, `main.ts`; model version peerline-3)

- **Count-aware prior.** `prior(c) = shrink_peers + thin_prior / n(c)` pseudo-peers at
  the market median (4 + 12/n), replacing the flat 4. Thick categories barely move
  (Lending n=15: 0.1401 → 0.1412; Dexs n=11: 0.2962 → 0.2875); thin ones are held to
  the market: Risk Curators 0.730 → **0.334**, Chain 0.740 → 0.337, the board's maximum
  multiple falls **1.1351 → 0.5111**. Steakhouse's implied value falls $2.26B → $1.03B
  (still rank 1 — its TVL is 1.7x the next protocol's, which the detail view now
  states), Gauntlet $1.34B → $611M, and the top 15 spans six categories instead of
  three. This is the root fix for the failure mode pass 2 patched case-by-case
  (Predict Fun): no category can be priced off an anecdote again, on any snapshot.
- **Farm plans differentiated by the protocol's own record.** Gas is priced by chain
  class (`gasFor`: Ethereum $12, Tron $3, Bitcoin $4, the cheap chains $2, unlisted $5)
  and every step's cost line follows it. Second actions now exist for curators and
  allocators (a second vault, a different risk profile), RWA (hold through a monthly
  attestation), stables (mint *and* provide liquidity), chains (be a chain user, not
  only a bridge in), payments (route real payments) and staking (claim and restake).
  The cadence step gains a third variant for surging protocols (+10% or more on the
  week: add in stages, stop the first week TVL falls), and the monthly watch step
  checks each deployment separately for protocols on four or more chains. Still seven
  steps per row, now 137–305 characters each.
- `main.ts`'s run summary now reports how many thin categories were held toward the
  prior (21 on this snapshot), so the run's own log states the guard fired.

## Pass 4 — the dashboard (`dashboard/app.js`, `dashboard/app.css`, screenshots)

- **Detail view gains a thesis strip** ("Why it ranks here"), computed in the page from
  the same rows the board shows: the protocol's TVL rank within its category and its
  multiple over the next one down, its seven-day change against the board median, and
  — for thin categories — a plain statement that the strengthened prior holds its
  multiple near the market median instead of letting thin evidence set the price.
  The peer-multiple card's note now names the count-aware prior too.
- **The model view states the new prior** in its formula line and prose, with the
  count of thin categories on this snapshot computed from the calibration table it
  prints below — the judge can check the claim against the table on the same page.
- **Screenshots retaken** from the new output at 1440x1000: the board (top implied
  $1.03B, peer multiples now visibly varying down the page), Steakhouse Financial's
  detail (thesis strip, curator-specific farm plan, $2 Base gas), and the filtered
  view switched to the **Ethereum chain filter — 85 rows across every category**,
  ranks preserved, replacing the one-category Risk Curators filter.

## Gate checklist — re-measured after pass 4

| Gate (RULES.txt) | Requirement | Measured |
| --- | --- | --- |
| board_file | 100–4,000 rows, ≤8 MiB | **167 rows**, 309,794 bytes |
| coverage | every watchlist slug present | **40 / 40** |
| sorted_by_value | ranks exactly 1..N, implied non-increasing | verified by `boardIssue` + post-write self-check |
| farm steps | 3–12 strings, each 20–600 chars trimmed | **7 per row**, lengths **137–305** chars |
| implied values | positive integers ≤ 1e14, not all equal | $771,746 … $1,034,225,990 |
| dashboard_files | index.html + ≥1 css + ≥1 js, ≤400 files, ≤4 MiB, no http(s) in attributes/CSS/JS | **3 files, 23,166 bytes total** (< 64 KB guidance, so the judge reads every source file whole), zero http(s) strings |
| screenshots | 3–4 images, each ≤512 KiB, long side ≤1440, short side ≥800 | **3 PNGs, 1440x1000**, 194,641 / 224,261 / 196,066 bytes |
| dossier_matches | byte-identical to `buildDossier(output, {text_max_bytes: 65536})`, ≤1.5 MiB | **844,506 bytes**; independently rebuilt from the output dir with the vendored library — **byte-equal** (also smaller than peerline-2's 909,901, which is the side of the size tie-break to be on) |
| vendor file | `vendor/makefun-board.ts` byte-for-byte | SHA-256 `9ca51b6e5cd84fe46cb0efa61e2ea99365a1fb0e21f2b75e6007f977f0dc326e` — unchanged |
| run_deterministic | two runs, identical outputs | **yes — hashes below** |

## Determinism — sha256 of every output file, two consecutive runs (identical)

```
da24190522e83a89fc58c8ed47996519434d055406db0c6454a2d18ebd4df24c  board.json
9d457aafb4838afed87e7981faafcc4e44dfe5155ab29f1dfc1340c5e157be9c  data.js
f531bacae011b6e1176d074279f83ec3b005a77af6dd3b4b4825394348aea795  dossier.json
0e99446da7b36432caa1e1d89ee2895592f73f8db55661b6793ed87a573a827e  dashboard/app.css
a3bfc530308b834661103d66474683f547ef813919f76d15c2270f551254baad  dashboard/app.js
0b66956b5519ab895b8eca3a5439426ee8ebc1eac1b57a2764938553874103fb  dashboard/index.html
fbb45491fe22062ce04a112cd5c04f197f4bd61e068d0d6af156b5394e4b3380  screenshots/1-board.png
e8cc6c5f12e0ad6e8f4c8d4829cb235e68816be4b5cf54dbca8cb5980f7a00dd  screenshots/2-detail.png
93b234f3b656b579687359d1c18643bf3f575492b9411b10262a59675504c3bd  screenshots/3-filtered.png
```

## Git log (improvement passes)

```
pass 4: detail thesis strip, model view states the count-aware prior, Ethereum-filter screenshot
pass 3: count-aware prior for thin categories, chain-priced gas, differentiated farm plans
```

---
# BUILD REPORT — token-radar-01 entry "Peerline Radar"

Built locally in this repository; the peerline-2 state of this report was submitted and
accepted on 2026-11-27 (submission `01a21c64-5372-729a-be8e-99642dd85696` at commit
`63a8920`), and passes 3–4 above improve on it. Kit used under the
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

## The model (peerline-2, superseded by peerline-3 in pass 3 above) — design and rationale

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

## Remaining before any re-submission (not done here, per brief)

Bundle the recorded sessions with the kit CLI (`node cli/makefun.mjs bundle …`, with the
run-record flags and `--muse-usage`), run `check`, then `submit` the new HEAD before
**2026-12-14T10:00:00Z**; the last submission before the deadline is the final entry.
