import { Router } from "express";
import { z } from "zod";
import { authLimiter } from "../middleware/rate-limit.js";
import { requireAuth } from "../middleware/auth.js";
import { register, login, me } from "../services/auth.service.js";

export const authRouter = Router();

const credentials = z.object({
  email: z.string().email().toLowerCase(),
  password: z.string().min(8).max(200),
  displayName: z.string().min(1).max(80).optional(),
});

authRouter.post("/register", authLimiter, async (req, res, next) => {
  try {
    const { email, password, displayName } = credentials.parse(req.body);
    res.status(201).json(await register(email, password, displayName));
  } catch (err) {
    next(err);
  }
});

authRouter.post("/login", authLimiter, async (req, res, next) => {
  try {
    const { email, password } = credentials.parse(req.body);
    res.json(await login(email, password));
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
