// v67 — single source of truth for the FBI Crime Data Explorer
// vintage year referenced across page metadata, OG images,
// disclaimers, and per-city descriptions. The audit caught "2025"
// hardcoded across 10+ files; bumping the year required a sweep
// across the repo. Now a one-line constant change here lifts every
// surface in lockstep.
//
// Update each year when the FBI's CDE publishes the new annual
// totals (typically Q3 of the following year — e.g. 2025 figures
// published Sept 2026).
export const FBI_DATA_YEAR = 2025;
export const FBI_DATA_LABEL = `FBI Crime Data Explorer ${FBI_DATA_YEAR}`;
