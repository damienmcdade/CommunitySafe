"use client";

export async function requestLocation(): Promise<GeolocationPosition> {
  if (typeof navigator === "undefined" || !navigator.geolocation) {
    throw new Error("geolocation_unsupported");
  }
  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(
      (p) => resolve(p),
      (err) => reject(new Error(`geolocation_${err.code}`)),
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 60_000 },
    );
  });
}
