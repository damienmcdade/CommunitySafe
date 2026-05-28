import { describe, it, expect, vi } from "vitest";
import type { Request, Response, NextFunction } from "express";
import { csrfGuard } from "../src/middleware/csrf.js";

// v96 — CSRF guard unit tests. The middleware is pure-logic
// (no DB, no network) so it's an ideal smoke target for vitest.

function mockReq(method: string, headers: Record<string, string>, path = "/posts"): Request {
  return { method, headers, path } as unknown as Request;
}

function mockRes(): { res: Response; status: ReturnType<typeof vi.fn>; json: ReturnType<typeof vi.fn> } {
  const status = vi.fn().mockReturnThis();
  const json = vi.fn().mockReturnThis();
  const res = { status, json } as unknown as Response;
  return { res, status, json };
}

describe("csrfGuard", () => {
  it("passes GET regardless of Sec-Fetch-Site", () => {
    const next = vi.fn() as unknown as NextFunction;
    const { res } = mockRes();
    csrfGuard(mockReq("GET", { "sec-fetch-site": "cross-site" }), res, next);
    expect(next).toHaveBeenCalled();
  });

  it("passes POST with Sec-Fetch-Site: same-origin", () => {
    const next = vi.fn() as unknown as NextFunction;
    const { res } = mockRes();
    csrfGuard(mockReq("POST", { "sec-fetch-site": "same-origin" }), res, next);
    expect(next).toHaveBeenCalled();
  });

  it("passes POST with Sec-Fetch-Site: same-site", () => {
    const next = vi.fn() as unknown as NextFunction;
    const { res } = mockRes();
    csrfGuard(mockReq("POST", { "sec-fetch-site": "same-site" }), res, next);
    expect(next).toHaveBeenCalled();
  });

  it("passes POST with Sec-Fetch-Site: none (typed URL / bookmark)", () => {
    const next = vi.fn() as unknown as NextFunction;
    const { res } = mockRes();
    csrfGuard(mockReq("POST", { "sec-fetch-site": "none" }), res, next);
    expect(next).toHaveBeenCalled();
  });

  it("passes POST when Sec-Fetch-Site is missing (non-browser client)", () => {
    const next = vi.fn() as unknown as NextFunction;
    const { res } = mockRes();
    csrfGuard(mockReq("POST", {}), res, next);
    expect(next).toHaveBeenCalled();
  });

  it("BLOCKS POST with Sec-Fetch-Site: cross-site", () => {
    const next = vi.fn() as unknown as NextFunction;
    const { res, status, json } = mockRes();
    csrfGuard(mockReq("POST", { "sec-fetch-site": "cross-site" }), res, next);
    expect(next).not.toHaveBeenCalled();
    expect(status).toHaveBeenCalledWith(403);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({ error: "csrf_blocked" }),
    );
  });

  it("BLOCKS PUT / PATCH / DELETE with Sec-Fetch-Site: cross-site", () => {
    for (const method of ["PUT", "PATCH", "DELETE"]) {
      const next = vi.fn() as unknown as NextFunction;
      const { res, status } = mockRes();
      csrfGuard(mockReq(method, { "sec-fetch-site": "cross-site" }), res, next);
      expect(next, `${method} should be blocked`).not.toHaveBeenCalled();
      expect(status).toHaveBeenCalledWith(403);
    }
  });
});
