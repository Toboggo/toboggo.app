import { useEffect, useMemo, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { mapStyleUrl, formatRating, getParkDisplayName } from "@toboggo/shared";
import type { Park } from "@toboggo/shared";
import { useTranslation } from "react-i18next";
import { useLocale } from "../../i18n/useLocale";
import { hasRating } from "../../lib/parkDisplay";
import { FakeMap } from "./FakeMap";
import { ratingTierColor, buildParkMarker, buildUserMarker, buildClusterMarker } from "./markers";
import { buildClusterIndex, queryDisplayFeatures, clusterExpansionZoom, RATING_VISIBLE_MIN_ZOOM } from "./clustering";

// Fond de carte : URL de style MapLibre configurée via VITE_MAP_STYLE_URL
// (OpenFreeMap au démarrage, cf. packages/shared/src/map.ts). Absente ⇒ FakeMap.
const STYLE_URL = mapStyleUrl();

// Zoom used when the camera is explicitly recentred on the user / a place —
// close enough to read the surrounding streets, wide enough to see nearby parks.
const RECENTER_ZOOM = 13.5;
const DEFAULT_ZOOM = 13;

type ParkPoint = Park & { distance_m?: number };

type MarkerEntry =
  | { kind: "park"; marker: maplibregl.Marker }
  | { kind: "cluster"; marker: maplibregl.Marker };

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
  const { t } = useTranslation("map");
  const { intlLocale } = useLocale();
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markersRef = useRef<Record<string, MarkerEntry>>({});
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

  // Cluster index over every park EXCEPT the selected one — excluding it up
  // front is what guarantees it always renders as its own pin and is never
  // folded into (or double-counted inside) a cluster badge, without having to
  // inspect cluster contents. Rebuilding costs ~2ms even at 2000+ points
  // (measured with the real supercluster lib against a synthetic dense-city
  // dataset) — negligible next to a data refetch or a select tap, and it
  // never runs on pan/zoom since `parks`/`selectedId` don't change then.
  const clusterIndex = useMemo(() => {
    const points: { park: ParkPoint; lngLat: [number, number] }[] = [];
    for (const park of parks) {
      if (park.id === selectedId) continue;
      const lngLat = parkLngLat(park);
      if (lngLat) points.push({ park, lngLat });
    }
    return buildClusterIndex(points);
  }, [parks, selectedId]);

  // Park + cluster markers, kept in sync with the current viewport/zoom via
  // `moveend` (clustering only ever needs to be recomputed once a gesture
  // settles, not every pan/zoom frame). Individual park markers are diffed
  // and reused by park id like before; cluster markers are cheap (one button,
  // no rich state) and always rebuilt from the live query so a cluster id —
  // only meaningful within the index that produced it — can never be reused
  // across an index change by accident.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const selectedPark = selectedId ? parks.find((p) => p.id === selectedId) : undefined;
    const selectedLngLat = selectedPark ? parkLngLat(selectedPark) : null;

    const applyPark = (park: ParkPoint, lngLat: [number, number], key: string, isSelected: boolean, showRating: boolean) => {
      let entry = markersRef.current[key];
      if (!entry || entry.kind !== "park") {
        entry?.marker.remove();
        const el = buildParkMarker(getParkDisplayName(park, t));
        el.addEventListener("click", () => onSelectRef.current(park.id));
        entry = { kind: "park", marker: new maplibregl.Marker({ element: el, anchor: "bottom" }) };
        markersRef.current[key] = entry;
      }
      entry.marker.setLngLat(lngLat).addTo(map); // addTo is idempotent — safe every pass
      const el = entry.marker.getElement();
      el.dataset.selected = isSelected ? "1" : "";
      const rated = hasRating(park);
      el.style.setProperty(
        "--marker-color",
        rated ? ratingTierColor(park.rating) : "var(--color-primary)",
      );
      const noteEl = el.querySelector("[data-note]");
      if (noteEl) noteEl.textContent = rated && showRating ? formatRating(park.rating, intlLocale) : "";
    };

    function sync() {
      const zoom = map!.getZoom();
      const b = map!.getBounds();
      const bbox: [number, number, number, number] = [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()];
      const features = queryDisplayFeatures(clusterIndex, bbox, zoom);
      const showRating = zoom >= RATING_VISIBLE_MIN_ZOOM;
      const keep = new Set<string>();

      for (const [key, entry] of Object.entries(markersRef.current)) {
        if (entry.kind === "cluster") {
          entry.marker.remove();
          delete markersRef.current[key];
        }
      }

      for (const f of features) {
        if (f.kind === "cluster") {
          const key = `cluster-${f.clusterId}`;
          keep.add(key);
          const el = buildClusterMarker(f.count, t("a11y.clusterCount", { count: f.count }));
          el.addEventListener("click", () => {
            const targetZoom = clusterExpansionZoom(clusterIndex, f.clusterId);
            map!.easeTo({ center: [f.lng, f.lat], zoom: targetZoom, duration: 400 });
          });
          const marker = new maplibregl.Marker({ element: el, anchor: "center" }).setLngLat([f.lng, f.lat]).addTo(map!);
          markersRef.current[key] = { kind: "cluster", marker };
        } else {
          const key = `park-${f.park.id}`;
          keep.add(key);
          applyPark(f.park, [f.lng, f.lat], key, f.park.id === selectedId, showRating);
        }
      }

      if (selectedPark && selectedLngLat) {
        const key = `park-${selectedPark.id}`;
        keep.add(key);
        applyPark(selectedPark, selectedLngLat, key, true, showRating);
      }

      for (const key of Object.keys(markersRef.current)) {
        if (!keep.has(key)) {
          markersRef.current[key].marker.remove();
          delete markersRef.current[key];
        }
      }
    }

    sync();
    map.on("moveend", sync);
    return () => {
      map.off("moveend", sync);
    };
  }, [clusterIndex, parks, selectedId, mapEpoch, intlLocale, t]);

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
      userMarkerRef.current = new maplibregl.Marker({ element: buildUserMarker(t("a11y.userLocation")) });
    }
    userMarkerRef.current.setLngLat([lng, lat]).addTo(map);
  }, [showUser, lat, lng, mapEpoch, t]);

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
