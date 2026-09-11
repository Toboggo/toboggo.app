import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button, Tag, useConfirm, useToast } from "@toboggo/design-system";
import { deleteMedia, listPendingMedia, setMediaStatus, setParkCover, type PendingMedia } from "@toboggo/shared";
import { PageHeader } from "../components/PageHeader";
import { useOrgScope } from "../lib/orgScope";
import { queryClient } from "../lib/queryClient";

const SOURCE_LABEL: Record<string, string> = {
  user: "Contributeur",
  municipality: "Collectivité",
  toboggo: "Toboggo",
  open_data: "Open data",
  partner: "Partenaire",
  osm: "OpenStreetMap",
  other: "Autre",
};

export default function Photos() {
  const { communeId } = useOrgScope();
  const confirm = useConfirm();
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);

  const { data: pending = [], isLoading } = useQuery({
    queryKey: ["bo-pending-media", communeId],
    queryFn: () => listPendingMedia({ communeId }),
  });

  function refresh() {
    void queryClient.invalidateQueries({ queryKey: ["bo-pending-media"] });
    void queryClient.invalidateQueries({ queryKey: ["bo-parks"] });
    void queryClient.invalidateQueries({ queryKey: ["shell-pending-media"] });
  }

  async function run(id: string, fn: () => Promise<void>, successMessage: string) {
    if (busy) return;
    setBusy(id);
    try {
      await fn();
      refresh();
      toast.success(successMessage);
    } catch (err: any) {
      toast.error(err?.message ?? "Action impossible.");
    } finally {
      setBusy(null);
    }
  }

  async function approve(m: PendingMedia, asCover: boolean) {
    await setMediaStatus(m.id, "approved");
    if (asCover) await setParkCover(m.park_id, m.id);
  }

  return (
    <div>
      <PageHeader
        title="Photos à valider"
        subtitle="Les photos envoyées par les parents attendent une validation avant d'être publiées."
      />

      {isLoading ? (
        <p style={{ color: "var(--color-text-muted)" }}>Chargement…</p>
      ) : pending.length === 0 ? (
        <p style={{ color: "var(--color-text-muted)" }}>Aucune photo en attente. 🎉</p>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 16 }}>
          {pending.map((m) => (
            <div key={m.id} style={{ background: "var(--color-surface)", borderRadius: 14, overflow: "hidden", border: "1px solid var(--color-border)" }}>
              <a href={m.url} target="_blank" rel="noreferrer">
                <img
                  src={m.url}
                  alt={`Photo proposée pour ${m.park?.name ?? "un parc"}`}
                  style={{ display: "block", width: "100%", height: 180, objectFit: "cover", background: "var(--color-bg-alt)" }}
                />
              </a>
              <div style={{ padding: 12 }}>
                <div style={{ fontWeight: 600, fontSize: 14 }}>{m.park?.name ?? "Parc inconnu"}</div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", margin: "6px 0 10px" }}>
                  <Tag tone="primary">{SOURCE_LABEL[m.source ?? "other"] ?? "Provenance inconnue"}</Tag>
                  <Tag>{new Date(m.created_at).toLocaleDateString("fr-FR")}</Tag>
                </div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <Button size="sm" disabled={!!busy} onClick={() => run(m.id, () => approve(m, false), "Photo approuvée.")}>
                    Approuver
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={!!busy}
                    onClick={() => run(m.id, () => approve(m, true), "Photo approuvée et définie comme couverture.")}
                  >
                    Approuver + couverture
                  </Button>
                  <Button
                    size="sm"
                    variant="danger"
                    disabled={!!busy}
                    onClick={() => run(m.id, () => setMediaStatus(m.id, "rejected"), "Photo refusée.")}
                  >
                    Refuser
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={!!busy}
                    onClick={async () => {
                      const ok = await confirm({
                        title: "Supprimer cette photo",
                        message: "Supprimer définitivement cette photo ? Cette action ne peut pas être annulée.",
                        confirmLabel: "Supprimer",
                        danger: true,
                      });
                      if (ok) await run(m.id, () => deleteMedia(m.id), "Photo supprimée.");
                    }}
                  >
                    Supprimer
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
