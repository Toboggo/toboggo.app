import { useEffect, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { useQuery } from "@tanstack/react-query";
import { mapStyleUrl, searchPlaces, type GeoPlace } from "@toboggo/shared";
import { Button, Chip, Icon, Input } from "@toboggo/design-system";
import { requestBrowserLocation, useGeo } from "../lib/geo";

/**
 * MapTiler/Mapbox-style geocoding ids are prefixed with the feature's kind
 * ("address.…", "poi.…", "place.…", "municipality.…", "region.…"…) — the only
 * structured (non-heuristic) signal this payload carries for "is this a
 * precise, on-the-ground location, or an administrative area". Only the
 * former is precise enough to stand in as the park's address; a city or
 * region match must never be copied into it.
 */
function isPreciseAddress(place: GeoPlace): boolean {
  return /^(address|poi)\./.test(place.id);
}

// Debounce dedicated to the (billed, remote) geocoding call — matches the
// convention already used in SearchOverlay.tsx.
const GEOCODE_DEBOUNCE_MS = 300;

/** Same crosshair glyph as the "Recentrer" FAB on the main Explorer map
 * (MapExplore.module.css .fabRecenter) — kept visually identical here. */
function CrosshairIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: "var(--color-text)" }} aria-hidden>
      <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
      <circle cx="12" cy="12" r="5" />
      <circle cx="12" cy="12" r="1.6" fill="currentColor" stroke="none" />
    </svg>
  );
}

/**
 * Position-first location picker.
 *
 * The pin's coordinate is the primary datum — searching a place or using GPS
 * only ever recentres the map/pin, never writes an address by itself (see
 * `onChange`, which only ever receives coordinates). A real MapLibre map is
 * shown when `VITE_MAP_STYLE_URL` is configured: the pin stays pinned to the
 * centre and the user pans the map under it (the most reliable touch pattern
 * on small screens). When no map style is configured the component degrades
 * to nudge controls + a readout, so the flow still works.
 */
export function PinField({
  lat,
  lng,
  onChange,
  onAddressResolved,
}: {
  lat: number;
  lng: number;
  onChange: (lat: number, lng: number) => void;
  /**
   * Called only when a selected search result carries a precise, exploitable
   * address (see `isPreciseAddress`) — never for a vague city/region match,
   * and never as a side effect of GPS or manual pin drag. Omit to leave the
   * address field alone entirely (existing callers keep their behaviour).
   */
  onAddressResolved?: (address: string) => void;
}) {
  const styleUrl = mapStyleUrl();
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [locating, setLocating] = useState(false);
  const [geoError, setGeoError] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query), GEOCODE_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [query]);

  const { data: places = [] } = useQuery({
    queryKey: ["pin-field-search", debouncedQuery.trim()],
    queryFn: ({ signal }) => searchPlaces(debouncedQuery, signal),
    enabled: debouncedQuery.trim().length >= 2,
  });

  // Moves the pin: through the map when one is mounted (its own `moveend`
  // reports the final centre back via `onChange`), or directly otherwise
  // (no-map fallback).
  function recenter(nextLat: number, nextLng: number) {
    if (mapRef.current) {
      mapRef.current.flyTo({ center: [nextLng, nextLat], zoom: 16 });
    } else {
      onChangeRef.current(nextLat, nextLng);
    }
  }

  function selectPlace(place: GeoPlace) {
    setQuery("");
    setDebouncedQuery("");
    recenter(place.lat, place.lng);
    // A place search only ever recentres the pin — it becomes the address
    // only when the result itself is precise enough to actually be one.
    if (onAddressResolved && isPreciseAddress(place)) onAddressResolved(place.label);
  }

  async function handleUseMyLocation() {
    setLocating(true);
    setGeoError(null);
    try {
      const pos = await requestBrowserLocation();
      useGeo.getState().setLocation(pos.lat, pos.lng, "Autour de vous");
      useGeo.getState().setPermission("granted");
      recenter(pos.lat, pos.lng);
    } catch {
      useGeo.getState().setPermission("denied");
      setGeoError("Position indisponible — recherchez un lieu ou déplacez le repère.");
    } finally {
      setLocating(false);
    }
  }

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

  const searchBar = (
    <div style={{ position: "relative" }}>
      <Input
        placeholder="Rechercher une ville, une adresse ou un lieu"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      {debouncedQuery.trim().length >= 2 && places.length > 0 && (
        <div
          style={{
            position: "absolute",
            top: "100%",
            left: 0,
            right: 0,
            marginTop: 4,
            zIndex: 5,
            background: "var(--color-surface)",
            borderRadius: "var(--radius-sm)",
            boxShadow: "var(--shadow-md)",
            overflow: "hidden",
          }}
        >
          {places.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => selectPlace(p)}
              style={{
                display: "block",
                width: "100%",
                textAlign: "left",
                padding: "10px 14px",
                border: "none",
                borderBottom: "1px solid var(--color-border)",
                background: "none",
                cursor: "pointer",
              }}
            >
              <div style={{ fontFamily: "var(--font-heading)", fontWeight: 600, fontSize: 13.5 }}>{p.name}</div>
              <div style={{ fontSize: 11.5, color: "var(--color-text-muted)" }}>{p.label}</div>
            </button>
          ))}
        </div>
      )}
    </div>
  );

  if (!styleUrl) {
    const step = 0.0002;
    const nudges: { label: string; dLat: number; dLng: number }[] = [
      { label: "Nord", dLat: step, dLng: 0 },
      { label: "Sud", dLat: -step, dLng: 0 },
      { label: "Est", dLat: 0, dLng: step },
      { label: "Ouest", dLat: 0, dLng: -step },
    ];
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {searchBar}
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
            <Chip onClick={handleUseMyLocation}>{locating ? "Localisation…" : "Ma position"}</Chip>
          </div>
          <div style={{ fontSize: 12.5, color: "var(--color-text-muted)" }}>
            {lat.toFixed(5)}, {lng.toFixed(5)}
          </div>
          {geoError && <div style={{ fontSize: 12, color: "var(--color-text-muted)", marginTop: 6 }}>{geoError}</div>}
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {searchBar}
      <Button variant="secondary" block loading={locating} onClick={handleUseMyLocation}>
        <Icon name="ic-explore" size={16} style={{ marginRight: 6, display: "inline-block", verticalAlign: "-2px" }} />
        Utiliser ma position actuelle
      </Button>
      <div
        style={{
          position: "relative",
          height: 280,
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
        <button
          type="button"
          aria-label="Utiliser ma position"
          onClick={handleUseMyLocation}
          disabled={locating}
          style={{
            position: "absolute",
            right: 8,
            bottom: 8,
            width: 40,
            height: 40,
            borderRadius: "50%",
            border: "none",
            background: "var(--color-surface)",
            boxShadow: "var(--shadow-md)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
          }}
        >
          <CrosshairIcon />
        </button>
      </div>
      {geoError && <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>{geoError}</div>}
    </div>
  );
}
