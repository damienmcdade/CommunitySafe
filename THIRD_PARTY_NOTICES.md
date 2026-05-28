# Third-Party Notices

TravelSafe (the "Software") incorporates the open-source components
listed below. This document satisfies attribution + notice requirements
for the cited licenses. For full license text see each package's
own LICENSE file under `node_modules/<package>/`.

## Notable copyleft / file-level copyleft

| Package | License | Notes |
|---|---|---|
| `@img/sharp-libvips-darwin-arm64` (and friends) | LGPL-3.0-or-later (via libvips) | Dynamically linked native lib used by Next/Image. Per LGPL §4 we acknowledge libvips and confirm the lib is not statically linked. Source: <https://github.com/libvips/libvips>. |
| `web-push` | MPL-2.0 | File-level copyleft. We use the package unmodified; if you fork TravelSafe, preserve the original MPL-2.0 headers on any web-push file you modify. Source: <https://github.com/web-push-libs/web-push>. |

## Permissive (MIT / Apache-2.0 / BSD)

The bulk of the dependency tree (`next`, `react`, `@prisma/client`,
`express`, `cors`, `helmet`, `morgan`, `zod`, `bcryptjs`, `jsonwebtoken`,
`undici`, `leaflet`, `react-leaflet`, `geojson`, `tailwindcss`,
`typescript`, etc.) is published under permissive licenses (MIT,
Apache-2.0, BSD-2-Clause, BSD-3-Clause, ISC). No additional
notice or source-disclosure requirements apply beyond keeping the
license text in `node_modules/<package>/`.

## City open-data attribution

Crime-data adapters carry a per-source `PROVENANCE` constant
documenting the dataset URL, refresh cadence, and granularity for
each city (`packages/crime-data/src/adapters/*.ts`). The UI surfaces
this provenance via `apps/web/src/components/DataProvenanceBanner.tsx`
on every safety-score and neighborhood page.

Specific city portals require attribution to the publishing agency
when redistributing data. TravelSafe satisfies this by:

- Naming each city's police agency in the user-facing source line.
- Linking to the underlying dataset page in the provenance banner.
- Excluding victim/suspect demographic columns at ingest per each
  adapter's keyword filter (see adapter source headers).

## Basemap attribution

Map tiles come from CARTO + OpenStreetMap. Attribution is rendered
inline in the Leaflet container per OSM's policy
(`apps/web/src/app/(app)/map/CrimeMap.tsx`, `route/RouteMap.tsx`):

> &copy; OpenStreetMap contributors &copy; CARTO

## CC-BY-SA imagery (work in progress)

City backdrop photography sourced from Wikimedia Commons under
CC-BY-SA 4.0 requires per-work creator + license enumeration
(§3(a)(1) of the license). `apps/web/src/app/credits/page.tsx`
currently uses a template-style attribution; per-photo enumeration
is a tracked improvement before public launch.

## How to update this file

Run `npx license-checker --production --json > /tmp/lc.json` from
the repo root and review for any newly-introduced GPL/AGPL/SSPL
deps. Add any new copyleft entries to the table above.
