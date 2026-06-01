#!/usr/bin/env node
// Verify that a city's crime-map choropleth will RENDER CORRECTLY — without a
// browser. The map (apps/web/src/app/(app)/map/CrimeMap.tsx) is a
// dynamic(ssr:false) component, so it can't be grepped out of the page HTML;
// instead this harness replicates the component's exact render pipeline against
// the boundary file + live API data and asserts the choropleth will populate:
//
//   1. read the boundary GeoJSON (apps/web/public/geo/<slug>.geojson)
//   2. fetch the adapter's area labels    (GET <API>/geo/areas?city=<slug>)
//   3. fetch the citywide per-area stats  (GET <API>/crime-data/citywide?city=<slug>)
//   4. match polygon properties.name -> area slug with the SAME normName +
//      exact/substring rule CrimeMap uses (NAME_ALIASES omitted — they only
//      affect a handful of SD/Denver/Detroit names and never produce a false
//      positive here)
//   5. report, per city: polygons, rendered (matched -> survive the
//      polygonsForRender filter), colored (matched area has incidentCount>0),
//      no-data (matched but 0 incidents -> renders grey), and a geometry-bounds
//      sanity check (the area centroids must fall inside the polygon bounds, so
//      the layer is drawn on the right city, not off-map).
//
// Exits non-zero if any requested city has zero rendered polygons or its
// geometry doesn't contain the city — i.e. the map would come up blank or in
// the wrong place. Safe to wire into CI as a post-build smoke check.
//
// Usage:
//   node tools/verify-map-render.mjs                 # every city with a geojson
//   node tools/verify-map-render.mjs baltimore honolulu
//   CRIME_API=https://… node tools/verify-map-render.mjs long-beach

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const GEO_DIR = path.join(ROOT, "apps/web/public/geo");
const API = process.env.CRIME_API || "https://communitysafe-api-production.up.railway.app";

// Mirrors normName() in CrimeMap.tsx (sans the small NAME_ALIASES table).
function normName(s) {
  return s
    .toLowerCase()
    .replace(/[\/_]/g, " ")
    .replace(/[^a-z0-9 ]/g, "")
    .replace(/\band\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function getJson(url) {
  const r = await fetch(url, { headers: { Accept: "application/json" } });
  if (!r.ok) throw new Error(`${url} -> HTTP ${r.status}`);
  return r.json();
}

// Bounding box over every coordinate in a FeatureCollection.
function bounds(fc) {
  let minLng = 999, maxLng = -999, minLat = 999, maxLat = -999;
  const walk = (a) => {
    if (typeof a[0] === "number") {
      minLng = Math.min(minLng, a[0]); maxLng = Math.max(maxLng, a[0]);
      minLat = Math.min(minLat, a[1]); maxLat = Math.max(maxLat, a[1]);
    } else for (const x of a) walk(x);
  };
  for (const f of fc.features) if (f.geometry) walk(f.geometry.coordinates);
  return { minLng, maxLng, minLat, maxLat };
}

function citiesFromArgs() {
  const args = process.argv.slice(2);
  if (args.length) return args;
  return fs
    .readdirSync(GEO_DIR)
    .filter((f) => f.endsWith(".geojson"))
    .map((f) => f.replace(/\.geojson$/, ""))
    .sort();
}

async function verifyCity(slug) {
  const file = path.join(GEO_DIR, `${slug}.geojson`);
  if (!fs.existsSync(file)) return { slug, ok: false, reason: "no geojson file" };

  let fc;
  try { fc = JSON.parse(fs.readFileSync(file, "utf8")); }
  catch (e) { return { slug, ok: false, reason: `invalid JSON: ${e.message}` }; }

  const emptyGeom = fc.features.filter((f) => !f.geometry?.coordinates?.length).length;
  const noName = fc.features.filter((f) => !f.properties?.name).length;

  const areasResp = await getJson(`${API}/geo/areas?city=${slug}`);
  const areas = Array.isArray(areasResp) ? areasResp : areasResp.areas ?? [];
  const citywide = await getJson(`${API}/crime-data/citywide?city=${slug}`);

  const byNorm = new Map(areas.map((a) => [normName(a.label), a.slug]));
  const statsBySlug = new Map((citywide.perArea ?? []).map((p) => [p.slug, p]));

  let rendered = 0, colored = 0, noData = 0;
  for (const f of fc.features) {
    const n = normName(f.properties?.name ?? "");
    let slugM = byNorm.get(n);
    if (!slugM) {
      for (const [ln, s] of byNorm) {
        if (ln === n) continue;
        if (ln.includes(n) || n.includes(ln)) { slugM = s; break; }
      }
    }
    if (!slugM) continue; // dropped by polygonsForRender — orphan polygon
    rendered++;
    const st = statsBySlug.get(slugM);
    if (st && st.incidentCount > 0) colored++; else noData++;
  }

  // Geometry sanity: the mean of the API-provided area centroids must sit
  // inside the polygon bounds, i.e. the layer is drawn on the right city.
  const b = bounds(fc);
  const cent = areas
    .map((a) => a.centroid)
    .filter((c) => c && Number.isFinite(c.lat) && Number.isFinite(c.lng));
  const meanLat = cent.reduce((s, c) => s + c.lat, 0) / (cent.length || 1);
  const meanLng = cent.reduce((s, c) => s + c.lng, 0) / (cent.length || 1);
  const placed =
    cent.length === 0 ||
    (meanLng >= b.minLng && meanLng <= b.maxLng && meanLat >= b.minLat && meanLat <= b.maxLat);

  const ok = rendered > 0 && placed && emptyGeom === 0 && noName === 0;
  return {
    slug, ok, polys: fc.features.length, rendered, colored, noData,
    emptyGeom, noName, placed, total: citywide.totalIncidents,
    bbox: `lng[${b.minLng.toFixed(2)},${b.maxLng.toFixed(2)}] lat[${b.minLat.toFixed(2)},${b.maxLat.toFixed(2)}]`,
  };
}

const cities = citiesFromArgs();
console.log(`Verifying ${cities.length} crime map(s) against ${API}\n`);
let failures = 0;
for (const slug of cities) {
  try {
    const r = await verifyCity(slug);
    if (!r.ok && r.reason) { console.log(`✗ ${slug}: ${r.reason}`); failures++; continue; }
    const flag = r.ok ? "✓" : "✗";
    if (!r.ok) failures++;
    console.log(
      `${flag} ${slug.padEnd(16)} polys ${String(r.polys).padStart(4)} | rendered ${String(r.rendered).padStart(4)} | ` +
      `colored ${String(r.colored).padStart(4)} | grey ${String(r.noData).padStart(3)} | ` +
      `${r.total ?? "?"} incidents | ${r.placed ? "placed ✓" : "OFF-MAP ✗"} | ${r.bbox}`,
    );
  } catch (e) {
    console.log(`✗ ${slug}: ${e.message}`);
    failures++;
  }
}
console.log(`\n${cities.length - failures}/${cities.length} maps render OK${failures ? ` — ${failures} FAILED` : ""}.`);
process.exit(failures ? 1 : 0);
