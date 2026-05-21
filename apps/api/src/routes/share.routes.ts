import { Router } from "express";
import { resolveSharedView } from "../services/safety/live-share.service.js";

export const shareRouter = Router();

shareRouter.get("/:token", async (req, res, next) => {
  try {
    res.json(await resolveSharedView(req.params.token));
  } catch (err) {
    next(err);
  }
});
