"use client";
import { useEffect } from "react";

/// Client-side document.title hook. The (app) routes are all client
/// components (they read live data via useApi + useArea + useCity), so we
/// can't use Next's static `metadata` export — `metadata` only works in
/// Server Components. Setting document.title in a useEffect achieves the
/// same browser-tab labeling without needing a server-component wrapper
/// per route. The format mirrors the root layout's `template: "%s ·
/// CommunitySafe"` for consistency: pass just the page-specific bit and the
/// hook appends the brand suffix.
export function useDocumentTitle(title: string | null | undefined) {
  useEffect(() => {
    if (typeof document === "undefined" || !title) return;
    document.title = `${title} · CommunitySafe`;
    // fix(audit web-title-1): no restore-on-cleanup. The effect re-runs on every
    // title change and captured `original` at setup, so navigating A->B->C and
    // unmounting B would restore A's stale title over C's. Each route sets its own
    // title on mount, so there's nothing to restore.
  }, [title]);
}
