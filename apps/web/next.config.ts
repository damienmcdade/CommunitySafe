import type { NextConfig } from "next";

// Browser security headers applied to every route. Lifted out of the
// config object so the rationale stays close to the values.
//
// What's INCLUDED:
//   Strict-Transport-Security: 2-year max-age + includeSubDomains +
//     preload. Required by the Chromium HSTS preload list. Safe
//     because the site is always served over HTTPS via Vercel.
//   X-Content-Type-Options: nosniff. Stops the browser from
//     content-sniffing a response into an unexpected MIME type
//     (the classic XSS path on image upload endpoints).
//   X-Frame-Options: DENY. Defeats clickjacking — nothing embeds
//     CommunitySafe in an iframe, including ourselves.
//   Referrer-Policy: strict-origin-when-cross-origin. Modern
//     default — sends only the origin to third parties, full URL
//     to same-origin.
//   Permissions-Policy: geolocation=(self) — the route planner +
//     map use it. Everything else (camera, mic, payment, USB,
//     FLoC/Topics) explicitly denied.
//   Cross-Origin-Opener-Policy: same-origin. Isolates this window
//     from any cross-origin popup so leaks via window.opener are
//     blocked.
//   X-DNS-Prefetch-Control: on. Lets the browser warm DNS for
//     external assets (Wikimedia CDN, OSM tile servers) before the
//     user clicks through to the map / city page.
//
// Content Security Policy — REPORT-ONLY for now. Violations are logged
// to the browser DevTools console (and to the report-to endpoint if a
// CSP reporting collector is configured) without actually blocking the
// resource. This lets us observe what would break before flipping
// enforcement on. The baseline allows:
//   - default 'self' for all non-listed fetch types
//   - img-src adds CartoDB tile subdomains (Leaflet map tiles) and
//     Wikimedia (next/image source for city backdrops, though Next's
//     optimizer normally proxies them through same-origin)
//   - script-src needs 'unsafe-inline' for Next.js hydration scripts +
//     'unsafe-eval' for some client libs; 'self' covers the bundled
//     chunks
//   - style-src needs 'unsafe-inline' for Leaflet's runtime-injected
//     styles and for Tailwind's any inline arbitrary-value classes
//   - connect-src is 'self' only — we don't make any browser-side
//     third-party fetches today; AI streaming + all data fetches are
//     proxied through /api/*
//   - frame-ancestors 'none' duplicates X-Frame-Options: DENY in the
//     modern CSP form
//   - worker-src 'self' blob: covers the service worker (/sw.js)
// v92 — switched from Report-Only to ENFORCING. Removed 'unsafe-eval'
// (DISA STIG SC-18; common XSS escalation vector). 'unsafe-inline' on
// script-src is kept because Next.js hydration writes inline bootstrap
// scripts at runtime that we can't nonce without a fork. style-src
// retains 'unsafe-inline' for Leaflet + Tailwind arbitrary-value
// classes which inject runtime <style> tags.
//
// connect-src now includes the Railway API origin so the Vercel-side
// fetch in tryProxy() and any client-side same-origin /api/* calls
// don't get blocked. Adjust if a new external endpoint is added.
// NOTE: the AdSense-compatible CSP origins now live in src/middleware.ts
// (ADSENSE_ORIGINS there), alongside the nonce'd Content-Security-Policy.

// fix(audit pentest-csp-unsafe-inline): the Content-Security-Policy moved to
// src/middleware.ts so it can carry a per-request nonce + 'strict-dynamic'
// (a static header can't). The remaining security headers stay here (they're
// request-independent). Do NOT re-add CSP here — two CSP headers are ANDed by
// the browser and would conflict with the nonce'd one.
const SECURITY_HEADERS = [
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "X-Content-Type-Options",    value: "nosniff" },
  { key: "X-Frame-Options",           value: "DENY" },
  { key: "Referrer-Policy",           value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy",        value: "geolocation=(self), camera=(), microphone=(), payment=(), usb=(), interest-cohort=(), browsing-topics=()" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  { key: "X-DNS-Prefetch-Control",    value: "on" },
];

const config: NextConfig = {
  reactStrictMode: true,
  // Force-include the bundled Boston snapshot in the serverless function
  // bundle. Next's file-tracing has missed the JSON import in two locations,
  // so we make it explicit here.
  outputFileTracingIncludes: {
    "/api/crime-data/**": ["./src/server/data/**"],
    "/api/geo/**":        ["./src/server/data/**"],
  },
  // Allow next/image to optimize Wikimedia photos used by CityBackdrop.
  // Optimization gives us AVIF/WebP conversion + responsive srcsets +
  // proper lazy-load — meaningful LCP + bandwidth win since each city
  // ships ~4 photos at 1920px width.
  images: {
    // fix(audit perf-web-2): the comment above promised AVIF/WebP but no
    // `formats` was set, so next/image only emitted WebP. Explicitly enable AVIF
    // (smaller than WebP) ahead of WebP for the backdrop photos.
    formats: ["image/avif", "image/webp"],
    remotePatterns: [
      { protocol: "https", hostname: "upload.wikimedia.org", pathname: "/wikipedia/commons/**" },
    ],
  },
  async headers() {
    return [
      { source: "/:path*", headers: SECURITY_HEADERS },
      // fix(audit perf-geo-2): the city polygon GeoJSON under /public/geo (some
      // files >1MB) was served with Next's default max-age=0, so it was
      // re-downloaded on every Crime Map view. Polygon geometry is effectively
      // static per city, so cache it hard. (If a city's polygons are regenerated,
      // bump the filename or purge the CDN.)
      {
        source: "/geo/:path*",
        headers: [{ key: "Cache-Control", value: "public, max-age=2592000, immutable" }],
      },
    ];
  },
};

export default config;
