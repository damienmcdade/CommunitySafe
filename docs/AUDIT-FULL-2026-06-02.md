# CommunitySafe / TravelSafe — Security & Quality Audit Report
**Audit date:** 2026-06-02 · **Repo:** `/Users/damiengantt-mcdade/TravelSafe` (Next.js web + Capacitor iOS/Android, Express API, `packages/crime-data` 44-city adapters, `packages/db` Prisma) · **Production:** https://communitysafe.app

---

## 1. Executive Summary

**Overall health:** The product has a strong defensive baseline — verified-clean web security headers, TLS/HSTS, no IDOR, server-side RBAC, working JWT alg-confusion rejection, fail-closed cron auth, no SSRF, no ReDoS, no committed secrets, and a genuinely implemented 30-day account-purge. However, the audit found a **structural fault line: two divergent authentication stacks**, where production (Vercel/web) runs the *weaker* one. This single architectural problem produces the one critical finding (MFA bypass) plus a cluster of high-severity auth gaps. A second recurring theme is **honesty/accuracy drift** between what the product *claims* (legal pages, UI copy, coverage dashboard, "live location" sharing) and what the code *does* — material for a safety product. A third theme is **crime-data correctness**: several cities silently undercount, share a single fake centroid, or lose their population denominator.

**Headline counts (verified):**

| Severity | Count |
|---|---|
| Critical | 1 |
| High | 31 |
| Medium | 54 |
| Low | 89 |
| Info | 77 |
| **Total findings** | **252** |
| Uncertain (needs human verification) | 3 |
| Refuted (dropped) | 5 |
| Audit tasks completed | 43 |

**Top 5 risks:**
1. **MFA is completely bypassed on the production login path** (critical) — a user who enables MFA still gets a full session token from password alone on the Vercel route the client actually calls.
2. **Two divergent auth stacks; production uses the weaker one** — no token revocation, no logout, no refresh, weaker bcrypt/TTL; the entire hardened Express auth surface is unreachable dead code.
3. **Safety-critical channels silently no-op** — SMS/Twilio unconfigured (SOS/check-in/live-share to phone contacts never send); "live location" sharing conveys no location despite the promise; one failed email aborts an emergency fan-out.
4. **GDPR/compliance documentation contradicts code** — account hard-delete/purge worker for the Express path does not exist; methodology page publishes the wrong FBI benchmark and a non-existent data year (2025).
5. **Crime-data accuracy defects** — multiple cities (LA, Boston, Philadelphia, Charlotte, Norfolk, Phoenix, Baltimore) mis-report coverage or lose population denominators; Sacramento/Atlanta/Virginia Beach/Norfolk collapse every incident to one centroid.

---

## 2. Critical & High Findings

### 2.1 CRITICAL — Authentication

#### MFA completely bypassed on the primary (web/Vercel) login route `[pentest-authn-1]`
- **Location:** `apps/web/src/server/services/auth.ts:40-83` (login), via `apps/web/src/app/api/auth/login/route.ts` and `apps/web/src/lib/api-client.ts:7` (`API_BASE` defaults to `""` → same-origin `/api/auth/login` on Vercel).
- **Evidence:** Express `login()` returns `mfaRequired:true` + a 5-min `mfaPendingToken` when `user.mfaEnabled` (`auth.service.ts:94-105`) and withholds the token pair until `/auth/mfa/verify`. The **web** `login()` never reads `user.mfaEnabled`/`mfaSecret` — after `bcrypt.compare` succeeds it immediately returns `token: signSession({uid,email})` (`auth.ts:79-82`). The shipped client login page calls `api("/auth/login")` — the web route.
- **Impact:** Any user who enrolled MFA via the Express API gets it **silently ignored** on the real login path. Password compromise = full account takeover despite a second factor the user believes is protecting them. Security-expectation violation on a safety product.
- **Fix:** Mirror the Express MFA challenge in the web login service (return `mfaRequired` + short-TTL pending ticket; add `/api/auth/mfa/verify` web route; never issue a session token on password-only when MFA is enabled). Ideally consolidate to a single auth backend so the two cannot drift.

### 2.2 HIGH — Authentication / Session (the "dual-stack" cluster)

These are all manifestations of one root cause: **two auth implementations, production using the weaker.**

