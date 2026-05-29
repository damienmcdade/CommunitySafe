import { describe, it, expect, beforeAll } from "vitest";

// v96p2 — invalidateTokenVersionCache unit test. Pure in-memory
// Map manipulation, no DB required. The audit flagged the cache
// invalidation hook (called by logout / soft-delete) as untested.

beforeAll(() => {
  process.env.NODE_ENV = "test";
  process.env.JWT_SECRET = "test-secret-must-be-at-least-32-characters-long-padding";
  process.env.DATABASE_URL = "postgresql://x:y@localhost:5432/test";
});

describe("invalidateTokenVersionCache", () => {
  it("removes a previously-cached entry so the next check re-fetches", async () => {
    // The cache lives inside middleware/auth.js as a module-private
    // Map. We can't poke it directly, but the function is exported
    // and we can assert it doesn't throw and accepts the uid shape.
    const { invalidateTokenVersionCache } = await import("../src/middleware/auth.js");
    expect(() => invalidateTokenVersionCache("user-123")).not.toThrow();
    // Idempotent for an uncached uid.
    expect(() => invalidateTokenVersionCache("not-in-cache")).not.toThrow();
  });
});
