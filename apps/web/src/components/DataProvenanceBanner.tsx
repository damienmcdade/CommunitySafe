export interface ProvenanceLike {
  source: string;
  datasetUrl: string;
  recency: string;
  granularity: string;
  disclaimer: string;
}

export function DataProvenanceBanner({ provenance }: { provenance: ProvenanceLike | null | undefined }) {
  if (!provenance) return null;
  return (
    <aside className="surface-muted p-4 text-sm text-slate2-700">
      <div className="font-medium text-slate2-900">Where this data comes from</div>
      <p className="mt-1">{provenance.disclaimer}</p>
      <dl className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
        <div>
          <dt className="text-slate2-500">Source</dt>
          <dd>
            <a className="underline underline-offset-2" href={provenance.datasetUrl} target="_blank" rel="noreferrer">
              {provenance.source}
            </a>
          </dd>
        </div>
        <div>
          <dt className="text-slate2-500">Recency</dt>
          <dd>{provenance.recency}</dd>
        </div>
        <div>
          <dt className="text-slate2-500">Granularity</dt>
          <dd>{provenance.granularity}</dd>
        </div>
      </dl>
    </aside>
  );
}

export function CommunityReportedLabel({ reviewedAt }: { reviewedAt: string | Date | null | undefined }) {
  const date = reviewedAt ? new Date(reviewedAt).toLocaleDateString() : "—";
  return (
    <span className="inline-flex items-center gap-1 text-xs text-slate2-500">
      <span className="inline-block w-1.5 h-1.5 rounded-full bg-sage-500" aria-hidden />
      Community-reported, reviewed {date}
    </span>
  );
}
