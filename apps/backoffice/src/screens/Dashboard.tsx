import type { CSSProperties } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { StatCard, Card } from "@toboggo/design-system";
import { listParks, listReports, listReviews, listActivity } from "@toboggo/shared";
import { PageHeader } from "../components/PageHeader";
import { useOrgScope } from "../lib/orgScope";

export default function Dashboard() {
  const navigate = useNavigate();
  const { isAdmin, communeId } = useOrgScope();

  const { data: parks = [] } = useQuery({ queryKey: ["dash-parks", communeId], queryFn: () => listParks({ communeId }) });
  const { data: reports = [] } = useQuery({ queryKey: ["dash-reports", communeId], queryFn: () => listReports({ communeId }) });
  const { data: reviews = [] } = useQuery({ queryKey: ["dash-reviews", communeId], queryFn: () => listReviews({ communeId }) });
  const { data: activity = [] } = useQuery({ queryKey: ["dash-activity", communeId, isAdmin], queryFn: () => listActivity(isAdmin ? null : communeId!) });

  const published = parks.filter((p) => p.status === "published").length;
  const pending = parks.filter((p) => p.status === "pending").length;
  const openReports = reports.filter((r) => r.status === "open").length;
  const lowReviews = reviews.filter((r) => r.stars <= 2).length;
  const avgRating = parks.length ? (parks.reduce((s, p) => s + p.rating, 0) / parks.length).toFixed(1) : "—";

  return (
    <div>
      <PageHeader title="Tableau de bord" />

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12, marginBottom: 28 }}>
        {isAdmin ? (
          <>
            <StatCard value={published} label="Parcs actifs" onClick={() => navigate("/parks")} />
            <StatCard value={reports.length ? new Set(reports.map((r) => r.user_id)).size : 0} label="Utilisateurs actifs" onClick={() => navigate("/users")} />
            <StatCard value={reviews.length} label="Avis publiés" onClick={() => navigate("/reviews")} />
            <StatCard value={openReports} label="Signalements ouverts" onClick={() => navigate("/reports")} />
          </>
        ) : (
          <>
            <StatCard value={published} label="Parcs publiés" onClick={() => navigate("/parks")} />
            <StatCard value={avgRating} label="Note moyenne" onClick={() => navigate("/reviews")} />
            <StatCard value={lowReviews} label="Avis ≤2★ à examiner" onClick={() => navigate("/reviews")} />
            <StatCard value={openReports} label="Signalements ouverts" onClick={() => navigate("/reports")} />
          </>
        )}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 20 }}>
        <Card>
          <h2 style={{ fontSize: 15, marginBottom: 12 }}>Activité récente</h2>
          {activity.length === 0 ? (
            <p style={{ fontSize: 13, color: "var(--color-text-muted)" }}>Aucune activité enregistrée.</p>
          ) : (
            activity.slice(0, 8).map((a) => (
              <div key={a.id} style={{ display: "flex", gap: 10, padding: "8px 0", borderBottom: "1px solid var(--color-border)" }}>
                <span style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--color-primary)", marginTop: 5, flexShrink: 0 }} />
                <div>
                  <div style={{ fontSize: 13.5 }}>{a.text}</div>
                  <div style={{ fontSize: 11, color: "var(--color-text-faint)" }}>
                    {a.actor} · {new Date(a.created_at).toLocaleString("fr-FR")}
                  </div>
                </div>
              </div>
            ))
          )}
        </Card>
        <Card>
          <h2 style={{ fontSize: 15, marginBottom: 12 }}>À traiter</h2>
          {pending > 0 && (
            <button onClick={() => navigate("/parks")} style={quickLinkStyle}>
              Parcs en attente de validation <strong>{pending}</strong>
            </button>
          )}
          <button onClick={() => navigate("/reports")} style={quickLinkStyle}>
            Signalements ouverts <strong>{openReports}</strong>
          </button>
          {!isAdmin && (
            <button onClick={() => navigate("/reviews")} style={quickLinkStyle}>
              Avis ≤2★ à examiner <strong>{lowReviews}</strong>
            </button>
          )}
        </Card>
      </div>
    </div>
  );
}

const quickLinkStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  width: "100%",
  padding: "10px 0",
  borderBottom: "1px solid var(--color-border)",
  background: "none",
  border: "none",
  fontSize: 13.5,
  cursor: "pointer",
  textAlign: "left",
};
