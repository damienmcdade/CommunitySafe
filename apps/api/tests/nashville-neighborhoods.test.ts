import { describe, it, expect } from "vitest";
import { resolveNashvilleArea } from "@travelsafe/crime-data/adapters/nashville-arcgis";
import { nashvillePolygons, nashvillePoints } from "@travelsafe/crime-data/data/nashville-neighborhoods";

// Regression guard for Nashville's v110 build: MNPD incidents are placed in a
// recognizable named OSM neighborhood by coordinate (point-in-polygon + nearest-
// name snap). If the polygon index / snap breaks, the city goes dark.
describe("resolveNashvilleArea", () => {
  it("bundles a substantial recognizable named neighborhood set", () => {
    const names = new Set([...nashvillePolygons.map((p) => p.name), ...nashvillePoints.map((p) => p.name)]);
    expect(names.size).toBeGreaterThan(120);
    for (const n of ["Antioch", "Bellevue", "Bordeaux"]) {
      expect([...names].some((x) => x === n)).toBe(true);
    }
  });

  it("resolves a downtown Nashville coordinate to a neighborhood", () => {
    // Downtown / Broadway area
    const got = resolveNashvilleArea(36.1610, -86.7785);
    expect(got).toBeTruthy();
    expect(typeof got).toBe("string");
  });

  it("returns null for missing/zero coordinates (so the row is dropped, not mislabeled)", () => {
    expect(resolveNashvilleArea(undefined, undefined)).toBeNull();
    expect(resolveNashvilleArea(0, 0)).toBeNull();
  });
});
