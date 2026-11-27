// Peerline: a token-launch radar fitted, odds-priced and validated by the snapshot itself.
//
// The board answers two questions about a protocol that records no token today: what would its
// token be worth if it launched (the conditional value), and how likely is a launch at all (the
// launch odds)? The board ranks by their product, the expected value of the launch, because a
// radar that ranks a near-certain small launch below a huge one that will never come is pointing
// at the wrong sky. Every figure is computed from the snapshot's ten fields; no protocol is ever
// named in the code.
//
// THE VALUE MODEL. Passes 1-4 priced a launch at TVL x a peer multiple, calibrated per category.
// Pass 5 tested that method the way it should have been tested from the start — leave-one-out
// over the snapshot's own price peers — and the category multiples LOST to a flat global
// multiple, which itself lost heavily to a power law. So the model is now the power law:
//
//   peers       = live-token protocols with a recorded market cap above zero (a cap of zero, or
//                 the -1 sentinel one protocol carries, is a missing price, not a price): 128
//   fit         = least squares on (log10 TVL, log10 mcap) over the peers:
//                 log10 value = a + b x log10 TVL, with b near 0.52 on this snapshot
//   conditional = 10^(a + b x log10 TVL) x momentum
//   momentum    = 1 + 0.4 x clamp(change_7d, -50, 100) / 100
//
// Value scales with the square root of custody, roughly: the largest custodian in the peer set
// custodies 26 billion and trades at 2 billion, and a flat multiple prices it at 5.6 billion.
// The leave-one-out run below is the evidence, printed in the dashboard's validation view: the
// power law's median error against the flat baseline's, fold by fold, on the snapshot's own
// peers. Category multiples and a breadth premium were carried into that run as variants and
// dropped because they made the error worse, not better; the model view's audit table shows
// each category's residual under the fitted line, so a reader can see the line is not hiding a
// category effect the pricing ignores. Momentum stays because the brief for a radar names
// seven-day growth as a value input and the validation shows it costs nothing (its error is
// level with the plain line's, its within-x2 share a point higher); it is damped because one
// week is weather, not climate.
//
// THE ODDS. Age is not a value input: passes 1-4 paid a seasoning premium for time served
// tokenless, and the snapshot's cohort record says that is backwards. What the record supports
// is an odds statement, so age prices the odds:
//
//   bands       = tokenless age under 1y, 1-2y, 2-4y, 4y and over (plus age unknown)
//   F_b         = the share of ALL protocols in band b that already have a token
//   F(c,b)      = the category's band share, shrunk (6 pseudo-protocols) toward a prior mean
//                 that anchors the category's own overall launch share to the global age
//                 profile — a category that has almost never tokenised is not credited with
//                 other categories' launches
//   S(c,b)      = 1 - F(c,b), the still-tokenless share; the tail S_inf(c) extends the last
//                 observed survival ratio one step, S(c,3) x clamp(S(c,3)/S(c,2), 0.3, 0.95)
//   odds(c,b)   = clamp(1 - S_inf(c) / S(c,b), 0.03, 0.95)
//
// Read it as survival: of the protocols still tokenless at a given age, the share that ever
// launch falls as the age rises, because the ones that were going to launch mostly already
// have. The raw band shares rise with age (older cohorts have had more time); the conditional
// odds fall. Both are printed in the model view, so the direction is checkable, not asserted.
//
// THE RANGES. Every row carries a p10-p90 range from 256 seeded bootstrap refits of the peer
// set (the power law refitted on each resample), and a rank range under the same refits. The
// seed is a constant of the model: the same snapshot refits identically on every run, which
// the gate's determinism check requires. The odds are held at their fitted values in the
// refits: the range prices the peer set's noise, which the validation shows is the large part.
//
// THE FARMS. Each plan is netted against the conservative (p10) value. The stated assumption:
// a launch that allocates A% of its supply to users pays it pro-rata across the farming
// capital, taken as 2% of TVL (most custodied value is passive and never farms). A position of
// $capital therefore expects A% x odds x p10 x capital / (0.02 x TVL). The break-even
// allocation turns that around — the share of supply users must receive for the plan's cash
// cost to come back — and the verdict prices the farmer's hour at a 5% reference allocation:
// farm at $5 an hour or better, thin when the expected value still covers the cash, skip when
// it does not. The constants are printed in the model view with the formulas.

import { createHash } from 'node:crypto';

/** The snapshot's protocol entry: exactly the ten fields the sealed input carries. */
export interface SnapshotProtocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

/** The whole snapshot document. */
export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

/** The model's fixed weights. The fit and the odds are NOT here: they are fitted per run. */
export interface ModelConstants {
  momentum_weight: number;
  momentum_floor_pct: number;
  momentum_cap_pct: number;
  odds_prior: number;
  odds_level_prior: number;
  odds_floor: number;
  odds_cap: number;
  tail_ratio_floor: number;
  tail_ratio_cap: number;
  bootstrap_runs: number;
  bootstrap_seed: number;
  ref_allocation: number;
  farmer_capital_share: number;
  farm_ev_hour_floor: number;
}

export const MODEL: ModelConstants = {
  momentum_weight: 0.4,
  momentum_floor_pct: -50,
  momentum_cap_pct: 100,
  odds_prior: 6,
  odds_level_prior: 4,
  odds_floor: 0.03,
  odds_cap: 0.95,
  tail_ratio_floor: 0.3,
  tail_ratio_cap: 0.95,
  bootstrap_runs: 256,
  bootstrap_seed: 20261114,
  ref_allocation: 0.05,
  farmer_capital_share: 0.02,
  farm_ev_hour_floor: 5,
};

/** The model's version label: the dashboard names it and the dossier quotes it. */
export const MODEL_VERSION = 'peerline-4';

/** How many live-token protocols the dashboard's Live view carries, by market cap. */
export const LIVE_ROWS = 24;

