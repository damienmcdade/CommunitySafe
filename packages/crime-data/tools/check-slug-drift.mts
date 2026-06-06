// Slug-drift check: for each city that uses the curated ACS population table,
// fetch its LIVE discovered area slugs and diff against the curated keys. A
// discovered slug with no population entry falls through to the peer-share
// denominator (less-accurate per-100k). A small count is expected (non-
// residential areas floored by design); a LARGE fraction signals the live feed's
// neighbourhood-name field changed its slug format (a real bug to fix).
// Run: node_modules/.bin/tsx tools/check-slug-drift.mts  (hits live feeds, ~2-4m)
import { CITIES } from "../src/cities.js";
import { GENERATED_NEIGHBORHOOD_POPS } from "../src/neighborhood-populations-generated.js";
let flagged = 0;
for (const city of CITIES) {
  const pops = (GENERATED_NEIGHBORHOOD_POPS as Record<string, Record<string, number>>)[city.slug];
  if (!pops) continue;
  let discovered: { slug: string }[] = [];
  try { discovered = await city.discover(); } catch (e) { console.log(`?? ${city.slug}: discover failed ${(e as Error).message.slice(0,60)}`); continue; }
  if (discovered.length === 0) { console.log(`-- ${city.slug}: 0 discovered (cold/empty)`); continue; }
  const popKeys = new Set(Object.keys(pops));
  const drift = discovered.map(a => a.slug).filter(s => !popKeys.has(s));
  const pct = Math.round((drift.length / discovered.length) * 100);
  const mark = pct >= 50 ? "❌ HIGH-DRIFT" : pct >= 20 ? "⚠ " : "✅";
  if (drift.length) { if (pct>=20) flagged++; console.log(`${mark} ${city.slug}: ${drift.length}/${discovered.length} (${pct}%) discovered slugs lack a pop entry${pct>=20?` — e.g. ${drift.slice(0,6).join(", ")}`:""}`); }
}
console.log(`\nCities with >=20% drift (investigate): ${flagged}`);
process.exit(0);
