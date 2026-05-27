import { ImageResponse } from "next/og";
import { cityLabelBySlug } from "@/lib/city-labels";
import { FBI_DATA_YEAR, FBI_DATA_LABEL } from "@/lib/data-vintage";

/// Programmatic OG image for /cities/[city]. Renders at edge per request,
/// then cached at Vercel's edge for `revalidate` seconds. Each share of a
/// city URL gets a tailored social card rather than the generic site
/// fallback.
// v95p26 — back to edge runtime after v95p25's nodejs switch broke
// ImageResponse at request time (500 errors). The size pressure that
// drove v95p25 came from importing cityBySlug → transitive crime-data
// adapters → Honolulu's 4124-address JSON. Now we only need slug →
// label here, so import the thin CITY_LABEL_BY_SLUG map instead and
// the Edge bundle drops back well under Vercel's 2 MB limit.
export const runtime = "edge";
export const revalidate = 3600;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "CommunitySafe city safety overview";

export default async function CityOgImage({ params }: { params: { city: string } }) {
  const label = cityLabelBySlug(params.city) ?? "City";
  // CityEntry on the server doesn't carry a `source` string (that lives
  // on the client-side CITIES catalog in lib/use-city.ts). The line just
  // labels the dataset on the social card — a generic fallback reads
  // fine when we don't have a richer label handy.
  const source = `${label} police open-data feed`;
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
        <div style={{ fontSize: 28, letterSpacing: "0.18em", textTransform: "uppercase", opacity: 0.85 }}>
          CommunitySafe · Safety overview
        </div>
        <div style={{ display: "flex", flexDirection: "column", flex: 1, justifyContent: "center" }}>
          <div style={{ fontSize: 96, fontWeight: 700, lineHeight: 1.05 }}>{label}</div>
          <div style={{ fontSize: 32, marginTop: 20, opacity: 0.9, maxWidth: 920 }}>
            Neighborhood-level safety data compared to the ${FBI_DATA_LABEL} national average.
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
          <span>Source: {source.length > 60 ? source.slice(0, 57) + "…" : source}</span>
          <span>communitysafe.app/cities/{params.city}</span>
        </div>
      </div>
    ),
    { ...size },
  );
}
