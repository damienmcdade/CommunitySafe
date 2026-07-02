# App Store readiness audit — 2026-07-02

End-to-end review of this codebase against the App Store Review Guidelines ahead of
resubmission (iOS + the macOS listing). Companion to
`APPSTORE-REJECTION-FIXES-2026-07-02.md`, which covers the two guidelines cited in the
2026-07-02 rejection (2.1(b), 1.5) and the App Store Connect steps.

Scope: everything App Review can observe — the native shell
(`apps/web/ios/App`), the web layer it renders, and the metadata the binary implies.
Legend: ✅ pass · 🔧 fixed on this branch · ⚠️ open risk / action required.

---

## 1. Safety

| Guideline | Status | Evidence / notes |
|---|---|---|
| 1.1 Objectionable content | ✅ | Content is factual municipal open data + FBI baselines, cited inline. Composer pre-filter blocks slurs, threats, doxxing (addresses, plates, phones, named individuals) and appearance-based profiling (`community/page.tsx`). |
| 1.2 User-generated content | ⚠️ | Pre-moderation filter ✅, per-post **Report** action ✅, published contact ✅ (`/support`, footer). **Gap: no block/mute mechanism** — posts are anonymous, so there is no "block this user" control. Apple's 1.2 checklist explicitly lists "the ability to block abusive users". Recommend a local mute ("hide posts from this author") keyed on the anonymous author token before the next UGC-focused review pass. |
| 1.4 Physical harm | ✅ | App repeatedly disclaims emergency use and routes to 911 (About, Support, Personal Safety). No medical/dosage content. |
| 1.5 Developer information / Support URL | 🔧 | **Was the rejection.** New `/support` page ships in-app and on the web: contact channel (`info@cyberwaveglobal.com`), response times, FAQ, operator disclosure (CyberWave Technologies LLC). Linked from the shared legal footer. ASC Support URL must be set to `https://cyberwaveglobal.com/support` (see fixes doc) — **verify it resolves publicly before resubmitting**. |

## 2. Performance

| Guideline | Status | Evidence / notes |
|---|---|---|
| 2.1 App completeness | 🔧 | No placeholder screens; all footer links resolve (support page added). **Residual risk:** the shell loads the remote site (`capacitor.config.ts` → `server.url`), so with no network the reviewer gets a blank WebView. Recommend a bundled offline error page (Capacitor `errorPath`) or switching to the static-export bundle mode already scaffolded in `next.config.ts`. |
| 2.1(b) IAP completeness | 🔧 | **Was the rejection.** Only purchase reference in the binary was the unreleased "Pro — coming soon" card + waitlist mailto on `/pricing`; now not rendered inside the native shell (`PricingContent.tsx`). No StoreKit code exists and nothing is sold. In ASC: attach zero IAPs, or fully submit them with review screenshots (fixes doc, Path A/B). |
| 2.3 Accurate metadata | ⚠️ | ASC-side: screenshots must show the current UI (`apps/web/scripts/appstore-shots.mjs` regenerates), description must not mention Pro/paid tiers while none are purchasable, and **no `*.vercel.app` URL may remain in any metadata field on either platform's listing**. |
| 2.5.2 Software requirements | ✅ | No dynamic code download; JS runs in WKWebView, which is permitted. |
| 2.5.x Background modes | 🔧 | `UIBackgroundModes` declared `fetch` with **no** fetch/BGTask handler anywhere in the AppDelegate — a classic "declared but unused background mode" flag. Removed; `remote-notification` kept (APNS is implemented, `aps-environment: production`). |
| Export compliance | 🔧 | Added `ITSAppUsesNonExemptEncryption = false` (HTTPS-only, exempt) so uploads don't stall on the encryption questionnaire. |

## 3. Business

| Guideline | Status | Evidence / notes |
|---|---|---|
| 3.1.1 In-app purchase | 🔧 | The waitlist `mailto:` CTA for a future paid tier was an external-purchase-path risk; it no longer renders natively. If Pro ever ships as a digital subscription it **must** use StoreKit — no web checkout or mailto in the binary. |
| 3.2 Other business models | ✅ | No ads in the binary today (AdSense is web-only and deploy-gated per the privacy manifest notes). If ads are ever enabled in the app, revisit ATT + privacy labels. |

## 4. Design

