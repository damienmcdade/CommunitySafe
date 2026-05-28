import { defineConfig } from "vitest/config";

// v96 — vitest is the bare-minimum bench so the high-risk paths
// have a regression net. Tests that need a real Neon database
// connection are tagged `// @prisma` and skipped unless
// TEST_DATABASE_URL is set; CI defaults run only the pure-logic
// tests so the suite is fast and dependency-free.

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
    testTimeout: 10_000,
    pool: "forks",
  },
});
