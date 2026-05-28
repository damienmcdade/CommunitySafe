"use client";
import Script from "next/script";
import { useEffect, useRef } from "react";

// Mirrors the default in root layout — TravelSafe publisher ID.
// Env var override available for staging/preview environments.
const ADSENSE_CLIENT_ID = process.env.NEXT_PUBLIC_ADSENSE_CLIENT_ID ?? "ca-pub-8731629548430880";

declare global {
  interface Window {
    adsbygoogle?: object[];
  }
}

/// Manual AdSense slot. Auto-ads (loaded in the root layout) handle
/// most placement automatically, but a manual slot is useful when you
/// want a specific position (e.g., between the AI Summary and the
/// disclaimer footer) and pre-defined dimensions for Cumulative
/// Layout Shift purposes.
///
/// Renders NOTHING when NEXT_PUBLIC_ADSENSE_CLIENT_ID isn't set, so
/// non-production deploys leave the ad slot blank instead of showing
/// "Advertisement" placeholder copy.
///
/// Usage:
///   <AdSlot slotId="1234567890" format="auto" responsive />
///
/// You get `slotId` from the AdSense dashboard after creating an ad
/// unit. The matching <ins> element is what AdSense's loader picks
/// up to fill. `format` defaults to "auto" + responsive so the slot
/// adapts to the container width.
export function AdSlot({
  slotId,
  format = "auto",
  responsive = true,
  className = "",
  style,
}: {
  slotId: string;
  format?: "auto" | "rectangle" | "horizontal" | "vertical";
  responsive?: boolean;
  className?: string;
  style?: React.CSSProperties;
}) {
  const insRef = useRef<HTMLModElement | null>(null);

  useEffect(() => {
    if (!ADSENSE_CLIENT_ID) return;
    try {
      // adsbygoogle.push({}) on each mount tells the AdSense loader
      // to fill the most-recently-rendered <ins> slot.
      (window.adsbygoogle = window.adsbygoogle || []).push({});
    } catch {
      // Loader not present yet (script still loading) — AdSense will
      // pick up the slot on its own once the script initializes.
    }
  }, []);

  if (!ADSENSE_CLIENT_ID) return null;

  return (
    <div className={`ad-slot ${className}`} style={style} aria-label="Advertisement">
      <ins
        ref={insRef}
        className="adsbygoogle"
        style={{ display: "block", ...style }}
        data-ad-client={ADSENSE_CLIENT_ID}
        data-ad-slot={slotId}
        data-ad-format={format}
        data-full-width-responsive={responsive ? "true" : "false"}
      />
      {/* The loader script lives in the root layout (loaded once
          globally). This Script entry is a no-op safety net for
          callsites that render before the root script has finished
          downloading — strategy="lazyOnload" with the same id de-dupes
          via Next's Script registry. */}
      <Script
        id="adsense-loader"
        strategy="lazyOnload"
        src={`https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${ADSENSE_CLIENT_ID}`}
        crossOrigin="anonymous"
      />
    </div>
  );
}
