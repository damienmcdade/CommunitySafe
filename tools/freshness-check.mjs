#!/usr/bin/env node
// Upstream data-freshness monitor.
//
// Why this exists: on 2026-09-21 a sweep found four upstream feeds had been
// quietly rotting, in some cases for months, and NOTHING in CI noticed:
//
//   • San Francisco migrated data.sfgov.org → data.sf.gov. The old host still
//     answered trivial queries, so every reachability probe passed while the
//     adapter's real pull 403'd and SF served a lapsed cache.
//   • Boston pinned a CKAN temp export that Boston rotated. The dead object
//     kept returning 200 with frozen contents — 153 days stale.
//   • Savannah's SAGIS layer went behind a token; every page failed, the
//     adapter swallowed each one, and the fetch resolved EMPTY with no log.
//   • Pittsburgh's WPRDC resource was replaced with a spreadsheet pivot.
//
// The existing checks could not have caught any of them. sync-check.mjs
// compares Vercel against Railway — but both serve the same stale data, so
// parity is perfect while both are wrong. prod-probe.yml is manual-only and
// never fails. Everything returned HTTP 200 throughout.
//
// So this watches the one thing that actually moves when a feed dies: the AGE
// of the newest incident behind each city's grade.
//
// Usage:
//   node tools/freshness-check.mjs            # report, exit 0
//   node tools/freshness-check.mjs --strict   # exit 1 on a regression
//   node tools/freshness-check.mjs --json
//
// Wired into .github/workflows/freshness-check.yml (daily).

import process from "node:process";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const BASE = process.env.FRESHNESS_BASE || "https://communitysafe-api-production.up.railway.app";
const STRICT = process.argv.includes("--strict");
const JSON_OUT = process.argv.includes("--json");

// A feed this far behind is no longer describing "now". Matches
// STALE_LOW_DAYS in packages/crime-data/src/safety-score.ts, which is the
// point at which the app itself drops the score to low confidence.
const STALE_DAYS = 75;
const CONCURRENCY = 6;
const TIMEOUT_MS = 90_000;

const baseline = JSON.parse(
  readFileSync(resolve(__dirname, "freshness-baseline.json"), "utf8"),
);
const KNOWN = baseline.known ?? {};

function cities() {
  // Read the slugs straight out of the registry so a newly added city is
  // monitored the day it ships, with no second list to forget to update.
  const src = readFileSync(
    resolve(__dirname, "../packages/crime-data/src/cities.ts"),
    "utf8",
  );
  return [...src.matchAll(/slug:\s*"([a-z0-9-]+)"/g)].map((m) => m[1]);
}

async function probe(slug) {
  const started = Date.now();
  try {
    const res = await fetch(`${BASE}/safezone/safety-score?city=${slug}`, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { "User-Agent": "CommunitySafe-freshness/1.0 (+https://communitysafe.app)" },
    });
    if (!res.ok) return { slug, state: "error", detail: `HTTP ${res.status}`, ms: Date.now() - started };
    const body = await res.json();
    const asOf = body.asOf ?? null;
    if (!asOf) {
      return { slug, state: "no-data", detail: "no asOf — feed returned nothing usable", ms: Date.now() - started };
    }
    const ageDays = Math.floor((Date.now() - Date.parse(asOf)) / 86_400_000);
    return {
      slug,
      state: ageDays > STALE_DAYS ? "stale" : "ok",
      ageDays,
      detail: `newest incident ${ageDays}d old`,
      ms: Date.now() - started,
    };
  } catch (err) {
    return { slug, state: "error", detail: String(err.message ?? err).slice(0, 90), ms: Date.now() - started };
  }
}

async function run() {
  const slugs = cities();
  const results = [];
  for (let i = 0; i < slugs.length; i += CONCURRENCY) {
    results.push(...(await Promise.all(slugs.slice(i, i + CONCURRENCY).map(probe))));
  }

  // A city is a REGRESSION when it is degraded and the baseline does not
  // already explain why. A baselined city that has RECOVERED is also worth
  // failing on — otherwise the baseline silently grows into a list of
  // excuses nobody revisits, which is how these feeds rotted in the first
  // place.
  const regressions = [];
  const recovered = [];
  for (const r of results) {
    const known = KNOWN[r.slug];
    const degraded = r.state !== "ok";
    if (degraded && !known) regressions.push(r);
    if (!degraded && known) recovered.push(r);
  }

  if (JSON_OUT) {
    console.log(JSON.stringify({ results, regressions, recovered }, null, 2));
  } else {
    const degraded = results.filter((r) => r.state !== "ok");
    console.log(`Checked ${results.length} cities against ${BASE}\n`);
    console.log(`OK: ${results.length - degraded.length}`);
    for (const r of degraded) {
      const known = KNOWN[r.slug];
      const tag = known ? "KNOWN" : "NEW";
      console.log(`  [${tag}] ${r.slug.padEnd(22)} ${r.state.padEnd(8)} ${r.detail}`);
      if (known) console.log(`         baseline: ${known}`);
    }
    if (regressions.length) {
      console.log(`\n${regressions.length} NEW degradation(s) — an upstream feed has changed or died:`);
      for (const r of regressions) console.log(`  • ${r.slug}: ${r.detail}`);
      console.log(`\nCheck the adapter's upstream by hand. The usual causes, in order:`);
      console.log(`  a host migration (the old host still 200s for small queries),`);
      console.log(`  a rotated export URL that keeps serving frozen contents,`);
      console.log(`  or a layer moved behind a token.`);
    }
    if (recovered.length) {
      console.log(`\n${recovered.length} baselined city(ies) RECOVERED — drop them from`);
      console.log(`tools/freshness-baseline.json so a future break is caught:`);
      for (const r of recovered) console.log(`  • ${r.slug}: ${r.detail}`);
    }
    if (!regressions.length && !recovered.length) console.log(`\nNo change against the baseline.`);
  }

  if (STRICT && (regressions.length || recovered.length)) process.exit(1);
}

run();
