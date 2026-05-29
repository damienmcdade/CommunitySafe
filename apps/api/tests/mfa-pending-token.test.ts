import { describe, it, expect, beforeAll } from "vitest";

// v96p2 — MFA challenge JWT unit tests. The audit flagged that
// signMfaPendingToken / verifyMfaPendingToken had zero coverage.
// They're pure-crypto round-trips, no DB or network needed; vitest
// can exercise them inline. JWT_SECRET is set before the env module
// loads because lib/env.ts validates it at parse time.

beforeAll(() => {
  process.env.NODE_ENV = "test";
  process.env.JWT_SECRET = "test-secret-must-be-at-least-32-characters-long-padding";
  process.env.DATABASE_URL = "postgresql://x:y@localhost:5432/test";
});

describe("MFA pending token", () => {
  it("round-trips a valid token", async () => {
    const { signMfaPendingToken, verifyMfaPendingToken } = await import("../src/lib/jwt.js");
    const token = signMfaPendingToken("user-123");
    expect(verifyMfaPendingToken(token).uid).toBe("user-123");
  });

  it("rejects an access token (typ mismatch)", async () => {
    const { signAccessToken, verifyMfaPendingToken } = await import("../src/lib/jwt.js");
    const access = signAccessToken({ uid: "user-123", email: "x@y.z", ver: 0 });
    expect(() => verifyMfaPendingToken(access)).toThrow(/mfa pending/i);
  });

  it("rejects a tampered payload", async () => {
    const { signMfaPendingToken, verifyMfaPendingToken } = await import("../src/lib/jwt.js");
    const token = signMfaPendingToken("user-123");
    const parts = token.split(".");
    const tampered = `${parts[0]}.${Buffer.from(JSON.stringify({ uid: "victim", typ: "mfa_pending" })).toString("base64url")}.${parts[2]}`;
    expect(() => verifyMfaPendingToken(tampered)).toThrow();
  });

  it("rejects an unsigned (alg:none) token", async () => {
    const { verifyMfaPendingToken } = await import("../src/lib/jwt.js");
    const header = Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" })).toString("base64url");
    const payload = Buffer.from(JSON.stringify({ uid: "victim", typ: "mfa_pending" })).toString("base64url");
    const unsigned = `${header}.${payload}.`;
    expect(() => verifyMfaPendingToken(unsigned)).toThrow();
  });

  it("rejects garbage", async () => {
    const { verifyMfaPendingToken } = await import("../src/lib/jwt.js");
    expect(() => verifyMfaPendingToken("not-a-jwt")).toThrow();
    expect(() => verifyMfaPendingToken("")).toThrow();
  });
});
