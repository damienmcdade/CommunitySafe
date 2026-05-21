import type { Request, Response, NextFunction } from "express";
import { verifySession, type SessionPayload } from "../lib/jwt.js";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      session?: SessionPayload;
    }
  }
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.header("authorization");
  if (!header?.startsWith("Bearer ")) {
    return res.status(401).json({ error: "missing_bearer_token" });
  }
  try {
    req.session = verifySession(header.slice("Bearer ".length));
    next();
  } catch {
    res.status(401).json({ error: "invalid_token" });
  }
}

export function optionalAuth(req: Request, _res: Response, next: NextFunction) {
  const header = req.header("authorization");
  if (header?.startsWith("Bearer ")) {
    try {
      req.session = verifySession(header.slice("Bearer ".length));
    } catch {
      // ignore — endpoint is optional auth
    }
  }
  next();
}
