import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { listParks, listReports, type Park } from "@toboggo/shared";
import { PageHeader } from "../components/PageHeader";
import { ParkModal } from "../components/ParkModal";
import { ReportModal } from "../components/ReportModal";
import { useOrgScope } from "../lib/orgScope";
import { useOrgSession } from "../lib/orgSession";

const TOKEN = import.meta.env.VITE_MAPBOX_TOKEN as string | undefined;
if (TOKEN) mapboxgl.accessToken = TOKEN;

function pinColor(park: Park) {
  if (park.status === "blocked") return "#7c1405";
  if (park.has_open_report) return "#ef4444";
  if (park.status === "draft" || park.status === "pending") return "#f08a2e";
  return "#16a34a";
}

export default function MapScreen() {
  const { communeId } = useOrgScope();
  const canManage = useOrgSession((s) => s.isGestionnaireOrAbove());
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const [modalPark, setModalPark] = useState<Park | null>(null);
  const [modalReport, setModalReport] = useState<any>(null);

  const { data: parks = [] } = useQuery({ queryKey: ["bo-parks", communeId], queryFn: () => listParks({ communeId }) });
  const { data: reports = [] } = useQuery({ queryKey: ["bo-reports", communeId], queryFn: () => listReports({ communeId, status: ["open"] }) });

  useEffect(() => {
    if (!containerRef.current || mapRef.current || !TOKEN || !parks.length) return;
    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: "mapbox://styles/mapbox/streets-v12",
      center: [parks[0].lng, parks[0].lat],
      zoom: 12,
    });
    mapRef.current = map;
    map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), "top-right");
    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, [parks.length]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const markers: mapboxgl.Marker[] = [];
    for (const park of parks) {
      const el = document.createElement("button");
      el.style.width = "26px";
      el.style.height = "26px";
      el.style.borderRadius = "50%";
      el.style.border = "3px solid white";
      el.style.boxShadow = "0 2px 6px rgba(0,0,0,0.3)";
      el.style.background = pinColor(park);
      el.style.cursor = "pointer";
      el.onclick = () => {
        const openReport = reports.find((r: any) => r.park_id === park.id);
        if (openReport) setModalReport(openReport);
        else setModalPark(park);
      };
      const marker = new mapboxgl.Marker({ element: el }).setLngLat([park.lng, park.lat]).addTo(map);
      markers.push(marker);
    }
    return () => markers.forEach((m) => m.remove());
  }, [parks, reports]);

  return (
    <div>
      <PageHeader title="Carte" subtitle="Parcs rattachés à votre collectivité par géolocalisation (adresse dans le périmètre communal)." />
      <div style={{ display: "flex", gap: 16, marginBottom: 12, fontSize: 12.5 }}>
        <Legend color="#16a34a" label="OK" />
        <Legend color="#f08a2e" label="Brouillon" />
        <Legend color="#ef4444" label="Signalement" />
        <Legend color="#7c1405" label="Bloqué" />
      </div>
      <div style={{ position: "relative", height: "60vh", borderRadius: 16, overflow: "hidden", background: "var(--color-bg-alt)" }}>
        {TOKEN ? (
          <div ref={containerRef} style={{ position: "absolute", inset: 0 }} />
        ) : (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: "var(--color-text-muted)", fontSize: 13, padding: 24, textAlign: "center" }}>
            Carte indisponible : renseignez VITE_MAPBOX_TOKEN dans .env.
          </div>
        )}
      </div>

      {modalPark && <ParkModal park={modalPark} onClose={() => setModalPark(null)} canManage={canManage} />}
      {modalReport && <ReportModal report={modalReport} onClose={() => setModalReport(null)} canManage={canManage} />}
    </div>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <span style={{ width: 10, height: 10, borderRadius: "50%", background: color }} />
      {label}
    </span>
  );
}
