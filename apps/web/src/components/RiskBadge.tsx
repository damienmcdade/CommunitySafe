const LABELS: Record<number, string> = {
  1: "Lower",
  2: "Below typical",
  3: "Typical for this area",
  4: "Above typical",
  5: "Notably elevated",
};

export function RiskBadge({ level }: { level: 1 | 2 | 3 | 4 | 5 }) {
  return (
    <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium risk-${level}`}>
      {LABELS[level]}
    </span>
  );
}
