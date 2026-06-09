// Build neighborhood (constituent place) polygon data for Montgomery County MD
// (FIPS 24031) and Prince George's County MD (FIPS 24033) from US Census TIGERweb.
//
// The recognizable "neighborhood" unit for a county jurisdiction is its
// constituent municipalities + Census Designated Places (Silver Spring, Rockville,
// Bethesda… / Hyattsville, Bowie, College Park, Laurel…). We pull Incorporated
// Places (layer 4) + Census Designated Places (layer 5) for Maryland (STATE=24),
// then assign each place to a county by testing its centroid against the county
// boundary polygon. Emits packages/crime-data/src/data/<county>-neighborhoods.ts
// matching the NashvilleNeighborhood shape (name, centroid, geometry).
//
// Source: US Census Bureau TIGER/Line via TIGERweb (public domain). The crime
// DATA itself is official county police open-data; these polygons only drive
// point-in-polygon assignment + the crime-map choropleth.
import { writeFileSync } from "node:fs";

const PLACES = "https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/Places_CouSub_ConCity_SubMCD/MapServer";
const COUNTYSVC = "https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/State_County/MapServer/1/query";
const UA = { "User-Agent": "CommunitySafe/0.1 (+https://github.com/damienmcdade/TravelSafe)" };

async function getJson(url) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const r = await fetch(url, { headers: UA });
      if (!r.ok) throw new Error("HTTP " + r.status);
      return await r.json();
    } catch (e) {
      if (attempt === 2) throw e;
      await new Promise((res) => setTimeout(res, 800 * (attempt + 1)));
    }
  }
}

// Ray-casting point-in-polygon over a set of rings (even-odd).
function pointInRings(lng, lat, rings) {
  let inside = false;
  for (const ring of rings) {
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const xi = ring[i][0], yi = ring[i][1], xj = ring[j][0], yj = ring[j][1];
      if (yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
    }
  }
  return inside;
}

function ringsOf(geom) {
  if (!geom) return [];
  return geom.type === "Polygon" ? geom.coordinates : geom.coordinates.flat();
}

function centroidOf(geom) {
  // Area-weighted centroid of the largest ring (good enough for label/snap point).
  let bestArea = -1, best = null;
  for (const ring of ringsOf(geom)) {
    let a = 0, cx = 0, cy = 0;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const f = ring[j][0] * ring[i][1] - ring[i][0] * ring[j][1];
      a += f; cx += (ring[j][0] + ring[i][0]) * f; cy += (ring[j][1] + ring[i][1]) * f;
    }
    a *= 0.5;
    if (Math.abs(a) > bestArea) { bestArea = Math.abs(a); best = a !== 0 ? [cx / (6 * a), cy / (6 * a)] : ring[0]; }
  }
  return best;
}

// Round coordinates to 5 decimals (~1.1 m) to keep the data file compact.
function roundGeom(geom) {
  const r = (n) => Math.round(n * 1e5) / 1e5;
  const mapRing = (ring) => ring.map(([x, y]) => [r(x), r(y)]);
  if (geom.type === "Polygon") return { type: "Polygon", coordinates: geom.coordinates.map(mapRing) };
  return { type: "MultiPolygon", coordinates: geom.coordinates.map((poly) => poly.map(mapRing)) };
}

async function countyBoundary(countyFips) {
  const url = `${COUNTYSVC}?where=STATE%3D%2724%27+AND+COUNTY%3D%27${countyFips}%27&outFields=NAME&returnGeometry=true&f=geojson`;
  const j = await getJson(url);
  const f = j.features?.[0];
  if (!f) throw new Error("county boundary not found: " + countyFips);
  return ringsOf(f.geometry);
}

async function mdPlaces(layer) {
  const url = `${PLACES}/${layer}/query?where=STATE%3D%2724%27&outFields=BASENAME,NAME&returnGeometry=true&f=geojson`;
  const j = await getJson(url);
  return j.features || [];
}

async function buildCounty(name, fips, slugPrefix, jurisdiction) {
  const boundary = await countyBoundary(fips);
  const incorporated = await mdPlaces(4);
  const cdps = await mdPlaces(5);
  const all = [...incorporated, ...cdps];
  const seen = new Set();
  const out = [];
  for (const f of all) {
    if (!f.geometry) continue;
    const c = centroidOf(f.geometry);
    if (!c) continue;
    if (!pointInRings(c[0], c[1], boundary)) continue; // place centroid must be inside this county
    let label = (f.properties.BASENAME || f.properties.NAME || "").trim();
    if (!label) continue;
    if (seen.has(label.toLowerCase())) continue;
    seen.add(label.toLowerCase());
    out.push({ name: label, centroid: { lat: +c[1].toFixed(5), lng: +c[0].toFixed(5) }, geometry: roundGeom(f.geometry) });
  }
  out.sort((a, b) => a.name.localeCompare(b.name));
  console.log(`${name}: ${out.length} places (from ${all.length} MD places)`);
  return out;
}

function emit(file, varName, interfaceName, header, polys) {
  const lines = [];
  lines.push(header);
  lines.push(`export interface ${interfaceName} {`);
  lines.push("  name: string;");
  lines.push("  centroid: { lat: number; lng: number };");
  lines.push('  geometry: { type: "Polygon" | "MultiPolygon"; coordinates: number[][][] | number[][][][] };');
  lines.push("}");
  lines.push(`export const ${varName}: ${interfaceName}[] = [`);
  for (const p of polys) lines.push("  " + JSON.stringify(p) + ",");
  lines.push("];");
  // No separate snap-only points: every place carries a polygon.
  lines.push(`export const ${varName.replace("Polygons", "Points")}: Array<{ name: string; lat: number; lng: number }> = [];`);
  writeFileSync(file, lines.join("\n") + "\n");
  console.log("wrote", file);
}

const moco = await buildCounty("Montgomery County", "031", "moco", "Montgomery County");
emit(
  "packages/crime-data/src/data/montgomery-county-neighborhoods.ts",
  "montgomeryPolygons",
  "MontgomeryNeighborhood",
  `// Montgomery County, MD (FIPS 24031) constituent places (incorporated municipalities +\n// Census Designated Places: Silver Spring, Rockville, Bethesda, Gaithersburg, Germantown…).\n// Boundaries: US Census Bureau TIGER/Line via TIGERweb (public domain). The crime DATA is\n// official Montgomery County PD (data.montgomerycountymd.gov). Generated by\n// tools/build-md-county-neighborhoods.mjs. Polygons drive the crime-map choropleth + a\n// point-in-polygon fallback; the MCPD feed tags each incident with its place name directly.`,
  moco
);

const pg = await buildCounty("Prince George's County", "033", "pg", "Prince George's County");
emit(
  "packages/crime-data/src/data/prince-georges-county-neighborhoods.ts",
  "princeGeorgesPolygons",
  "PrinceGeorgesNeighborhood",
  `// Prince George's County, MD (FIPS 24033) constituent places (incorporated municipalities +\n// Census Designated Places: Bowie, College Park, Hyattsville, Laurel, Greenbelt, Suitland,\n// Oxon Hill, Clinton, Fort Washington…). Boundaries: US Census Bureau TIGER/Line via\n// TIGERweb (public domain). The crime DATA is official Prince George's County PD\n// (data.princegeorgescountymd.gov). Generated by tools/build-md-county-neighborhoods.mjs.\n// The PGPD feed carries no place name, so incidents are placed by point-in-polygon.`,
  pg
);

console.log("done");
