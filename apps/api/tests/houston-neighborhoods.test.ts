import { describe, it, expect } from "vitest";
import { resolveHoustonArea } from "@travelsafe/crime-data/adapters/houston-arcgis";
import { houstonPolygons, houstonPoints } from "@travelsafe/crime-data/data/houston-neighborhoods";

// Regression guard for Houston: HPD NIBRS incidents are placed in a recognizable
// named OSM neighborhood by coordinate (point-in-polygon + nearest-name snap).
describe("resolveHoustonArea", () => {
  it("bundles a substantial recognizable named neighborhood set", () => {
    const names = new Set([...houstonPolygons.map((p) => p.name), ...houstonPoints.map((p) => p.name)]);
    expect(names.size).toBeGreaterThan(150);
    for (const n of ["Montrose", "Midtown", "Alief"]) {
      expect([...names].some((x) => x === n)).toBe(true);
    }
  });

  it("resolves a downtown Houston coordinate to a neighborhood", () => {
    const got = resolveHoustonArea(29.7589, -95.3677);
    expect(got).toBeTruthy();
    expect(typeof got).toBe("string");
  });

  it("returns null outside Houston's latitude band", () => {
    expect(resolveHoustonArea(undefined, undefined)).toBeNull();
    expect(resolveHoustonArea(40.0, -95.0)).toBeNull();
  });
});
