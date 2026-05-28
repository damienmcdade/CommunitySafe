# TravelSafe

# SafeZone Engine: Location-Risk Analytics & Modular UI

A high-performance, fully automated location-risk analytics engine and modular UI tab built for seamless cross-platform integration. SafeZone transforms disparate, raw municipal crime datasets into standardized, street-level safety indexes ("BlockScores"), allowing real-time risk evaluation within any map-based application.

Built natively in **React Native (Expo)** and decoupled via an **API-first backend architecture**, this repository provides a turn-key solution for platforms looking to increase user retention and transaction security by embedding hyper-local safety insights.

---

## 🎯 Target Enterprise Use Cases

*   **Real Estate Platforms:** Embed dynamic neighborhood-level safety ratings directly onto property listing layouts.
*   **Travel & Hospitality Tech:** Power safe-route navigation matrices and accommodation risk screening.
*   **Corporate Duty of Care:** Integrate automated travel-risk notifications and localized geofencing for traveling workforces.

---

## 🛠️ Architecture & Technical Highlights

### 🧠 1. Proprietary Scoring & Data Normalization Pipeline
*   **Weighted Risk Engine:** Rather than dumping raw police blotters on a map, the engine runs a data normalization formula that weights incidents by severity (e.g., separating low-impact property incidents from personal safety threats) to generate a highly accurate, local safety metric.
*   **Low-Cost Automated Scraping:** Scheduled cron functions automatically fetch, sanitize, and index municipal records without requiring manual oversight.

### 📱 2. Modular React Native / Expo Frontend
*   **Decoupled Architecture:** The `SafeZone` map tab is fully encapsulated. It can be copy-pasted into any existing React Native application with zero structural refactoring.
*   **State Optimization:** Leverages optimized regional caching to prevent redundant API map fetches when a user pans across city grids.

### 🌐 3. Multi-Platform Deployment
*   Single-codebase architecture optimized simultaneously for **Web (Vercel/Netlify)**, **iOS (Apple App Store)**, and **Android (Google Play Store)** utilizing Expo Application Services (EAS).

---

## 📁 Repository Structure

```text
├── .github/                    # CI/CD workflows
├── apps/
│   ├── web/                    # Next.js App Router frontend (Vercel)
│   └── api/                    # Express + Prisma backend (Railway)
├── packages/
│   ├── crime-data/             # 37-city open-data adapters + safety-score
│   └── db/                     # Prisma schema + client
├── workers/
│   └── boston-proxy/           # Cloudflare-style CKAN proxy
└── docs/                       # Architecture, methodology, audits
```

---

## 🚀 Quick Start (Local Development)

### Prerequisites
* Node.js v22 (see `package.json` engines)
* npm 9+ with workspace support
* PostgreSQL (Neon free tier works) + Redis (Upstash free tier works)

### Setup & Installation

1. **Clone the repository:**
   ```bash
   git clone https://github.com/damienmcdade/TravelSafe.git
   cd TravelSafe
   ```

2. **Configure environment variables:**
   Copy `.env.example` to `.env.local` at the repo root and fill in the
   `DATABASE_URL`, `REDIS_URL`, `JWT_SECRET`, and AI provider keys. Both
   `apps/web` and `apps/api` read the root `.env.local` by default.

3. **Install + generate Prisma client + build packages:**
   ```bash
   npm install
   npm run db:generate
   npm run build --workspace packages/crime-data
   ```

4. **Run both apps in parallel:**
   ```bash
   npm run dev          # api on :8080, web on :3000
   ```

---

## 📦 Production Deployment

| Surface | Platform | Trigger |
|---|---|---|
| `apps/web` | Vercel | git push to `main` (auto) |
| `apps/api` | Railway | git push to `main` (auto) |
| Database | Neon | managed |
| Redis | Railway plugin | managed |

The legacy build commands below are kept only for reference — the live
deploy path is `git push origin main`.

### Cross-Platform Native Bundling via EAS (legacy / historical):
```bash
# Compile and build iOS Production Target
eas build --platform ios --profile production

# Compile and build Android Production Target (.aab bundle)
eas build --platform android --profile production

# Export Static optimized Web single-page deployment bundle
npx expo export --platform web
```

---

## 💼 Acquisition, Code Licensing & Technical Due Diligence

This codebase was intentionally designed and architected to serve as a drop-in acquisition asset for larger consumer applications. All logic layers—from the spatial database queries to the interface renderings—are fully decoupled and thoroughly documented.

For inquiries regarding **complete asset acquisition**, **proprietary algorithm licensing**, or to request access to our structural core architecture breakdown, please contact:

*   **Principal Developer:** [Damien Gantt-McDade]
*   **Professional Contact:** [damienmcdade17@gmail.com]
*   **Digital Portfolio/LinkedIn:** [www.linkedin.com/in/damien-gantt-mcdade-62a30629a]
---

## Design constraints (read before contributing)

These are **non-negotiable**. They are enforced in code (Prisma schema, post
pre-vetter, registry link-out component) and in review.

