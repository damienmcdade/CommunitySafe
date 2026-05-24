"use client";
import { useCallback, useEffect, useState } from "react";

const STORAGE_KEY = "travelsafe.theme.v1";
export type Theme = "light" | "dark" | "system";

function systemPrefersDark(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false;
}

function applyTheme(t: Theme) {
  if (typeof document === "undefined") return;
  const effectiveDark = t === "dark" || (t === "system" && systemPrefersDark());
  document.documentElement.classList.toggle("dark", effectiveDark);
}

/// useTheme — persisted dark/light/system theme. "system" follows the
/// OS preference and updates live when the OS theme flips. Default is
/// "system" so users who haven't expressed a preference get the look
/// that matches their device. Toggle UI lives on /settings/privacy.
export function useTheme(): { theme: Theme; setTheme: (t: Theme) => void; effective: "light" | "dark" } {
  const [theme, setLocal] = useState<Theme>("system");
  const [effective, setEffective] = useState<"light" | "dark">("light");

  useEffect(() => {
    let t: Theme = "system";
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw === "light" || raw === "dark" || raw === "system") t = raw;
    } catch { /* ignore */ }
    setLocal(t);
    applyTheme(t);
    setEffective(t === "dark" || (t === "system" && systemPrefersDark()) ? "dark" : "light");
  }, []);

  // Re-evaluate when the OS preference changes (relevant only when
  // theme === "system"). We register the listener once and use a
  // ref to read the current theme so the listener doesn't churn.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia?.("(prefers-color-scheme: dark)");
    if (!mq) return;
    function onChange() {
      if (theme === "system") {
        applyTheme("system");
        setEffective(systemPrefersDark() ? "dark" : "light");
      }
    }
    mq.addEventListener?.("change", onChange);
    return () => mq.removeEventListener?.("change", onChange);
  }, [theme]);

  const setTheme = useCallback((t: Theme) => {
    setLocal(t);
    applyTheme(t);
    setEffective(t === "dark" || (t === "system" && systemPrefersDark()) ? "dark" : "light");
    try { window.localStorage.setItem(STORAGE_KEY, t); } catch { /* ignore */ }
  }, []);

  return { theme, setTheme, effective };
}

/// Pre-paint script that sets the dark class BEFORE React hydrates so
/// users on dark theme don't see a light-mode flash. Inline this string
/// inside a <script> in the root layout's <head>.
export const THEME_BOOTSTRAP_SCRIPT = `
(function(){
  try {
    var t = localStorage.getItem("${STORAGE_KEY}");
    var prefersDark = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
    var effective = (t === "dark") || (t !== "light" && prefersDark);
    if (effective) document.documentElement.classList.add("dark");
  } catch(_) {}
})();
`.trim();
