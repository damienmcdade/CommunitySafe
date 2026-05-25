import { Router } from "express";
import { z } from "zod";
import {
  getSafetyScore,
  getCitywideSafetyScore,
} from "@travelsafe/crime-data/safety-score";
import {
  getTrendForArea,
  getCitywideTrend,
} from "@travelsafe/crime-data/trend-feed";

export const safezoneRouter = Router();

// /safezone/safety-score?city=<slug> OR ?area=<slug>&label=<label>.
// Mirrors the Vercel-side /api/safezone/safety-score handler in
// apps/web. Both Vercel and Railway can serve the same response now
// that the underlying scoring code lives in @travelsafe/crime-data.
const ScoreQuery = z.object({
  city:  z.string().min(1).max(120).optional(),
  area:  z.string().min(1).max(120).optional(),
  label: z.string().min(1).max(120).optional(),
}).refine((q) => Boolean(q.city) !== Boolean(q.area), {
  message: "Pass exactly one of `city` or `area`.",
});

safezoneRouter.get("/safety-score", async (req, res, next) => {
  try {
    const { city, area, label } = ScoreQuery.parse(req.query);
    // Cache-Control mirrors the Vercel edge cache so a CDN in front
    // of Railway (Cloudflare etc.) can reuse the same posture.
    res.setHeader("Cache-Control", "public, s-maxage=300, stale-while-revalidate=900");
    if (city) return res.json(await getCitywideSafetyScore(city));
    return res.json(await getSafetyScore(area!, label ?? area!));
  } catch (err) {
    next(err);
  }
});

const TrendQuery = z.object({
  city:  z.string().min(1).max(120).optional(),
  area:  z.string().min(1).max(120).optional(),
  label: z.string().min(1).max(120).optional(),
  days:  z.coerce.number().int().min(1).max(180).optional(),
}).refine((q) => Boolean(q.city) !== Boolean(q.area), {
  message: "Pass exactly one of `city` or `area`.",
});

safezoneRouter.get("/trend", async (req, res, next) => {
  try {
    const { city, area, label, days } = TrendQuery.parse(req.query);
    res.setHeader("Cache-Control", "public, s-maxage=300, stale-while-revalidate=900");
    if (city) return res.json(await getCitywideTrend(city, { windowDays: days }));
    return res.json(await getTrendForArea(area!, label ?? area!, { windowDays: days }));
  } catch (err) {
    next(err);
  }
});
