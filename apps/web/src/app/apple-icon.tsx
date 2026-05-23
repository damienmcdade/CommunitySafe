import { ImageResponse } from "next/og";

/// iOS home-screen icon. Apple's PWA install pulls 180×180 specifically
/// and applies its own rounded-corner mask, so we paint a full-bleed
/// square — iOS does the rest. Theme color matches the manifest so the
/// app's standalone status bar reads as one continuous brand surface.
export const runtime = "edge";
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
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
          fontSize: 100,
          letterSpacing: "-0.04em",
        }}
      >
        ts
      </div>
    ),
    { ...size },
  );
}