/** The fitted power law and the flat baseline it is validated against. */
export interface ValueFit {
  intercept: number;
  slope: number;
  peers: number;
  baseline_median_ratio: number;
  category_residuals: { category: string; peers: number; median_log10_residual: number }[];
}

/** One age band of the launch record: how many protocols sit in it, how many already launched. */
export interface OddsBand {
  band: string;
  protocols: number;
  launched: number;
  launched_share: number;
  odds: number;
}

/** The launch-odds fit: the global band table the dashboard prints. */
export interface OddsModel {
  bands: OddsBand[];
  unknown_age_odds: number;
  global_launched_share: number;
}

/** The leave-one-out validation of the shipped method against the flat-multiple baseline. */
export interface Validation {
  peers: number;
  method_median_abs_log10: number;
  method_within_2x_pct: number;
  method_median_log10: number;
  baseline_median_abs_log10: number;
  baseline_within_2x_pct: number;
  baseline_median_log10: number;
  by_category: { category: string; peers: number; median_abs_log10: number; within_2x_pct: number }[];
}

/** The per-row audit trail: every input that produced the row's stated value. */
export interface RowModel {
  implied_multiple: number;
  momentum_pct: number;
  momentum_multiplier: number;
  age_days: number | null;
  age_band: string;
  cohort_protocols: number;
  cohort_launched_share: number;
  launch_odds: number;
}

/** The farm plan's economics: what the plan costs, and what a launch would have to pay it. */
export interface FarmEconomics {
  capital_usd: number;
  cost_usd: number;
  hours: number;
  conservative_value_usd: number;
  breakeven_allocation_pct: number | null;
  expected_value_usd: number;
  ev_per_hour_usd: number;
  verdict: 'farm' | 'thin' | 'skip';
}

/** One row of board.json. implied_value_usd is the expected value: conditional x odds. */
export interface BoardRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
  token_status: 'pre-token';
  watchlist: boolean;
  age_days: number | null;
  conditional_value_usd: number;
  launch_odds: number;
  implied_value_usd: number;
  value_p10_usd: number;
  value_p90_usd: number;
  rank_p10: number;
  rank_p90: number;
  model: RowModel;
  farm: FarmEconomics;
  farm_steps: string[];
}

/** A live-token protocol: it already trades, so the board shows the market's own value. */
export interface LiveRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number | null;
  ratio: number | null;
  change_7d: number | null;
}

/** The 758-protocol accounting the dashboard's integrity strip states. */
export interface Ledger {
  total: number;
  ranked: number;
  ranked_watchlist: number;
  ranked_below_floor: number;
  launched_priced: number;
  launched_unpriced_cap: number;
  token_recorded_no_cap: number;
  pre_token_excluded: number;
  excluded_reasons: { reason: string; count: number }[];
}

/** Everything the dashboard renders. */
export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model: ModelConstants;
  model_version: string;
  fit: ValueFit;
  odds: OddsModel;
  validation: Validation;
  ledger: Ledger;
  board_checksum: string;
  watchlist_size: number;
  board_size: number;
  live_size: number;
  total_expected_value_usd: number;
  rows: BoardRow[];
  live: LiveRow[];
}

/** Why the snapshot is not one this model can score. */
export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

const DAY_MS = 86_400_000;
const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;
const round2 = (n: number): number => Math.round(n * 100) / 100;
const bySlugOrder = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);
const clamp = (n: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, n));

/** A whole day count from `listedAt` to `asOf`, clamped at zero; null when either date is bad. */
export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

