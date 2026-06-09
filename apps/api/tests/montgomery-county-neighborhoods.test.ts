import { describe, it, expect } from "vitest";
import { montgomeryPolygons } from "@travelsafe/crime-data/data/montgomery-county-neighborhoods";

// Regression guard for Montgomery County, MD: MCPD incidents are placed into the
// county's recognizable constituent communities (Census place polygons) by
// point-in-polygon. The crime DATA is official MCPD; boundaries are US Census.
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

describe("Montgomery County neighborhoods", () => {
  it("bundles a substantial recognizable named place set (>= 50)", () => {
    expect(montgomeryPolygons.length).toBeGreaterThanOrEqual(50);
    const names = new Set(montgomeryPolygons.map((p) => p.name));
    for (const n of ["Silver Spring", "Rockville", "Bethesda", "Gaithersburg", "Germantown", "Takoma Park"]) {
      expect(names.has(n)).toBe(true);
    }
  });

  it("every place carries a valid centroid inside Montgomery County's bbox", () => {
    for (const p of montgomeryPolygons) {
      expect(p.centroid.lat).toBeGreaterThan(38.9);
      expect(p.centroid.lat).toBeLessThan(39.35);
      expect(p.centroid.lng).toBeGreaterThan(-77.5);
      expect(p.centroid.lng).toBeLessThan(-76.85);
    }
  });

  it("places a downtown Silver Spring coordinate inside Silver Spring", () => {
    const ss = montgomeryPolygons.find((p) => p.name === "Silver Spring")!;
    expect(pointInRings(-77.0261, 38.9959, ss.geometry)).toBe(true);
  });
});