1. **No demographic data is ever collected** — no ethnicity, gender, sexual
   orientation, religion, or age fields exist in the schema. Do not add them.
2. **Never display, track, or geolocate individual named people as threats.**
   No threat card may carry a person's name, photo, or attributed crime.
   Threat awareness is **area-level only** (neighborhood / SDPD beat).
3. **Sex-offender info is a link-out** to the official public registry (Megan's
   Law in California by default). We do not re-host or re-display individuals'
   data in-app.
4. **Community posts default to area-level.** The pre-vetter blocks or holds
   for manual review any post that names a specific street address or person.
   Submission UI shows a defamation / accuracy warning before posting.
5. **Data provenance is always shown** — every screen that displays crime data
   surfaces source name, dataset recency, and the note that coverage is
   neighborhood-level (not live street-level).
6. **Personal Safety features** (check-in, live share) are user-initiated and
   use only the user's own location, shared only with their own trusted
   contacts. They are not used to populate any community-facing surface.
7. **The app does not dispatch emergency services.** There is no in-app SOS.
   The Personal Safety tab leads with guidance to dial 911 directly via a
   device-native `tel:` action that must work even if the app backend is down.
8. **Trusted contacts must opt in.** A confirmation link is emailed to each
   newly-added contact; only `CONFIRMED` contacts receive any notification.
9. **Reliability honesty.** Status surfaces show real delivery state, never
   optimistic assumptions; if the API is unreachable at timer-arm time, the
   timer is refused with a visible error rather than armed in a state the
   backend can't honor.

---

## Architecture

```
TravelSafe/                 # npm workspaces monorepo
├── apps/
│   ├── web/                # Next.js (App Router) + Tailwind   → deploys to Vercel
│   └── api/                # Express + JWT + Prisma client     → deploys to Railway
└── packages/
    └── db/                 # Shared Prisma schema + seed       → Railway Postgres
```

The Next.js app calls the Express API over HTTPS using `NEXT_PUBLIC_API_BASE_URL`.
Web Push notifications are signed with VAPID keys held by the API and delivered
via the service worker in `apps/web/public/sw.js`.

### Data sources

| Adapter | Source | Endpoint | Granularity | Use |
|---|---|---|---|---|
| `sandag-socrata` (primary) | SANDAG Crime Data on San Diego County Open Data Portal | `https://data.sandiegocounty.gov/resource/486f-q228.json` | Yearly rates by jurisdiction | `getAreaStats` |
| `sdpd-nibrs` (secondary) | City of San Diego Police NIBRS Crime Offenses | `https://seshat.datasd.org/police_nibrs/pd_nibrs_<year>_datasd.csv` | Incident-level, aggregated to neighborhood/beat, quarterly | `getIncidents`, `getRecentReports` |
| `mock` (fallback) | In-repo sample data, clearly labeled | n/a | Sample | Local dev, rate-limit / outage fallback |

> SDPD/SANDAG data is aggregated to neighborhood/beat level and refreshed
> weekly to quarterly — **not in real time**. The UI must continue to state
> this clearly.

---

## Local development

### Prerequisites

- Node.js 20+ (Railway and Vercel both default to current LTS)
- A PostgreSQL database (Docker one-liner below works fine)
- `npm` 10+

### One-time setup

```bash
git clone git@github.com:damienmcdade/TravelSafe.git
cd TravelSafe
cp .env.example .env             # fill in values
npm install
docker run --name travelsafe-pg -e POSTGRES_PASSWORD=postgres -p 5432:5432 -d postgres:16
npm run db:generate
npm run db:migrate -- --name init
npm run db:seed
```

### Run

```bash
npm run dev      # starts apps/web (3000) and apps/api (4000) in parallel
```

Other useful scripts:

```bash
npm run db:studio    # Prisma Studio
npm run typecheck    # type-check every workspace
npm run lint         # lint every workspace
```

---

## Deploy

### Vercel (apps/web)

1. `vercel link` from the repo root (the included `vercel.json` points at
   `apps/web` as the project root).
2. In the Vercel dashboard, set environment variables from `.env.example`.
   The web app only needs the `NEXT_PUBLIC_*` ones at build time.
3. `vercel --prod` (or push to `main` if Git integration is enabled).

### Railway (apps/api + Postgres)

1. Create a new Railway project and add the **Postgres** plugin — it sets
   `DATABASE_URL` for you.
2. Add a service from this repo. The included `railway.json` builds with
   `npm install && db:generate && build:api`, then at boot runs
   `db:push && start:api` with `/health` as the healthcheck path.
   `db:push` syncs the Prisma schema to Postgres directly (no migration
   files required) — suitable for a project pre-launch. Once you have
   production data to preserve, replace `db:push` with `db:migrate:deploy`
   in `railway.json` and check committed migration files into
   `packages/db/prisma/migrations/`.
3. Set the remaining env vars (`JWT_SECRET`, `VAPID_*`, `CORS_ORIGINS` —
   include your Vercel URL).
4. Copy the public Railway URL of the API service into Vercel as
   `NEXT_PUBLIC_API_BASE_URL` and redeploy the web app.

