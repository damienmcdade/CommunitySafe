import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

// Robbery-taxonomy invariant guard.
//
// Robbery is filed under NIBRS "Crime Against Property", but the FBI UCR
// Part-1 classification (and our scoring) counts robbery as VIOLENT (PERSONS).
// Adapters that route robbery to PROPERTY silently drop it out of the violent
// rate — a real data-correctness defect (buffalo shipped exactly this and was
// caught at the pre-production gate).
//
// This scans every adapter source and fails if any single mapping line places
// a robbery token into CrimeCategory.PROPERTY. It is intentionally narrow (no
// false positives): keyword arrays and provenance strings that merely mention
// robbery are fine — only a robbery→PROPERTY classification is flagged.
//
// Note: the passthrough-style misclassifications (minneapolis, montgomery
// county) had NO "robbery" token at all before their fix — a pure source scan
// cannot catch absence-of-override. Those are covered by the explicit
// NIBRS-code / crimename overrides added to those adapters. This guard locks
// in the one statically-detectable anti-pattern so it cannot silently return.

const here = dirname(fileURLToPath(import.meta.url));
const ADAPTERS_DIR = join(here, "../../../packages/crime-data/src/adapters");

function adapterFiles(): string[] {
  return readdirSync(ADAPTERS_DIR)
    .filter((f) => f.endsWith(".ts") && !f.endsWith(".d.ts"))
    .map((f) => join(ADAPTERS_DIR, f));
}

describe("robbery taxonomy invariant", () => {
  const files = adapterFiles();

  it("has adapter sources to scan", () => {
    expect(files.length).toBeGreaterThan(20);
  });

  for (const file of files) {
    const src = readFileSync(file, "utf8");
    const name = file.split("/").pop()!;

    it(`${name}: robbery is never classified as PROPERTY`, () => {
      const offending = src
        .split("\n")
        .filter((line) => /robbery/i.test(line) && /CrimeCategory\.PROPERTY/.test(line));
      expect(
        offending,
        `robbery→PROPERTY mapping found in ${name}:\n${offending.join("\n")}`,
      ).toHaveLength(0);
    });
  }
});