/** The median of a non-empty list, computed on a sorted copy so the input order never matters. */
function median(values: number[]): number {
  const sorted = [...values].sort((x, y) => x - y);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

/** A percentile of a list by nearest-rank on a sorted copy; the bootstrap's only read. */
function percentile(values: number[], q: number): number {
  const sorted = [...values].sort((x, y) => x - y);
  return sorted[Math.floor(q * (sorted.length - 1))]!;
}

/** Whether a protocol records no token at all. */
export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

/** Whether a protocol carries a price the model may learn from: a recorded cap above zero. */
export function isPricePeer(p: SnapshotProtocol): boolean {
  return p.mcap_usd !== null && p.mcap_usd > 0 && p.tvl_usd > 0;
}

const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;

/** Why a pre-token protocol is off the board, or null when it is rankable. */
export function exclusionReason(p: SnapshotProtocol): string | null {
  if (!isPreToken(p)) return 'already has a token';
  if (p.category === 'CEX') return 'a centralised exchange, not a launch candidate';
  if (VERSIONED.test(p.name)) return 'a versioned pool of another protocol';
  return null;
}

/** Whether the board may rank a protocol: pre-token, not an exchange, not a versioned pool. */
export function isRankable(p: SnapshotProtocol): boolean {
  return exclusionReason(p) === null;
}

/** The age band a day count falls in; the odds table's rows, in order. */
export const AGE_BANDS = ['under 1y', '1-2y', '2-4y', '4y and over'] as const;

export function ageBand(age: number | null): string {
  if (age === null) return 'age unknown';
  if (age < 365) return AGE_BANDS[0];
  if (age < 730) return AGE_BANDS[1];
  if (age < 1460) return AGE_BANDS[2];
  return AGE_BANDS[3];
}

/** Least squares on (log10 TVL, log10 mcap): the value fit, on any peer set. */
export function fitLine(peers: SnapshotProtocol[]): { intercept: number; slope: number } {
  const xs = peers.map((p) => Math.log10(p.tvl_usd));
  const ys = peers.map((p) => Math.log10(p.mcap_usd!));
  const mx = xs.reduce((a, b) => a + b, 0) / xs.length;
  const my = ys.reduce((a, b) => a + b, 0) / ys.length;
  let num = 0;
  let den = 0;
  for (let i = 0; i < xs.length; i++) {
    num += (xs[i]! - mx) * (ys[i]! - my);
    den += (xs[i]! - mx) ** 2;
  }
  const slope = den > 0 ? num / den : 0;
  return { intercept: my - slope * mx, slope };
}

/** The run's value fit, the flat baseline's median, and each category's residual under the line. */
export function fitValue(snapshot: Snapshot): ValueFit {
  const peers = snapshot.protocols.filter(isPricePeer);
  const { intercept, slope } = fitLine(peers);
  const ratios = peers.map((p) => Math.min(p.mcap_usd! / p.tvl_usd, 5));
  const perCat = new Map<string, number[]>();
  for (const p of peers) {
    const resid = Math.log10(p.mcap_usd!) - (intercept + slope * Math.log10(p.tvl_usd));
    const key = p.category ?? 'Uncategorized';
    const list = perCat.get(key);
    if (list === undefined) perCat.set(key, [resid]);
    else list.push(resid);
  }
  return {
    intercept: round4(intercept),
    slope: round4(slope),
    peers: peers.length,
    baseline_median_ratio: round4(ratios.length > 0 ? median(ratios) : 0),
    category_residuals: [...perCat.entries()]
      .filter(([, rs]) => rs.length >= 3)
      .map(([category, rs]) => ({ category, peers: rs.length, median_log10_residual: round4(median(rs)) }))
      .sort((a, b) => b.peers - a.peers || bySlugOrder(a.category, b.category)),
  };
}

/** A protocol's momentum multiplier: the part of value that is its own week's record. */
function momentumOf(p: SnapshotProtocol, model: ModelConstants): { pct: number; mult: number } {
  const rawGrowth = typeof p.change_7d === 'number' && Number.isFinite(p.change_7d) ? p.change_7d : 0;
  const pct = clamp(rawGrowth, model.momentum_floor_pct, model.momentum_cap_pct);
  return { pct, mult: 1 + (pct / 100) * model.momentum_weight };
}

/** The conditional value of one protocol under one fit: its price IF it launches. */
function conditionalValue(p: SnapshotProtocol, fit: { intercept: number; slope: number }, model: ModelConstants): number {
  return Math.pow(10, fit.intercept + fit.slope * Math.log10(Math.max(p.tvl_usd, 1))) * momentumOf(p, model).mult;
}

/**
 * Fit the launch odds on the snapshot's whole launch record. Cohorts are category x age band;
 * a category's band share is shrunk toward a prior mean built from the category's own overall
 * launch share laid over the global age profile, and the survival tail extends the last
 * observed still-tokenless ratio one step, so no band's odds read 0 or 1 off a handful of rows.
 */
export function fitOdds(snapshot: Snapshot, model: ModelConstants = MODEL): { odds: OddsModel; oddsFor: (p: SnapshotProtocol) => { odds: number; band: string; cohort: number; share: number } } {
  const bandOf = (p: SnapshotProtocol): number => {
    const a = ageDays(snapshot.as_of, p.listed_at);
    if (a === null) return -1;
    if (a < 365) return 0;
    if (a < 730) return 1;
    if (a < 1460) return 2;
    return 3;
  };
  const launched = (p: SnapshotProtocol): boolean => !isPreToken(p);
  const globalCounts = AGE_BANDS.map(() => ({ n: 0, l: 0 }));
  const catCounts = new Map<string, { n: number; l: number }[]>();
  const catTotals = new Map<string, { n: number; l: number }>();
  let allN = 0;
  let allL = 0;
  for (const p of snapshot.protocols) {
    const key = p.category ?? 'Uncategorized';
    allN += 1;
    if (launched(p)) allL += 1;
    const tot = catTotals.get(key) ?? { n: 0, l: 0 };
    tot.n += 1;
    if (launched(p)) tot.l += 1;
    catTotals.set(key, tot);
    const b = bandOf(p);
    if (b < 0) continue;
    globalCounts[b]!.n += 1;
    if (launched(p)) globalCounts[b]!.l += 1;
    let arr = catCounts.get(key);
    if (arr === undefined) {
      arr = AGE_BANDS.map(() => ({ n: 0, l: 0 }));
      catCounts.set(key, arr);
    }
    arr[b]!.n += 1;
    if (launched(p)) arr[b]!.l += 1;
  }
  const globalShareAll = allN > 0 ? allL / allN : 0;
  const globalShare = globalCounts.map((c) => (c.n > 0 ? c.l / c.n : globalShareAll));
  /** A category's own overall launch share, lightly shrunk toward the global share. */
  const levelFor = (category: string | null): number => {
    const tot = catTotals.get(category ?? 'Uncategorized') ?? { n: 0, l: 0 };
    return (tot.l + model.odds_level_prior * globalShareAll) / (tot.n + model.odds_level_prior);
  };
  /** A category's shrunk launched share in one band; the global read when category is null. */
  const shareFor = (category: string | null, b: number): number => {
    if (category === null) return globalShare[b]!;
    const arr = catCounts.get(category ?? 'Uncategorized');
    const c = arr === undefined ? { n: 0, l: 0 } : arr[b]!;
    const profile = globalShareAll > 0 ? globalShare[b]! / globalShareAll : 1;
    const priorMean = clamp(levelFor(category) * profile, 0.01, 0.97);
    return (c.l + model.odds_prior * priorMean) / (c.n + model.odds_prior);
  };
  /** A category's survival tail: the still-tokenless share once launches stop accumulating. */
  const tailFor = (category: string | null): number => {
    const s2 = 1 - shareFor(category, 2);
    const s3 = 1 - shareFor(category, 3);
    const ratio = s2 > 0.001 ? clamp(s3 / s2, model.tail_ratio_floor, model.tail_ratio_cap) : model.tail_ratio_cap;
    return s3 * ratio;
  };
  const oddsFromShare = (category: string | null, share: number): number =>
    clamp(1 - tailFor(category) / Math.max(1 - share, 0.001), model.odds_floor, model.odds_cap);
  const bands: OddsBand[] = AGE_BANDS.map((band, b) => ({
    band,
    protocols: globalCounts[b]!.n,
    launched: globalCounts[b]!.l,
    launched_share: round4(globalShare[b]!),
    odds: round4(oddsFromShare(null, globalShare[b]!)),
  }));
  return {
    odds: {
      bands,
      unknown_age_odds: round4(oddsFromShare(null, globalShareAll)),
      global_launched_share: round4(globalShareAll),
    },
    oddsFor: (p) => {
      const b = bandOf(p);
      const tot = catTotals.get(p.category ?? 'Uncategorized') ?? { n: 0, l: 0 };
      if (b < 0) {
        return { odds: round4(oddsFromShare(p.category, levelFor(p.category))), band: 'age unknown', cohort: tot.n, share: round4(levelFor(p.category)) };
      }
      const arr = catCounts.get(p.category ?? 'Uncategorized');
      const c = arr === undefined ? { n: 0, l: 0 } : arr[b]!;
      return {
        odds: round4(oddsFromShare(p.category, shareFor(p.category, b))),
        band: AGE_BANDS[b]!,
        cohort: c.n,
        share: round4(shareFor(p.category, b)),
      };
    },
  };
}

/**
 * Leave-one-out validation of the shipped method. Each price peer is predicted from a fit on
 * the other 127; the baseline predicts from the same folds' flat global median multiple alone.
 * Errors are log10: 0.301 is a factor of two, so the within-x2 share reads off the error list.
 */
export function validate(snapshot: Snapshot, model: ModelConstants = MODEL): Validation {
  const peers = snapshot.protocols.filter(isPricePeer);
  const methodErr: number[] = [];
  const baseErr: number[] = [];
  const perCat = new Map<string, number[]>();
  peers.forEach((p, i) => {
    const rest = peers.filter((_, j) => j !== i);
    const fit = fitLine(rest);
    const baseRatio = median(rest.map((q) => Math.min(q.mcap_usd! / q.tvl_usd, 5)));
    const actual = p.mcap_usd!;
    const mErr = Math.log10(conditionalValue(p, fit, model) / actual);
    const bErr = Math.log10((p.tvl_usd * baseRatio) / actual);
    methodErr.push(mErr);
    baseErr.push(bErr);
    const key = p.category ?? 'Uncategorized';
    const list = perCat.get(key);
    if (list === undefined) perCat.set(key, [mErr]);
    else list.push(mErr);
  });
  const within2 = (errs: number[]): number => (errs.length === 0 ? 0 : (100 * errs.filter((e) => Math.abs(e) <= Math.log10(2)).length) / errs.length);
  const medAbs = (errs: number[]): number => (errs.length === 0 ? 0 : median(errs.map((e) => Math.abs(e))));
  return {
    peers: peers.length,
    method_median_abs_log10: round4(medAbs(methodErr)),
    method_within_2x_pct: round2(within2(methodErr)),
    method_median_log10: round4(methodErr.length === 0 ? 0 : median(methodErr)),
    baseline_median_abs_log10: round4(medAbs(baseErr)),
    baseline_within_2x_pct: round2(within2(baseErr)),
    baseline_median_log10: round4(baseErr.length === 0 ? 0 : median(baseErr)),
    by_category: [...perCat.entries()]
      .filter(([, errs]) => errs.length >= 4)
      .map(([category, errs]) => ({ category, peers: errs.length, median_abs_log10: round4(medAbs(errs)), within_2x_pct: round2(within2(errs)) }))
      .sort((a, b) => b.peers - a.peers || bySlugOrder(a.category, b.category)),
  };
}

/** mulberry32: a tiny seeded PRNG. The seed is a model constant, so refits are reproducible. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Bootstrap the peer set: refit the power law on resamples of the price peers and reprice every
 * candidate. Returns each candidate's conditional-value p10/p90 and its rank p10/p90 under the
 * expected-value ranking. The odds are held at their fitted values: the range prices the peer
 * set's noise, which is the part the validation shows is large.
 */
export function bootstrapRanges(
  candidates: SnapshotProtocol[],
  snapshot: Snapshot,
  oddsOf: Map<string, number>,
  model: ModelConstants = MODEL,
): Map<string, { p10: number; p90: number; rankP10: number; rankP90: number }> {
  const peers = snapshot.protocols.filter(isPricePeer);
  const rand = mulberry32(model.bootstrap_seed);
  const condSamples = new Map<string, number[]>(candidates.map((p) => [p.slug, []]));
  const rankSamples = new Map<string, number[]>(candidates.map((p) => [p.slug, []]));
  for (let run = 0; run < model.bootstrap_runs; run++) {
    const sample: SnapshotProtocol[] = [];
    for (let i = 0; i < peers.length; i++) sample.push(peers[Math.floor(rand() * peers.length)]!);
    const fit = fitLine(sample);
    const evs = candidates.map((p) => {
      const cond = conditionalValue(p, fit, model);
      return { slug: p.slug, cond, ev: cond * (oddsOf.get(p.slug) ?? 0) };
    });
    for (const e of evs) condSamples.get(e.slug)!.push(e.cond);
    const ranked = [...evs].sort((a, b) => b.ev - a.ev || bySlugOrder(a.slug, b.slug));
    ranked.forEach((e, i) => rankSamples.get(e.slug)!.push(i + 1));
  }
  const out = new Map<string, { p10: number; p90: number; rankP10: number; rankP90: number }>();
  for (const p of candidates) {
    const conds = condSamples.get(p.slug)!;
    const ranks = rankSamples.get(p.slug)!;
    out.set(p.slug, {
      p10: Math.max(1, Math.round(percentile(conds, 0.1))),
      p90: Math.max(1, Math.round(percentile(conds, 0.9))),
      rankP10: Math.round(percentile(ranks, 0.1)),
      rankP90: Math.round(percentile(ranks, 0.9)),
    });
  }
  return out;
}

/** The first chain a protocol names, or a neutral phrase. */
function chainOf(p: SnapshotProtocol): string {
  return p.chains.length > 0 ? p.chains[0]! : 'its main chain';
}

/** Chains where a transaction costs cents, not dollars: the L2s and the cheap L1s. */
const CHEAP_CHAINS = new Set([
  'Base', 'Arbitrum', 'Optimism', 'Polygon', 'Binance', 'BSC', 'Avalanche', 'Solana', 'Monad',
  'zkSync Era', 'Linea', 'Scroll', 'Mantle', 'Gnosis', 'Fantom', 'Sonic', 'Near', 'Sui', 'Aptos',
  'Unichain', 'Ink', 'Katana', 'Arc', 'Robinhood Chain', 'Pharos', 'Flare', 'Corn', 'BSquared',
]);

/**
 * A realistic gas budget for one transaction on a chain, in dollars. Ethereum mainnet is the
 * expensive case; the cheap chains cost cents, so the plan budgets a dollar or two and says so;
 * anything unlisted gets a middle figure. A plan that quotes $10 of gas on Base, or $2 on
 * Ethereum, is a plan a farmer learns not to trust, so the figure follows the chain.
 */
function gasFor(chain: string): number {
  if (chain === 'Ethereum') return 12;
  if (chain === 'Tron') return 3;
  if (chain === 'Bitcoin') return 4;
  if (CHEAP_CHAINS.has(chain)) return 2;
  return 5;
}

/** Position size for one farm wallet, stepped by the protocol's own TVL. */
function capitalFor(p: SnapshotProtocol): number {
  if (p.tvl_usd >= 5_000_000_000) return 300;
  if (p.tvl_usd >= 1_000_000_000) return 200;
  if (p.tvl_usd >= 250_000_000) return 120;
  if (p.tvl_usd >= 50_000_000) return 80;
  return 50;
}

/** Days a position should stay open, from the protocol's age: younger means a longer window. */
function holdDaysFor(age: number | null): number {
  if (age === null) return 45;
  if (age < 180) return 75;
  if (age < 365) return 60;
  if (age < 730) return 45;
  return 30;
}

/** The core position for a category, in words a farmer can act on. */
function coreAction(p: SnapshotProtocol, capital: number, chain: string): string {
  const c = (p.category ?? '').toLowerCase();
  const n = p.name;
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) return `Supply $${capital} of USDC as collateral to ${n} on ${chain}, then borrow a small amount against it so both sides of the market see the wallet.`;
  if (c.includes('dex') || c.includes('aggregator')) return `Place $${capital} into ${n}'s deepest USDC pool on ${chain} as liquidity, and route a few ordinary swaps through ${n} itself.`;
  if (c.includes('perpetual') || c.includes('derivative') || c.includes('option')) return `Deposit $${capital} of USDC margin on ${n} and trade one small, hedged position so the account has real volume, not just a deposit.`;
  if (c.includes('bridge') || c.includes('cross chain')) return `Bridge $${capital} of USDC to ${chain} through ${n}, then put the bridged funds to work in one app on the far side.`;
  if (c.includes('staking') || c.includes('restak')) return `Stake $${capital} worth of the base asset through ${n} on ${chain} and keep the staking receipt token in the same wallet.`;
  if (c.includes('yield') || c.includes('farm') || c.includes('allocator') || c.includes('curator')) return `Deposit $${capital} into a ${n} vault on ${chain} and leave the vault shares untouched in the wallet.`;
  if (c.includes('stable')) return `Mint $${capital} of ${n}'s stable asset on ${chain} against USDC collateral and hold part of it unspent.`;
  if (c.includes('rwa')) return `Mint $${capital} of ${n}'s tokenised asset on ${chain} and hold it past the next monthly reporting date.`;
  if (c.includes('prediction')) return `Fund ${n} with $${capital} and take one position in a market you actually have a view on.`;
  if (c.includes('insurance')) return `Buy $${capital} of cover from ${n} on ${chain} for an asset you hold, and keep the policy to expiry.`;
  if (c.includes('privacy')) return `Deposit $${capital} into ${n} on ${chain} through its own interface and make one shielded transfer to your second wallet.`;
  if (c === 'chain') return `Bridge $${capital} of USDC onto ${n}'s own chain and put it to work in one native app there, so the wallet is a chain user from the first week.`;
  if (c.includes('payment')) return `Route $${capital} of real payments through ${n} over the hold window instead of parking it: pay your own second wallet in instalments if you have nothing else to pay for.`;
  return `Deposit $${capital} of USDC into ${n} on ${chain} through its own app and leave the position open.`;
}

