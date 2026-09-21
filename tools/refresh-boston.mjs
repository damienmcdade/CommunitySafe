#!/usr/bin/env node
// Regenerates apps/web/data/boston-snapshot.json from the live BPD CSV.
//
// Run: node tools/refresh-boston.mjs
// Then: git add apps/web/data/boston-snapshot.json && git commit
//
// Why this exists: data.boston.gov rejects Vercel's IP range for any
// non-trivial response. The CSV download endpoint redirects to a signed S3
// URL that DOES work from Vercel, but downloading + parsing 48 MB on every
// cold start is wasteful. Instead we snapshot the most-recent 5,000 rows
// here and ship them as static JSON in the bundle.
//
// Cadence: weekly is plenty (BPD publishes with ~1-month lag anyway).

import { mkdirSync, createWriteStream, createReadStream, statSync, writeFileSync, readFileSync, unlinkSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";
import readline from "node:readline";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "..");
// v58 path update — boston-snapshot moved to the @travelsafe/crime-data
// workspace package during the v34 monorepo extraction. Writing to the
// old apps/web path created dead files while the live adapter kept
// loading the stale committed snapshot (3+ days lag observed in prod).
const OUT_JSON = resolve(REPO_ROOT, "packages/crime-data/src/data/boston-snapshot.json");
const OUT_PATH = resolve(REPO_ROOT, "packages/crime-data/src/data/boston-snapshot.ts");
const TMP_CSV = resolve(REPO_ROOT, ".cache/boston-full.csv");
const ROWS_TO_KEEP = 5000;
// The CKAN *package* is stable; the CSV resource under it is not. Boston
// publishes each refresh as a new temp export (tmpXXXXXXXX.csv) and the old
// object keeps returning 200 forever with frozen contents — which is exactly
// how this job committed four months of identical data before the freshness
// guard below was added, and how it then failed three runs straight in
// Sept 2026 once the pinned export finally fell 153 days behind.
//
// So: resolve the current resource at run time via CKAN package_show, and
// pick the freshest CSV rather than trusting any one URL. PINNED_CSV_URL is
// kept only as a last-resort fallback; the freshness guard still has the
// final say, so a stale fallback fails the job rather than shipping.
const CKAN_PACKAGE_ID = "6220d948-eae2-4e4b-8723-2dc8e67722a3";
const CKAN_PACKAGE_SHOW = `https://data.boston.gov/api/3/action/package_show?id=${CKAN_PACKAGE_ID}`;
const PINNED_CSV_URL = "https://data.boston.gov/dataset/6220d948-eae2-4e4b-8723-2dc8e67722a3/resource/b973d8cb-eeb2-4e7e-99da-c92938efc9c0/download/tmpcyl1hw5w.csv";

const UA = "CommunitySafe-refresh/1.0 (https://github.com/damienmcdade/TravelSafe)";

/// Ask CKAN which CSV currently backs the crime-incidents package.
/// Returns null (rather than throwing) so a portal hiccup falls back to the
/// pinned URL and lets the freshness guard decide whether that is acceptable.
async function resolveCsvUrl() {
  try {
    const res = await fetch(CKAN_PACKAGE_SHOW, {
      redirect: "follow",
      headers: { "User-Agent": UA, Accept: "application/json" },
    });
    if (!res.ok) {
      console.warn(`CKAN package_show returned HTTP ${res.status}; falling back to the pinned URL.`);
      return null;
    }
    const body = await res.json();
    if (!body?.success || !Array.isArray(body?.result?.resources)) {
      console.warn("CKAN package_show payload had no resources; falling back to the pinned URL.");
      return null;
    }
    const csvs = body.result.resources.filter(
      (r) => String(r?.format ?? "").toUpperCase() === "CSV" && typeof r?.url === "string",
    );
    if (csvs.length === 0) {
      console.warn("CKAN package_show listed no CSV resource; falling back to the pinned URL.");
      return null;
    }
    // Newest by last_modified (falling back to created) — Boston keeps the
    // superseded exports listed, so "first CSV" is not good enough.
    const stamp = (r) => Date.parse(r.last_modified ?? r.created ?? 0) || 0;
    csvs.sort((a, b) => stamp(b) - stamp(a));
    const pick = csvs[0];
    console.log(`CKAN resolved CSV: ${pick.name ?? "(unnamed)"} · modified ${String(pick.last_modified ?? pick.created).slice(0, 10)}`);
    return pick.url;
  } catch (err) {
    console.warn(`CKAN package_show failed (${err.message}); falling back to the pinned URL.`);
    return null;
  }
}

const resolved = await resolveCsvUrl();
const CSV_URL = resolved ?? PINNED_CSV_URL;
if (!resolved) console.warn(`Using PINNED_CSV_URL — if the data is stale the guard below will fail this run.`);

mkdirSync(dirname(TMP_CSV), { recursive: true });
mkdirSync(dirname(OUT_PATH), { recursive: true });

console.log(`Downloading Boston CSV …`);
const start = Date.now();
const res = await fetch(CSV_URL, {
  redirect: "follow",
  headers: { "User-Agent": UA },
});
if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
await pipeline(Readable.fromWeb(res.body), createWriteStream(TMP_CSV));
const sizeMB = (statSync(TMP_CSV).size / 1_048_576).toFixed(1);
console.log(`Downloaded ${sizeMB} MB in ${((Date.now()-start)/1000).toFixed(1)}s`);

