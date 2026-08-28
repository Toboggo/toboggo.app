import { useEffect, useRef } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import type { Park } from "@toboggo/shared";
import { FakeMap } from "./FakeMap";

const TOKEN = import.meta.env.VITE_MAPBOX_TOKEN as string | undefined;
if (TOKEN) mapboxgl.accessToken = TOKEN;

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
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const markersRef = useRef<Record<string, mapboxgl.Marker>>({});

  useEffect(() => {
    if (!containerRef.current || mapRef.current || !TOKEN) return;
    mapRef.current = new mapboxgl.Map({
      container: containerRef.current,
      style: "mapbox://styles/mapbox/streets-v12",
      center: [lng, lat],
      zoom: 13,
    });
    mapRef.current.addControl(new mapboxgl.NavigationControl({ showCompass: false }), "top-right");
    return () => {
      mapRef.current?.remove();
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
        marker = new mapboxgl.Marker({ element: el }).setLngLat([park.lng, park.lat]).addTo(map);
        markersRef.current[park.id] = marker;
      }
      (marker.getElement() as HTMLElement).style.background = color;
      (marker.getElement() as HTMLElement).style.outline =
        park.id === selectedId ? "3px solid var(--color-primary)" : "none";
    }
  }, [parks, selectedId, onSelect]);

  if (!TOKEN) {
    return <FakeMap parks={parks} selectedId={selectedId} onSelect={onSelect} />;
  }

  return <div ref={containerRef} style={{ position: "absolute", inset: 0 }} />;
}
