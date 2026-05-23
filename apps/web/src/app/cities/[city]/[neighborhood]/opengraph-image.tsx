import { ImageResponse } from "next/og";
import { cityBySlug } from "@/server/services/crime-data/cities";

/// Programmatic OG image for /cities/[city]/[neighborhood]. Renders the
/// neighborhood label + parent city as a social-card hero so shared
/// links get a tailored visual instead of the generic site default.
///
/// We DON'T call getSafetyScore here even though a per-grade card would
/// be richer — the safety-score path imports `node:fs/promises` (via
/// polygon-areas) and the OG-image route's runtime doesn't reliably
/// resolve that dep on Vercel today. Keeping the OG image purely
/// label-driven means the route is fast, has no failure modes tied to
/// upstream data, and gracefully handles unknown slugs.
export const runtime = "edge";
export const revalidate = 3600;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "TravelSafe neighborhood safety overview";

export default async function NeighborhoodOgImage({
  params,
}: {
  params: { city: string; neighborhood: string };
}) {
  const city = cityBySlug(params.city);
  if (!city) return fallback("Neighborhood overview", "TravelSafe");

  // city.discover() reaches the adapter which may pull a remote feed —
  // but it's cached aggressively and necessary to resolve the label.
  // If discover throws (upstream outage), still render a fallback card.
  const areas = await city.discover().catch(() => []);
  const area = areas.find((a) => a.slug === params.neighborhood);
  if (!area) return fallback(`${city.label} neighborhood`, city.label);

  return new ImageResponse(
    (
      <div
        style={{
          height: "100%",
          width: "100%",
          display: "flex",
          flexDirection: "column",
          background: "linear-gradient(135deg, #0E4F73 0%, #2563EB 100%)",
          color: "white",
          padding: "70px 80px",
          fontFamily: "system-ui",
        }}
      >
        <div
          style={{
            display: "flex",
            fontSize: 26,
            letterSpacing: "0.18em",
            textTransform: "uppercase",
            opacity: 0.85,
          }}
        >
          TravelSafe · {city.label}
        </div>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            flexGrow: 1,
            justifyContent: "center",
          }}
        >
          <div style={{ display: "flex", fontSize: 88, fontWeight: 700, lineHeight: 1.05, maxWidth: 1040 }}>
            {area.label}
          </div>
          <div
            style={{
              display: "flex",
              fontSize: 30,
              marginTop: 22,
              opacity: 0.9,
              maxWidth: 1040,
              lineHeight: 1.3,
            }}
          >
            Neighborhood-level safety data compared to the FBI Crime in the Nation 2024 national average.
          </div>
        </div>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            fontSize: 22,
            opacity: 0.85,
            borderTop: "1px solid rgba(255,255,255,0.22)",
            paddingTop: 22,
          }}
        >
          <span>Source: {city.label} police open-data feed</span>
          <span>
            travel-safe-chi.vercel.app/cities/{params.city}/{params.neighborhood}
          </span>
        </div>
      </div>
    ),
    { ...size },
  );
}

function fallback(line1: string, line2: string) {
  return new ImageResponse(
    (
      <div
        style={{
          height: "100%",
          width: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: 80,
          background: "linear-gradient(135deg,#0E4F73 0%,#2563EB 100%)",
          color: "white",
          fontFamily: "system-ui",
        }}
      >
        <div style={{ display: "flex", fontSize: 24, letterSpacing: "0.18em", textTransform: "uppercase", opacity: 0.85 }}>
          TravelSafe
        </div>
        <div style={{ display: "flex", fontSize: 72, fontWeight: 700, marginTop: 12 }}>{line1}</div>
        <div style={{ display: "flex", fontSize: 30, marginTop: 14, opacity: 0.9 }}>{line2}</div>
      </div>
    ),
    { ...size },
  );
}
