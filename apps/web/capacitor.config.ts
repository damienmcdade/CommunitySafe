import type { CapacitorConfig } from "@capacitor/cli";

// Capacitor shell for the ANDROID build of CommunitySafe.
//
// iOS is no longer a Capacitor app: it is a native SwiftUI application at
// `apps/ios` that talks to the same APIs directly. Apple rejected the iOS
// WebView wrapper under Guideline 4.2 (Minimum Functionality) on
// 2026-08-24, and the native rewrite is the remedy. Do not reintroduce an
// iOS Capacitor target here.
//
// All /api/* calls and AI features hit the LIVE Railway API
// (https://communitysafe-api-production.up.railway.app) — the
// iOS bundle ships only the client-side React + assets.

const config: CapacitorConfig = {
  appId: "app.communitysafe",
  appName: "CommunitySafe",
  webDir: "out",
  // For initial bootstrap we point at the LIVE prod URL so the iOS
  // app renders the same React tree users see in browsers (full
  // Next.js App Router + API + AI + maps). The webDir bundle is
  // kept as a fallback target for when we have a static export.
  // To switch to the static-bundle mode: comment out server.url,
  // ensure `out/` is populated via the mobile-build script, then
  // `npx cap sync`.
  server: {
    url: "https://communitysafe.app",
    cleartext: false,
  },
  ios: {
    // Don't let the WebView shift content into the status bar / home
    // indicator area — common Capacitor papercut on iPhone.
    contentInsetAdjustmentBehavior: "never",
    scrollEnabled: true,
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 0,
    },
  },
};

export default config;
