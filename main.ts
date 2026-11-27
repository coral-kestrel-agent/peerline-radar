// Peerline token radar: the token-radar-01 entry program (Node 22, standard library only).
//
// Reads the sealed snapshot from /input/snapshot.json (or --input <file|dir>), scores every
// pre-token protocol with the peer-calibrated model in lib/model.ts, writes the ranked board
// to /output/board.json, writes the dashboard's data to /output/data.js, copies this
// repository's dashboard/ and screenshots/ into /output, and finishes with /output/dossier.json
// from the vendored make.fun library, byte for byte what the scorer rebuilds.
//
// Outside the grader's container, MAKEFUN_OUTPUT_DIR stands in for /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input ../kit/input/snapshot.json

import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { boardIssue, buildRadar, dataScript, parseSnapshot } from './lib/model.ts';
import { buildDossier } from './vendor/makefun-board.ts';

const here = fileURLToPath(new URL('.', import.meta.url));

/** The scorer's caps: text_max_bytes shapes the dossier's bytes; the rest only refuse. */
const DOSSIER_CAPS = {
  text_max_bytes: 65_536,
  screenshots: { max: 4, max_bytes: 524_288 },
  dashboard: { max_files: 400, max_bytes: 4_194_304 },
};
const IMAGE_NAME = /^[A-Za-z0-9_][A-Za-z0-9._-]{0,127}$/;

/** --name <value> (or --name=<value>) out of the arguments, else the fallback. */
function arg(name: string, fallback: string): string {
  const at = process.argv.indexOf(`--${name}`);
  if (at >= 0 && at + 1 < process.argv.length) return process.argv[at + 1]!;
  const eq = process.argv.find((a) => a.startsWith(`--${name}=`));
  return eq === undefined ? fallback : eq.slice(name.length + 3);
}

/** Fail the way the starter fails: one line on stderr, a non-zero exit, nothing half-written. */
function fail(message: string, code: number): never {
  process.stderr.write(`peerline radar: ${message}\n`);
  process.exit(code);
}

const inputArg = arg('input', '/input');
const inputFile = inputArg.endsWith('.json') ? inputArg : join(inputArg, 'snapshot.json');
if (!existsSync(inputFile)) fail(`no snapshot at ${inputFile}: pass --input <snapshot.json|directory> or mount the sealed /input`, 2);
const out = arg('output', process.env.MAKEFUN_OUTPUT_DIR ?? '/output');

const snapshot = parseSnapshot(readFileSync(inputFile, 'utf8'));
const { board, radar } = buildRadar(snapshot);
const issue = boardIssue(board, snapshot);
if (issue !== null) fail(`the model wrote a board the gate refuses: ${issue}`, 1);

mkdirSync(out, { recursive: true });
writeFileSync(join(out, 'board.json'), JSON.stringify({ rows: board }));
writeFileSync(join(out, 'data.js'), dataScript(radar));

/** Copy one directory's regular files into `to`, skipping dot-names; returns the names copied. */
function copyFiles(from: string, to: string): string[] {
  if (!existsSync(from)) return [];
  mkdirSync(to, { recursive: true });
  const copied: string[] = [];
  for (const name of readdirSync(from).sort()) {
    if (name.startsWith('.')) continue;
    const path = join(from, name);
    if (!statSync(path).isFile()) continue;
    copyFileSync(path, join(to, name));
    copied.push(name);
  }
  return copied;
}

const pageFiles = copyFiles(join(here, 'dashboard'), join(out, 'dashboard'));
const shots = copyFiles(join(here, 'screenshots'), join(out, 'screenshots'));
if (shots.length < 3 || shots.length > DOSSIER_CAPS.screenshots.max) {
  fail(`screenshots/ holds ${shots.length} images: hand in 3 or 4, the board, a detail view and a filtered view`, 1);
}
for (const name of shots) {
  if (!IMAGE_NAME.test(name)) fail(`screenshots/${name}: a name is letters, digits and . _ -, 1 to 128 characters`, 1);
  const bytes = statSync(join(here, 'screenshots', name)).size;
  if (bytes > DOSSIER_CAPS.screenshots.max_bytes) fail(`screenshots/${name} is ${bytes} bytes, over the 512 KiB cap`, 1);
}

// The dossier goes last: the scorer rebuilds it from this very /output and compares bytes.
const dossier = buildDossier(out, DOSSIER_CAPS);
if (dossier.length > 1_572_864) fail(`dossier.json would be ${dossier.length} bytes, over the 1.5 MiB cap`, 1);
writeFileSync(join(out, 'dossier.json'), dossier);

// Post-write self-check: re-read the board as the gate will, and refuse a run whose own output
// does not parse, rank 1..N, or descend by value. Cheap insurance inside the grader's sandbox.
const written = JSON.parse(readFileSync(join(out, 'board.json'), 'utf8')) as { rows: { rank: number; implied_value_usd: number }[] };
if (!Array.isArray(written.rows) || written.rows.length !== board.length) fail('the written board.json does not hold the board', 1);
for (let i = 0; i < written.rows.length; i++) {
  if (written.rows[i]!.rank !== i + 1) fail(`the written board.json has rank ${written.rows[i]!.rank} at position ${i + 1}`, 1);
  if (i > 0 && written.rows[i]!.implied_value_usd > written.rows[i - 1]!.implied_value_usd) fail('the written board.json rises in value as rank ascends', 1);
}

const v = radar.validation;
process.stdout.write(
  `peerline radar: ${snapshot.protocols.length} protocols, ${snapshot.watchlist.length} on the watchlist, ${board.length} rows scored ` +
    `(ledger: ${radar.ledger.launched_priced} launched and priced, ${radar.ledger.token_recorded_no_cap} token recorded without a cap, ` +
    `${radar.ledger.pre_token_excluded} pre-token excluded), value fit log10 value = ${radar.fit.intercept} + ${radar.fit.slope} x log10 TVL ` +
    `on ${radar.fit.peers} peers, board checksum ${radar.board_checksum}\n` +
    `peerline radar: leave-one-out over ${v.peers} peers: method median error x${Math.pow(10, v.method_median_abs_log10).toFixed(2)} ` +
    `(${v.method_within_2x_pct}% within x2) against the flat baseline's x${Math.pow(10, v.baseline_median_abs_log10).toFixed(2)} ` +
    `(${v.baseline_within_2x_pct}% within x2)\n` +
    `peerline radar: wrote board.json, data.js, dashboard (${pageFiles.length} files), screenshots (${shots.length} images) and dossier.json under ${out}\n`,
);
