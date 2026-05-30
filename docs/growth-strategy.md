# CommunitySafe Growth & Retention Strategy

Working strategy for acquisition, activation, retention, and referral.
Reflects the product as of the IA v3 redesign (commits `0d6a13d` +
follow-ups). Not a fundraising deck — an operating plan.

## Target user

Two primary personas, sharing one mental model:

1. **The traveler.** Booking a trip, looking up a city they don't know.
   Wants quick triage ("is this safe?"), neighborhood comparison, and
   a "what should I avoid?" answer in 30 seconds.
2. **The neighborhood-aware resident.** Lives in the city already.
   Watches trends, plans evening routes, monitors their commute.

Both want **signal over noise**, **verifiable sources**, and a
**calm tone** — not fear marketing, not Citizen's neon push pings.

Anti-persona: doom-scrollers who want to feel afraid. The product
intentionally underserves them — that's a feature, not a bug.

## Acquisition

### SEO (highest leverage)

- **Per-city landing pages** — the `/cities/[city]` route already
  exists. Every city + every neighborhood is a long-tail search
  target ("Is Pacific Beach San Diego safe?", "Crime in Logan Square
  Chicago"). Goal: rank in the top 5 for every supported
  city+neighborhood combination by EOY 2026.
- **Comparison pages** — "Pacific Beach vs Mission Beach safety
  comparison" type pages. We already have the data; cost is mostly
  programmatic SEO + careful SSR.
- **Methodology pages** — explainer content ("How is the Safety Score
  computed?", "What is NIBRS?") earns inbound from "what does X
  mean" searches and builds trust signals for the data.

### Social

- **Twitter/X** — a `@CommunitySafeApp` account that posts non-alarming
  weekly summaries: "5 quietest neighborhoods in Chicago this week"
  rather than "shooting reported in X". The calm tone IS the
  differentiator from Citizen — lean into it.
- **TikTok / Reels** — short "before you travel to X, here are 3
  neighborhoods we like" videos. Travel-creator partnerships are a
  natural fit; no paid endorsements, just data they can cite.
- **Reddit** — answer questions in r/travel, r/SanFrancisco, etc.
  with cited CommunitySafe data + the methodology link. Earned, not
  spammy.

### Partnerships

- **Airbnb / Vrbo plugins** — guest-facing "safety briefing for your
  stay" widget. Hosts get a feature differentiator; we get
  distribution. Sales motion: outbound to Superhosts in our
  best-covered cities.
- **University study-abroad / corporate-relocation programs** —
  white-label the safety briefing into their onboarding materials.
  These are bulk-license deals (Pro tier candidate).
- **Insurance carriers** — travel-insurance bundle "free safety
  briefing with every policy" type partnerships.

### Paid

Deferred until organic + partnership channels show steady-state
acquisition costs. Paid social for a safety product can backfire
quickly — algorithmic ad delivery favors fear, which conflicts with
the brand. If/when we do paid, prefer Google search (intent-matched)
over social.

## Activation

The first-run experience needs to deliver value within 30 seconds.
The current /now landing accomplishes most of this — improvements:

1. **City auto-detect on first load** — already done via the
   geolocation-resolve flow. Onboarding: show the city banner +
   ask "Is this you?" with a quick switcher.
2. **First-visit walkthrough** — 3-step coachmark sequence:
   "1) Your city's overall safety pulse, 2) Drill into your
   neighborhood, 3) Plan a safe route." Skip-able. Persists
   completion in localStorage so it never shows twice.
3. **Empty-state messaging** — when an area has no data, the page
   currently shows "no incidents in window — that's normal for many
   areas". This is already good; could add a "what would I see here
   if there were incidents?" sample state with a watermark.

## Retention

### Notification cadence (the durable retention lever)

- **Default to daily digest** — already done. Once-daily, one
  notification, summarized. Counter-positioned against the
  notification-fatigue model.
- **Smart muting** — if a user hasn't opened a notification in 7
  days, drop the cadence to weekly automatically. If they still
  don't engage, pause and prompt them to re-enable on next visit.
- **Trip-window notifications** — when a user pins a city +
  date-range (Pro feature), surface notifications specifically for
  that trip rather than the user's home city. Adds value to the
  travel persona specifically.

### Saved areas + cross-area dashboards

- **Saved areas** are already in the local store. A logged-in user
  could sync them server-side (Pro feature) and see a "your saved
  areas" digest. This is the strongest retention hook for the
  resident persona.
- **"Things changed since your last visit"** — when a returning user
  opens the app, surface a top-of-feed card: "Since you last
  visited X days ago, here's what shifted in your saved areas."
  Calm tone, data-grounded.

### Content rhythm

- Weekly "What we changed this week" log on a `/changelog` page,
  shared to social. Builds trust + gives returning users a reason
  to check back beyond their own area's data.
- Monthly "City pulse" blog post per supported city. Programmatically
  generated from the API, lightly edited. Indexed for SEO + share-
  able by partners.

## Referral

- **Shareable per-city briefing URLs** — already supported via
  deep-linking. Add a "Share this briefing" button that copies a
  short URL pre-populated with the current city + area + time
  window.
- **Trusted-contact invite flow** — the Personal Safety tab's
  trusted contacts already require email confirmation; this could
  double as a soft referral channel ("Trusted contacts: [accept]
  [or set up your own CommunitySafe]").
- **No financial incentive program** — no "refer a friend, get $5"
  schemes. They erode trust in a safety product.

## Metrics to watch

### North-star metric

**Weekly active areas** — the count of unique (user, area) pairs
that received at least one open per week. Combines neighborhood
engagement (residents) with travel research (travelers) into one
number that goes up when the product is working.

### Acquisition

- Organic traffic by city (SEO health)
- Direct loads from `/cities/[city]` pages (long-tail working)
- First-visit conversion to logged-in (anonymous device session
  exists today; account creation is currently zero-friction
  since it's not required — track the conversion when we start
  gating Pro features)

### Activation

- Time to first neighborhood pick (target <30s)
- % of first sessions that hit at least 2 cards (Awareness +
  Safety Score)
- % that enable notifications (target conservative: 8-12%)

### Retention

- 7-day, 30-day, 90-day return rate
- Notification open rate per cadence (digest vs real-time vs paused)
- % of returning users with ≥1 saved area

### Referral

- Share URL clicks per share
- New users attributed to shared URLs vs organic

## What we explicitly will not do

- **Push notifications with body text describing recent incidents**.
  Other apps do this and it works for engagement; it conflicts with
  the calm-UX commitment.
- **Lifetime-value optimization that incentivizes more alarming
  copy** in the daily digest. Even if it lifts open rates.
- **Personalization that exploits anxiety patterns**. No "based on
  your interest in X, we recommend Y" loops on safety topics.
- **Data sale of any kind**. Even aggregated, even anonymized.

## 6-month execution plan

| Month | Acquisition | Activation | Retention |
|-------|-------------|------------|-----------|
| 1 | SEO sprint on `/cities/[city]` pages; submit sitemap; schema markup | First-run walkthrough | "Since you last visited" card |
| 2 | First batch of comparison pages (top 5 cities × 10 neighborhoods) | City auto-detect prompt | Smart-mute on stale notifications |
| 3 | Twitter weekly digest | Sample-data empty states | Saved-areas server sync (Pro alpha) |
| 4 | TikTok partnerships (3-5 creators) | A/B test the walkthrough | Weekly digest editor |
| 5 | Airbnb plugin pilot (1-2 hosts) | — | Trip-window notifications (Pro beta) |
| 6 | Insurance carrier outreach | — | Pro launch |
