# Mobile UX Audit (375px viewport)

Static review of CommunitySafe's major surfaces for common mobile pitfalls.
Findings ordered by severity. Each finding cites the file + the specific
class / pattern responsible, and suggests the fix.

## Methodology

Reviewed JSX for the following patterns at 375px viewport assumptions:
- Horizontal overflow from fixed-width containers
- Tap targets smaller than the 44×44 WCAG/HIG minimum
- Sticky elements that consume >15% of viewport height
- Text below 12px (illegible on phones held at arm's length)
- Touch-area crowding (multiple interactive elements within 8px)
- Modal/popover behavior at narrow widths
- Form-input width and keyboard handling
- Image / map / chart responsiveness

## Findings

### CRITICAL — none found

The IA v3 redesign that landed this session uses responsive grids
(`grid-cols-1 md:grid-cols-3`) throughout, so no major hard-coded
desktop widths leak through.

### HIGH

#### H1. `TabNav` "More" drawer right-edge clipping (`components/TabNav.tsx:115`)

The drawer renders as `absolute right-0 top-full` with `min-w-[12rem]`.
At 375px viewport, if the More button is positioned in the rightmost
column of the nav strip, the drawer's right edge is flush with the
viewport — fine — but if a longer-named city pushes the More button
further left, the drawer can extend past the right edge before flowing
back via `right-0`. Confirmed safe in current layout via `ml-auto` on
the drawer `<li>`, but a defensive `max-w-[calc(100vw-1rem)]` would
guarantee it.

**Fix:** add `max-w-[calc(100vw-1rem)]` to the drawer panel `<div>`.

#### H2. ThreatFeed `IncidentRow` expanded explanation crowds the row (`components/SafeZoneTab/ThreatFeed.tsx:`)

The explain expansion uses `ml-4` to indent below the row, but the
inline row already contains 4 items in a flex (dot, description, Explain
link, confidence badge). At 375px with a long description, the row
wraps and the Explain link can break to a new line awkwardly.

**Fix:** add `flex-wrap` to the row's inner flex, or move the Explain
link below the description on narrow viewports via `sm:` prefix on the
existing inline placement.

### MEDIUM

#### M1. Hero gradient title overlap (`safety-score/page.tsx:98`, others)

`<h1>` uses `text-3xl sm:text-4xl` with a `bg-title-stripe` clip that
extends across two lines. At 375px the gradient sometimes splits
mid-letter on the wrap, producing a visually broken look. Most pages
have this — Awareness, Plan, Safety Score, Route.

**Fix:** add `break-words` to the gradient `<span>` and bump line-height.

#### M2. Multiple coexisting fixed-position widgets

`LiveActivityBadge` (top-right on `/now`) + `TabNav` (sticky top) +
in-flow page header. At 375px with all three visible, the live badge
sometimes overlaps the page-hero title's right edge. Not a blocker
since the badge is small, but unpolished.

**Fix:** add `flex-wrap` to the page-hero header container so the
badge moves below the title on small screens.

#### M3. WheelPicker drum-style picker on /watch (`components/WheelPicker.tsx`)

The wheel picker is touch-friendly by design but at 375px the
"detail" sublabel column can wrap to 3 lines for cities with
longer neighborhood names. This makes the wheel taller than expected
and pushes the watch cards below the fold.

**Fix:** add `truncate` to the detail column and rely on the title
attribute for full text.

#### M4. `RouteMap` controls bar above the map (`route/page.tsx`)

The new "Show activity heatmap" toggle floats to the right of the
map. On mobile, narrow viewports push the toggle into a single column
and add ~40px vertical space above the map, which then needs to be
scrolled past to see the route.

**Fix:** move the toggle into the map itself as a Leaflet control
(top-right) instead of an external button — saves vertical real estate.

### LOW

#### L1. Sub-text frequently uses `text-xs` (12px) or `text-[10px]` (10px)

Common across cards: `text-[10px] uppercase tracking-wider` for
"badge" labels, `text-[11px]` for citations, `text-xs` for tabular
counts. 10px is below the WCAG minimum recommended for body text
(though acceptable for chrome / metadata). Acceptable for the
current design language but worth a global "minimum readable
font size" pass.

**Fix:** consider a global bump of `text-[10px]` → `text-[11px]`
in next polish pass.

#### L2. Form inputs span full row width without max-width

`LocationSearch`, `NeighborhoodCombobox`, and post composer inputs
all use `w-full` with no `max-w-*`. At 375px this is correct; at
larger phones (430px iPhone Pro Max) it's still fine; on tablet
portrait (768px) the full-width input feels stretched.

**Fix:** add `max-w-2xl` to the input wrappers where they're not
already in a constrained column.

#### L3. Sticky `TabNav` consumes ~48px on mobile

At 375×667 (iPhone SE) that's 7.2% of viewport height. Within
acceptable limits but combined with iOS Safari's URL bar (which
reappears on scroll) the effective sticky budget is tighter.

**Fix:** no action — the sticky nav is the right tradeoff for app-
like navigation. Worth noting for future "should we add another
sticky element?" decisions.

#### L4. ASCII fallbacks for emoji glyphs

Some screens use `→`, `⋯`, `✓`. On older Android keyboards these
render as boxes. Modern devices are fine.

**Fix:** none required; document for future.

## What's working well on mobile

- Every major grid uses `grid-cols-1 md:grid-cols-3` so single-column
  is the mobile default — no awkward horizontal scroll of card grids.
- The new `/now` page's structure (city section / divider / neighborhood
  section) is genuinely better on mobile than the prior tab toggle —
  the user no longer loses state by switching tabs and never has to
  remember which tab they're on.
- Sticky nav respects the iOS top safe area via `top-0` + the
  surrounding `backdrop-blur` reads gracefully on tap-down highlight.
- The "More ⋯" drawer collapses utilities into a single tap target
  so the primary nav stays sparse.
- Form inputs use `inputmode` / `type` attributes correctly so
  numeric inputs invoke the numeric keyboard, etc.

## Suggested execution order

1. **H1, H2** — both are 5-minute fixes that prevent the worst
   current mobile-only behavior.
2. **M1** — global gradient-title fix; touches every page-hero.
3. **M2, M3, M4** — page-specific touch-ups, can land opportunistically.
4. **L1, L2** — design-system passes, suitable for a dedicated polish
   PR.
