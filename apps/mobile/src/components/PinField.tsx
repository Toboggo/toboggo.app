import { useEffect, useRef } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { mapStyleUrl } from "@toboggo/shared";
import { Chip } from "@toboggo/design-system";

/**
 * Position-first location picker (MVP — no geocoding).
 *
 * The park's coordinate is the primary datum. A real MapLibre map is shown when
 * `VITE_MAP_STYLE_URL` is configured: the pin stays pinned to the centre and the
 * user pans the map under it (the most reliable touch pattern on small screens);
 * `onChange` fires with the centre on `moveend`. When no map style is configured
 * the component degrades to nudge controls + a readout, so the flow still works.
 */
export function PinField({
  lat,
  lng,
  onChange,
}: {
  lat: number;
  lng: number;
  onChange: (lat: number, lng: number) => void;
}) {
  const styleUrl = mapStyleUrl();
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    if (!containerRef.current || mapRef.current || !styleUrl) return;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: styleUrl,
      center: [lng, lat],
      zoom: 16,
    });
    mapRef.current = map;
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
    const emit = () => {
      const c = map.getCenter();
      onChangeRef.current(Number(c.lat.toFixed(6)), Number(c.lng.toFixed(6)));
    };
    map.on("moveend", emit);
    return () => {
      map.remove();
      mapRef.current = null;
    };
    // Init once; the map is uncontrolled afterwards (the user drives it).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!styleUrl) {
    const step = 0.0002;
    const nudges: { label: string; dLat: number; dLng: number }[] = [
      { label: "Nord", dLat: step, dLng: 0 },
      { label: "Sud", dLat: -step, dLng: 0 },
      { label: "Est", dLat: 0, dLng: step },
      { label: "Ouest", dLat: 0, dLng: -step },
    ];
    return (
      <div
        style={{
          background: "var(--color-surface)",
          border: "1px solid var(--color-border)",
          borderRadius: "var(--radius-md)",
          padding: "var(--space-4)",
        }}
      >
        <div style={{ fontSize: 12.5, color: "var(--color-text-muted)", marginBottom: 10 }}>
          Carte indisponible — ajustez la position pas à pas.
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 10 }}>
          {nudges.map((n) => (
            <Chip
              key={n.label}
              onClick={() => onChange(Number((lat + n.dLat).toFixed(6)), Number((lng + n.dLng).toFixed(6)))}
            >
              {n.label}
            </Chip>
          ))}
        </div>
        <div style={{ fontSize: 12.5, color: "var(--color-text-muted)" }}>
          {lat.toFixed(5)}, {lng.toFixed(5)}
        </div>
      </div>
    );
  }

  return (
    <div
      style={{
        position: "relative",
        height: 240,
        borderRadius: "var(--radius-md)",
        overflow: "hidden",
        border: "1px solid var(--color-border)",
      }}
    >
      <div ref={containerRef} style={{ position: "absolute", inset: 0 }} />
      {/* Fixed centre pin — the map moves under it. */}
      <div
        aria-hidden
        style={{
          position: "absolute",
          left: "50%",
          top: "50%",
          transform: "translate(-50%, -100%)",
          pointerEvents: "none",
          color: "var(--color-primary)",
        }}
      >
        <svg width="30" height="30" viewBox="0 0 24 24" fill="currentColor" stroke="var(--color-surface)" strokeWidth="1.5">
          <path d="M12 2c-4 0-7 3-7 7 0 5 7 13 7 13s7-8 7-13c0-4-3-7-7-7z" />
          <circle cx="12" cy="9" r="2.5" fill="var(--color-surface)" stroke="none" />
        </svg>
      </div>
      <div
        style={{
          position: "absolute",
          left: 8,
          bottom: 8,
          background: "var(--color-surface)",
          borderRadius: "var(--radius-xs)",
          padding: "4px 8px",
          fontSize: 11.5,
          color: "var(--color-text-muted)",
          boxShadow: "var(--shadow-sm)",
        }}
      >
        Déplacez la carte pour placer le repère
      </div>
    </div>
  );
}