/** A second, category-flavoured interaction, so the wallet reads as a user and not a deposit. */
function secondAction(p: SnapshotProtocol, chain: string): string {
  const c = (p.category ?? '').toLowerCase();
  const n = p.name;
  if (c.includes('lend') || c.includes('cdp')) return `Repay part of the borrow and borrow again once, so the wallet shows a full credit cycle on ${n}.`;
  if (c.includes('dex') || c.includes('aggregator')) return `Withdraw a quarter of the liquidity and re-add it a week later, so ${n} records the wallet as a returning provider.`;
  if (c.includes('perpetual') || c.includes('derivative')) return `Open and close one more small trade on a different market of ${n}, keeping total fees under $5.`;
  if (c.includes('bridge')) return `Bridge a smaller amount back the other way once, so ${n} sees the wallet travel in both directions.`;
  if (c.includes('curator') || c.includes('allocator')) return `Move a fifth of the position into a second ${n} vault with a different risk profile, so the wallet holds more than one curated strategy and not a single deposit.`;
  if (c.includes('rwa')) return `When ${n} posts its next monthly report or attestation, read it and note the date in your farm log: holding through a reporting date is the behaviour a real holder shows.`;
  if (c.includes('stable')) return `Provide a small amount of the minted asset as liquidity in its main pool on ${chain}, so the wallet both mints the asset and helps it trade.`;
  if (c.includes('staking') || c.includes('restak')) return `Claim the staking rewards once and restake them, so the wallet compounds the way a holder does instead of only depositing.`;
  if (c === 'chain') return `Use one more native app on ${n}'s chain each week — a swap, a name, a small mint — so the wallet's history is spread across the chain and not one bridge in.`;
  if (c.includes('payment')) return `Pay one real bill or invoice through ${n} if it offers the route, and keep the receipt in your farm log.`;
  return `Use one more feature of ${n} on ${chain} beyond the core position, such as its dashboard, a vote or a second product, once.`;
}

