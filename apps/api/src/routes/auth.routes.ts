import { Router } from "express";
import { z } from "zod";
import { authLimiter } from "../middleware/rate-limit.js";
import { requireAuth } from "../middleware/auth.js";
import { register, login, me } from "../services/auth.service.js";
import { writeSecurityAudit } from "../lib/audit.js";
import { HttpError } from "../middleware/error.js";

export const authRouter = Router();

const credentials = z.object({
  email: z.string().email().toLowerCase(),
  // v92 — min 12 chars (DISA STIG IA-5). 8 was below the FedRAMP baseline.
  password: z.string().min(12, "Password must be at least 12 characters").max(200),
  displayName: z.string().min(1).max(80).optional(),
});

authRouter.post("/register", authLimiter, async (req, res, next) => {
  try {
    const { email, password, displayName } = credentials.parse(req.body);
    const result = await register(email, password, displayName);
    writeSecurityAudit({ event: "auth.register", userId: result.user.id, email, req });
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
});

authRouter.post("/login", authLimiter, async (req, res, next) => {
  try {
    const { email, password } = credentials.parse(req.body);
    try {
      const result = await login(email, password);
      writeSecurityAudit({ event: "auth.login.success", userId: result.user.id, email, req });
      res.json(result);
    } catch (err) {
      if (err instanceof HttpError) {
        if (err.code === "account_locked") {
          writeSecurityAudit({ event: "auth.login.fail.locked", email, req });
        } else if (err.code === "banned") {
          writeSecurityAudit({ event: "auth.login.fail.banned", email, req });
        } else if (err.code === "invalid_credentials") {
          writeSecurityAudit({ event: "auth.login.fail.bad_password", email, req });
        }
      }
      throw err;
    }
  } catch (err) {
    next(err);
  }
});

authRouter.get("/me", requireAuth, async (req, res, next) => {
  try {
    res.json(await me(req.session!.uid));
  } catch (err) {
    next(err);
  }
});
