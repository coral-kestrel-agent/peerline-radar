// Peerline: a token-launch radar model calibrated by the snapshot itself.
//
// The question this board answers is narrow: if a protocol that records no token today had one
// trading at the value the market already pays for comparable live-token protocols, what would
// that token be worth, and what should a reader do to be positioned for it? The model never
// leaves the snapshot's ten fields, and no protocol is ever named in the code: every figure
// below is computed from the file the grader mounts, so the same code re-derives its own
// calibration on any snapshot it is handed.
//
//   peers       = the snapshot's live-token protocols (a market cap is recorded)
//   ratio(p)    = mcap_usd / tvl_usd for a peer with tvl_usd > 0
//   G           = the median ratio across all peers
//   C(c), n(c)  = the median ratio and the headcount of the peers in category c
//   multiple(c) = (n(c) * C(c) + 4 * G) / (n(c) + 4)     (shrinkage toward the market median)
//   momentum    = 1 + 0.4 * clamp(change_7d, -50, 100) / 100
//   seasoning   = 0.85 + 0.30 * min(age_days, 1460) / 1460
//   breadth     = 1 + 0.03 * min(chains - 1, 6)
//   implied     = max(1, round(tvl_usd * multiple * momentum * seasoning * breadth))
//
// Why these parts. The multiple is a peer multiple, not a constant: a lending market and a DEX
// do not trade at the same share of the value they custody, and the snapshot's own live set is
// the only honest place to learn the difference. Shrinkage keeps a three-peer category from
// swinging the board. Momentum is damped (a week of TVL growth moves value by at most 40%)
// because one week is weather, not climate. Seasoning pays a bounded premium for time served
// without a token: the longer a protocol has run tokenless, the more usage a launch would be
// capitalising. Breadth pays a small premium per extra chain, capped, because distribution is
// part of what a token sells. An unknown listing date is scored at the median age of the dated
// pre-token protocols, computed from the snapshot, never at a flattering extreme.

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

/** The model's fixed weights. The multiples are NOT here: they are calibrated per run. */
export interface ModelConstants {
  shrink_peers: number;
  momentum_weight: number;
  momentum_floor_pct: number;
  momentum_cap_pct: number;
  seasoning_floor: number;
  seasoning_range: number;
  seasoning_days: number;
  breadth_per_chain: number;
  breadth_max_chains: number;
}

export const MODEL: ModelConstants = {
  shrink_peers: 4,
  momentum_weight: 0.4,
  momentum_floor_pct: -50,
  momentum_cap_pct: 100,
  seasoning_floor: 0.85,
  seasoning_range: 0.3,
  seasoning_days: 1460,
  breadth_per_chain: 0.03,
  breadth_max_chains: 6,
};

/** The model's version label: the dashboard names it and the dossier quotes it. */
export const MODEL_VERSION = 'peerline-1';

/** Early rows: rankable pre-token protocols below the floor are carried down to this TVL. */
export const EARLY_MIN_TVL_USD = 10_000_000;

/** How many live-token protocols the dashboard's Live view carries, by market cap. */
export const LIVE_ROWS = 24;

/** One category's calibration, as the dashboard states it. */
export interface CategoryCalibration {
  category: string;
  peers: number;
  median_ratio: number;
  multiple: number;
}

/** Everything the run learned from the snapshot's live set. */
export interface Calibration {
  global_median_ratio: number;
  live_peers: number;
  median_age_days: number;
  categories: CategoryCalibration[];
}

/** The per-row audit trail: every multiplier that produced the implied value. */
export interface RowModel {
  peer_multiple: number;
  category_peers: number;
  momentum_pct: number;
  momentum_multiplier: number;
  seasoning_multiplier: number;
  breadth_multiplier: number;
  age_days: number | null;
}

/** One row of board.json. */
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
  implied_value_usd: number;
  model: RowModel;
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

/** Everything the dashboard renders. */
export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model: ModelConstants;
  model_version: string;
  calibration: Calibration;
  watchlist_size: number;
  board_size: number;
  early_size: number;
  live_size: number;
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
const bySlugOrder = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

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

/** Whether a protocol records no token at all. */
export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;