console.log(`Parsing + filtering to most-recent ${ROWS_TO_KEEP} rows …`);
// v58 — quote-aware CSV parser. The prior naive line.split(",")
// shifted column indexes whenever OFFENSE_DESCRIPTION contained
// internal commas (e.g. "ANIMAL INCIDENTS (DOG BITES, LOST DOG, ETC)"),
// which collapsed the snapshot from ~5k rows to ~800 garbage rows
// with OCCURRED_ON_DATE = "47" etc. The fix is to handle the BPD
// CSV's standard RFC-4180-ish quoting.
function splitCSV(line) {
  const out = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (ch === '"') inQuotes = false;
      else cur += ch;
    } else {
      if (ch === '"') inQuotes = true;
      else if (ch === ",") { out.push(cur); cur = ""; }
      else cur += ch;
    }
  }
  out.push(cur);
  return out;
}

const rl = readline.createInterface({ input: createReadStream(TMP_CSV), crlfDelay: Infinity });
let headers = null;
const idx = {};
const rows = [];
for await (const line of rl) {
  if (!headers) {
    headers = splitCSV(line);
    for (const [i, h] of headers.entries()) idx[h] = i;
    continue;
  }
  const f = splitCSV(line);
  const date_str = f[idx.OCCURRED_ON_DATE];
  if (!date_str) continue;
  // BPD timestamps land as "2023-01-27 22:44:00+00" (no colon in
  // offset, two-digit hour only). Node's Date.parse rejects "+00" —
  // normalize to "+00:00" so the timestamp parses to a finite number.
  const iso = date_str.replace(" ", "T").replace(/([+-]\d{2})$/, "$1:00");
  const ts = Date.parse(iso);
  if (!Number.isFinite(ts)) continue;
  rows.push({
    ts,
    INCIDENT_NUMBER: f[idx.INCIDENT_NUMBER] || "",
    OFFENSE_DESCRIPTION: (f[idx.OFFENSE_DESCRIPTION] || "").trim(),
    DISTRICT: f[idx.DISTRICT] || "",
    OCCURRED_ON_DATE: date_str,
    Lat: f[idx.Lat] || null,
    Long: f[idx.Long] || null,
  });
}
rows.sort((a, b) => b.ts - a.ts);
const top = rows.slice(0, ROWS_TO_KEEP).map(({ ts: _ts, ...rest }) => rest);

const newest = top[0]?.OCCURRED_ON_DATE ?? null;

// FAIL LOUDLY ON A FROZEN FEED.
//
// CSV_URL pins a CKAN *temp* export (tmpcyl1hw5w.csv). That S3 object stopped
// being updated in April 2026, but it still returns 200 — so this script ran
// green every week and committed byte-identical data for four months while
// production served crime grades from a snapshot a third of a year old,
// labelled "high confidence". A refresh job that cannot fail is not a refresh
// job. If the feed is stale, the workflow must go red so a human looks at it.
const MAX_SNAPSHOT_AGE_DAYS = 45;
if (!newest) {
  console.error("Refusing to write: snapshot has no dated rows.");
  process.exit(1);
}
const ageDays = Math.floor((Date.now() - Date.parse(newest)) / 86_400_000);
if (ageDays > MAX_SNAPSHOT_AGE_DAYS) {
  console.error(
    `Refusing to write: newest Boston incident is ${ageDays} days old (max ${MAX_SNAPSHOT_AGE_DAYS}).\n` +
    `Resolved CSV: ${CSV_URL}\n` +
    (resolved
      ? `This URL came from CKAN package_show, so BPD itself is publishing late —\n` +
        `check https://data.boston.gov/dataset/crime-incident-reports-august-2015-to-date-source-new-system`
      : `CKAN package_show could not be reached, so this run used the stale pinned\n` +
        `fallback. Re-run once the portal is up before investigating BPD.`),
  );
  process.exit(1);
}

const snapshot = {
  // NOTE: deliberately NOT stamped with the run time. A wall-clock
  // `generated_at` changed on every run, which defeated the workflow's own
  // "did anything actually change?" guard and produced eight consecutive
  // weekly commits of identical data. The snapshot's identity is its content.
  source: "https://data.boston.gov/dataset/crime-incident-reports-august-2015-to-date-source-new-system",
  count: top.length,
  newest,
  oldest: top[top.length - 1]?.OCCURRED_ON_DATE ?? null,
  rows: top,
};
// Write both forms:
//  * JSON (for quick eyeballing, diff-friendly)
//  * TS module (the actual import target — bundled by Next reliably)
writeFileSync(OUT_JSON, JSON.stringify(snapshot));
const tsBody = `// Auto-generated by tools/refresh-boston.mjs — do not edit by hand.
// Bundled as a TS module (not JSON) so Next file-tracing always includes it.

export interface BostonSnapshotRow {
  INCIDENT_NUMBER: string;
  OFFENSE_DESCRIPTION: string;
  DISTRICT: string;
  OCCURRED_ON_DATE: string;
  Lat: string | null;
  Long: string | null;
}

export interface BostonSnapshot {
  /** Deprecated: no longer emitted. Its wall-clock value defeated the change guard. */
  generated_at?: string;
  source: string;
  count: number;
  newest: string | null;
  oldest: string | null;
  rows: BostonSnapshotRow[];
}

export const bostonSnapshot: BostonSnapshot = ${JSON.stringify(snapshot)};
`;
writeFileSync(OUT_PATH, tsBody);
try { unlinkSync(TMP_CSV); } catch {}
const outSize = (statSync(OUT_PATH).size / 1024).toFixed(0);
console.log(`Wrote ${OUT_PATH} (${outSize} KB · ${top.length} rows)`);
console.log(`  newest: ${snapshot.newest}`);
console.log(`  oldest: ${snapshot.oldest}`);
console.log(`Done. Commit the snapshot to ship it.`);
