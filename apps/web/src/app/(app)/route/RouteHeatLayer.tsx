"use client";
import { useEffect, useRef } from "react";
import { useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet.heat";

// leaflet.heat extends L with `heatLayer`. The plugin doesn't ship its
// own types, so we declare the minimal surface we use.
declare module "leaflet" {
  interface HeatLayerOptions {
    radius?: number;
    blur?: number;
    maxZoom?: number;
    minOpacity?: number;
    max?: number;
    gradient?: Record<number, string>;
  }
  function heatLayer(
    latlngs: Array<[number, number, number]>,
    options?: HeatLayerOptions,
  ): L.Layer;
}

/// Heatmap overlay for the SafeRoute map. Renders the recent-incident
/// density along the route corridor so users can SEE the exposure
/// pattern the score is based on rather than trusting the
/// letter-grade alone. Calm-palette gradient (sage → sand → coral) so
/// the layer reads as data, not warning.
///
/// Mounts as a Leaflet layer (not React-Leaflet primitive) because
/// react-leaflet doesn't ship a heatmap component — we attach
/// directly via the map instance from useMap().
export function RouteHeatLayer({
  points,
  visible,
}: {
  /// Each point is [lat, lng, weight]. Weight 0-1 controls density
  /// contribution; pass 1.0 for raw count-equivalents.
  points: Array<[number, number, number]>;
  visible: boolean;
}) {
  const map = useMap();
  const layerRef = useRef<L.Layer | null>(null);

  useEffect(() => {
    if (!visible || points.length === 0) {
      if (layerRef.current) {
        map.removeLayer(layerRef.current);
        layerRef.current = null;
      }
      return;
    }
    // Tear down any prior layer before mounting a fresh one so prop
    // changes (visibility, point set) don't leak layers.
    if (layerRef.current) {
      map.removeLayer(layerRef.current);
    }
    const layer = L.heatLayer(points, {
      radius: 22,
      blur: 18,
      minOpacity: 0.25,
      max: 1.0,
      // Calm gradient — sage at low density, sand at moderate,
      // coral at peak. No alarm-red anywhere; matches the rest of
      // CommunitySafe's "don't monetize fear" palette posture.
      gradient: {
        0.2: "#7BA86E",
        0.5: "#E5C28B",
        0.8: "#D26E47",
      },
    });
    layer.addTo(map);
    layerRef.current = layer;
    return () => {
      if (layerRef.current) {
        map.removeLayer(layerRef.current);
        layerRef.current = null;
      }
    };
  }, [map, points, visible]);

  return null;
}
