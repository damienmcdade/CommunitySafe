import { Router } from "express";
import { z } from "zod";
import { resolveSharedView } from "../services/safety/live-share.service.js";

export const shareRouter = Router();

// v95p11 — explicit token shape validation. createLiveShare mints
// the token via crypto.randomBytes(20).toString("base64url") (= 27
// base64url chars). Allow 20-64 chars so a future rotation to a
// longer/shorter random width doesn't break clients, but reject
// anything that's not URL-safe so we don't bother the DB with
// queries that can't match a real token.
const Token = z.string().min(20).max(64).regex(/^[A-Za-z0-9_-]+$/);

shareRouter.get("/:token", async (req, res, next) => {
  try {
    const token = Token.parse(req.params.token);
    res.json(await resolveSharedView(token));
  } catch (err) {
    next(err);
  }
});
