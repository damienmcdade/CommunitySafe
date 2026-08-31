import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { writeLimiter } from "../middleware/rate-limit.js";

// ── Cross-app subscription carryover ─────────────────────────────────────────
// The CommunitySafe app (app.communitysafe.premium_monthly) and the standalone
// CommunitySafe Widget app (app.communitysafe.widget.premium_monthly) are
// SEPARATE App Store products, so StoreKit's per-app entitlements can never see
// each other. Each app reports its active subscription here keyed by the
// device's identifierForVendor (identical across our same-team apps on one
// device); either app then asks whether ANY non-expired entitlement exists for
// the device, and unlocks premium if so — so a subscriber to one app is never
// charged again for the same service in the other. Device-keyed, no login.
//
// Trust model: the client only reports transactions StoreKit has already
// verified locally, and sends the verified expiration. A spoofed report can at
// most unlock the sibling app for that one device — the same lenient/fail-open
// posture both apps already take on their own StoreKit checks. Server-side App
// Store Server API JWS verification can be layered on later with no client
// change (the fields reported here are exactly what that API returns).
export const entitlementRouter = Router();

/**
 * Longest grant this endpoint will honour from an UNVERIFIED client report.
 *
 * The body is not signed by Apple, so `expiresDate` is attacker-controlled: a
 * single curl with your own device id previously bought premium until the year
 * 3000, permanently, with no jailbreak. Clamping to just over one monthly
 * period means a forged grant self-heals within a renewal cycle, while a real
 * subscriber is unaffected — the app re-reports on every launch, so a genuine
 * expiry is always refreshed well before the clamp bites.
 *
 * This is a stopgap. The real fix is deriving expiry from Apple's
 * `GET /inApps/v1/transactions/{originalTransactionId}` and never trusting the
 * body at all; the reported fields are deliberately shaped to match that API.
 */
const MAX_UNVERIFIED_GRANT_MS = 33 * 24 * 60 * 60 * 1000;

const reportBody = z.object({
  deviceId: z.string().uuid(),
  productId: z.string().min(1).max(191),
  originalTransactionId: z.string().min(1).max(191),
  source: z.enum(["widget", "main"]),
  // Upper bound keeps `new Date()` inside the valid range — past 8.64e15 it
  // yields an Invalid Date, which Prisma rejects, turning a malformed request
  // into a 500 plus one Sentry event per call.
  expiresDate: z.number().int().positive().max(4102444800000), // ≤ year 2100
  active: z.boolean().optional(), // false → lapsed/revoked: expire the row now
});

// A device tells us its current subscription status for one app. Upsert on
// (deviceId, originalTransactionId) so renewals just extend the same row and a
// lapse/revocation (active:false) expires it immediately — best-effort, since
// the reporting app must run to send the update.
entitlementRouter.post("/report", writeLimiter, async (req, res, next) => {
  try {
    const b = reportBody.parse(req.body);
    // Never honour a longer grant than a client could legitimately need before
    // its next report — see MAX_UNVERIFIED_GRANT_MS.
    const expiresAt =
      b.active === false
        ? new Date(0)
        : new Date(Math.min(b.expiresDate, Date.now() + MAX_UNVERIFIED_GRANT_MS));
    await prisma.deviceEntitlement.upsert({
      where: {
        deviceId_originalTransactionId: {
          deviceId: b.deviceId,
          originalTransactionId: b.originalTransactionId,
        },
      },
      create: {
        deviceId: b.deviceId,
        productId: b.productId,
        originalTransactionId: b.originalTransactionId,
        source: b.source,
        expiresAt,
      },
      update: { productId: b.productId, source: b.source, expiresAt },
    });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

const checkQuery = z.object({
  deviceId: z.string().uuid(),
  // The caller passes its OWN productId so we only report SIBLING entitlements
  // (the app already covers its own subscription via StoreKit). Optional —
  // omitting it just means "any active entitlement for this device".
  exclude: z.string().max(191).optional(),
});

// Does this device hold a still-active subscription from the OTHER app?
entitlementRouter.get("/check", async (req, res, next) => {
  try {
    const q = checkQuery.parse(req.query);
    const hit = await prisma.deviceEntitlement.findFirst({
      where: {
        deviceId: q.deviceId,
        expiresAt: { gt: new Date() },
        ...(q.exclude ? { productId: { not: q.exclude } } : {}),
      },
      select: { productId: true, source: true, expiresAt: true },
      orderBy: { expiresAt: "desc" },
    });
    res.json({
      premium: Boolean(hit),
      source: hit?.source ?? null,
      productId: hit?.productId ?? null,
      expiresAt: hit?.expiresAt ?? null,
    });
  } catch (err) {
    next(err);
  }
});