/** The plan's shape: every figure the steps quote and the economics reuse, from one place. */
interface PlanShape {
  chain: string;
  capital: number;
  hold: number;
  gas: number;
  smallGas: number;
  weeks: number;
  months: number;
  watchMinutes: number;
  cost: number;
  hours: number;
}

function planShape(p: SnapshotProtocol, age: number | null): PlanShape {
  const chain = chainOf(p);
  const capital = capitalFor(p);
  const hold = holdDaysFor(age);
  const gas = gasFor(chain);
  const smallGas = Math.max(1, Math.round(gas / 3));
  const weeks = Math.ceil(hold / 7);
  const months = Math.max(1, Math.round(hold / 30));
  const watchMinutes = p.chains.length >= 4 ? 15 : 10;
  const cost = gas + gas + smallGas + smallGas * weeks;
  const hours = round2((10 + 20 + 15 + 10 * weeks + 5 * weeks + watchMinutes * months) / 60);
  return { chain, capital, hold, gas, smallGas, weeks, months, watchMinutes, cost, hours };
}

/**
 * Net a plan against the conservative (p10) value of a launch. The stated assumption: if the
 * token launches and allocates A% of its supply to users, the payment is pro-rata across the
 * farming capital, taken as 2% of TVL — most custodied value is passive and never farms — so a
 * position of $capital expects A% x odds x p10 x capital / (0.02 x TVL). The break-even
 * allocation turns that around: the share of supply users must receive, at the p10 value and
 * the fitted odds, for the plan's cash cost to come back. The verdict prices the farmer's hour
 * at the reference allocation of 5%: farm at $5 an hour or better, thin when the expected value
 * still covers the cash, skip when it does not.
 */
