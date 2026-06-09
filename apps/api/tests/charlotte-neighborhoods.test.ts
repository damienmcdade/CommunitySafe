import { describe, it, expect } from "vitest";
import { resolveCharlotteArea } from "@travelsafe/crime-data/adapters/charlotte-arcgis";
import { charlottePolygons, charlottePoints } from "@travelsafe/crime-data/data/charlotte-neighborhoods";

// Regression guard for Charlotte's v110 neighborhood resolution: incidents are
// placed in a recognizable named OSM neighborhood by coordinate (point-in-polygon
// + nearest-name snap), falling back to the CMPD patrol division. If the polygon
// index or snap logic breaks, incidents silently collapse back to 14 divisions.
describe("resolveCharlotteArea", () => {
  it("bundles a substantial set of named neighborhoods incl. recognizable ones", () => {
    expect(charlottePolygons.length).toBeGreaterThan(50);
    // The full named set = polygon neighborhoods + point-only neighborhoods.
    const names = new Set([...charlottePolygons.map((p) => p.name), ...charlottePoints.map((p) => p.name)]);
    expect(names.size).toBeGreaterThan(120);
    // A few well-known Charlotte neighborhoods that should be present.
    for (const n of ["Dilworth", "NoDa", "Biddleville"]) {
      expect([...names].some((x) => x === n || x.includes(n))).toBe(true);
    }
  });

  it("resolves a point inside a neighborhood polygon to that neighborhood", () => {
    // Each polygon's own centroid must resolve back to its name (point-in-polygon
    // for convex-ish shapes; snap as the safety net for concave centroids).
    let hits = 0;
    const sample = charlottePolygons.slice(0, 40);
    for (const p of sample) {
      const got = resolveCharlotteArea(p.centroid.lat, p.centroid.lng, "Central");
      if (got === p.name) hits++;
    }
    // The vast majority of centroids land in their own polygon; allow a few
    // concave-shape misses that snap to an immediate neighbor.
    expect(hits).toBeGreaterThan(sample.length * 0.8);
  });

  it("falls back to the CMPD division when coordinates are missing", () => {
    expect(resolveCharlotteArea(undefined, undefined, "Metro")).toBe("Metro");
    expect(resolveCharlotteArea(0, 0, "Providence")).toBe("Providence");
  });

  it("falls back to Unknown when there is no coordinate and no division", () => {
    expect(resolveCharlotteArea(undefined, undefined, null)).toBe("Unknown");
  });
});
