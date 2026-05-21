"use client";
import { useCallback, useEffect, useState } from "react";

// Same-origin: every API call hits the Next.js Route Handlers under /api/*
// served by the same Vercel deployment as the web app. NEXT_PUBLIC_API_BASE_URL
// can still override (e.g. local dev pointing at a different host).
export const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "";

function token(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("travelsafe.token");
}

export function setToken(t: string | null) {
  if (typeof window === "undefined") return;
  if (t == null) localStorage.removeItem("travelsafe.token");
  else localStorage.setItem("travelsafe.token", t);
}

export function isSignedIn(): boolean {
  return token() != null;
}

export async function api<T = unknown>(path: string, init: RequestInit = {}): Promise<T> {
  const headers: HeadersInit = {
    "Content-Type": "application/json",
    ...(init.headers ?? {}),
  };
  const tk = token();
  if (tk) (headers as Record<string, string>).Authorization = `Bearer ${tk}`;
  const res = await fetch(`${API_BASE}/api${path}`, { ...init, headers });
  const text = await res.text();
  const body = text ? JSON.parse(text) : null;
  if (!res.ok) {
    const message = (body && (body.error || body.message)) || `http_${res.status}`;
    const err = new Error(message) as Error & { status: number; body: unknown };
    err.status = res.status;
    err.body = body;
    throw err;
  }
  return body as T;
}

/// React hook that surfaces fetch errors directly. We intentionally do NOT
/// fall back to bundled sample content — the app shows only real data from
/// official sources (SANDAG, SDPD NIBRS, NWS) plus moderated community posts.
/// Empty results render a calm empty-state, errors render an inline retry.
export function useApi<T = unknown>(path: string | null, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [loading, setLoading] = useState(false);

  const reload = useCallback(async () => {
    if (!path) return;
    setLoading(true);
    setError(null);
    try {
      const d = await api<T>(path);
      setData(d);
    } catch (e) {
      setError(e as Error);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path]);

  useEffect(() => {
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, ...deps]);

  return { data, error, loading, reload };
}
