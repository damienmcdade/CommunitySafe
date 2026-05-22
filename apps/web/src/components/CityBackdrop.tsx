"use client";
import { useEffect, useState } from "react";
import { useCity } from "@/lib/use-city";

// Verified Wikimedia Commons photos of the actual cities. Each URL has been
// curl-checked to return HTTP 200 + image/jpeg, and each photo is a
// recognizable landmark (skyline, bridge, observatory, etc.) of the named
// city — no generic stock imagery, no random Lorem Picsum fillers.
//
// Wikimedia accepts only standard thumbnail widths (1280, 1920, 3840). We use
// 1920 where the source is high-res enough, 1280 otherwise.
const PHOTOS: Record<string, string[]> = {
  "san-diego": [
    // Downtown skyline (infobox panorama)
    "https://upload.wikimedia.org/wikipedia/commons/thumb/1/11/San_Diego_skyline_18_%28cropped%29.jpg/1920px-San_Diego_skyline_18_%28cropped%29.jpg",
    // Coronado Bridge curving across the bay
    "https://upload.wikimedia.org/wikipedia/commons/thumb/f/f7/San_Diego-Coronado_Bridge_by_Frank_Mckenna.jpg/1920px-San_Diego-Coronado_Bridge_by_Frank_Mckenna.jpg",
    // Balboa Park — California Tower
    "https://upload.wikimedia.org/wikipedia/commons/thumb/5/59/Balboa_Park6_%28cropped3%29.jpg/1280px-Balboa_Park6_%28cropped3%29.jpg",
    // Coronado + bay from Cabrillo National Monument
    "https://upload.wikimedia.org/wikipedia/commons/thumb/3/3c/Cabrillo_Monument_04.JPG/1920px-Cabrillo_Monument_04.JPG",
  ],
  "los-angeles": [
    // Downtown LA skyline with Mt. Baldy
    "https://upload.wikimedia.org/wikipedia/commons/thumb/6/69/Los_Angeles_with_Mount_Baldy.jpg/1920px-Los_Angeles_with_Mount_Baldy.jpg",
    // Hollywood Sign
    "https://upload.wikimedia.org/wikipedia/commons/thumb/5/5a/Hollywood_Sign_%28Zuschnitt%29.jpg/1920px-Hollywood_Sign_%28Zuschnitt%29.jpg",
    // Griffith Observatory
    "https://upload.wikimedia.org/wikipedia/commons/thumb/4/4b/Griffith_observatory_2006.jpg/1920px-Griffith_observatory_2006.jpg",
    // Santa Monica Pier entrance at evening
    "https://upload.wikimedia.org/wikipedia/commons/thumb/3/36/Santa_monica_pier_entrance_evening.jpg/1280px-Santa_monica_pier_entrance_evening.jpg",
  ],
  "san-francisco": [
    // Golden Gate Bridge
    "https://upload.wikimedia.org/wikipedia/commons/thumb/e/e6/The_Golden_Gate_Bridge_2019.jpg/1920px-The_Golden_Gate_Bridge_2019.jpg",
    // Downtown aerial including Salesforce / Transamerica towers
    "https://upload.wikimedia.org/wikipedia/commons/thumb/f/f9/San_Francisco_Downtown_Aerial%2C_August_2025.jpg/1920px-San_Francisco_Downtown_Aerial%2C_August_2025.jpg",
    // Painted Ladies at Alamo Square
    "https://upload.wikimedia.org/wikipedia/commons/thumb/7/71/Painted_Ladies_San_Francisco_January_2013_panorama_2.jpg/1920px-Painted_Ladies_San_Francisco_January_2013_panorama_2.jpg",
    // Lombard Street's crooked block
    "https://upload.wikimedia.org/wikipedia/commons/thumb/d/d1/Lombard_Street_2020.jpg/1280px-Lombard_Street_2020.jpg",
  ],
};

const ROTATE_MS = 5 * 60 * 1000;

export function CityBackdrop() {
  const { city } = useCity();
  const photos = PHOTOS[city.slug] ?? [];
  const [idx, setIdx] = useState(0);
  const [imgError, setImgError] = useState<Record<number, boolean>>({});

  // Reset to the first photo whenever the city changes so the user sees the
  // new city's downtown immediately, then resume rotation.
  useEffect(() => { setIdx(0); setImgError({}); }, [city.slug]);

  useEffect(() => {
    if (photos.length <= 1) return;
    const id = window.setInterval(() => {
      setIdx((i) => (i + 1) % photos.length);
    }, ROTATE_MS);
    return () => window.clearInterval(id);
  }, [photos.length]);

  return (
    <div className="fixed inset-0 z-0 pointer-events-none overflow-hidden" aria-hidden>
      {photos.map((url, i) => (
        <div
          key={`${city.slug}-${i}`}
          className={`absolute inset-0 transition-opacity duration-[2000ms] ${i === idx && !imgError[i] ? "opacity-100" : "opacity-0"}`}
        >
          <img
            src={url}
            alt=""
            loading={i === 0 ? "eager" : "lazy"}
            decoding="async"
            onError={() => setImgError((e) => ({ ...e, [i]: true }))}
            className={`w-full h-full object-cover ${i === idx ? "animate-kenburns" : ""}`}
          />
        </div>
      ))}
      {/* Light legibility overlay — the photo reads clearly while text on top
          stays comfortable to read. No sand-50 wash on the bottom anymore. */}
      <div className="absolute inset-0 bg-gradient-to-b from-white/30 via-white/45 to-white/65" />
    </div>
  );
}
