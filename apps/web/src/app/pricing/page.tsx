import type { Metadata } from "next";
import { PricingContent } from "./PricingContent";

export const metadata: Metadata = {
  title: "Pricing",
  description: "CommunitySafe is free to use. Pro tier coming soon for advanced safety features.",
};

/// Public /pricing page. Scaffold only — no payment integration. The
/// tier comparison reflects the current set of features that COULD be
/// gated; final pricing + actual gate enforcement are deferred pending
/// product decisions. This page exists so:
///   1. Search engines + curious users see CommunitySafe has a clear
///      free-to-use posture.
///   2. The infrastructure is in place to flip features into Pro
///      without scrambling for a pricing page when revenue lands.
///   3. The "no fear-monetization" guarantee is explicit on the
///      page itself.
/// The body is a client component: inside the native iOS/macOS shell the
/// unreleased Pro tier is hidden entirely (App Store Guideline 2.1(b) /
/// 3.1.1 — see PricingContent).
export default function PricingPage() {
  return <PricingContent />;
}
