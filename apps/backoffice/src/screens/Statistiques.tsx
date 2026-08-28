import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { toCsv, downloadCsv, listParks, listReports, listReviews, listActivity } from "@toboggo/shared";
import { Button, Card } from "@toboggo/design-system";
import { PageHeader } from "../components/PageHeader";
import { useOrgScope } from "../lib/orgScope";
import { SERVICE_LABEL } from "../lib/equipmentLabels";

function Bar({ pct, color = "var(--color-primary)" }: { pct: number; color?: string }) {
  return (
    <div style={{ height: 6, background: "var(--color-bg-alt)", borderRadius: 999, flex: 1 }}>
      <div style={{ width: `${Math.min(100, pct)}%`, height: "100%", background: color, borderRadius: 999 }} />
    </div>
  );
}

export default function Statistiques() {
  const navigate = useNavigate();
  const { communeId } = useOrgScope();

  const { data: parks = [] } = useQuery({ queryKey: ["bo-parks", communeId], queryFn: () => listParks({ communeId }) });
  const { data: reports = [] } = useQuery({ queryKey: ["bo-reports", communeId], queryFn: () => listReports({ communeId }) });
  const { data: reviews = [] } = useQuery({ queryKey: ["bo-reviews", communeId], queryFn: () => listReviews({ communeId }) });
  const { data: activity = [] } = useQuery({ queryKey: ["bo-journal", communeId], queryFn: () => listActivity(communeId!), enabled: !!communeId });

  const totalViews = parks.reduce((s, p) => s + p.views, 0);
  const resolved = reports.filter((r) => r.status === "resolved").length;
  const dismissed = reports.filter((r) => r.status === "dismissed").length;
  const open = reports.filter((r) => r.status === "open").length;
  const totalReports = reports.length || 1;
  const resolutionRate = Math.round(((resolved + dismissed) / totalReports) * 100);
  const avgResolutionDays = reports.filter((r) => r.resolution_days).length
    ? Math.round(reports.reduce((s, r) => s + (r.resolution_days ?? 0), 0) / reports.filter((r) => r.resolution_days).length)
    : null;

  const avgRating = parks.length ? parks.reduce((s, p) => s + p.rating, 0) / parks.length : 0;

  const amenityKeys = Object.keys(SERVICE_LABEL) as (keyof typeof SERVICE_LABEL)[];
  const amenityPct = amenityKeys.map((k) => ({
    key: k,
    label: SERVICE_LABEL[k],
    pct: parks.length ? Math.round((parks.filter((p) => (p as any)[k]).length / parks.length) * 100) : 0,
  }));

  const teamCounts = Object.entries(
    activity.reduce<Record<string, number>>((acc, a) => {
      acc[a.actor] = (acc[a.actor] ?? 0) + 1;
      return acc;
    }, {}),
  ).sort((a, b) => b[1] - a[1]);
  const maxTeamCount = Math.max(1, ...teamCounts.map(([, n]) => n));

  function exportCsv() {
    const csv = toCsv(parks.map((p) => ({ Parc: p.name, Vues: p.views })), ["Parc", "Vues"]);
    downloadCsv("toboggo-statistiques.csv", csv);
  }

  return (
    <div>
      <PageHeader
        title="Statistiques"
        actions={
          <Button size="sm" variant="secondary" onClick={exportCsv}>
            Exporter CSV
          </Button>
        }
      />

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <Card>
          <h2 style={{ fontSize: 15, marginBottom: 12 }}>Fréquentation</h2>
          <div style={{ fontFamily: "var(--font-heading)", fontWeight: 700, fontSize: 26, marginBottom: 12 }}>{totalViews} vues</div>
          {parks
            .slice()
            .sort((a, b) => b.views - a.views)
            .slice(0, 6)
            .map((p) => (
              <div key={p.id} onClick={() => navigate("/parks")} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, cursor: "pointer", fontSize: 12.5 }}>
                <span style={{ width: 90, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.name}</span>
                <Bar pct={totalViews ? (p.views / totalViews) * 100 : 0} />
                <span>{p.views}</span>
              </div>
            ))}
        </Card>

        <Card>
          <h2 style={{ fontSize: 15, marginBottom: 12 }}>Traitement des signalements</h2>
          <div style={{ fontFamily: "var(--font-heading)", fontWeight: 700, fontSize: 26, marginBottom: 4 }}>{resolutionRate}%</div>
          <div style={{ fontSize: 12, color: "var(--color-text-muted)", marginBottom: 12 }}>
            {avgResolutionDays != null ? `Traité en ${avgResolutionDays}j en moyenne` : "Pas encore de données de délai"}
          </div>
          <div onClick={() => navigate("/reports")} style={{ display: "flex", gap: 4, height: 10, borderRadius: 999, overflow: "hidden", cursor: "pointer", marginBottom: 8 }}>
            <div style={{ width: `${(resolved / totalReports) * 100}%`, background: "var(--color-primary)" }} />
            <div style={{ width: `${(dismissed / totalReports) * 100}%`, background: "var(--color-text-faint)" }} />
            <div style={{ width: `${(open / totalReports) * 100}%`, background: "var(--color-warning-text)" }} />
          </div>
          <div style={{ fontSize: 12, display: "flex", gap: 12 }}>
            <span>Résolus {resolved}</span>
            <span>Ignorés {dismissed}</span>
            <span>Ouverts {open}</span>
          </div>
        </Card>

        <Card>
          <h2 style={{ fontSize: 15, marginBottom: 12 }}>Note moyenne</h2>
          <div style={{ fontFamily: "var(--font-heading)", fontWeight: 700, fontSize: 26, marginBottom: 12 }}>⭐ {avgRating.toFixed(1)}</div>
          {reviews.length === 0 ? (
            <p style={{ fontSize: 12.5, color: "var(--color-text-muted)" }}>Aucun avis pour l'instant.</p>
          ) : (
            parks
              .filter((p) => p.review_count > 0)
              .slice(0, 6)
              .map((p) => (
                <div key={p.id} onClick={() => navigate("/reviews")} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, cursor: "pointer", fontSize: 12.5 }}>
                  <span style={{ width: 90, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.name}</span>
                  <Bar pct={(p.rating / 5) * 100} color="var(--color-accent)" />
                  <span>{p.rating.toFixed(1)}</span>
                </div>
              ))
          )}
        </Card>

        <Card>
          <h2 style={{ fontSize: 15, marginBottom: 12 }}>Équipements présents</h2>
          {amenityPct.map((a) => (
            <div key={a.key} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, fontSize: 12.5 }}>
              <span style={{ width: 90 }}>{a.label}</span>
              <Bar pct={a.pct} />
              <span>{a.pct}%</span>
            </div>
          ))}
        </Card>

        <Card style={{ gridColumn: "1 / -1" }}>
          <h2 style={{ fontSize: 15, marginBottom: 12 }}>Activité de l'équipe</h2>
          {teamCounts.length === 0 ? (
            <p style={{ fontSize: 12.5, color: "var(--color-text-muted)" }}>Aucune activité enregistrée.</p>
          ) : (
            teamCounts.map(([actor, n]) => (
              <div key={actor} onClick={() => navigate("/journal")} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, cursor: "pointer", fontSize: 12.5 }}>
                <span style={{ width: 100 }}>{actor}</span>
                <Bar pct={(n / maxTeamCount) * 100} />
                <span>{n} actions</span>
              </div>
            ))
          )}
        </Card>
      </div>
    </div>
  );
}
