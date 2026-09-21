import { describe, expect, it, vi } from "vitest";
import { fetchPagesTolerant } from "@travelsafe/crime-data/lib/paged";

// Regression net for the bug found in the 2026-09-21 production sweep:
// every adapter's page loop caught each page's error individually, so a
// TOTAL upstream outage resolved with zero rows instead of throwing. The
// adapter's own catch never ran, its last-good cache was never served, and
// a dead feed looked exactly like a city where no crime was reported.
// Savannah sat in that state in production (ArcGIS 499 "Token Required")
// showing a grade of "N/A" with nothing in the logs.
describe("fetchPagesTolerant", () => {
  it("returns every page when all succeed", async () => {
    const out = await fetchPagesTolerant("t", 3, 2, async (i) => [i, i * 10]);
    expect(out).toEqual([[0, 0], [1, 10], [2, 20]]);
  });

  it("tolerates a partial failure and keeps the good pages", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const out = await fetchPagesTolerant("t", 4, 2, async (i) => {
      if (i === 2) throw new Error("flaky page");
      return [i];
    });
    expect(out).toEqual([[0], [1], [], [3]]);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("1/4 pages failed"));
    warn.mockRestore();
  });

  // The whole point of the helper: an outage must be loud, not empty.
  it("throws when every page fails, rather than resolving empty", async () => {
    await expect(
      fetchPagesTolerant("savannah", 3, 2, async () => {
        throw new Error("ArcGIS 499 Token Required");
      }),
    ).rejects.toThrow(/savannah: upstream unreachable — all 3 pages failed.*499/);
  });

  it("honours the concurrency cap", async () => {
    let live = 0;
    let peak = 0;
    await fetchPagesTolerant("t", 8, 3, async (i) => {
      live++;
      peak = Math.max(peak, live);
      await new Promise((r) => setTimeout(r, 5));
      live--;
      return [i];
    });
    expect(peak).toBeLessThanOrEqual(3);
  });

  it("does not throw on a zero-page request", async () => {
    await expect(fetchPagesTolerant("t", 0, 4, async () => [])).resolves.toEqual([]);
  });
});
