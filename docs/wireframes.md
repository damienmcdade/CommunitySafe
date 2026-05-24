# TravelSafe Wireframes — Post-IA-v3

ASCII wireframes for the 4 primary destinations + drawer routes at
desktop (1280px) and mobile (375px) breakpoints. Reflects the IA
shipped in commit `0d6a13d` (Now / Plan / Act / Map + drawer).

Legend:
- `[X]` = button
- `_____` = input
- `===` = section divider
- `▼` = expandable
- `(I)` = info icon
- `(★)` = save-area star

---

## /now — Unified Awareness

### Desktop (1280px)

```
+----------------------------------------------------------------------+
|  TabNav: [Now*]  [Plan]  [Act]  [Map]                       [⋯ More] |
+----------------------------------------------------------------------+
| PAGE HERO                                                            |
| Now · San Diego                                                      |
| What's happening in {NEIGHBORHOOD | CITY}     [● Live activity badge]|
+----------------------------------------------------------------------+
|                                                                      |
| === City section ===                                  Jump to area ↓ |
|                                                                      |
| +----------------------+----+   +---------------------------+        |
| | BlockScore (city)    |    |   | ThreatFeed (city)         |        |
| | Grade: B (87/100)    |    |   | • dispatch • Explain  [tag]        |
| +----------------------+----+   | • dispatch • Explain  [tag]        |
|                                 +---------------------------+        |
|                                                                      |
| +-----------------------+  +-------------------+                     |
| | IncidentSummaryCard   |  | Hotspot card      |                     |
| | Severity: moderate ↑  |  | 1. Downtown       |                     |
| +-----------------------+  | 2. Pacific Beach  |                     |
|                            +-------------------+                     |
| +-----------------------+  +-------------------+                     |
| | CrimeChart (city)     |  | UptickTile        |                     |
| | [7d][30d][90d]…       |  +-------------------+                     |
| +-----------------------+  +-------------------+                     |
|                            | NewsPanel         |                     |
| +-----------------------+  +-------------------+                     |
| | DataProvenanceBanner  |  +-------------------+                     |
| +-----------------------+  | OfficialAlerts    |                     |
|                            +-------------------+                     |
|  ―――――――――― divider ――――――――――                                       |
|                                                                      |
| === Neighborhood section ===                            ↑ Back to city
|                                                                      |
|  {Area picker}_____________________  [Use my location][Notifications]|
|                                                                      |
|  (when area picked:)                                                 |
|  +----------------------+----+   +---------------------------+       |
|  | BlockScore (area)    |    |   | ThreatFeed (area)         |       |
|  +----------------------+----+   +---------------------------+       |
|                                                                      |
|  +-----------------------+   +-------------------+                   |
|  | IncidentSummary(area) |   | NewsPanel(area)   |                   |
|  +-----------------------+   +-------------------+                   |
|  +-----------------------+                                           |
|  | AreaBriefPanel        |                                           |
|  +-----------------------+                                           |
|  +-----------------------+                                           |
|  | CrimeChart (area)     |                                           |
|  +-----------------------+                                           |
|  +-----------------------+                                           |
|  | CrimeMixCard          |                                           |
|  +-----------------------+                                           |
|  +-----------------------+                                           |
|  | TimeOfDayCard         |                                           |
|  +-----------------------+                                           |
|                                                                      |
+----------------------------------------------------------------------+
```

### Mobile (375px)

```
+-------------------------+
| [Now*][Plan][Act][Map][⋯]
+-------------------------+
| HERO                    |
| Now · San Diego         |
| {Neighborhood/City}     |
| [● live]                |
+-------------------------+
| === City section ===    |
|                         |
| [BlockScore (city)]     |
| [ThreatFeed (city)]     |
| [IncidentSummary]       |
| [CrimeChart]            |
| [HotspotCard]           |
| [UptickTile]            |
| [NewsPanel]             |
| [OfficialAlerts]        |
| [DataProvenance]        |
|                         |
| ―― divider ――           |
|                         |
| === Neighborhood ===    |
| _____ Search _____      |
| [Use my location]       |
| [Notifications]         |
|                         |
| (when picked:)          |
| [BlockScore (area)]     |
| [ThreatFeed (area)]     |
| [IncidentSummary(area)] |
| [AreaBrief]             |
| [CrimeChart (area)]     |
| [CrimeMixCard]          |
| [TimeOfDayCard]         |
| [NewsPanel (area)]      |
+-------------------------+
```

