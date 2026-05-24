"use client";

export type TrustLevelName = "NEW" | "REGULAR" | "TRUSTED" | "MODERATOR";

const TONE: Record<TrustLevelName, { label: string; cls: string; title: string }> = {
  NEW: {
    label: "New",
    cls: "bg-sand-100 text-slate2-500 ring-sand-300",
    title: "New contributor — fewer than 3 verified posts on record.",
  },
  REGULAR: {
    label: "Regular",
    cls: "bg-bay-100 text-bay-700 ring-bay-200",
    title: "Regular contributor — 3+ verified posts with a low rejection rate.",
  },
  TRUSTED: {
    label: "Trusted",
    cls: "bg-sage-100 text-sage-700 ring-sage-200",
    title: "Trusted contributor — 10+ verified posts with a very low rejection rate.",
  },
  MODERATOR: {
    label: "Moderator",
    cls: "bg-amber2-50 text-amber2-700 ring-amber2-300",
    title: "Community moderator — reviews other contributors' posts.",
  },
};

/// Tiny inline badge for a community-post author. Informational only —
/// the trust system does NOT affect visibility or ranking. Hover for the
/// rationale; matches the visual language of the ThreatFeed confidence
/// badges so trust signals across the app feel consistent.
export function TrustBadge({ level }: { level: TrustLevelName }) {
  // Suppress the default-tier badge: rendering "New" next to every
  // first-time poster would be noise. NEW renders as nothing; readers
  // see the badge only when the author has earned at least REGULAR.
  if (level === "NEW") return null;
  const t = TONE[level];
  return (
    <span
      title={t.title}
      className={`text-[10px] uppercase tracking-wider font-medium px-1.5 py-0.5 rounded-full ring-1 ${t.cls}`}
    >
      {t.label}
    </span>
  );
}
