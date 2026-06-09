import { describe, it, expect } from "vitest";
import { princeGeorgesPolygons } from "@travelsafe/crime-data/data/prince-georges-county-neighborhoods";

// Regression guard for Prince George's County, MD: PGPD incidents are placed into
// the county's recognizable constituent communities (Census place polygons) by
// point-in-polygon. The crime DATA is official PGPD; boundaries are US Census.
function pointInRings(lng: number, lat: number, geom: { type: string; coordinates: unknown }): boolean {
  const rings: number[][][] = geom.type === "Polygon"
    ? (geom.coordinates as number[][][])
    : (geom.coordinates as number[][][][]).flat();
  let inside = false;
  for (const ring of rings) {
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const xi = ring[i][0], yi = ring[i][1], xj = ring[j][0], yj = ring[j][1];
      if (yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
    }
  }
  return inside;
}

describe("Prince George's County neighborhoods", () => {
  it("bundles a substantial recognizable named place set (>= 50)", () => {
    expect(princeGeorgesPolygons.length).toBeGreaterThanOrEqual(50);
    const names = new Set(princeGeorgesPolygons.map((p) => p.name));
    for (const n of ["Bowie", "College Park", "Hyattsville", "Laurel", "Greenbelt"]) {
      expect(names.has(n)).toBe(true);
    }
  });

  it("every place carries a valid centroid inside Prince George's County's bbox", () => {
    for (const p of princeGeorgesPolygons) {
      expect(p.centroid.lat).toBeGreaterThan(38.5);
      expect(p.centroid.lat).toBeLessThan(39.15);
      expect(p.centroid.lng).toBeGreaterThan(-77.1);
      expect(p.centroid.lng).toBeLessThan(-76.65);
    }
  });

  it("places a College Park coordinate inside College Park", () => {
    const cp = princeGeorgesPolygons.find((p) => p.name === "College Park")!;
    expect(pointInRings(-76.9369, 38.9897, cp.geometry)).toBe(true);
  });
});
