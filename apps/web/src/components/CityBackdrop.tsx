"use client";
import { useEffect, useState } from "react";
import Image from "next/image";
import { useCity } from "@/lib/use-city";
import { PHOTOS } from "@/lib/city-photos";

// Verified Wikimedia Commons photos of the actual cities. Each URL has been
// curl-checked to return HTTP 200 + image/jpeg, and each photo is a
// recognizable landmark (skyline, bridge, observatory, etc.) of the named
// city — no generic stock imagery, no random Lorem Picsum fillers.
//
// All URLs are at 1920×1080 (Wikimedia's standard 1920px thumb width) for
// 1080p backdrop quality.
//
// v93p3 — exported for the /credits page to render per-photo attribution
// (CC-BY-SA 4.0 §3(a)(2)).

// v108 — 60-second rotation (was 30s). Each city carries 8 verified photos,
// so a full cycle is ~8 minutes — calmer and less distracting, per request.
const ROTATE_MS = 60 * 1000;

export function CityBackdrop() {
  const { city } = useCity();
  const photos = PHOTOS[city.slug] ?? [];
  // `idx` is the photo currently settling in; `prevIdx` is the one beneath it.
  const [idx, setIdx] = useState(0);
  const [prevIdx, setPrevIdx] = useState(0);
  const [imgError, setImgError] = useState<Record<number, boolean>>({});

  // Reset to the first photo whenever the city changes so the user sees the
  // new city's downtown immediately, then resume rotation.
  useEffect(() => { setIdx(0); setPrevIdx(0); setImgError({}); }, [city.slug]);

  useEffect(() => {
    if (photos.length <= 1) return;
    const id = window.setInterval(() => {
      setIdx((i) => {
        // Remember the outgoing photo so it can stay as the opaque base while
        // the incoming one cross-fades in on top (no transparent gap → no flash).
        setPrevIdx(i);
        return (i + 1) % photos.length;
      });
    }, ROTATE_MS);
    return () => window.clearInterval(id);
  }, [photos.length]);

  // No verified photos for this city — render a neutral brand wash instead of a
  // broken <img> or a stark white pane.
  if (photos.length === 0) {
    return (
      <div
        className="fixed inset-0 z-0 pointer-events-none bg-gradient-to-b from-sand-50 via-bay-50/60 to-bay-100/50"
        aria-hidden
      />
    );
  }

  const next = photos.length > 1 ? (idx + 1) % photos.length : idx;

  // fix(audit perf-web-1): only render at most 3 fullscreen <Image>s (base +
  // incoming + a hidden preload of the NEXT photo) instead of all ~8, so the
  // browser never fetches the whole set on each city.
  //
  // v108 — bright-white-flash fix. The previous build kept `visible = [idx,
  // idx+1]` and UNMOUNTED the outgoing photo the instant idx changed, so the
  // incoming photo cross-faded in over the (white) page background — a visible
  // brightening at every swap. Now the previous photo stays mounted as a fully
  // opaque BASE while the incoming photo fades in on top of it, so there is
  // never a transparent frame between the two. Once the dissolve finishes the
  // incoming photo becomes the next base seamlessly.
  return (
    <div className="fixed inset-0 z-0 pointer-events-none overflow-hidden" aria-hidden>
      {/* Base — the previous photo, fully opaque. On first paint (and for a
          single-photo city) prevIdx === idx, so this simply shows the current
          photo. */}
      <div className="absolute inset-0">
        <Image
          src={photos[prevIdx]}
          alt=""
          fill
          sizes="100vw"
          priority
          className="object-cover"
        />
      </div>

      {/* Incoming — the current photo, cross-dissolving in ON TOP of the base
          via the cs-backdrop-fade-in keyframe (opacity 0→1, scale 1.06→1).
          Keyed by idx so each swap re-mounts and restarts the animation. Only
          rendered while it differs from the base and hasn't errored. */}
      {idx !== prevIdx && !imgError[idx] && (
        <div key={`${city.slug}-in-${idx}`} className="absolute inset-0 cs-backdrop-fade-in">
          <Image
            src={photos[idx]}
            alt=""
            fill
            sizes="100vw"
            onError={() => setImgError((e) => ({ ...e, [idx]: true }))}
            className="object-cover"
          />
        </div>
      )}

      {/* Preload the next photo (hidden) so the upcoming dissolve has it
          decoded and cached — keeps the transition smooth. */}
      {next !== idx && (
        <div className="absolute inset-0 opacity-0">
          <Image src={photos[next]} alt="" fill sizes="100vw" className="object-cover" />
        </div>
      )}

      {/* Constant legibility overlay (NOT part of the transition) — the photo
          reads clearly while text on top stays comfortable to read. */}
      <div className="absolute inset-0 bg-gradient-to-b from-white/30 via-white/45 to-white/65" />
    </div>
  );
}
