import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { mapStyleUrl, type Park } from "@toboggo/shared";
import { Button } from "@toboggo/design-system";
import { DashboardPanel, PanelEmpty } from "./shared";
import styles from "../Dashboard.module.css";

const STYLE_URL = mapStyleUrl();

function pinColor(park: Park) {
  if (park.status === "blocked") return "#7c1405";
  if (park.has_open_report) return "#ef4444";
  if (park.status === "draft" || park.status === "pending") return "#f08a2e";
  return "#16a34a";
}

/**
 * Compact, read-only preview of the collectivité's own parks (COLL-02C §4) —
 * reuses the same MapLibre style/infra as `MapScreen`, but a much smaller
 * subset: no click handlers, no report modal, no navigation controls. Never
 * duplicates the full `MapScreen`; "Voir la carte" routes to it.
 */
export function MiniParkMap({ parks }: { parks: Park[] }) {
  const navigate = useNavigate();
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);

  useEffect(() => {
    if (!containerRef.current || mapRef.current || !STYLE_URL || !parks.length) return;
    const bounds = new maplibregl.LngLatBounds();
    for (const park of parks) bounds.extend([park.longitude, park.latitude]);
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: STYLE_URL,
      bounds,
      fitBoundsOptions: { padding: 28, maxZoom: 14 },
      interactive: false,
      attributionControl: false,
    });
    mapRef.current = map;
    for (const park of parks) {
      const el = document.createElement("span");
      el.style.width = "14px";
      el.style.height = "14px";
      el.style.borderRadius = "50%";
      el.style.border = "2px solid white";
      el.style.boxShadow = "0 1px 3px rgba(0,0,0,0.35)";
      el.style.background = pinColor(park);
      el.style.display = "block";
      new maplibregl.Marker({ element: el }).setLngLat([park.longitude, park.latitude]).addTo(map);
    }
    return () => {
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parks]);

  const totalViews = parks.reduce((sum, p) => sum + (p.views ?? 0), 0);

  return (
    <DashboardPanel
      title="Carte de vos parcs"
      icon="ic-explore"
      action={
        <Button variant="ghost" size="sm" onClick={() => navigate("/map")}>
          Voir la carte
        </Button>
      }
    >
      {parks.length === 0 ? (
        <PanelEmpty icon="ic-explore" text="Aucun parc à afficher sur la carte." />
      ) : !STYLE_URL ? (
        <div className={styles.mapFallback}>Carte indisponible : renseignez VITE_MAP_STYLE_URL dans .env.</div>
      ) : (
        <>
          <div className={styles.miniMap} ref={containerRef} />
          <p className={styles.mapCaption}>
            {parks.length} parc{parks.length > 1 ? "s" : ""}
            {totalViews > 0 && ` · ${totalViews} vue${totalViews > 1 ? "s" : ""} cumulée${totalViews > 1 ? "s" : ""}`}
          </p>
        </>
      )}
    </DashboardPanel>
  );
}
