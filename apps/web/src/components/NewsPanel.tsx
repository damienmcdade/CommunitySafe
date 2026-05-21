"use client";
import { useApi } from "@/lib/api-client";
import { relativeTime } from "@/lib/sse";

interface NewsItem {
  title: string;
  link: string;
  source: string;
  publishedAt: string;
  snippet?: string;
}
interface Resp { source: string; query: string; items: NewsItem[]; disclaimer: string }

export function NewsPanel({ areaSlug }: { areaSlug?: string }) {
  const path = areaSlug ? `/news?area=${encodeURIComponent(areaSlug)}` : "/news";
  const { data, loading, error } = useApi<Resp>(path, [areaSlug]);
  const items = data?.items ?? [];

  return (
    <section className="surface p-5">
      <header className="flex items-baseline justify-between">
        <h3 className="font-display text-lg text-slate2-900">What&apos;s being reported</h3>
        <span className="text-xs text-slate2-500">San Diego news, past 7 days</span>
      </header>
      <p className="mt-1 text-xs text-slate2-500">
        Headlines aggregated from Google News. Click through to read at the original source.
      </p>
      {loading && (
        <ul className="mt-4 space-y-3">
          {[0, 1, 2].map((i) => (
            <li key={i} className="space-y-2">
              <div className="skel h-3 w-3/4" />
              <div className="skel h-2 w-1/2" />
            </li>
          ))}
        </ul>
      )}
      {error && !loading && (
        <p className="mt-3 text-sm text-dusk-700">
          Couldn&apos;t load news right now. The Google News feed may be rate-limiting; try again in a minute.
        </p>
      )}
      {!loading && !error && items.length === 0 && (
        <p className="mt-3 text-sm text-slate2-500">No matching headlines in the past week — that&apos;s usually quiet news.</p>
      )}
      {!loading && items.length > 0 && (
        <ul className="mt-4 divide-y divide-sand-200">
          {items.map((item, i) => (
            <li key={i} className="py-3">
              <a
                href={item.link}
                target="_blank"
                rel="noreferrer"
                className="block group"
              >
                <span className="block text-sm text-slate2-900 group-hover:text-bay-700 transition-colors leading-snug">
                  {item.title}
                </span>
                <span className="block mt-1 text-xs text-slate2-500">
                  {item.source} · {relativeTime(item.publishedAt)}
                </span>
              </a>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