export function farmEconomics(p: SnapshotProtocol, shape: PlanShape, odds: number, conservativeValue: number, model: ModelConstants = MODEL): FarmEconomics {
  const farmingCapital = model.farmer_capital_share * p.tvl_usd;
  const positionShare = farmingCapital > 0 ? shape.capital / farmingCapital : 0;
  const denominator = odds * conservativeValue * positionShare;
  const breakeven = denominator > 0 ? round2((100 * shape.cost) / denominator) : null;
  const expected = denominator * model.ref_allocation;
  const ev = round2(expected - shape.cost);
  const evPerHour = shape.hours > 0 ? round2(ev / shape.hours) : 0;
  const verdict: FarmEconomics['verdict'] =
    breakeven !== null && breakeven > 100 ? 'skip' : evPerHour >= model.farm_ev_hour_floor ? 'farm' : ev >= 0 ? 'thin' : 'skip';
  return {
    capital_usd: shape.capital,
    cost_usd: shape.cost,
    hours: shape.hours,
    conservative_value_usd: conservativeValue,
    breakeven_allocation_pct: breakeven,
    expected_value_usd: ev,
    ev_per_hour_usd: evPerHour,
    verdict,
  };
}

/**
 * A protocol's farm plan: eight steps derived from its own record (category, chains, TVL, age,
 * momentum), closing with the netted verdict. A shrinking protocol gets a shorter leash in its
 * own plan; a growing one gets a fuller cadence. No step names a points programme the snapshot
 * does not record: the plan says where to look, and warns that only the protocol's own page can
 * confirm one exists.
 */
export function farmSteps(p: SnapshotProtocol, age: number | null, shape: PlanShape, econ: FarmEconomics): string[] {
  const { chain, capital, hold, gas, smallGas } = shape;
  const growth = p.change_7d ?? 0;
  const shrinking = growth <= -10;
  const surging = growth >= 10;
  const cadence = shrinking
    ? `Re-check the position every two weeks rather than adding to it: ${p.name}'s TVL fell this week, so let the protocol prove it can hold value before you commit more.`
    : surging
      ? `Add in stages while the growth lasts: repeat the core action at half size each week, and stop adding the first week ${p.name}'s TVL falls — a surge is when late size gets farmed hardest.`
      : `Repeat one small qualifying action on ${p.name} every week, on roughly the same day, so the wallet builds a steady history instead of one burst.`;
  const watchStep =
    p.chains.length >= 4
      ? `Once a month, open ${p.name}'s own site and its official announcements and look for a points, rewards or governance page for each of its ${p.chains.length} chain deployments; follow only links the protocol itself publishes. Cost: nothing to look, and never pay a third party to claim. Time: 15 minutes a month.`
      : `Once a month, open ${p.name}'s own site and its official announcements and look for a points, rewards or governance page; follow only links the protocol itself publishes. Cost: nothing to look, and never pay a third party to claim. Time: 10 minutes a month.`;
  const verdictStep =
    econ.verdict === 'farm'
      ? `Verdict: FARM. The plan costs about $${econ.cost_usd} in gas and ${econ.hours} hours; at the low-end value it breaks even if users receive ${econ.breakeven_allocation_pct}% of the supply, and at a 5% reference allocation it nets about $${econ.ev_per_hour_usd} an hour.`
      : econ.verdict === 'thin'
        ? `Verdict: THIN. The plan costs about $${econ.cost_usd} in gas and ${econ.hours} hours; it breaks even if users receive ${econ.breakeven_allocation_pct}% of the supply, so run it only alongside stronger farms, not on its own.`
        : `Verdict: SKIP. The plan costs about $${econ.cost_usd} in gas and ${econ.hours} hours, and even at the low-end value it needs ${econ.breakeven_allocation_pct === null ? 'more than the whole supply' : `${econ.breakeven_allocation_pct}% of the supply`} to break even; the expected value does not cover the cash.`;
  return [
    `Set up one dedicated wallet for ${p.name} and fund it from your main wallet in a single transfer. Cost: about $${gas} of gas on ${chain}. Time: 10 minutes.`,
    `${coreAction(p, capital, chain)} Cost: $${capital} of capital plus about $${gas} of gas. Time: 20 minutes to set up.`,
    `${secondAction(p, chain)} Cost: about $${smallGas} of gas. Time: 15 minutes.`,
    `${cadence} Cost: about $${smallGas} of gas per action. Time: 10 minutes a week.`,
    `Keep the position open for at least ${hold} days, across at least two weekly snapshots, before you judge it. Cost: the $${capital} stays committed. Time: ${hold} days.`,
    watchStep,
    `Keep a farm log for ${p.name}: wallet address, dates, amounts and transaction hashes, and note the day you would exit if no token ever comes. Cost: nothing. Time: 5 minutes a week.`,
    verdictStep,
  ];
}