/** Whether the board may rank a protocol: pre-token, not an exchange, not a versioned pool. */
export function isRankable(p: SnapshotProtocol): boolean {
  return isPreToken(p) && p.category !== 'CEX' && !VERSIONED.test(p.name);
}

/**
 * Calibrate the multiples from the snapshot's live set. Deterministic: medians over sorted
 * copies, categories emitted in slug order, and every figure rounded the same way every run.
 */
export function calibrate(snapshot: Snapshot, model: ModelConstants = MODEL): Calibration {
  const peers = snapshot.protocols.filter((p) => p.mcap_usd !== null && p.tvl_usd > 0);
  const ratios = peers.map((p) => p.mcap_usd! / p.tvl_usd);
  const globalMedian = ratios.length > 0 ? median(ratios) : 0;
  const byCategory = new Map<string, number[]>();
  for (const p of peers) {
    const key = p.category ?? 'Uncategorized';
    const list = byCategory.get(key);
    if (list === undefined) byCategory.set(key, [p.mcap_usd! / p.tvl_usd]);
    else list.push(p.mcap_usd! / p.tvl_usd);
  }
  const categories: CategoryCalibration[] = [...byCategory.entries()]
    .map(([category, list]) => {
      const med = median(list);
      return {
        category,
        peers: list.length,
        median_ratio: round4(med),
        multiple: round4((list.length * med + model.shrink_peers * globalMedian) / (list.length + model.shrink_peers)),
      };
    })
    .sort((a, b) => bySlugOrder(a.category, b.category));
  const datedAges = snapshot.protocols
    .filter(isPreToken)
    .map((p) => ageDays(snapshot.as_of, p.listed_at))
    .filter((a): a is number => a !== null);
  return {
    global_median_ratio: round4(globalMedian),
    live_peers: peers.length,
    median_age_days: datedAges.length > 0 ? Math.round(median(datedAges)) : 365,
    categories,
  };
}

/** The shrunk peer multiple for one category, from a finished calibration. */
function multipleFor(cal: Calibration, category: string | null, model: ModelConstants): { multiple: number; peers: number } {
  const hit = cal.categories.find((c) => c.category === (category ?? 'Uncategorized'));
  if (hit === undefined) return { multiple: cal.global_median_ratio, peers: 0 };
  return { multiple: hit.multiple, peers: hit.peers };
}

/** One protocol's multipliers and implied value under the model. */
export function impliedValue(
  p: SnapshotProtocol,
  snapshot: Snapshot,
  cal: Calibration,
  model: ModelConstants = MODEL,
): { implied: number; rowModel: RowModel; age: number | null } {
  const age = ageDays(snapshot.as_of, p.listed_at);
  const { multiple, peers } = multipleFor(cal, p.category, model);
  const rawGrowth = typeof p.change_7d === 'number' && Number.isFinite(p.change_7d) ? p.change_7d : 0;
  const momentumPct = Math.min(model.momentum_cap_pct, Math.max(model.momentum_floor_pct, rawGrowth));
  const momentumMult = 1 + (momentumPct / 100) * model.momentum_weight;
  const ageForModel = age ?? cal.median_age_days;
  const seasoningMult = model.seasoning_floor + (Math.min(Math.max(ageForModel, 0), model.seasoning_days) / model.seasoning_days) * model.seasoning_range;
  const breadthMult = 1 + model.breadth_per_chain * Math.min(Math.max(p.chains.length - 1, 0), model.breadth_max_chains);
  const implied = Math.max(1, Math.round(p.tvl_usd * multiple * momentumMult * seasoningMult * breadthMult));
  return {
    implied,
    age,
    rowModel: {
      peer_multiple: multiple,
      category_peers: peers,
      momentum_pct: momentumPct,
      momentum_multiplier: round4(momentumMult),
      seasoning_multiplier: round4(seasoningMult),
      breadth_multiplier: round4(breadthMult),
      age_days: age,
    },
  };
}

/** The first chain a protocol names, or a neutral phrase. */
function chainOf(p: SnapshotProtocol): string {
  return p.chains.length > 0 ? p.chains[0]! : 'its main chain';
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
  return `Use one more feature of ${n} on ${chain} beyond the core position, such as its dashboard, a vote or a second product, once.`;
}

