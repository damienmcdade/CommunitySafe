"use client";
import { useEffect } from "react";
import { ensureAnonymousAuth } from "@/lib/api-client";

/// Mounts once at the root. Silently issues a per-device anonymous session on
/// first visit so the user has full access to every feature (check-in timer,
/// live-share, alert preferences, etc.) with no login UI in the way.
export function SessionBootstrap() {
  useEffect(() => { void ensureAnonymousAuth(); }, []);
  return null;
}
