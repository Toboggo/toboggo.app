import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Avatar, Button, Input, Segmented } from "@toboggo/design-system";
import { countParksByCreator, listAllUsers, listReviews, setUserSuspended, toCsv, downloadCsv } from "@toboggo/shared";
import { PageHeader } from "@toboggo/backoffice-core/components/PageHeader";
import { queryClient } from "@toboggo/backoffice-core/lib/queryClient";

type TabValue = "all" | "active" | "suspended";

export default function Users() {
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState<TabValue>("all");

  const { data: users = [] } = useQuery({ queryKey: ["bo-users"], queryFn: listAllUsers });
  // Compteurs « parcs par utilisateur » : lots keyset bornés sur `id,created_by` des seuls parcs
  // créés par un utilisateur — plus de `listParks({})` (tronqué à 1000, vue complète).
  const { data: parkCounts } = useQuery({ queryKey: ["bo-parks-by-creator"], queryFn: () => countParksByCreator() });
  const { data: reviews = [] } = useQuery({ queryKey: ["bo-reviews-all"], queryFn: () => listReviews({}) });

  const filtered = users
    .filter((u) => (tab === "active" ? !u.suspended : tab === "suspended" ? u.suspended : true))
    .filter((u) => !query || u.name.toLowerCase().includes(query.toLowerCase()) || u.email.toLowerCase().includes(query.toLowerCase()));

  function counts(userId: string) {
    return {
      parks: parkCounts?.counts.get(userId) ?? 0,
      reviews: reviews.filter((r: any) => r.user_id === userId).length,
    };
  }

  function exportCsv() {
    const csv = toCsv(
      filtered.map((u) => {
        const c = counts(u.id);
        return { Nom: u.name, "E-mail": u.email, Parcs: c.parks, Avis: c.reviews, Statut: u.suspended ? "Suspendu" : "Actif" };
      }),
      ["Nom", "E-mail", "Parcs", "Avis", "Statut"],
    );
    downloadCsv("toboggo-utilisateurs.csv", csv);
  }

  async function toggleSuspend(userId: string, suspended: boolean) {
    await setUserSuspended(userId, !suspended);
    void queryClient.invalidateQueries({ queryKey: ["bo-users"] });
  }

  return (
    <div>
      <PageHeader
        title="Utilisateurs"
        actions={
          <Button size="sm" variant="secondary" onClick={exportCsv}>
            Exporter CSV
          </Button>
        }
      />
      <div style={{ display: "flex", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
        <Segmented
          options={[
            { value: "all", label: "Tous" },
            { value: "active", label: "Actifs" },
            { value: "suspended", label: "Suspendus" },
          ]}
          value={tab}
          onChange={(v) => setTab(v as TabValue)}
        />
        <div style={{ maxWidth: 260 }}>
          <Input placeholder="Nom ou e-mail…" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
      </div>

      {filtered.length === 0 ? (
        <p style={{ color: "var(--color-text-muted)" }}>Aucun utilisateur ne correspond.</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {filtered.map((u) => {
            const c = counts(u.id);
            return (
              <div key={u.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: 12, background: "var(--color-surface)", borderRadius: 12 }}>
                <Avatar name={u.name} size={36} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontFamily: "var(--font-heading)", fontWeight: 600, fontSize: 14 }}>{u.name}</div>
                  <div style={{ fontSize: 12.5, color: "var(--color-text-muted)" }}>
                    {u.email} · {c.parks}{parkCounts && !parkCounts.complete ? "+" : ""} parcs · {c.reviews} avis
                  </div>
                </div>
                <span style={{ fontSize: 12, color: u.suspended ? "var(--color-error)" : "var(--color-primary)" }}>{u.suspended ? "Suspendu" : "Actif"}</span>
                <Button size="sm" variant="secondary" onClick={() => toggleSuspend(u.id, u.suspended)}>
                  {u.suspended ? "Réactiver" : "Suspendre"}
                </Button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