### Pushing to GitHub

```bash
git add .
git commit -m "Initial TravelSafe scaffold"
git push -u origin main
```

The GitHub remote `origin` was set when the repo was cloned —
`git remote -v` should show `damienmcdade/TravelSafe`.

---

## Environment variables

See [`.env.example`](./.env.example) for the full annotated list. Highlights:

| Variable | Required by | Notes |
|---|---|---|
| `DATABASE_URL` | api, db | Provided automatically by Railway Postgres |
| `JWT_SECRET` | api | Generate with `openssl rand -base64 48` |
| `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` | api | Generate with `npx web-push generate-vapid-keys` |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | web | Mirror of the public key, exposed to the browser |
| `NEXT_PUBLIC_API_BASE_URL` | web | Vercel needs this set to the Railway API URL |
| `SANDAG_SOCRATA_APP_TOKEN` | api | Optional; raises Socrata rate limit |
| `CRIME_DATA_ADAPTER` | api | `auto` (default), `sandag`, `sdpd`, or `mock` |

---

## Feature map

| Tab / Screen | Path | Backend route |
|---|---|---|
| Welcome (no sign-up required) | `/` | — links straight to `/threats`; auth is optional |
| Register / login | `/register`, `/login` | `POST /auth/register`, `POST /auth/login` — only needed for posting / trusted contacts / check-in timer |
| Awareness (citywide by default) | `/threats` | `GET /crime-data/citywide`, `GET /crime-data/insights?…`, location search via `GET /geo/lookup`, geo opt-in |
| Crime Map | `/map` | Leaflet + OpenStreetMap, circle markers per neighborhood sized by incident volume + calm color bands |
| Official alerts sidebar | (on TravelSafe + Neighborhood Watch) | `GET /official-alerts` — currently National Weather Service; SDPD press releases and CHP TODO |
| Live community pulse | (on TravelSafe) | `GET /community/stream` (SSE) — new VERIFIED posts insert in real time |
| AI compose coach | (in TravelSafe composer) | `POST /ai/compose-feedback` streams from `anthropic/claude-haiku-4-5` via Vercel AI Gateway; falls back silently when `AI_GATEWAY_API_KEY` is unset |
| Onboarding — alert categories | `/onboarding/alert-preferences` | `PUT /preferences/alerts` |
| Onboarding — trusted contacts | `/onboarding/trusted-contacts` | `POST /contacts`, `GET /contacts` (max 5) |
| Threat Detection | `/threats` | `GET /crime-data/alerts?neighborhood=…` + push when entering higher-incident area |
| Personal Safety | `/safety` | Emergency-call guidance + check-in timer + live-share. **No in-app SOS / alert dispatch.** See below. |
| &nbsp;&nbsp;↳ 911 dial | | client-side `tel:911` link — never depends on backend |
| &nbsp;&nbsp;↳ Check on me | | `POST /safety/check-in`, `POST /safety/check-in/:id/safe` (server-side worker fires expiries) |
| &nbsp;&nbsp;↳ Live share | | `POST /safety/live-share`, `GET /share/:token` (web), `DELETE /safety/live-share/:id` |
| &nbsp;&nbsp;↳ Safe route | | `POST /safety/safe-route` (area-risk flagged, area-level only) |
| Trusted contact opt-in | `/contacts/confirm/:token` | `POST /contacts/:id/confirm`, `POST /contacts/:id/resend` |
| TravelSafe — City Scanner | `/community` | `GET /crime-data/area-stats?jurisdiction=…`, `GET /community/posts` |
| Official registry link-out | `/community` (panel) | static link, never re-displays individuals |
| Submit warning | `/community` (modal) | `POST /community/posts` → pre-vetter → verification queue |
| Report / block / mute | `/community` | `POST /moderation/reports`, `POST /moderation/block`, `POST /moderation/mute` |
| Neighborhood Watch | `/neighborhood` | `GET /neighborhood/feed?neighborhood=…` |

### Community post verification rules

1. Submission UI requires the user to acknowledge a defamation / accuracy
   warning.
2. The pre-vetter (`services/moderation/post-prevet.ts`) inspects the draft:
   - posts containing a likely street address (`/\d+\s+\w+\s+(st|ave|blvd|…)/i`)
     or a likely personal name are **held for manual review**, not auto-published;
   - profanity-filtered terms are flagged;
   - rate-limit: max N posts / user / hour.
3. Posts that pass the pre-vetter enter the queue as `PENDING`. A moderator
   moves them to `VERIFIED` or `REJECTED`. Only `VERIFIED` posts surface in the
   community feed by default; `PENDING` posts are visible only to the author.

---

## License

Source code: All Rights Reserved (proprietary). Public crime-data
adapters wrap third-party open-data sources; their terms are described
in `THIRD_PARTY_NOTICES.md`. No license is granted to use, copy,
modify, or distribute this code without explicit written permission
from the project owner.

For inquiries: open an issue at
https://github.com/damienmcdade/TravelSafe/issues
