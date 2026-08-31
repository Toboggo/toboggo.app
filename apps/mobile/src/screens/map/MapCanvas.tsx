import { useEffect, useRef } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { mapStyleUrl } from "@toboggo/shared";
import type { Park } from "@toboggo/shared";
import { FakeMap } from "./FakeMap";

// Fond de carte : URL de style MapLibre configurée via VITE_MAP_STYLE_URL
// (OpenFreeMap au démarrage, cf. packages/shared/src/map.ts). Absente ⇒ FakeMap.
const STYLE_URL = mapStyleUrl();

export function MapCanvas({
  lat,
  lng,
  parks,
  selectedId,
  onSelect,
  recenterSignal,
}: {
  lat: number;
  lng: number;
  parks: (Park & { distance_m?: number })[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  recenterSignal: number;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markersRef = useRef<Record<string, maplibregl.Marker>>({});

  useEffect(() => {
    if (!containerRef.current || mapRef.current || !STYLE_URL) return;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: STYLE_URL,
      center: [lng, lat],
      zoom: 13,
    });
    mapRef.current = map;
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
    return () => {
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    mapRef.current?.flyTo({ center: [lng, lat], zoom: 13 });
  }, [recenterSignal]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const currentIds = new Set(parks.map((p) => p.id));
    for (const id of Object.keys(markersRef.current)) {
      if (!currentIds.has(id)) {
        markersRef.current[id].remove();
        delete markersRef.current[id];
      }
    }
    for (const park of parks) {
      const score = park.rating * 2;
      const color = score >= 8 ? "#16a34a" : score >= 6 ? "#f08a2e" : "#ef4444";
      let marker = markersRef.current[park.id];
      if (!marker) {
        const el = document.createElement("button");
        el.setAttribute("aria-label", park.name);
        el.style.width = "30px";
        el.style.height = "30px";
        el.style.borderRadius = "50% 50% 50% 0";
        el.style.transform = "rotate(-45deg)";
        el.style.border = "3px solid white";
        el.style.boxShadow = "0 2px 6px rgba(0,0,0,0.3)";
        el.style.cursor = "pointer";
        el.onclick = () => onSelect(park.id);
        marker = new maplibregl.Marker({ element: el }).setLngLat([park.lng, park.lat]).addTo(map);
        markersRef.current[park.id] = marker;
      }
      (marker.getElement() as HTMLElement).style.background = color;
      (marker.getElement() as HTMLElement).style.outline =
        park.id === selectedId ? "3px solid var(--color-primary)" : "none";
    }
  }, [parks, selectedId, onSelect]);

  if (!STYLE_URL) {
    return <FakeMap parks={parks} selectedId={selectedId} onSelect={onSelect} />;
  }

  return <div ref={containerRef} style={{ position: "absolute", inset: 0 }} />;
}