---

## /plan — Investigate hub (Score + Route)

### Desktop

```
+----------------------------------------------------------------------+
|  TabNav: [Now]  [Plan*]  [Act]  [Map]                       [⋯ More] |
+----------------------------------------------------------------------+
| Sub-tabs:  [Safety Score*]  [Safe Route]                             |
+----------------------------------------------------------------------+
|                                                                      |
| (Score tab renders SafetyScorePage:)                                 |
| +----------------------------------------------------------------+   |
| | HERO: How {city} compares to FBI national average              |   |
| +----------------------------------------------------------------+   |
| | (if area picked:)                                              |   |
| | Showing {area} · drill-down view (★) [← Back to city]          |   |
| +----------------------------------------------------------------+   |
| | SafeZoneAreaPicker (drill-into-a-neighborhood)                 |   |
| +----------------------------------------------------------------+   |
| | [Both][Violent only][Property only]    Show: ___ (chips)       |   |
| +----------------------------------------------------------------+   |
| | ScoreReport:                                                   |   |
| |  +--Grade card-------+                                          |  |
| |  | A   {label}        |  (population, window, asOf)            |   |
| |  +-------------------+                                          |  |
| |  +--Per-category bars-+                                         |  |
| |  | Violent          [bar][bar][bar]                            |   |
| |  | Property         [bar][bar][bar]                            |   |
| |  +-------------------+                                          |  |
| +----------------------------------------------------------------+   |
| | [+ Compare with another neighborhood]                           |  |
| +----------------------------------------------------------------+   |
| | TrendPanel (h3, mounted inline):                                |  |
| |  [7d][14d][30d][90d] window                                    |   |
| |  rolling timeline of police reports                            |   |
| |  +--Hour-of-day histogram--+                                    |  |
| +----------------------------------------------------------------+   |
|                                                                      |
+----------------------------------------------------------------------+

(Route tab renders SafeRoutePage, swapping the entire panel on click)
```

### Mobile

```
+-------------------------+
| Tabs (truncated)        |
+-------------------------+
| [Score*] [Route]        |
+-------------------------+
| HERO                    |
| Plan · {city}           |
+-------------------------+
| (Showing {area} ★)      |
| [← city]                |
+-------------------------+
| [Picker]                |
+-------------------------+
| [Filter chips]          |
+-------------------------+
| Grade card (full width) |
| {A}  {label}            |
| (meta)                  |
+-------------------------+
| Violent bars            |
| Property bars           |
+-------------------------+
| [+ Compare]             |
+-------------------------+
| TrendPanel              |
| Window: [7][14][30][90] |
| Timeline ...            |
+-------------------------+
```

---

## /act — Tools hub (Personal Safety + Community)

### Desktop

```
+----------------------------------------------------------------------+
|  TabNav: [Now]  [Plan]  [Act*]  [Map]                       [⋯ More] |
+----------------------------------------------------------------------+
| Sub-tabs:  [Personal Safety*]  [CommunitySafe]                       |
+----------------------------------------------------------------------+
| (Personal Safety tab renders SafetyPage:)                            |
| +----------------------------------+  +---------------------------+  |
| | Emergency panel                  |  | Check-in timer panel      |  |
| | [Call 911]                       |  | [Start 30/60/90 min timer]|  |
| +----------------------------------+  +---------------------------+  |
| +----------------------------------+  +---------------------------+  |
| | Live-share panel                 |  | Trusted contacts          |  |
| | [Share for X min via email]      |  | (manage 5 max)            |  |
| +----------------------------------+  +---------------------------+  |
| +----------------------------------+                                 |
| | Safety tips (matched to area)    |                                 |
| +----------------------------------+                                 |
| +----------------------------------+                                 |
| | Account panel (export/delete)    |                                 |
| +----------------------------------+                                 |
+----------------------------------------------------------------------+
```

