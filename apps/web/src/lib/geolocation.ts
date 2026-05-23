"use client";

const ERROR_MESSAGES: Record<number, string> = {
  1: "Location permission was blocked. Allow location access for this site in your browser settings, then try again.",
  2: "Your device could not determine its location. Try again, or move to an area with a clearer signal.",
  3: "Location lookup timed out. Try again in a moment.",
};

export class GeolocationError extends Error {
  constructor(public code: number, message?: string) {
    super(message ?? ERROR_MESSAGES[code] ?? `Location error (code ${code}).`);
    this.name = "GeolocationError";
  }
}

function getOnce(opts: PositionOptions): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(
      (p) => resolve(p),
      (err) => reject(new GeolocationError(err.code, ERROR_MESSAGES[err.code])),
      opts,
    );
  });
}

/// Two-stage geolocation request. Many desktop browsers refuse to satisfy
/// `enableHighAccuracy: true` within a 15-second budget when there's no
/// GPS — they fall back to Wi-Fi triangulation, which works but is slow
/// to converge. The previous single-shot call returned a code-3 (timeout)
/// after 15s and gave the user nothing.
/// Stage 1: short, high-accuracy attempt (best when GPS is available).
/// Stage 2: longer, low-accuracy attempt — Wi-Fi/IP-based lookup, which
/// is plenty good enough for city + neighborhood resolution. We only
/// surface the failure if BOTH stages fail.
export async function requestLocation(): Promise<GeolocationPosition> {
  if (typeof navigator === "undefined" || !navigator.geolocation) {
    throw new GeolocationError(0, "Your browser does not support geolocation.");
  }
  if (typeof window !== "undefined" && window.isSecureContext === false) {
    throw new GeolocationError(0, "Location requires a secure (https) connection.");
  }
  try {
    return await getOnce({ enableHighAccuracy: true, timeout: 8_000, maximumAge: 60_000 });
  } catch (err) {
    // Permission denials are terminal — re-prompting won't help.
    if (err instanceof GeolocationError && err.code === 1) throw err;
    // Otherwise retry with a relaxed accuracy budget. Wi-Fi-based
    // lookups are accurate to a city block, which is fine for the
    // neighborhood-resolution step that follows.
    return await getOnce({ enableHighAccuracy: false, timeout: 20_000, maximumAge: 5 * 60_000 });
  }
}