| Guideline | Status | Evidence / notes |
|---|---|---|
| 4.2 Minimum functionality | ⚠️ | **Highest residual risk** (this developer account already saw a 4.3(a) rejection). The shell is a remote-URL WebView. Native differentiation on record: APNS push, WidgetKit widget, haptics, native share sheet, CoreLocation, deep links, hardware-back. The widget/push story only holds if it works — see the App Group fix below. Longer-term: ship the static bundle instead of `server.url`. |
| 4.3 Spam / duplicate apps | ⚠️ | Nothing in-code to fix; keep this listing clearly differentiated from any sibling listings on the same account (distinct name, screenshots, description). Do not ship the same binary under multiple names — that is what 4.3(a) targets. |
| 4.5.4 Push / permission prompts | 🔧 | AppDelegate requested notification permission **unconditionally at first launch** (contextless prompt, and a double-prompt path alongside the in-app Saved Places toggle). Now it only silently re-registers when permission was already granted; the prompt happens in context via `@capacitor/push-notifications`. |
| 4.8 Sign in with Apple | ✅ | Only first-party email/password auth — no third-party/social login, so SIWA is not required. |
| iPad / Mac | ✅ | `TARGETED_DEVICE_FAMILY = 1,2`, full iPad orientation set (rejection was reviewed on iPad Air). No native Mac target: macOS availability is "Mac (Designed for iPad)" in ASC — same binary, so every fix here covers the macOS listing; the ASC metadata steps must be repeated there. |

## 5. Legal / Privacy

| Guideline | Status | Evidence / notes |
|---|---|---|
| 5.1.1(i) Privacy policy + purpose strings | 🔧 | Policy at `/privacy` ✅. Location purpose strings are specific and truthful ✅. Camera/Photo strings are justified (community post photo attach via file input) ✅. **`NSContactsUsageDescription` described an address-book import that does not exist** (trusted contacts are typed manually) — removed, along with the Contacts entry in `PrivacyInfo.xcprivacy`, so declared collection matches reality. Note: the "Always" location string remains but nothing requests Always and there is no `location` background mode — benign, but either implement or drop it when live-share background tracking becomes real. |
| 5.1.1(v) Account deletion | ✅ | In-app, discoverable: Personal Safety → "Your account & data" → hard delete (`/api/account/delete` → `deleteAccount()` cascade) + JSON export. FAQ on `/support` documents the path. |
| 5.1.2 Data use & sharing | ✅ | `NSPrivacyTracking = false`, empty tracking-domain list, no third-party analytics/ad SDKs in the binary, no data sale per policy. ASC privacy "nutrition labels" must declare exactly: email (linked), precise location (linked), crash data, device ID — matching the manifest. |
| Privacy manifest | ✅ | Present (`PrivacyInfo.xcprivacy`) with required-reason API declaration (UserDefaults, CA92.1). |

## Native shell defects fixed during this audit

1. **App Group entitlement missing (widget was broken):** `AppDelegate.swift` and
   `CommunitySafeWidget.swift` share data via `UserDefaults(suiteName: "group.app.communitysafe")`,
   but neither target's `.entitlements` declared `com.apple.security.application-groups`.
   Without it the suite silently isn't shared — the widget always showed the San
   Francisco fallback, undercutting the app's strongest 4.2/4.3 native-functionality
   argument. Both entitlements files now declare the group. **Action:** ensure the
   App Group `group.app.communitysafe` is registered to both bundle IDs
   (`app.communitysafe`, `app.communitysafe.widget`) in the developer portal before
   archiving, or signing will fail.
2. Unused `fetch` background mode removed (see 2.5.x above).
3. Contextless launch-time push prompt removed (see 4.5.4 above).
4. Contacts purpose string + privacy-manifest entry removed (see 5.1.1 above).
5. `ITSAppUsesNonExemptEncryption = false` added.

## Pre-flight checklist for the next binary

- [ ] Register the App Group on both bundle IDs, regenerate provisioning profiles.
- [ ] Bump `CFBundleVersion` past 5 (rejected build was 1.0 (5); `Info.plist` still says 3 — confirm the CI/archive step overrides it).
- [ ] `npm run mobile:sync` then archive from `ios/App/App.xcodeproj`; confirm the widget target builds with the new entitlements.
- [ ] Airplane-mode launch test on device: app must show something other than a blank screen (see 2.1 residual risk).
- [ ] First-launch test: **no** notification prompt until the Saved Places toggle is used.
- [ ] Verify `https://cyberwaveglobal.com/support` resolves logged-out on a phone.
- [ ] ASC: Support/Marketing/Privacy URLs on cyberwaveglobal.com on **both** the iOS and macOS listings; privacy labels match the manifest; IAP Path A or B from the fixes doc; reply in Resolution Center.
