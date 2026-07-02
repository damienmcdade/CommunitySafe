import type { Metadata } from "next";
import Link from "next/link";
import { LegalFooter } from "@/components/LegalFooter";

export const metadata: Metadata = {
  title: "Support",
  description:
    "Get help with CommunitySafe: contact the support team, find answers to common questions, and learn how to report a problem on iOS, iPadOS, macOS, Android, or the web.",
};

const LAST_UPDATED = "2026-07-02";

/// Dedicated support surface required by App Store Review Guideline 1.5:
/// the Support URL registered in App Store Connect must resolve to a page
/// where users can actually ask questions and request help. This page is
/// what https://cyberwaveglobal.com/support fronts for the App Store
/// listing (iOS + macOS), so it must always ship with: a working contact
/// channel, expected response times, and self-serve answers.
export default function SupportPage() {
  return (
    <main className="max-w-3xl mx-auto px-4 py-10 space-y-6">
      <header>
        <p className="text-xs uppercase tracking-[0.18em] text-bay-700 font-medium">Support</p>
        <h1 className="mt-1 font-display text-3xl text-slate2-900">CommunitySafe Support</h1>
        <p className="mt-2 text-xs text-slate2-500">Last updated: {LAST_UPDATED}</p>
      </header>

      <section className="surface p-6 space-y-3 text-sm text-slate2-700 leading-relaxed" id="contact">
        <h2 className="font-display text-xl text-slate2-900">Contact us</h2>
        <p>
          Questions, bug reports, feedback, or help with your account &mdash; on
          iPhone, iPad, Mac, Android, or the web &mdash; email us and a human will
          reply:
        </p>
        <ul className="list-disc pl-5 space-y-1">
          <li>
            Email:{" "}
            <a
              href="mailto:info@cyberwaveglobal.com?subject=CommunitySafe%20support"
              className="text-bay-700 underline"
            >
              info@cyberwaveglobal.com
            </a>
          </li>
          <li>
            Website:{" "}
            <a
              href="https://cyberwaveglobal.com"
              target="_blank"
              rel="noopener noreferrer"
              className="text-bay-700 underline"
            >
              cyberwaveglobal.com
            </a>
          </li>
        </ul>
        <p>
          We respond within <strong>2 business days</strong>. Privacy-rights
          requests (GDPR, CCPA/CPRA) are answered within 30 days as described in
          the <Link href="/privacy" className="text-bay-700 underline">Privacy Policy</Link>.
        </p>
        <p className="text-xs text-slate2-500">
          When reporting a problem, include your device and OS version (e.g.
          &ldquo;iPad Air, iPadOS 26&rdquo;), the app version from Settings, and
          what you were doing when the issue occurred. Screenshots help.
        </p>
      </section>

      <section className="surface p-6 space-y-3 text-sm text-slate2-700 leading-relaxed" id="faq">
        <h2 className="font-display text-xl text-slate2-900">Common questions</h2>
        <div className="space-y-4">
          <div>
            <h3 className="font-medium text-slate2-900">How do I delete my account and data?</h3>
            <p>
              Open the <strong>Personal Safety</strong> tab and scroll to{" "}
              <strong>Your account &amp; data</strong> &mdash; you can export
              everything as JSON or delete the account outright. Deletion is
              immediate and permanent. You can also email us from the address on
              your account and we will delete it for you.
            </p>
          </div>
          <div>
            <h3 className="font-medium text-slate2-900">Why does a neighborhood show no data?</h3>
            <p>
              Each city publishes open data on its own cadence. The{" "}
              <Link href="/coverage" className="text-bay-700 underline">Coverage &amp; status</Link>{" "}
              page shows, per city, whether the feed is live, lagged, or down.
            </p>
          </div>
          <div>
            <h3 className="font-medium text-slate2-900">A Safety Score looks wrong &mdash; how do I dispute it?</h3>
            <p>
              Read the <Link href="/methodology" className="text-bay-700 underline">Methodology</Link>{" "}
              page first &mdash; scores are computed from each city&rsquo;s own
              published incidents. If you still believe the data is wrong, email
              us with the neighborhood and date range and we will investigate the
              source feed.
            </p>
          </div>
          <div>
            <h3 className="font-medium text-slate2-900">How do I manage notifications?</h3>
            <p>
              Alerts are tied to your saved places: open{" "}
              <strong>Saved Places</strong> and use the notification toggle
              there. On iOS and macOS you can also disable them system-wide
              under <strong>Settings &rarr; Notifications &rarr; CommunitySafe</strong>.
            </p>
          </div>
          <div>
            <h3 className="font-medium text-slate2-900">How do I report a community post?</h3>
            <p>
              Every post has a <strong>Report</strong> action. Reports are
              reviewed against the{" "}
              <Link href="/community-guidelines" className="text-bay-700 underline">Community guidelines</Link>;
              you can also block an author directly from the post.
            </p>
          </div>
          <div>
            <h3 className="font-medium text-slate2-900">Does CommunitySafe cost anything?</h3>
            <p>
              No. The app is free to use and the core safety information will
              never be behind a paywall. See{" "}
              <Link href="/pricing" className="text-bay-700 underline">Pricing</Link>.
            </p>
          </div>
        </div>
      </section>

      <section className="surface p-6 space-y-3 text-sm text-slate2-700 leading-relaxed" id="operator">
        <h2 className="font-display text-xl text-slate2-900">Who provides this support</h2>
        <p>
          CommunitySafe is built and operated by{" "}
          <a
            href="https://cyberwaveglobal.com"
            target="_blank"
            rel="noopener noreferrer"
            className="text-bay-700 underline"
          >
            CyberWave Technologies LLC
          </a>{" "}
          (cyberwaveglobal.com). See{" "}
          <Link href="/about" className="text-bay-700 underline">About</Link> for the full
          operator disclosure, and the{" "}
          <Link href="/privacy" className="text-bay-700 underline">Privacy Policy</Link>,{" "}
          <Link href="/terms" className="text-bay-700 underline">Terms of Use</Link>, and{" "}
          <Link href="/dmca" className="text-bay-700 underline">Copyright/DMCA</Link> pages for
          legal requests.
        </p>
        <p className="text-xs text-slate2-500">
          If you are in danger, do not use this page &mdash; call 911 (or your
          local emergency number) immediately. CommunitySafe is not an emergency
          service.
        </p>
      </section>

      <LegalFooter />
    </main>
  );
}
