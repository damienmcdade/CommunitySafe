/// Canonical number formatters. Multiple cards across the app render
/// crime rates per 100,000 population — and prior to consolidation
/// they used inconsistent precision (`toFixed(0)` on some, raw
/// `toLocaleString()` on others), which meant the same source number
/// could display as "1,235" on one card and "1234.56" on the next.
/// Single source of truth fixes that without forcing a layout change
/// in any individual card.

/// Format a per-100k-population rate as a comma-grouped integer with
/// the canonical " / 100k" suffix. Returns "—" for null / NaN so
/// callers don't need to guard.
///
/// Why integer (rounded): per-100k rates aggregated over a 30-day
/// window typically run from single digits to low thousands. Decimal
/// precision is noise at that scale — and the FBI national-rate
/// references CommunitySafe compares against are also published as
/// integers.
export function formatRatePer100k(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return `${Math.round(n).toLocaleString()} / 100k`;
}

/// Same number, but with the spelled-out " per 100k" suffix — used in
/// running prose (aria-labels, headlines) where the slash reads
/// awkwardly. Prefer this in screen-reader contexts.
export function formatRatePer100kProse(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "no data";
  return `${Math.round(n).toLocaleString()} per 100k`;
}

/// Format a delta percentage with explicit sign so "+12%" reads
/// differently from "12%" at a glance. Rounded to whole percent —
/// sub-percent precision implies a confidence we don't have.
export function formatDeltaPct(pct: number | null | undefined): string {
  if (pct == null || !Number.isFinite(pct)) return "—";
  const rounded = Math.round(pct);
  return `${rounded > 0 ? "+" : ""}${rounded}%`;
}