### Mobile

```
+-------------------------+
| Tabs                    |
+-------------------------+
| [Safety*] [Community]   |
+-------------------------+
| [Emergency]             |
| [Call 911]              |
+-------------------------+
| [Check-in timer]        |
+-------------------------+
| [Live share]            |
+-------------------------+
| [Trusted contacts]      |
+-------------------------+
| [Safety tips]           |
+-------------------------+
| [Account]               |
+-------------------------+
```

---

## /map — Full-bleed map (unchanged)

### Desktop / Mobile

```
+----------------------------------------------------------------------+
|  TabNav: [Now]  [Plan]  [Act]  [Map*]                       [⋯ More] |
+----------------------------------------------------------------------+
| Search _____________________  Filter chips: [Persons][Property][...]  |
+----------------------------------------------------------------------+
|                                                                      |
|                                                                      |
|                                                                      |
|                       LEAFLET MAP (full viewport)                    |
|                                                                      |
|                                                                      |
|                                                                      |
+----------------------------------------------------------------------+
```

---

## /watch — Neighborhood Watch (drawer)

### Desktop

```
+----------------------------------------------------------------------+
| (top of page)                                                        |
+----------------------------------------------------------------------+
| Watch cards grid (5 groups):                                         |
|                                                                      |
| +---------------+ +---------------+                                  |
| | Official      | | Reporting     |                                  |
| | (police link) | | (news link)   |                                  |
| +---------------+ +---------------+                                  |
| +---------------+ +---------------+                                  |
| | Local data    | | Get involved  |                                  |
| | (city portal) | | (civic links) |                                  |
| +---------------+ +---------------+                                  |
|                                                                      |
| +---------------------------------+                                  |
| | AI Brief — In plain English     |  (renders via AreaBriefPanel)    |
| | (full-width on watch — single   |                                  |
| | source of truth shared with /now)|                                 |
| +---------------------------------+                                  |
+----------------------------------------------------------------------+
| WheelPicker (area selector, drum-style, at bottom)                   |
+----------------------------------------------------------------------+
```

### Mobile

```
+-------------------------+
| Tabs                    |
+-------------------------+
| [Watch cards]           |
|  - Official             |
|  - Reporting            |
|  - Local data           |
|  - Get involved         |
|                         |
| [AI Brief]              |
|  In plain English       |
|                         |
| ―――                      |
| [Wheel picker]          |
+-------------------------+
```

---

## /coverage — Data health (drawer)

```
+----------------------------------------------------------------------+
| Per-city status grid:                                                |
|                                                                      |
| +-------+ +-------+ +-------+ +-------+ +-------+                   |
| | SD ●  | | LA ●  | | NY ●  | | DC ●  | | CHI ● |                   |
| | live  | | live  | | warm  | | live  | | live  |                   |
| | 30k   | | 45k   | | 0     | | 18k   | | 22k   |                   |
| +-------+ +-------+ +-------+ +-------+ +-------+                   |
| ...                                                                  |
| (5x6 grid for 30 cities)                                             |
+----------------------------------------------------------------------+
```

---

## /pricing — Public (new this session)

```
+----------------------------------------------------------------------+
| HERO: Free to use, today and for the foreseeable future              |
| (subtitle)                                                           |
+----------------------------------------------------------------------+
| +------------------+   +------------------+                          |
| | Free             |   | Pro (Coming Soon)|  ← highlight ring        |
| | $0               |   | ─                |                          |
| | tagline          |   | tagline          |                          |
| | ✓ feature        |   | ✓ feature        |                          |
| | ✓ feature        |   | ✓ feature        |                          |
| | [Start using]    |   | [Join waitlist]  |                          |
| +------------------+   +------------------+                          |
+----------------------------------------------------------------------+
| What we promise (and don't):                                         |
| - Core data stays free forever                                       |
| - Never monetize fear                                                |
| - Never sell data                                                    |
| - Pro adds, never subtracts                                          |
+----------------------------------------------------------------------+
| privacy | terms | back to app                                        |
+----------------------------------------------------------------------+
```
