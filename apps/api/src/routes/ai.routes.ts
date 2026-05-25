import { Router } from "express";
import { z } from "zod";
import { writeLimiter } from "../middleware/rate-limit.js";
import { streamComposeFeedback } from "../services/ai/compose-feedback.js";
import { explainIncident } from "../services/ai/incident-explain.service.js";
import { generateAreaBrief } from "../services/ai/area-brief.service.js";
import { generateIncidentSummary } from "../services/ai/incident-summary.service.js";

export const aiRouter = Router();

const explainBody = z.object({
  description: z.string().min(1).max(400),
});

aiRouter.post("/incident-explain", writeLimiter, async (req, res, next) => {
  try {
    const { description } = explainBody.parse(req.body);
    const out = await explainIncident(description);
    res.json(out);
  } catch (err) {
    next(err);
  }
});

const composeBody = z.object({
  what:  z.string().min(1).max(800),
  where: z.string().min(1).max(200),
  when:  z.string().min(1).max(200),
});

// v38 — area-brief + incident-summary ports from apps/web. Same
// prompt + caching + response shape; Railway-hosted so the Vercel
// proxy can avoid the cold-start LRU reset on every serverless
// instance spin-up.
aiRouter.get("/area-brief", async (req, res, next) => {
  try {
    const area = typeof req.query.area === "string" ? req.query.area : "";
    if (!area) return res.status(400).json({ error: "area_required" });
    const brief = await generateAreaBrief(area);
    res.setHeader("Cache-Control", "public, s-maxage=300, stale-while-revalidate=900");
    res.json({
      area,
      brief,
      aiConfigured: brief !== null,
      disclaimer:
        "Two-paragraph AI brief grounded in the area's actual top reported " +
        "offenses. Not legal or medical advice; never describes individuals.",
    });
  } catch (err) {
    next(err);
  }
});

const summaryQuery = z.object({
  area: z.string().min(1).max(120).optional(),
  city: z.string().min(1).max(120).optional(),
  windowDays: z.coerce.number().int().min(1).max(180).optional(),
});

aiRouter.get("/incident-summary", async (req, res, next) => {
  try {
    const q = summaryQuery.parse(req.query);
    const out = q.area
      ? await generateIncidentSummary({ area: q.area, windowDays: q.windowDays })
      : q.city
        ? await generateIncidentSummary({ cityOnly: { citySlug: q.city }, windowDays: q.windowDays })
        : null;
    if (!out) {
      return res.status(400).json({ error: "summary_unavailable", reason: "Pass ?area= or ?city=" });
    }
    res.setHeader("Cache-Control", "public, s-maxage=300, stale-while-revalidate=900");
    res.json(out);
  } catch (err) {
    next(err);
  }
});

aiRouter.post("/compose-feedback", writeLimiter, async (req, res, next) => {
  try {
    const draft = composeBody.parse(req.body);
    const result = await streamComposeFeedback(draft);
    if (!result.configured) {
      return res.status(503).json({ error: "ai_disabled", message: "AI_GATEWAY_API_KEY not configured" });
    }
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.setHeader("Cache-Control", "no-store");
    // ai SDK v6 streamText returns an object with `textStream` (AsyncIterable<string>).
    for await (const chunk of result.stream.textStream) {
      res.write(chunk);
    }
    res.end();
  } catch (err) {
    next(err);
  }
});
