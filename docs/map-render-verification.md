# Crime-map render verification

The crime-map choropleth (`apps/web/src/app/(app)/map/CrimeMap.tsx`) is a
`dynamic(ssr:false)` client component, so it never appears in the page HTML and
can't be verified by scraping a deployed bundle. Instead we verify the inputs
that fully determine the render, with `tools/verify-map-render.mjs`, which
replicates the component's exact pipeline against the boundary file + live API:

1. boundary GeoJSON — `apps/web/public/geo/<slug>.geojson`
2. adapter area labels — `GET /geo/areas?city=<slug>`
3. per-area stats — `GET /crime-data/citywide?city=<slug>`
4. match `properties.name → area slug` with the same `normName` + exact/substring
   rule the component uses, apply the `polygonsForRender` orphan filter, then
   color each survivor from its area's `incidentCount`.

It asserts a city has >0 rendered polygons and that the area centroids fall
inside the polygon bounds (drawn on the right city, not off-map). Exits non-zero
otherwise — safe as a post-build CI smoke check.

```
node tools/verify-map-render.mjs                      # all cities with a geojson
node tools/verify-map-render.mjs baltimore honolulu   # specific cities
```

## 2026-05-31 — the four newly-added maps

Added in commit `573def2` (baltimore / fort-worth / honolulu / long-beach
previously 404'd and fell back to the amber "boundary missing" banner).
Verified against production data:

| City | Polys | Rendered | Colored (incidents >0) | Grey (no-data) | Placement |
|---|---|---|---|---|---|
| Baltimore | 278 | 270 | 270 | 0 | ✓ in city |
| Fort Worth | 390 | 314 | 314 | 0 | ✓ in city |
| Honolulu | 83 | 83 | 83 | 0 | ✓ on Oʻahu |
| Long Beach | 98 | 93 | 93 | 0 | ✓ in city |

Findings:

- **Every rendered polygon is colored** — 0 no-data grey across all four; each
  matched neighborhood has real incident stats (Baltimore 58k / FW 40k /
  Honolulu 14k / LB 10k incidents in-window), so the choropleths fill rather
  than render grey.
- **The orphan filter works** — `polygonsForRender` drops unmatched polygons
  (FW 390→314, LB 98→93, Baltimore 278→270; the extras are division-fallback /
  duplicate polygons, not real neighborhoods), so no stray grey shapes dominate.
- **Geometry lands on the right city** — every bounding box sits inside the
  correct real-world coordinates.
- **The amber "boundary missing" banner is gone** for these four (it triggers
  only on a 404/empty geojson; all now return 200 with valid features).
- Residual unmatched area labels (Baltimore's 7 renamed waterfront
  neighborhoods, Honolulu's ~33 military/condo micro-areas with no civic
  boundary) correctly fall to the under-map footnote rather than rendering.

Match rates vs adapter area labels: Fort Worth 100%, Long Beach 100%,
Baltimore 97%, Honolulu 72% (the honest ceiling — see
`tools/verify-map-render.mjs` and the commit message for sourcing).
