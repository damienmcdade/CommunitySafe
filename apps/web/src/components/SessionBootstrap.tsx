"use client";
import { useEffect } from "react";
import { ensureAnonymousAuth } from "@/lib/api-client";
import { initNativeShell } from "@/lib/native";

/// Mounts once at the root. Silently issues a per-device anonymous session on
/// first visit so the user has full access to every feature (check-in timer,
/// live-share, alert preferences, etc.) with no login UI in the way. Also runs
/// one-time native-shell setup (status bar, splash hide, deep-link + hardware
/// back handling) when running inside the iOS/Android app.
export function SessionBootstrap() {
  useEffect(() => {
    void ensureAnonymousAuth();
    // Push permission is deliberately NOT requested at launch (ASO onboarding
    // pass 2026-07-28): the ask now happens when the user saves their alert
    // preferences — the moment the permission's value is obvious. See
    // app/onboarding/alert-preferences/page.tsx.
    void initNativeShell();
  }, []);
  return null;
}
