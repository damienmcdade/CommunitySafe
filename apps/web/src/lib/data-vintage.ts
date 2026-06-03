// v67 — single source of truth for the FBI Crime Data Explorer
// vintage year referenced across page metadata, OG images,
// disclaimers, and per-city descriptions. The audit caught "2025"
// hardcoded across 10+ files; bumping the year required a sweep
// across the repo. Now a one-line constant change here lifts every
// surface in lockstep.
//
// Update each year when the FBI's CDE publishes the new annual
// totals (typically Q3 of the following year — e.g. 2025 figures
// publish ~Sept 2026).
// fix(audit legal-fbi-year-mislabel-1): set to 2024 — the FBI's latest COMPLETE
// annual release (published Aug/Sept 2025). The prior "2025" was forward-dated;
// no 2025 annual data exists yet. Keep this in lockstep with
// FBI_NATIONAL_SOURCE.publishedYear in packages/crime-data/src/safety-score.ts.
export const FBI_DATA_YEAR = 2024;
export const FBI_DATA_LABEL = `FBI Crime Data Explorer ${FBI_DATA_YEAR}`;
