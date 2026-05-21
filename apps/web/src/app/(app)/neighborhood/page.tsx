"use client";
import { useState } from "react";
import { useApi } from "@/lib/api-client";
import { DataProvenanceBanner, CommunityReportedLabel, type ProvenanceLike } from "@/components/DataProvenanceBanner";
import { RiskBadge } from "@/components/RiskBadge";

interface Area { id: string; slug: string; name: string }
interface Feed {
  area: Area;
  posts: { id: string; body: string; createdAt: string; reviewedAt: string | null; _count: { comments: number; reactions: number } }[];
  alerts: { area: string; category: string; riskLevel: 1 | 2 | 3 | 4 | 5; summary: string; recency: string; provenance: ProvenanceLike }[];
  recent: { id: string; ibrOffenseDescription: string; occurredAt: string; beat?: string | null }[];
}

export default function NeighborhoodPage() {
  const { data: areas } = useApi<Area[]>("/neighborhood/");
  const [slug, setSlug] = useState("pacific-beach");
  const { data: feed } = useApi<Feed>(`/neighborhood/feed?neighborhood=${slug}`, [slug]);

  return (
    <main className="space-y-8">
      <header>
        <h1 className="font-display text-3xl text-slate2-900">Neighborhood Watch</h1>
        <p className="mt-2 text-slate2-500">A focused view of a single neighborhood: verified community posts, area alerts, and recent public-record incidents.</p>
      </header>

      <section className="surface p-4 flex flex-wrap items-center gap-3">
        <label className="text-sm text-slate2-700">Neighborhood</label>
        <select value={slug} onChange={(e) => setSlug(e.target.value)} className="px-3 py-2 surface">
          {(areas ?? []).map((a) => <option key={a.id} value={a.slug}>{a.name}</option>)}
        </select>
      </section>

      {feed?.alerts && feed.alerts.length > 0 && (
        <section className="space-y-3">
          <h2 className="font-display text-lg text-slate2-900">Area alerts</h2>
          {feed.alerts.map((a, i) => (
            <article key={i} className="surface p-5">
              <div className="flex items-center justify-between">
                <span className="text-slate2-900">{a.category.toLowerCase()} incidents</span>
                <RiskBadge level={a.riskLevel} />
              </div>
              <p className="mt-2 text-slate2-700">{a.summary}</p>
              <p className="text-xs text-slate2-500 mt-2">Recency: {a.recency}</p>
            </article>
          ))}
          <DataProvenanceBanner provenance={feed.alerts[0]?.provenance} />
        </section>
      )}

      <section className="space-y-3">
        <h2 className="font-display text-lg text-slate2-900">Recent public-record incidents</h2>
        {(feed?.recent ?? []).length === 0 && <p className="text-sm text-slate2-500">No recent incidents in the cached window.</p>}
        <ul className="space-y-2">
          {(feed?.recent ?? []).map((r) => (
            <li key={r.id} className="surface-muted p-3 text-sm flex justify-between">
              <span>{r.ibrOffenseDescription}</span>
              <span className="text-slate2-500">{new Date(r.occurredAt).toLocaleDateString()} {r.beat ? `· beat ${r.beat}` : ""}</span>
            </li>
          ))}
        </ul>
        <p className="text-xs text-slate2-500">Source: SDPD NIBRS — quarterly, neighborhood/beat aggregated. Not live, not street-level.</p>
      </section>

      <section className="space-y-3">
        <h2 className="font-display text-lg text-slate2-900">Verified community posts</h2>
        {(feed?.posts ?? []).map((p) => (
          <article key={p.id} className="surface p-5">
            <CommunityReportedLabel reviewedAt={p.reviewedAt} />
            <pre className="mt-2 whitespace-pre-wrap text-slate2-900 font-sans text-sm">{p.body}</pre>
          </article>
        ))}
      </section>
    </main>
  );
}
