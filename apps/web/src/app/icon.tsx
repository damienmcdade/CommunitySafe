import { ImageResponse } from "next/og";

/// Programmatic favicon. Next serves this at /icon (and the PNG hash
/// path used by metadata.icons). One asset covers desktop browser tabs,
/// Chrome's PWA install prompt, and the generic "any" icon slot in
/// manifest.json. 512×512 because Next downsamples for smaller surfaces.
export const runtime = "edge";
export const size = { width: 512, height: 512 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "linear-gradient(135deg, #0E4F73 0%, #2563EB 100%)",
          color: "white",
          fontFamily: "system-ui",
          fontWeight: 700,
          fontSize: 280,
          letterSpacing: "-0.04em",
        }}
      >
        ts
      </div>
    ),
    { ...size },
  );
}
