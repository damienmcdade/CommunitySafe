"use client";

import { useEffect, useState } from "react";
import { LegalFooter } from "@/components/LegalFooter";
import { isNativeApp } from "@/lib/native";

/// Client body for /pricing. The Pro tier is unreleased ("coming soon") and
/// has no purchasable product behind it, so inside the native iOS/macOS
/// shell we must not render it: App Review reads any advertised paid tier
/// as a reference to an In-App Purchase and rejects under Guideline 2.1(b)
/// when no matching IAP product is submitted (and a waitlist mailto CTA
/// would separately trip Guideline 3.1.1 as an external purchase path).
/// On the plain web the Pro card renders as before. `native` starts null so
/// the first paint shows only the always-safe Free card everywhere; the
/// Pro card appears after mount on web only.
export function PricingContent() {
  const [native, setNative] = useState<boolean | null>(null);
  useEffect(() => setNative(isNativeApp()), []);
  const showPro = native === false;

  return (
    <main className="max-w-5xl mx-auto px-4 sm:px-6 py-10 space-y-10">
      <header className="text-center space-y-3">
        <p className="text-xs uppercase tracking-[0.18em] text-bay-700 font-medium">Pricing</p>
        <h1 className="font-display text-4xl sm:text-5xl text-slate2-900">
          Free to use, today and for the foreseeable future
        </h1>
        <p className="text-slate2-700 max-w-2xl mx-auto">
          CommunitySafe&apos;s core mission is calm, accurate neighborhood safety awareness for travelers
          and residents — that core stays free.
          {showPro && (
            <>
              {" "}A Pro tier may arrive later for power-user conveniences, but it
              will <em>never</em> gate the safety information itself.
            </>
          )}
        </p>
      </header>

      <section className={`grid grid-cols-1 gap-4 ${showPro ? "md:grid-cols-2" : "max-w-xl mx-auto w-full"}`}>
        <PricingCard
          name="Free"
          price="$0"
          tagline="Everything you need to make safer travel decisions."
          highlight={false}
          features={[
            "City & neighborhood Safety Scores across 57 US cities and counties",
            "Live crime feeds + analytical baselines",
            "Crime Map, Safe Route, Trend Feed",
            "Community posts (CommunitySafe)",
            "Daily digest notifications",
            "Saved areas + dark mode",
            "Privacy controls + data export",
          ]}
          cta={{ label: "Start using CommunitySafe", href: "/now" }}
        />
        {showPro && (
          <PricingCard
            name="Pro"
            price="Coming soon"
            tagline="Power-user features for frequent travelers and safety-conscious teams."
            highlight
            features={[
              "Multi-city saved areas with cross-city dashboards",
              "Real-time push notifications (Free is daily digest)",
              "Unlimited AI incident summaries",
              "Travel itinerary safety reports (export to PDF)",
              "Custom alert geo-fences",
              "Priority access to new city adapters",
            ]}
            cta={{ label: "Join the waitlist", href: "mailto:info@cyberwaveglobal.com?subject=CommunitySafe%20Pro%20waitlist" }}
          />
        )}
      </section>

      <section className="surface p-6 sm:p-8 space-y-3">
        <h2 className="font-display text-2xl text-slate2-900">What we promise (and don&apos;t)</h2>
        <ul className="text-sm text-slate2-700 space-y-2 list-disc pl-5">
          <li>The Safety Score, Crime Map, Trend Feed, and core neighborhood data <strong>stay free</strong>. We will never put basic safety information behind a paywall.</li>
          <li>We will <strong>never monetize fear</strong>: no urgency tactics, no scarcity copy, no &ldquo;upgrade or be unsafe&rdquo; framing.</li>
          <li>We will <strong>never sell your data</strong>. CommunitySafe doesn&apos;t collect demographic data and doesn&apos;t track individuals. Pricing tiers will gate convenience features, never user data.</li>
          <li>Pro features will be additions, not subtractions — nothing the Free tier offers today gets removed when Pro ships.</li>
        </ul>
      </section>

      <LegalFooter />
    </main>
  );
}

function PricingCard({
  name, price, tagline, features, highlight, cta,
}: {
  name: string;
  price: string;
  tagline: string;
  features: string[];
  highlight: boolean;
  cta: { label: string; href: string };
}) {
  return (
    <article className={`surface p-6 sm:p-8 flex flex-col ${highlight ? "ring-2 ring-bay-400" : ""}`}>
      <header>
        <p className="text-xs uppercase tracking-wider text-bay-700 font-medium">{name}</p>
        <p className="mt-1 font-display text-3xl text-slate2-900">{price}</p>
        <p className="mt-2 text-sm text-slate2-700">{tagline}</p>
      </header>
      <ul className="mt-5 space-y-2 text-sm text-slate2-700 flex-1">
        {features.map((f) => (
          <li key={f} className="flex items-baseline gap-2">
            <span className="text-sage-700 shrink-0" aria-hidden>✓</span>
            <span>{f}</span>
          </li>
        ))}
      </ul>
      <a
        href={cta.href}
        className={`mt-6 inline-flex items-center justify-center px-4 py-2 rounded-md text-sm font-medium transition-colors ${
          highlight
            ? "bg-bay-500 text-white hover:bg-bay-600"
            : "surface-muted text-slate2-900 hover:bg-bay-100"
        }`}
      >
        {cta.label}
      </a>
    </article>
  );
}