/** Every candidate the board ranks: all rankable pre-token protocols, plus the watchlist whole. */
export function boardCandidates(snapshot: Snapshot): SnapshotProtocol[] {
  const index = new Map(snapshot.protocols.map((p) => [p.slug, p]));
  const chosen = new Map<string, SnapshotProtocol>();
  for (const p of snapshot.protocols) if (isRankable(p)) chosen.set(p.slug, p);
  for (const slug of snapshot.watchlist) {
    const p = index.get(slug);
    if (p !== undefined) chosen.set(slug, p);
  }
  return [...chosen.values()];
}

/** The board: every candidate, ranked by expected value (conditional value x launch odds). */
export function buildBoard(snapshot: Snapshot, model: ModelConstants = MODEL): BoardRow[] {
  const fit = fitValue(snapshot);
  const line = { intercept: fit.intercept, slope: fit.slope };
  const { oddsFor } = fitOdds(snapshot, model);
  const watch = new Set(snapshot.watchlist);
  const candidates = boardCandidates(snapshot);
  const oddsOf = new Map<string, number>();
  const audit = new Map<string, { odds: number; band: string; cohort: number; share: number }>();
  for (const p of candidates) {
    const o = oddsFor(p);
    oddsOf.set(p.slug, o.odds);
    audit.set(p.slug, o);
  }
  const ranges = bootstrapRanges(candidates, snapshot, oddsOf, model);
  const scored = candidates.map((p) => {
    const age = ageDays(snapshot.as_of, p.listed_at);
    const mom = momentumOf(p, model);
    const conditional = Math.max(1, Math.round(conditionalValue(p, line, model)));
    const o = audit.get(p.slug)!;
    const implied = Math.max(1, Math.round(conditional * o.odds));
    const range = ranges.get(p.slug)!;
    const shape = planShape(p, age);
    const econ = farmEconomics(p, shape, o.odds, range.p10, model);
    return {
      p,
      age,
      conditional,
      implied,
      range,
      econ,
      shape,
      rowModel: {
        implied_multiple: p.tvl_usd > 0 ? round4(conditional / p.tvl_usd) : 0,
        momentum_pct: mom.pct,
        momentum_multiplier: round4(mom.mult),
        age_days: age,
        age_band: o.band,
        cohort_protocols: o.cohort,
        cohort_launched_share: o.share,
        launch_odds: o.odds,
      } satisfies RowModel,
    };
  });
  scored.sort((a, b) => b.implied - a.implied || bySlugOrder(a.p.slug, b.p.slug));
  return scored.map((s, i) => ({
    rank: i + 1,
    slug: s.p.slug,
    name: s.p.name,
    category: s.p.category,
    chains: s.p.chains,
    tvl_usd: s.p.tvl_usd,
    change_7d: s.p.change_7d,
    mcap_usd: s.p.mcap_usd,
    listed_at: s.p.listed_at,
    gecko_id: s.p.gecko_id,
    symbol: s.p.symbol,
    token_status: 'pre-token',
    watchlist: watch.has(s.p.slug),
    age_days: s.age,
    conditional_value_usd: s.conditional,
    launch_odds: s.rowModel.launch_odds,
    implied_value_usd: s.implied,
    value_p10_usd: s.range.p10,
    value_p90_usd: s.range.p90,
    rank_p10: s.range.rankP10,
    rank_p90: s.range.rankP90,
    model: s.rowModel,
    farm: s.econ,
    farm_steps: farmSteps(s.p, s.age, s.shape, s.econ),
  }));
}

/** The live-token protocols, by market cap, for the dashboard's Live view. */
export function liveRows(snapshot: Snapshot): LiveRow[] {
  return snapshot.protocols
    .filter((p) => !isPreToken(p) && p.category !== 'CEX')
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0) || b.tvl_usd - a.tvl_usd || bySlugOrder(a.slug, b.slug))
    .slice(0, LIVE_ROWS)
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd,
      ratio: p.tvl_usd > 0 && p.mcap_usd !== null ? round4(p.mcap_usd / p.tvl_usd) : null,
      change_7d: p.change_7d,
    }));
}

/** The full accounting: every protocol in the snapshot lands in exactly one ledger line. */
export function buildLedger(snapshot: Snapshot, board: BoardRow[]): Ledger {
  const onBoard = new Set(board.map((r) => r.slug));
  let launchedPriced = 0;
  let launchedUnpricedCap = 0;
  let tokenNoCap = 0;
  const reasons = new Map<string, number>();
  for (const p of snapshot.protocols) {
    if (onBoard.has(p.slug)) continue;
    if (isPreToken(p)) {
      const reason = exclusionReason(p) ?? 'not rankable';
      reasons.set(reason, (reasons.get(reason) ?? 0) + 1);
    } else if (p.mcap_usd !== null && p.mcap_usd > 0) launchedPriced += 1;
    else if (p.mcap_usd !== null) launchedUnpricedCap += 1;
    else tokenNoCap += 1;
  }
  const excluded = [...reasons.values()].reduce((a, b) => a + b, 0);
  return {
    total: snapshot.protocols.length,
    ranked: board.length,
    ranked_watchlist: board.filter((r) => r.watchlist).length,
    ranked_below_floor: board.filter((r) => r.tvl_usd < snapshot.floor_usd).length,
    launched_priced: launchedPriced,
    launched_unpriced_cap: launchedUnpricedCap,
    token_recorded_no_cap: tokenNoCap,
    pre_token_excluded: excluded,
    excluded_reasons: [...reasons.entries()]
      .map(([reason, count]) => ({ reason, count }))
      .sort((a, b) => b.count - a.count || bySlugOrder(a.reason, b.reason)),
  };
}

