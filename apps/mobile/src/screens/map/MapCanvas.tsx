import { useEffect, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { mapStyleUrl } from "@toboggo/shared";
import type { Park } from "@toboggo/shared";
import { hasRating } from "../../lib/parkDisplay";
import { FakeMap } from "./FakeMap";
import { ratingTierColor, buildParkMarker, buildUserMarker } from "./markers";

// Fond de carte : URL de style MapLibre configurée via VITE_MAP_STYLE_URL
// (OpenFreeMap au démarrage, cf. packages/shared/src/map.ts). Absente ⇒ FakeMap.
const STYLE_URL = mapStyleUrl();

// Zoom used when the camera is explicitly recentred on the user / a place —
// close enough to read the surrounding streets, wide enough to see nearby parks.
const RECENTER_ZOOM = 13.5;
const DEFAULT_ZOOM = 13;

type ParkPoint = Park & { distance_m?: number };

function parkLngLat(p: ParkPoint): [number, number] | null {
  const lng = Number(p.longitude ?? p.lng);
  const lat = Number(p.latitude ?? p.lat);
  if (!Number.isFinite(lng) || !Number.isFinite(lat) || (lng === 0 && lat === 0)) return null;
  return [lng, lat];
}

export function MapCanvas({
  lat,
  lng,
  parks,
  selectedId,
  onSelect,
  recenterSignal,
  showUser = false,
  insets,
}: {
  lat: number;
  lng: number;
  parks: ParkPoint[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  recenterSignal: number;
  showUser?: boolean;
  /** Pixels hidden by the floating header (top) and the bottom sheet (bottom). */
  insets?: { top: number; bottom: number };
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markersRef = useRef<Record<string, maplibregl.Marker>>({});
  const userMarkerRef = useRef<maplibregl.Marker | null>(null);
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;
  // Bumped every time a fresh Map is constructed (incl. React StrictMode's
  // mount/unmount/remount in dev). Downstream effects key off it so they
  // rebuild their markers on the new instance instead of touching orphans.
  const [mapEpoch, setMapEpoch] = useState(0);
  const latLngRef = useRef({ lat, lng });
  latLngRef.current = { lat, lng };
  const insetsRef = useRef(insets);
  insetsRef.current = insets;

  /**
   * Vertical shift (screen px) applied to a recentre so the point lands in the
   * middle of the strip the user can actually see (canvas minus the header and
   * the bottom sheet), not the middle of the whole canvas. Clamped so it can't
   * push the point off-canvas.
   */
  const centreOffsetY = (map: maplibregl.Map) => {
    const i = insetsRef.current;
    if (!i) return 0;
    const h = map.getCanvas().clientHeight || 0;
    const raw = (i.top - i.bottom) / 2;
    return Math.round(Math.max(-h * 0.42, Math.min(h * 0.42, raw)));
  };

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !STYLE_URL) return;
    const map = new maplibregl.Map({
      container,
      style: STYLE_URL,
      center: [lng, lat],
      zoom: DEFAULT_ZOOM,
    });
    mapRef.current = map;
    markersRef.current = {};
    userMarkerRef.current = null;
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
    setMapEpoch((n) => n + 1);
    return () => {
      map.remove();
      if (mapRef.current === map) mapRef.current = null;
      markersRef.current = {};
      userMarkerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Park markers — one per result, kept in sync with `parks`. Rebuilt wholesale
  // when the map instance changes (markers belong to a single Map).
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const currentIds = new Set(parks.map((p) => p.id));
    for (const id of Object.keys(markersRef.current)) {
      if (!currentIds.has(id)) {
        try {
          markersRef.current[id].remove();
        } catch {
          /* already gone */
        }
        delete markersRef.current[id];
      }
    }
    for (const park of parks) {
      const lngLat = parkLngLat(park);
      if (!lngLat) continue;
      let marker = markersRef.current[park.id];
      if (!marker) {
        const el = buildParkMarker(park.name);
        el.addEventListener("click", () => onSelectRef.current(park.id));
        marker = new maplibregl.Marker({ element: el, anchor: "bottom" });
        markersRef.current[park.id] = marker;
      }
      marker.setLngLat(lngLat).addTo(map); // addTo is idempotent — safe every pass
      const el = marker.getElement();
      el.dataset.selected = park.id === selectedId ? "1" : "";
      const rated = hasRating(park);
      el.style.setProperty(
        "--marker-color",
        rated ? ratingTierColor(park.rating) : "var(--color-primary)",
      );
      const noteEl = el.querySelector("[data-note]");
      if (noteEl) noteEl.textContent = rated ? park.rating.toFixed(1).replace(".", ",") : "";
    }
  }, [parks, selectedId, mapEpoch]);

  // User position marker.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (!showUser || !Number.isFinite(lat) || !Number.isFinite(lng)) {
      try {
        userMarkerRef.current?.remove();
      } catch {
        /* already gone */
      }
      userMarkerRef.current = null;
      return;
    }
    if (!userMarkerRef.current) {
      userMarkerRef.current = new maplibregl.Marker({ element: buildUserMarker() });
    }
    userMarkerRef.current.setLngLat([lng, lat]).addTo(map);
  }, [showUser, lat, lng, mapEpoch]);

  // Camera — moves ONLY on an explicit recenter (recenterSignal changes: first
  // GPS fix, city pick, or the recenter button). Data / query changes never move
  // the map, so a manual pan/zoom is never overridden by a background refetch.
  // The vertical `offset` accounts for the header + bottom sheet so the user
  // lands in the middle of the *visible* map for the current snap.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (recenterSignal === 0) return; // no explicit recenter yet — leave the map where it was created
    const { lat: uLat, lng: uLng } = latLngRef.current;
    if (!Number.isFinite(uLat) || !Number.isFinite(uLng)) return;
    try {
      map.easeTo({
        center: [uLng, uLat],
        zoom: RECENTER_ZOOM,
        offset: [0, centreOffsetY(map)],
        duration: 600,
      });
    } catch {
      /* map disposing */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recenterSignal, mapEpoch]);

  if (!STYLE_URL) {
    return <FakeMap parks={parks} selectedId={selectedId} onSelect={onSelect} showUser={showUser} />;
  }

  return <div ref={containerRef} style={{ position: "absolute", inset: 0 }} />;
}