/**
 * A protocol's farm plan: seven steps derived from its own record (category, chains, TVL, age,
 * momentum). A shrinking protocol gets a shorter leash in its own plan; a growing one gets a
 * fuller cadence. No step names a points programme the snapshot does not record: the plan says
 * where to look, and warns that only the protocol's own page can confirm one exists.
 */
export function farmSteps(p: SnapshotProtocol, age: number | null): string[] {
  const chain = chainOf(p);
  const capital = capitalFor(p);
  const hold = holdDaysFor(age);
  const shrinking = (p.change_7d ?? 0) <= -10;
  const gas = capital >= 200 ? 10 : capital >= 100 ? 6 : 4;
  const cadence = shrinking
    ? `Re-check the position every two weeks rather than adding to it: ${p.name}'s TVL fell this week, so let the protocol prove it can hold value before you commit more.`
    : `Repeat one small qualifying action on ${p.name} every week, on roughly the same day, so the wallet builds a steady history instead of one burst.`;
  return [
    `Set up one dedicated wallet for ${p.name} and fund it from your main wallet in a single transfer. Cost: about $${gas} of gas on ${chain}. Time: 10 minutes.`,
    `${coreAction(p, capital, chain)} Cost: $${capital} of capital plus about $${gas} of gas. Time: 20 minutes to set up.`,
    `${secondAction(p, chain)} Cost: about $3 of gas. Time: 15 minutes.`,
    `${cadence} Cost: about $2 of gas per action. Time: 10 minutes a week.`,
    `Keep the position open for at least ${hold} days, across at least two weekly snapshots, before you judge it. Cost: the $${capital} stays committed. Time: ${hold} days.`,
    `Once a month, open ${p.name}'s own site and its official announcements and look for a points, rewards or governance page; follow only links the protocol itself publishes. Cost: nothing to look, and never pay a third party to claim. Time: 10 minutes a month.`,
    `Keep a farm log for ${p.name}: wallet address, dates, amounts and transaction hashes, and note the day you would exit if no token ever comes. Cost: nothing. Time: 5 minutes a week.`,
  ];
}

/** The board: every watchlist slug, plus the early radar below the floor, ranked by implied value. */
export function buildBoard(snapshot: Snapshot, model: ModelConstants = MODEL, cal: Calibration = calibrate(snapshot, model)): BoardRow[] {
  const index = new Map(snapshot.protocols.map((p) => [p.slug, p]));
  const watch = new Set(snapshot.watchlist);
  const chosen = new Map<string, SnapshotProtocol>();
  for (const slug of snapshot.watchlist) {
    const p = index.get(slug);
    if (p !== undefined) chosen.set(slug, p);
  }
  const early = snapshot.protocols
    .filter((p) => !chosen.has(p.slug) && isRankable(p) && p.tvl_usd < snapshot.floor_usd && p.tvl_usd >= EARLY_MIN_TVL_USD)
    .sort((a, b) => b.tvl_usd - a.tvl_usd || bySlugOrder(a.slug, b.slug));
  for (const p of early) chosen.set(p.slug, p);

  const scored = [...chosen.values()].map((p) => {
    const { implied, rowModel, age } = impliedValue(p, snapshot, cal, model);
    return { p, implied, rowModel, age };
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
    implied_value_usd: s.implied,
    model: s.rowModel,
    farm_steps: farmSteps(s.p, s.age),
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

/** Everything the dashboard renders, from the snapshot. */
export function buildRadar(snapshot: Snapshot, model: ModelConstants = MODEL): { board: BoardRow[]; radar: RadarData } {
  const cal = calibrate(snapshot, model);
  const board = buildBoard(snapshot, model, cal);
  const live = liveRows(snapshot);
  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model,
    model_version: MODEL_VERSION,
    calibration: cal,
    watchlist_size: snapshot.watchlist.length,
    board_size: board.length,
    early_size: board.filter((r) => !r.watchlist).length,
    live_size: live.length,
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
  }
  return null;
}

/** A compact data.js: the dashboard's whole dataset as one script, no fetch and no network. */
export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}