/** Everything the dashboard renders, from the snapshot. */
export function buildRadar(snapshot: Snapshot, model: ModelConstants = MODEL): { board: BoardRow[]; radar: RadarData } {
  const fit = fitValue(snapshot);
  const { odds } = fitOdds(snapshot, model);
  const board = buildBoard(snapshot, model);
  const live = liveRows(snapshot);
  const boardJson = JSON.stringify({ rows: board });
  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model,
    model_version: MODEL_VERSION,
    fit,
    odds,
    validation: validate(snapshot, model),
    ledger: buildLedger(snapshot, board),
    board_checksum: createHash('sha256').update(boardJson).digest('hex').slice(0, 16),
    watchlist_size: snapshot.watchlist.length,
    board_size: board.length,
    live_size: live.length,
    total_expected_value_usd: board.reduce((a, r) => a + r.implied_value_usd, 0),
    rows: board,
    live,
  };
  return { board, radar };
}

/** The snapshot out of a file's text, refused unless it is the shape the model scores. */
export function parseSnapshot(text: string): Snapshot {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new SnapshotError('snapshot.json is not JSON');
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new SnapshotError('snapshot.json is not a JSON object');
  const o = raw as Record<string, unknown>;
  if (typeof o.as_of !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(o.as_of)) throw new SnapshotError('snapshot.json has no as_of date');
  if (typeof o.source !== 'string') throw new SnapshotError('snapshot.json has no source');
  if (typeof o.floor_usd !== 'number' || !Number.isSafeInteger(o.floor_usd) || o.floor_usd <= 0) throw new SnapshotError('snapshot.json has no floor_usd');
  if (!Array.isArray(o.protocols)) throw new SnapshotError('snapshot.json has no protocols array');
  if (!Array.isArray(o.watchlist) || o.watchlist.some((s) => typeof s !== 'string')) throw new SnapshotError('snapshot.json has no watchlist of slugs');
  const protocols = o.protocols.map((v, i) => {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new SnapshotError(`snapshot.json's protocol ${i} is not an object`);
    const p = v as Record<string, unknown>;
    if (typeof p.slug !== 'string' || typeof p.name !== 'string' || typeof p.tvl_usd !== 'number' || !Number.isFinite(p.tvl_usd)) {
      throw new SnapshotError(`snapshot.json's protocol ${i} lacks a slug, a name or a TVL`);
    }
    return {
      slug: p.slug,
      name: p.name,
      category: typeof p.category === 'string' ? p.category : null,
      chains: Array.isArray(p.chains) ? p.chains.filter((c): c is string => typeof c === 'string') : [],
      tvl_usd: p.tvl_usd,
      change_7d: typeof p.change_7d === 'number' && Number.isFinite(p.change_7d) ? p.change_7d : null,
      mcap_usd: typeof p.mcap_usd === 'number' && Number.isFinite(p.mcap_usd) ? p.mcap_usd : null,
      listed_at: typeof p.listed_at === 'string' ? p.listed_at : null,
      gecko_id: typeof p.gecko_id === 'string' ? p.gecko_id : null,
      symbol: typeof p.symbol === 'string' ? p.symbol : null,
    };
  });
  return { as_of: o.as_of, source: o.source, floor_usd: o.floor_usd, protocols, watchlist: o.watchlist as string[] };
}

/** Why a board is not one the gate will take, or null. Mirrors the gate's seven rows for our shape. */
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  if (board.length < 100 || board.length > 4000) return `the board holds ${board.length} rows, outside 100..4000`;
  const slugs = new Set(board.map((r) => r.slug));
  if (slugs.size !== board.length) return 'a slug appears twice on the board';
  const known = new Set(snapshot.protocols.map((p) => p.slug));
  for (const r of board) if (!known.has(r.slug)) return `${r.slug} is not one of the snapshot's protocols`;
  const missing = snapshot.watchlist.filter((s) => !slugs.has(s));
  if (missing.length > 0) return `the board misses ${missing.length} watchlist slugs: ${missing.slice(0, 5).join(', ')}`;
  const ranks = board.map((r) => r.rank).sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i++) if (ranks[i] !== i + 1) return `rank ${i + 1} is ${ranks[i]}`;
  for (let i = 1; i < board.length; i++) if (board[i]!.implied_value_usd > board[i - 1]!.implied_value_usd) return `row ${i + 1} outranks row ${i} on implied value`;
  if (board.length >= 2 && board[0]!.implied_value_usd === board[board.length - 1]!.implied_value_usd) return 'every row shares one implied value: not a ranking';
  for (const r of board) {
    if (r.farm_steps.length < 3 || r.farm_steps.length > 12) return `${r.slug} has ${r.farm_steps.length} farm steps`;
    for (const s of r.farm_steps) {
      const t = s.trim();
      if (t.length < 20 || t.length > 600) return `${r.slug} has a farm step of ${t.length} characters`;
    }
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0 || r.implied_value_usd > 100_000_000_000_000) return `${r.slug} has implied value ${r.implied_value_usd}`;
    if (!(r.launch_odds > 0 && r.launch_odds <= 1)) return `${r.slug} has launch odds ${r.launch_odds}`;
    if (r.value_p10_usd < 1 || r.value_p90_usd < r.value_p10_usd) return `${r.slug} has a broken bootstrap range`;
  }
  return null;
}

/** A compact data.js: the dashboard's whole dataset as one script, no fetch and no network. */
export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}