| ID | Title | Location | Core evidence | Fix |
|---|---|---|---|---|
| `auth-dual-stack-1` | Two divergent auth stacks; production web uses the weaker one; entire Express MFA/refresh/logout system is unreachable dead code | `api-client.ts:7,51` vs `apps/api/src/routes/auth.routes.ts` | Web client only POSTs `/api/auth/anonymous`, `/login`, GET `/me`. Grep for `auth/logout\|refresh\|mfa\|mfaRequired\|refreshToken\|tokenVersion` in web → **zero** client calls. Full Express surface (logout, refresh, mfa/*, account/delete soft-delete, lockout, tokenVersion) is unreachable. | Pick one canonical auth backend; delete/quarantine the unused stack. |
| `auth-no-revocation-web-2` | Canonical web JWT has no tokenVersion and no logout — a leaked token can't be revoked for its 24h life | `apps/web/src/server/lib/jwt.ts:5-8,17-28`; `auth.ts:8-15` (comment admits gap) | Web `signSession` encodes only `{uid,email}`; live decode confirms 86400s TTL. No web logout route exists. | Add `tokenVersion` check to web `verifySession` (column already exists) + `POST /api/auth/logout` that bumps it. |
| `auth-mfa-unreachable-3` | MFA fully built on Express but unreachable from web UI; web login service doesn't implement it | `login/page.tsx:19-24`; `services/auth.ts:40-83`; `apps/api/src/services/mfa.service.ts` | Web login page reads only `r.token`, never handles `mfaRequired`. Web login service has no `if (user.mfaEnabled)` branch. | Implement the `mfaEnabled` branch + enroll/challenge UI, or remove the half-wired MFA feature. |
| `pentest-authn-2` | Web session tokens can't be revoked on logout/password-change/sign-out-everywhere | `jwt.ts:5-8`; `auth.ts:7-40`; `env.ts:23` | No `ver`/`typ` claim; comment admits version-based revocation impossible without re-issuing. | Add `ver` claim + check against `User.tokenVersion`; bump on logout/password-change. |
| `pentest-authn-3` | TOTP MFA verification has no per-account lockout — brute-forceable via distributed IPs | `auth.routes.ts:156-168`; `auth.service.ts:119-138`; `mfa.service.ts:43-45` | Lockout (`failedAttempts`/`lockedUntil`, max 5) increments only on bad `bcrypt.compare` in `login()`. `verifyMfaAndIssueTokens` never touches it. Only throttle is per-IP `authLimiter` (20/15min). | Apply the same per-account failed-attempt counter/lockout to MFA verify and disable-MFA, keyed on user. |

### 2.3 HIGH — Safety features (life-critical)

| ID | Title | Location | Impact | Fix |
|---|---|---|---|---|
| `safety-sms-unconfigured-2` | SMS/Twilio unconfigured in prod — phone SOS / live-share / check-in alerts silently never send | `live-share.ts:66-72`; `notifications/sms.ts` | Live probe: live-share to a phone returned `{"sent":false,"reason":"sms_not_configured"}`. Backs SOS and check-in expiry too. Phone-only trusted contacts are **never alerted**. | Configure Twilio in prod, OR loudly gate phone-only contacts and warn at arm time. |
| `safety-liveshare-no-location-3` / `loc-liveshare-no-location-5` / `api-code-9` / `loc-liveshare-static-5` | "Live location" share shows the recipient no coordinates — feature is a stub vs the promise | `share/[token]/page.tsx:26-31`; `live-share.ts:58-61` (email says "sharing their live location") | Copy promises "a live-location link, and a map pin of where you are." Recipient view renders no map/coords. `LiveShareLink` has no lat/lng columns. | Implement coordinate capture/streaming, or rewrite SOS/live-share/email copy to stop claiming live tracking. |
| `api-code-2` | `sendEmail` throws on SMTP failure but `notifyContact` treats it as boolean — one failed email aborts the rest of an emergency fan-out | `notifications/email.ts:16-37`, `index.ts:33,44`, `check-in.service.ts:79-83` | `sendEmail` can only return `ok:true` or throw; the `failed` branch is unreachable; a real SMTP error propagates up and suppresses alerts to the remaining contacts. | Wrap `sendMail` in try/catch returning `{ok:false}`, and/or wrap each `notifyContact` call so one failure can't suppress others. |

### 2.4 HIGH — Compliance / data integrity

| ID | Title | Location | Impact | Fix |
|---|---|---|---|---|
| `api-code-1` | Account hard-delete/purge worker does not exist; soft-deleted user PII retained indefinitely (contradicts GDPR comments) | `retention.worker.ts` vs `auth.service.ts:188`, `auth.routes.ts:104-118` | Comments claim a retention worker hard-deletes users past the grace window; the worker only `deleteMany` on `securityAuditLog`, never the `User` table. Documented-but-unfulfilled compliance control. | Implement a User hard-delete sweep (rely on `onDelete: Cascade`), or correct the comments. (Note: the **web** path hard-deletes immediately — see `auth-purge-cron-ok-8`.) |
| `db-ssl-1` | SSL verify-full hardening regex no-ops when `DATABASE_URL` has no sslmode | `packages/db/src/index.ts:8`; `apps/api/src/lib/prisma.ts:4`; `seed.ts:6` | `.replace(/sslmode=(require\|prefer\|verify-ca)/i,...)` leaves a URL with no `sslmode` unchanged and `sslmode=disable` untouched — the "SSL pinned to verify-full" guarantee silently fails. | Parse the URL and unconditionally set `sslmode=verify-full` (or pass explicit `ssl:{rejectUnauthorized:true,ca}`). Centralize in one helper. |

### 2.5 HIGH — Legal accuracy

| ID | Title | Location | Impact | Fix |
|---|---|---|---|---|
| `legal-accuracy-1` | Canonical Methodology page publishes wrong FBI benchmark (364/1,896) contradicting the numbers the app uses (328/1,548) | `methodology/page.tsx:41-42` vs `safety-score.ts:31` | The page declares itself canonical ("if any in-app caption conflicts, the caption is wrong") yet its benchmark differs from the live constant `FBI_NATIONAL_PER_100K_2025`. | Source the page benchmark from the constant at build time; add a CI assertion. |
| `legal-fbi-year-mislabel-1` | Public methodology + all metadata claim "FBI Crime Data Explorer 2025" but baseline data is 2023/2024 (a year that doesn't exist yet) | `data-vintage.ts:11-12`; `fbi-baselines.ts:40-121`; `methodology/page.tsx:40` | `FBI_DATA_YEAR=2025`/`FBI_DATA_LABEL="FBI Crime Data Explorer 2025"` is stamped on OG images, footer, /cities, methodology — but every new-city baseline row is `year:2023`. | Set `FBI_DATA_YEAR` to true vintage, or render per-source year from baseline rows (as `NationalAverageCard` already does). |

### 2.6 HIGH — Crime-data engine (lagged-feed undercount)

| ID | Title | Location | Impact | Fix |
|---|---|---|---|---|
| `cd-trend-wow-now-anchor` | Citywide trend week-over-week buckets anchor to wall-clock `now`, not data-latest — empty for every lagged feed | `trend-feed.ts:201-211` | In-window cutoff uses `anchorMs` (data-latest) but WoW sub-buckets revert to `now-7d`/`now-14d`, so lagged feeds bucket nothing. | Replace `now` with `anchorMs` at lines 201-202. |
| `cd-upticks-now-anchor` | Uptick detector uses wall-clock now-7d/14d — always empty for lagged feeds; Awareness uptick tile never fires for most cities | `upticks.ts:44-67` | No data-latest anchor like safety-score has. | Mirror trend-feed/safety-score: anchor to freshest in-window timestamp. |
| `ui-tod-1` | TimeOfDayCard always shows empty "no incidents" — fetches `bullets=0` then recomputes histogram from the now-empty dispatch list | `TimeOfDayCard.tsx:159-186,239-259`; `trend-feed.ts:262-264` | `bullets=0` → `bulletCap=0` → `slice(0,0)=[]`; client histogram iterates the empty list. Card is always blank. | Consume server-computed `timeOfDay` buckets, or request enough dispatch bullets. |

### 2.7 HIGH — City coverage / map correctness

| ID | City | Title | Location | Fix |
|---|---|---|---|---|
| `coverage-la-baseline-stale` | Los Angeles | Coverage dashboard under-reports LA ~6x (18 vs 116 neighborhoods) — stale hardcoded baseline | `coverage/baseline.ts:35` | Update to ~116; regenerate baseline from adapter `discover()` output. |
| `coverage-bos-phl-pop-stale` | Boston, Philadelphia | Curated populations keyed to stale district-anchor slugs; 0% match current neighborhood slugs → fall back to peer-share | `neighborhood-populations-generated.ts` (bos-* 12, phl-* 21) | Regenerate ACS-joined pops keyed to current `bos-`/`phl-` slugs; delete orphans. |
| `coverage-clt-pop-inflated` | Charlotte | Per-division population (~1.49M) nearly doubles city pop (~875k), deflating crime rates | `neighborhood-populations-generated.ts:169-182` | Recompute against city-limit polygons or drop to peer-share. |
| `cov-norfolk-pop-missing` | Norfolk | Zero neighborhood population entries (peers have full coverage) | no `nor-` keys; norfolk.geojson 110 polygons | Run ACS/TigerWeb generation for Norfolk Civic League polygons. |
| `cov-phoenix-pop-orphan-1` | Phoenix | Generated pops are ZIP-keyed; never match the village slugs the adapter emits → every Phoenix area loses its census denominator | `neighborhood-populations-generated.ts:1298-1339` vs `phoenix-ckan.ts:224-236` | Re-key to village slugs by summing member-ZIP pops. |
| `cov-denver-token-gap` | Denver | Crime data dead in prod without `DENVER_ARCGIS_TOKEN`, but Coverage dashboard falsely reports it "live" | `denver-arcgis.ts:12-22,94-98`; `coverage/baseline.ts:42` | Provision the token, or set Denver status to honest "warming-up"/"no-data". Add to `.env.example`. |
| `map-sacramento-single-centroid` | Sacramento | Every incident gets the same downtown centroid — all crime-map dots stack on one point | `sacramento-arcgis.ts:78,241-242,273` | Suppress per-incident dots for coordless feeds; leave lat/lng undefined. |
| `coverage-atlanta-centroid-1` | Atlanta | Every discovered neighborhood shares one hardcoded centroid, breaking geolocation snapping | `atlanta-arcgis.ts:135,:55` | Compute centroids from real per-area incident coords (like Indianapolis/Raleigh/Tucson). |

### 2.8 HIGH — Location services

| ID | Title | Location | Fix |
|---|---|---|---|
| `loc-snap-1` | Web lookup ignores `citySlug` for area-snap and uses SD-tuned 20km cap, diverging from Railway's per-city 60km | `apps/web/.../geo/lookup.ts:113-194` vs `apps/api/.../geo/lookup.service.ts:11-41` | Mirror `nearestAreaForCity`; thread `citySlug`; raise/city-aware the cap. |
| `safezone-proximity-coordless-cities` | Proximity alert zones silently never fire for coordless-feed cities (Phoenix, Boise, Saint Paul, Virginia Beach; missing-coord rows in Charlotte/Dallas) | `proximity.worker.ts:57` + adapters | Fall back to area-level alerting, or surface "point-level alerts not available for <city>." |
| `loc-consent-bypass-1` | Trusted-contact consent gate (`permissionAcknowledged`) enforced on the unused Railway API but NOT on the Vercel route the client calls | `apps/web/.../contacts.ts:22-37`, `contacts/route.ts:7-22` | Enforce `permissionAcknowledged` (zod `literal(true)`) + required checkbox in UI. |
| `alerts-amber-latency-1` | AMBER (child-abduction) alerts can lag ~15-20 min behind issuance | `AmberAlertsBanner.tsx:35`; `api-client.ts:17,303`; `amber.ts:16` | Set a 60-90s refresh on the banner; drop AMBER server cache TTL to ~60s. |

### 2.9 HIGH — Performance

| ID | Title | Location | Fix |
|---|---|---|---|
| `perf-web-1` | All 8 backdrop photos fetched eagerly per city (~2MB) while only one is visible; backdrop is in the root layout so it hits landing LCP | `CityBackdrop.tsx:41-64`; `city-photos.ts` | Render only current (+next) photo; reduce to 3-4 photos/city. |
| `perf-geo-1` / `perf-web-2` / `perf-geo-2` | GeoJSON map assets oversized (12-13 decimal precision; Honolulu 2.0MB, SF 1.5MB, Raleigh 1.3MB for 6 polygons) and served with `max-age=0` (re-downloaded per view) | `apps/web/public/geo/*.geojson` (19MB); `CrimeMap.tsx:274`; `next.config.ts:122-126` | Build-time round to 5 decimals + topology-preserving simplify (<150KB/file); add `Cache-Control: immutable` for `/geo/:path*`. |
| `perf-compute-1` | Dispatcher LKG caches unbounded and invisible to the OOM watchdog | `dispatcher.ts:62-64`; `apps/api/src/index.ts:132-163` | Register LKG maps with cache-registry or bound them to an LRU; trim in `evictAllRowCaches`. |
| `perf-compute-2` | Route timeouts abandon but never cancel the heavy compose — timed-out requests keep their compute slot and row arrays | `safezone.routes.ts:47-52`; `ai.routes.ts:46-49,101-104`; `compute-limit.ts:88-92` | Thread an `AbortSignal` from the route timeout through dispatcher to the undici fetch; prefer Redis L2/LKG before the gate. |

---

## 3. Findings by Dimension

### E2E (auth, account lifecycle, safety flows)
- **Critical/High:** MFA bypass, dual-stack, web revocation gap, MFA unreachable, SMS unconfigured, live-share stub (all detailed above).
- **Medium:** `auth-anon-account-accumulation-4` (every device mints a permanent `device-*@travelsafe.local` User row, never purged); `auth-register-deadend-5` (register UI says "removed" but `/register` endpoints still work; login dead-ends through a redirect); `safety-unsupported-city-500-5` (unknown city → 500 instead of 404).
- **Low:** password-length policy mismatch (login min 8 vs register/Express min 12); token-type guard fail-open when `typ` absent; share endpoint leaks userId; check-in armable with **zero** confirmed contacts (silent no-op on expiry).
- **Info (verified clean):** `auth-purge-cron-ok-8` (web hard-deletes immediately; cron fail-closed/401 without secret); brand-split visible in live artifacts.

### Code
- **High:** purge worker missing, email-throw fan-out abort, SSL regex no-op (above).
- **Medium:** `web-nav-1` (Crime Map per-neighborhood CTAs redirect to citywide, dropping area context); `api-code-3` (audit events mislabeled — logout→`auth.token.refresh`, block→`moderation.suspend`); `api-code-4`/`pentest-authz-1` (react/comment/block write FK refs with no existence check → 500 not 404; interact with hidden/rejected posts); `db-post-softdelete-2` (`Post.deletedAt` documented+indexed but never set; feed queries lack the filter); `db-seed-3` (seed creates known-credential demo account with no env guard); `infra-cron-checkin-schedule-mismatch` (cron scheduled daily but comment says "every minute").
- **Low:** focus-steal, legacy-redirect links, `window.location.href` hard nav, `useDocumentTitle` stale restore, proxy forwards Authorization with shared `s-maxage` and no `Vary`, `verifySession` typ fail-open, Promise.race timers never cleared, push digest deep-links to `/threats` stub, dispatcher routes unknown slug to San Diego, empty-normName substring match, soft-delete extension misses `*OrThrow`/aggregate/groupBy, unbounded `/community/posts/mine`, CI gaps (no `packages/db`/`crime-data` typecheck gate; no web/crime-data tests; Vercel uses `npm install` not `npm ci`).
- **Info (verified clean):** JSON-LD not `</script>`-escaped (controlled input today); `SECURITY_AUDIT_RETENTION_DAYS` bypasses zod env; citywide compose uses `MAX_SAFE_INTEGER` per-area limit (intentional); default pg.Pool sizing; stale `NO_CRON_SECRET` comment; rollup-linux pin verified correct.

### Legal
- **High:** wrong FBI benchmark; FBI year mislabel (above).
- **Medium:** `legal-manifest-stale-count-1` (PWA manifest says "37 US cities" + "FBI 2025" vs live 44).
- **Low:** `legal-accuracy-2` (city count inconsistent: About/Methodology 38, Terms 44, registry 44); `legal-coppa-1` (soft client-side age gate; "verifiable" COPPA framing overstated; doesn't block account creation); `legal-brand-1` (Privacy policy lists `travelsafe.*` storage keys + `device-*@travelsafe.local` + github.com/damienmcdade/TravelSafe to users); `legal-notices-stale-credits-1` (THIRD_PARTY_NOTICES says photo attribution "work in progress" but per-photo enumeration shipped); `legal-ccbysa-attribution-form-1` (CC-BY-SA relies solely on a Commons link; author name/license version not shown); `legal-export-filename-brand-1` (data exports download as `travelsafe-account-*.json`).
- **Info (verified clean):** `legal-retention-1` (30-day purge genuinely implemented + scheduled daily 03:30); `legal-attribution-1` (FHA/ECOA prohibited-use language accurate); `legal-911-1` (911 disclaimer present in legal + live UI); `legal-entity-jurisdiction-consistency-1` (CyberWave Technologies LLC consistent). **Notes requiring counsel:** `legal-trademark-no-mark-1` (no ™/® on CommunitySafe); `legal-dmca-agent-unregistered-1` (DMCA agent email-only, no evidence of US Copyright Office registration or physical address — §512(c) safe harbor at risk).

### Quality / UI
- **High:** TimeOfDayCard always-empty (above).
- **Medium:** `ui-card-1` (AreaInsightsPanel leaks raw area slug into header + AI brief); `ui-cards-3` (SavedPlaces empty grey grade dot reads as "Loading…" forever for quiet areas); `ui-a11y-aiassistant-focus-steal`; `ui-consent-broken-promise` (cookie consent can't be changed where the banner says it can; `cs.consent.v1`/`cs.age.v1` absent from Privacy dashboard); `ui-moderation-takedown-no-error` (Take-down silently fails with no feedback).
- **Low:** category enum rendered lowercase-raw; IncidentSummary fallback lowercases proper nouns; two near-duplicate hour-of-day cards on neighborhood page; TimeOfDayChart "{windowDays}-day window" label vs data-anchored buckets; TrustedContacts Remove/Resend no failure feedback; LiveActivityBadge permanently green "Live"; community react/report swallow failures; AdSlot no-AdSense guard is dead code (hardcoded publisher-ID fallback); pricing/onboarding legacy-redirect links; `cityForArea` hardcoded `CITIES[n]` index fragility.
- **Info (verified clean):** tz bucketing/freshness/uptick/severity math sound; clean human-readable labels across 8 sample cities; prefix-routing correct; stale comments (4-photo/30-city counts).

### City–Neighborhood Coverage
See the matrix in §4.

### Penetration Testing
- **Critical:** MFA bypass (above).
- **High:** no web revocation; TOTP no per-account lockout (above).
- **Medium:** `pentest-authn-4` (tokens in localStorage, XSS-exfiltratable; no HttpOnly cookie option); `pentest-authn-5` (web bcrypt 12 / 24h TTL vs API 13 / 15m); `pentest-authn-6` (no password-reset/forgot/change flow + lockout can be weaponized into account-DoS); `pentest-authz-1` (react/comment accept any postId); `pentest-csp-unsafe-inline` (script-src `'unsafe-inline'`, no nonce).
- **Low:** plaintext `mfaSecret` at rest; single `JWT_SECRET` for all token classes; share-token leaks userId; SANDAG SoQL raw interpolation (escaped, but the only such site); `/ai/area-brief` no length-validation; live FBI key in untracked local `.env` (not committed); non-constant-time cron-secret compare; vitest 9.8 RCE (dev-only); nested postcss XSS (build-time); Node v26 vs declared 22.x; missing token/write rate-limiters on `/share/:token`, `/contacts/:id`, `/preferences/alerts`, `/posts/:id/react`, `/posts/:id/review`; CSP unsafe-inline; `/health` leaks brand + heap/cache/compute/commit unauthenticated.
- **Info (verified clean):** ownership scoping correct (no IDOR); moderator RBAC server-side; no prototype pollution sink; no SSRF; no ReDoS; cron/diag authenticated + fail-closed; no client secret/source-map leaks; CSRF model is Bearer-from-localStorage (cookies unused); CORS denies unknown origins; alg:none rejected; account-delete revokes token immediately; login rate-limiter live with generic error (no user enumeration); strong web headers/TLS/HSTS. Brand split surfaces in operator-facing identifiers.

### Location Services
- **High:** web lookup snap divergence; coordless proximity; consent bypass; AMBER latency (above).
- **Medium:** unbounded lat/lng (no range validation, embedded into map links); citywide-vs-national grade disclaimer mismatch; per-area "national average" chip label vs city-relative computation; per-area `cityForArea` SD fallback (wrong-city score with HTTP 200); proximity cooldown suppression (incidents in cooldown permanently dropped); proximity occurredAt-lag miss (lagged-feed records never flagged "fresh"); share userId leak; `getCitywide()` wall-clock window (undercounts lagged feeds); DC ArcGIS silent partial-cache (the Detroit-v99 bug); NWS/AMBER/USGS no fetch timeout; NWS geomatch fragile substring; traffic fallback falsely claims 4 states (GA/VA/OH/CO) have no feed; traffic now()-timestamp sort; FL single-layer traffic.
- **Low (selected):** full-precision coords persisted; per-area window upper-bound inconsistency; micropolygon substring inflation; guaranteed-400 reverse-geocode round-trip; proximity place starvation (>500 places, no cursor); city-bbox first-match routing; Vercel share/confirm no token validation/rate-limit; Twilio discards error body; PHL epoch(0) date fallback; legacy Express `/official-alerts` SD-only still mounted; CHP category-case mismatch; AMBER national fallback on unknown city; HI no traffic entry; fixed 25km radius under-covers large metros.
- **Info (verified clean):** Seattle (-1,-1) sentinel filtered; live-share static-pin honesty; FBI alias naming; check-in grace/latency documented; honest fallback chain + OOM gate; no freshness signal in official-alerts response (improvement noted).

### Crime Maps
Covered in §4 matrix. Many cities verified clean (Minneapolis gold-standard, Colorado Springs, Detroit, Seattle, Pittsburgh, Saint Paul, Fort Worth structural alignment, Denver/Sacramento polygons, Jacksonville/Gainesville/Tampa, Atlanta/Indianapolis/Raleigh/Tucson geometry).

### Performance
- **High:** eager backdrops, oversized/uncached GeoJSON, unbounded LKG caches, uncancelled timed-out composes (above).
- **Medium:** single-area `getSafetyScore` not deduped (full city fan-out per request); trend 742KB→22KB fix opt-in only (default still serves ~760KB); web coverage probe fans 44-city `Promise.all` through a 6-slot gate with stacked timeouts; SavedPlace no `alertsEnabled` index (proximity worker full-scans every 5 min).
- **Low:** AVIF not enabled despite config comment; `/safezone/trend` no per-request timeout; unbounded `/posts/mine`.
- **Info (verified clean):** compute gate/dedupe/watchdog/async-geojson/freshness caps well-engineered; precomputed population table is a compiled static (no runtime cost); getCitywide recompute bounded by dedupe + compute-limit + edge s-maxage.

---

## 4. City Coverage Matrix

**Coverage / population denominator problems:**

| City | Problem | Severity | ID |
|---|---|---|---|
| Los Angeles | Dashboard under-reports 6x (18 vs 116) | High | `coverage-la-baseline-stale` |
| Boston, Philadelphia | Curated pops keyed to stale slugs → peer-share fallback | High | `coverage-bos-phl-pop-stale` |
| Charlotte | Population ~1.49M (≈2× city) deflates rates; areas are 14 patrol divisions | High/Medium | `coverage-clt-pop-inflated`, `coverage-clt-divisions` |
| Norfolk | Zero population entries; all areas share one centroid; org/admin labels exposed | High/Medium/Low | `cov-norfolk-pop-missing`, `cov-norfolk-centroid-collapse`, `cov-norfolk-org-artifacts` |
| Phoenix | Pops ZIP-keyed, never match village slugs; annual snapshot frozen 2025-12-31 (~5mo stale); coordless proximity | High/Medium | `cov-phoenix-pop-orphan-1`, `cov-phoenix-snapshot-stale-3` |
| Denver | Dead without `DENVER_ARCGIS_TOKEN` but reported "live" | High | `cov-denver-token-gap` |
| Baltimore | No curated/generated population; 32 substring-collision polygon pairs can mis-bind | Medium | `coverage-balt-no-pop`, `map-balt-substring-misbind` |
| Atlanta, Indianapolis, Raleigh, Tucson | Absent from generated ACS population table | Medium | `coverage-acs-pop-missing-2` |
| Jacksonville, Virginia Beach, Gainesville, Tampa | Newest 4 cities absent from generated population table | Medium | `coverage-missing-generated-pops` |
| Honolulu, Long Beach, Austin | Zero population entries → polygon-area/peer-share | Low | `cov-no-census-pop-hnl-lb-atx-5` |

**Broken / collapsed-centroid / coordless maps:**

| City | Problem | Severity | ID |
|---|---|---|---|
| Sacramento | Every incident on one downtown centroid (dots stack) | High | `map-sacramento-single-centroid` |
| Atlanta | Every neighborhood shares one hardcoded centroid | High | `coverage-atlanta-centroid-1` |
| Virginia Beach | All 333 areas share one citywide centroid | Medium | `coverage-vb-shared-centroid` |
| Norfolk | All ~50+ areas collapse to one centroid | Medium | `cov-norfolk-centroid-collapse` |
| Boise | Single city-centroid placeholder for all neighborhoods | Low | `cov-boise-centroid-placeholder` |

**Coarse / mislabeled granularity (areas aren't real neighborhoods):**

| City | What users actually get | Severity | ID |
|---|---|---|---|
| Austin | 10 APD patrol sectors labeled "neighborhood" granularity | Medium | `cov-austin-sectors-2` |
| Charlotte | 14 CMPD patrol divisions | Medium | `coverage-clt-divisions` |
| Raleigh | 6 RPD districts (compass directions) | Low | `coverage-raleigh-6-districts-4` |
| Dallas | 24 compass-sector labels; bbox west-edge clipped | Low/Info | `coverage-dal-coarse-labels`, `coverage-dal-bbox-clip`, `coverage-dal-baseline-mismatch` |
| Fort Worth | 6 "FWPD … Division" pseudo-areas selectable | Low | `map-fortworth-division-pseudo-areas` |
| Milwaukee | ~21-22 ZIP-collapsed neighborhoods (190-nbhd city); served geojson has 3 raw-ZIP + 3 suburb artifact polygons; geojson/data divergence | Medium/Low | `cov-mke-artifact-polygons`, `cov-mke-geojson-vs-datafile-divergence`, `cov-mke-coarse-zip-granularity` |
| Virginia Beach | 333 micro-subdivisions; major districts (Oceanfront/Town Center/Bayside) missing | Low | `coverage-vb-subdivision-granularity` |

**Orphan polygons / label-cosmetics (minor):**
- Kansas City: ~10+ misspelled names shown verbatim (`cov-kc-name-typos`, Medium).
- Seattle: lowercase-mid-name / bad-acronym title-casing (`coverage-seattle-titlecase-1`).
- Washington DC: slash/lowercase label fragments (`coverage-dc-label-formatting`).
- Orphans (label without polygon, or vice-versa): NYC Tottenville (`coverage-nyc-tottenville-orphan-2`); Philadelphia Blue Bell Hill (`coverage-phl-blue-bell-hill-orphan`); NOLA Treme/Algiers/New Orleans East fallback labels (`cov-nola-district-fallback-labels`); Cincinnati O'Bryonville (`cov-cin-obryonville`); San Diego O'Farrell (`coverage-sd-ofarrell-orphan`); Honolulu ~76% polygon coverage (`cov-honolulu-polygon-76pct-4`); Buffalo 35 vs claimed 36 (`cov-buffalo-count-mismatch`); LA "Harbor"/"Pacific" division fallbacks (`coverage-la-division-fallback-areas`); NYC PSA/transit precinct fallback labels (`coverage-nyc-precinct-fallback-3`).
- Synthetic "Unmapped" leaks into area catalog: Indianapolis, Tucson (`coverage-unmapped-leak-3`).
- Coverage dashboard: null "newest incident" freshness for LA/SF/Chicago (`coverage-freshness-null-largecities`); Las Vegas/Boise return empty on cold cache, no static seed (`cov-lv-boise-no-cold-fallback`); registry comments stale for Jacksonville/Gainesville/Tampa (`coverage-stale-registry-comments`); Baton Rouge ROW_LIMIT 5000 may truncate the 180-day window (`cov-br-rowlimit-window`).

**Verified-clean cities (reference quality):** Minneapolis (gold standard), Colorado Springs, Detroit, Seattle (geometry), Pittsburgh, Saint Paul, Fort Worth (structural alignment), Cincinnati/NOLA/Baton Rouge/Cambridge coords, Cleveland/Milwaukee/Las Vegas/Boise coords, Denver/Sacramento polygons, Atlanta/Indianapolis/Raleigh/Tucson geometry, Honolulu/Long Beach/Austin/Phoenix geometry, Jacksonville/Gainesville/Tampa.

**[NEEDS HUMAN VERIFICATION]:**
- `cov-sacramento-baseline-stale` (Sacramento baseline 10 vs real ~100-117) — *uncertain verdict.*
- `coverage-maps-integrity-clean` (DC/Boston/Philadelphia/Oakland map geometry clean) — *uncertain verdict.*

---

## 5. The TravelSafe-vs-CommunitySafe Brand / Identity Issue

**Confirmed live and pervasive.** The repo, package scope, internal identifiers, and storage keys say **travelsafe**; everything user-facing says **CommunitySafe**; the operating legal entity is **CyberWave Technologies LLC** with **cyberwaveglobal.com** email/domains.

**Where it surfaces (evidence):**
- **Operator/infra identifiers** (`pentest-brand-1`, `pentest-brand-health-leak`, `pentest-secrets-5`, `safety-brand-split-live-7`): live `/api/health` → `service:"travelsafe-web"`; Railway `/health` → `service:"travelsafe-api"`; package scope `@travelsafe/crime-data`; CSP connect-src `communitysafe-api-production.up.railway.app`. The unauthenticated `/health` leaks the brand split plus heap/cache/compute telemetry.
- **User-visible storage/identifiers** (`ui-cards-4`, `ui-brand-split-confirmed`): localStorage keys `travelsafe.token`, `travelsafe.city.v1`, `travelsafe.assistant.v1`, etc.; anonymous device email `device-*@travelsafe.local` (appears in data exports).
- **User-facing legal/export copy** (`legal-brand-1`, `legal-export-filename-brand-1`): the Privacy policy enumerates `travelsafe.*` keys to users and links `github.com/damienmcdade/TravelSafe`; GDPR data exports download as `travelsafe-account-*.json`.
- **Stale code comment** (`pentest-csrf-stale-native-comment`): CSRF guard says "no native app yet" while a Capacitor iOS WebView ships.

**Legal implications:**
1. **Data-controller identity / GDPR-CCPA clarity.** The named controller in Terms/Privacy must unambiguously be the operator the user is contracting with. A user seeing `travelsafe.local`, `travelsafe.*` keys, and a `damienmcdade/TravelSafe` GitHub link inside a "CommunitySafe" / "CyberWave Technologies LLC" product could reasonably be confused about *who holds their data and emergency-contact PII* — a meaningful concern for a safety app handling location and trusted contacts.
2. **Trademark exposure** (`legal-trademark-no-mark-1`). No ™/® or brand-reservation clause exists for "CommunitySafe," and the public brand differs from both the repo and the legal entity. If CommunitySafe is to be protected/owned, the chain (entity → mark → product) should be explicit and consistent.
3. **Incident-response ambiguity** (`pentest-secrets-5`): operator-facing identifiers split across brands can mislead responders about which entity/host is affected during a security event.

**Recommendation:** Pick one canonical brand for operator-facing identifiers (health `service` id, package display strings, storage-key prefix); reconcile the named data controller across Terms/Privacy; rename user-visible export filenames and device-email domain to CommunitySafe (internal keys may remain as a documented legacy alias); add a one-line Privacy note explaining `travelsafe.*` is CommunitySafe's legacy internal namespace operated by CyberWave Technologies LLC.

---

## 6. Prioritized Remediation Roadmap

### P0 — Ship immediately (exploitable / safety / legal exposure)
| Item | Findings | Effort |
|---|---|---|
| Fix MFA bypass on the web login path (implement `mfaEnabled` branch; never issue token on password-only) | `pentest-authn-1`, `auth-mfa-unreachable-3` | M (1-2 d) |
| Configure Twilio in prod (or loudly gate phone-only contacts) | `safety-sms-unconfigured-2` | S (hrs, config) |
| Fix emergency email fan-out abort (try/catch per contact) | `api-code-2` | S |
| Add per-account lockout to TOTP verify | `pentest-authn-3` | S |
| Correct or remove the wrong FBI benchmark + "2025" year claims | `legal-accuracy-1`, `legal-fbi-year-mislabel-1`, `safetyscore-citywide-grade-disclaimer-mismatch` | S |
| Either implement live-share location or rewrite "live location" copy | `safety-liveshare-no-location-3`, `loc-liveshare-no-location-5`, `api-code-9` | M (copy: S) |
| Implement Express User-purge sweep OR correct the GDPR comments | `api-code-1` | M |

### P1 — Near-term (serious gaps)
| Item | Findings | Effort |
|---|---|---|
| Consolidate to one auth backend; add web tokenVersion revocation + logout; align bcrypt/TTL | `auth-dual-stack-1`, `auth-no-revocation-web-2`, `pentest-authn-2`, `pentest-authn-5` | L (3-5 d) |
| Add password-reset/change flow + unlock-on-reset | `pentest-authn-6` | M |
| Fix lagged-feed undercount across engine (port data-anchor to trend WoW, upticks, getCitywide; fix TimeOfDayCard) | `cd-trend-wow-now-anchor`, `cd-upticks-now-anchor`, `loc-window-anchor-1`, `ui-tod-1` | M |
| Fix SSL verify-full regex (parse + force) | `db-ssl-1` | S |
| Enforce trusted-contact consent on Vercel route | `loc-consent-bypass-1` | S |
| Fix proximity worker: cooldown suppression + occurredAt-lag miss + coordless cities + `alertsEnabled` index | `safezone-proximity-cooldown-suppression`, `safezone-proximity-occurredat-lag-miss`, `safezone-proximity-coordless-cities`, `perf-savedplace-index` | M |
| AMBER latency (faster poll + shorter cache) | `alerts-amber-latency-1` | S |
| Population/coverage fixes for LA, Boston, Philadelphia, Charlotte, Norfolk, Phoenix, Denver; Sacramento/Atlanta/VB centroids | the §4 High/Medium rows | L (data pipeline runs) |
| Validate lat/lng bounds; add fetch timeouts to NWS/AMBER/USGS | `loc-coords-2`, `alerts-no-fetch-timeout-2` | S |
| GeoJSON simplification + immutable caching; AVIF; eager-backdrop fix | `perf-geo-1`, `perf-geo-2`, `perf-web-2`, `perf-web-3`, `perf-web-1` | M |
| Move CSP to nonce-based (drop `unsafe-inline`); reduce `/health` payload | `pentest-csp-unsafe-inline`, `pentest-csp-unsafe-inline-script`, `pentest-health-1`, `pentest-brand-health-leak` | M |
| Brand reconciliation (data-controller, export filenames, device email, identifiers) | §5 cluster | M |
| Encrypt `mfaSecret` at rest; thread AbortSignal through timed-out composes; bound LKG caches | `pentest-authn-7`, `perf-compute-2`, `perf-compute-1` | M |

### P2 — Backlog (correctness/hygiene, lower risk)
| Item | Findings | Effort |
|---|---|---|
| Post visibility/existence checks on react/comment/block | `pentest-authz-1`, `api-code-4` | S |
| Resolve `Post.deletedAt` contract (implement or remove) | `db-post-softdelete-2` | S |
| Env-guard the demo seed account | `db-seed-3` | S |
| Replace legacy redirect-stub links; CTAs to canonical routes | `web-nav-1/2/3`, `api-code-7`, `ui-pricing-onboarding-legacy-redirect-links` | S |
| Replace `cityForArea` positional indices with slug-keyed lookup + per-area 404 | `xcity-hardcoded-index-fragility-4`, `safetyscore-perarea-cityforarea-sd-fallback`, `cd-dispatcher-unknown-area-sd-route` | M |
| Coverage baseline regeneration from adapters; freshness from warm cache | `coverage-freshness-null-largecities`, multiple baseline rows | M |
| Label cosmetics (KC typos, Seattle/DC casing, Norfolk org labels, orphan polygons) | §4 minor rows | M (incremental) |
| CI: typecheck all workspaces, add crime-data/web tests, `npm ci` on Vercel | `infra-ci-*`, `infra-vercel-install-not-ci` | M |
| Dependency bumps (vitest 4.1.8, next patch, Node 22), rate-limiter parity, traffic-honesty copy, fetch timeouts | `pentest-deps-*`, `pentest-ratelimit-*`, `traffic-fallback-honesty-1` | M |
| Move token to HttpOnly cookie (or short access + refresh) | `pentest-authn-4` | L |
| DMCA agent registration + physical address; trademark clause; COPPA framing | `legal-dmca-agent-unregistered-1`, `legal-trademark-no-mark-1`, `legal-coppa-1` | legal process |
| UI failure-feedback (TrustedContacts, moderation take-down, community react/report), LiveActivityBadge health, cookie-consent control | `ui-cards-1`, `ui-moderation-takedown-no-error`, `ui-community-react-report-no-catch`, `ui-cards-2`, `ui-consent-broken-promise` | M |

---

## 7. Verified Clean / No Issues Found

The following were explicitly probed and confirmed sound:

- **Web security headers & transport** — HSTS (2yr, preload), `X-Frame-Options: DENY`, `nosniff`, strict referrer/permissions policy, COOP, HTTP→HTTPS 308, no production source maps, terse error bodies (`pentest-positive-headers`, `pentest-err-1`).
- **AuthZ / IDOR** — owner-scoped WHERE on every per-user object; non-owned/fabricated id → 404; moderator RBAC re-checked server-side per action; alg:none rejected; account-delete revokes token immediately; login limiter live with generic error (`pentest-authz-1/3/4`, `pentest-idor-1`, `pentest-jwt-1`, `pentest-revoke-1`, `pentest-ratelimit-1`, `pentest-cors-1`).
- **No SSRF, no ReDoS, no prototype-pollution sink** (`pentest-ssrf-4`, `pentest-redos-5`, `pentest-protopoll-3`).
- **Secrets hygiene** — all crons/diag fail-closed + authenticated; no client secret/source-map leaks; VAPID correctly split; no committed secrets; install scripts/rollup pin legitimate (`pentest-secrets-3/4`, `pentest-vapid-handling`, `pentest-deps-4`, `infra-rollup-optionaldep-correct`).
- **Account lifecycle (web path)** — immediate transactional hard-delete with Blob erasure + revocation; 30-day purge genuinely implemented and scheduled (`auth-purge-cron-ok-8`, `legal-retention-1`).
- **Legal baseline** — entity/jurisdiction consistent (CyberWave Technologies LLC, CA); FHA/ECOA prohibited-use accurate; 911 disclaimer present in copy and live UI; THIRD_PARTY_NOTICES license inventory complete (`legal-entity-jurisdiction-consistency-1`, `legal-attribution-1`, `legal-911-1`).
- **Crime-data engine quality** — tz bucketing correct; honest fallback chain + production mock-bar + OOM gate/dedupe/watchdog well-engineered; population table is a compiled static (no runtime cost); clean human-readable labels and correct prefix-routing across sampled cities (`ui-trend-tz-ok`, `loc-fallback-honesty-5`, `perf-compute-7`, `perf-pop-precompute-ok`, `xcity-labels-clean-1`, `xcity-prefix-routing-2`, `xcity-copy-brand-3`).
- **Reference-quality city coverage** — Minneapolis (gold standard), Colorado Springs, Detroit, Seattle geometry, Pittsburgh, Saint Paul, Fort Worth alignment, plus valid geometry for the Cleveland/Milwaukee/Las Vegas/Boise, Denver/Sacramento, Atlanta/Indianapolis/Raleigh/Tucson, Honolulu/Long Beach/Austin/Phoenix, and Jacksonville/Gainesville/Tampa sets.

**[NEEDS HUMAN VERIFICATION] (uncertain verdicts):** `cov-sacramento-baseline-stale`, `coverage-maps-integrity-clean` (DC/Boston/Philadelphia/Oakland), `pentest-cors-correct`.

*Five candidate findings were investigated and refuted during the audit; they are excluded from this report.*