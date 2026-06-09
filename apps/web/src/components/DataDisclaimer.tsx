/// Canonical legal disclaimer banner shown on every surface that
/// displays neighborhood scores, ranks, dispatches, or trends.
/// Standardized so users see the same three-part guidance everywhere:
///   1. Historical reporting only — not predictive.
///   2. Not a substitute for professional safety advice.
///   3. Should not be the sole basis for housing, lending, insurance,
///      or hiring decisions — verify with the cited source.
///
/// Compact variant (`size="sm"`) uses the muted surface for inline
/// captions; default size is for top-of-page banners. Centralizing
/// the copy here means a future change touches one file, not seven.

interface Props {
  size?: "sm" | "md";
  /// Optional label customization for surfaces that emphasize the
  /// "read this" affordance (e.g., the score page hero).
  prefix?: string;
}

export function DataDisclaimer({ size = "sm", prefix }: Props) {
  const isCompact = size === "sm";
  return (
    <p
      className={`surface-muted p-3 text-xs text-slate2-700 leading-snug ${isCompact ? "" : "text-sm"}`}
      role="note"
    >
      {prefix && <strong className="text-slate2-900">{prefix}</strong>}{prefix ? " " : ""}
      CommunitySafe adds up police reports that are already public. Scores show
      what has been reported in the past. They do not predict future risk and are
      not professional safety advice. Please do not use them as the only reason for
      a housing, lending, insurance, or hiring decision. Always check the official
      source before you act on a number.
    </p>
  );
}
