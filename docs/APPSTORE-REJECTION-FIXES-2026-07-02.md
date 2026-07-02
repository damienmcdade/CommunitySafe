# App Store rejection fixes — 2026-07-02

**Rejection reference:** Submission ID `737c0e24-b9e0-4ddc-8d24-9778e6f1512f`, reviewed 2026-07-02 on iPad Air 11-inch (M3), version 1.0 (5). Two guidelines cited: **2.1(b)** (In-App Purchase products referenced but not submitted) and **1.5** (Support URL — a `*.vercel.app` page with no support information).

> **Repo note:** the rejection text names the listing "MarketScale AI" with support URL
> `https://marketscale-ai.vercel.app`. This repository ships the CommunitySafe codebase
> (`app.communitysafe`); it contains no MarketScale references and no StoreKit/IAP code.
> The code-level fixes below remove every pattern in this codebase that triggers those
> two guidelines. The App Store Connect steps must be performed on the actual app
> record(s) being submitted — for **both** the iOS and macOS submissions.

---

## What changed in code (this branch)

### Guideline 1.5 — Support URL
- **New `/support` page** (`apps/web/src/app/(legal)/support/page.tsx`): working
  contact channel (`info@cyberwaveglobal.com`), stated response time, self-serve FAQ
  (account deletion, data export, coverage, score disputes, notifications, post
  reporting), operator disclosure, and emergency disclaimer. Rendered inside the app
  and on the web.
- **`/support` linked from the shared legal footer** so every public page reaches it
  in one click.
- All contact/company URLs on the page point to **cyberwaveglobal.com** (no
  `*.vercel.app` URLs anywhere in user-facing content).

### Guideline 2.1(b) — dangling purchase references
- The only purchase-adjacent content in the binary was the `/pricing` page's
  unreleased **"Pro — coming soon"** card (with a waitlist `mailto:` CTA). App Review
  reads an advertised paid tier as an IAP reference; with no submitted IAP product it
  fails 2.1(b), and a `mailto:` purchase path would separately risk 3.1.1.
- `/pricing` is now split into a server shell + client body
  (`PricingContent.tsx`): inside the native iOS/macOS shell the Pro card, waitlist
  CTA, and "Pro tier may arrive later" copy are **not rendered at all**. The web
  page is unchanged for browsers.

There is intentionally **no StoreKit integration** in this app: nothing is sold, so
the compliant posture is *zero* purchase references in the binary, not IAP wiring.

---

## App Store Connect steps (must be done in ASC — repeat for the iOS app record AND the macOS/"Mac" availability)

### Guideline 1.5 — Support URL
1. App Store Connect → **My Apps → [app] → App Information** (per platform where shown,
   and **App Store → [version] → App Review Information**).
2. Set **Support URL** to `https://cyberwaveglobal.com/support`.
   - Configure `cyberwaveglobal.com/support` to serve (or 301 to) the app's live
     `/support` page. Verify it loads logged-out on a phone before resubmitting —
     Apple clicks it.
3. Set **Marketing URL** to `https://cyberwaveglobal.com` and confirm the
   **Privacy Policy URL** is also on `cyberwaveglobal.com` (e.g.
   `https://cyberwaveglobal.com/privacy` redirecting to the live privacy page).
4. Remove every `*.vercel.app` URL from all metadata fields, on both the iOS and
   macOS listings — Apple treats platform-hosted preview domains as non-permanent.

### Guideline 2.1(b) — In-App Purchases
Choose ONE, per platform submission:

- **Path A — nothing is for sale yet (matches this codebase):** delete (or leave in
  "Missing Metadata"/unattached state, never "Waiting for Review") any IAP products
  created under **Features → In-App Purchases**, make sure none are attached to the
  version submission, upload a **new build** produced from this branch, and reply in
  Resolution Center that all purchase references were removed from the binary.
- **Path B — you intend to sell subscriptions now:** for each IAP product fill in
  display name, description, pricing, and the **required App Review screenshot**
  (a real capture of the purchase UI in the app), attach the products to the version
  submission with the new binary, and submit them together. Note: digital
  subscriptions must then use StoreKit — a `mailto:` or web checkout in-app is a
  3.1.1 rejection — which would require adding IAP support to this codebase first.

### Resubmission checklist (each platform)
- [ ] New build (increment `CFBundleVersion`) from this branch uploaded.
- [ ] Support URL = `https://cyberwaveglobal.com/support` and resolves publicly.
- [ ] Marketing / Privacy Policy URLs on `cyberwaveglobal.com`; no `vercel.app` anywhere.
- [ ] No IAP attached to the submission (Path A) or all IAPs fully submitted with
      review screenshots (Path B).
- [ ] Reply in Resolution Center summarizing both fixes so the same reviewer can
      re-check quickly.
