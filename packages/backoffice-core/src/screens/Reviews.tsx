import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Button, Input, Segmented, Select, StarRating, useConfirm } from "@toboggo/design-system";
import { deleteReview, listReviews, replyToReview, toCsv, downloadCsv, type Review, type ReviewStatus } from "@toboggo/shared";
import { PageHeader } from "../components/PageHeader";
import { ReviewStatusTag } from "../components/StatusTag";
import { useOrgScope } from "../lib/orgScope";
import { useOrgSession } from "../lib/orgSession";
import { usePermissions } from "../lib/permissions";
import { useAsyncAction } from "../lib/useAsyncAction";
import { queryClient } from "../lib/queryClient";

type RatingFilter = "all" | "5" | "4" | "low";
type StatusFilter = "all" | ReviewStatus;
type ReviewRow = Review & { parks?: { name: string } };

// Les 4 valeurs viennent de l'enum réel `review_status` (database.types.ts) —
// mêmes libellés que `ReviewStatusTag` (StatusTag.tsx), aucun mapping créé
// ici. Note d'audit (Admin-UI-6E) : seuls `published` (valeur par défaut à la
// création) et `flagged` (`flagReview`, signalement par un parent) sont
// effectivement écrits par du code applicatif aujourd'hui ; `hidden` et
// `pending` sont des valeurs réelles de l'enum mais qu'aucun chemin de code
// n'écrit actuellement — le filtre les propose quand même (valeurs réelles du
// type, pas inventées) au cas où une ligne existante ou future les porterait.
const STATUS_VALUES: StatusFilter[] = ["all", "published", "flagged", "hidden", "pending"];
const STATUS_FILTER_LABEL: Record<StatusFilter, string> = {
  all: "Tous les statuts",
  published: "Publié",
  flagged: "Signalé",
  hidden: "Masqué",
  pending: "En attente",
};

const dateFmt = new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "short", year: "numeric" });

export default function Reviews() {
  const navigate = useNavigate();
  const { communeId } = useOrgScope();
  const { canReplyToReview, canDeleteReview } = usePermissions();
  const userName = useOrgSession((s) => s.userName);
  const confirm = useConfirm();
  const [query, setQuery] = useState("");
  const [rating, setRating] = useState<RatingFilter>("all");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({});

  const { data: reviews = [] } = useQuery({
    queryKey: ["bo-reviews", communeId],
    queryFn: () => listReviews({ communeId }) as Promise<ReviewRow[]>,
  });

  const filtered = reviews
    .filter((r) => {
      if (rating === "5") return r.rating === 5;
      if (rating === "4") return r.rating === 4;
      if (rating === "low") return r.rating <= 2;
      return true;
    })
    .filter((r) => status === "all" || r.status === status)
    .filter((r) => {
      if (!query) return true;
      const needle = query.toLowerCase();
      return (
        r.author_name.toLowerCase().includes(needle) ||
        (r.parks?.name ?? "").toLowerCase().includes(needle) ||
        (r.comment ?? "").toLowerCase().includes(needle)
      );
    });

  function exportCsv() {
    const csv = toCsv(
      filtered.map((r) => ({ Auteur: r.author_name, Parc: r.parks?.name ?? "", Note: r.rating, Statut: r.status, Commentaire: r.comment ?? "" })),
      ["Auteur", "Parc", "Note", "Statut", "Commentaire"],
    );
    downloadCsv("toboggo-avis.csv", csv);
  }

  const { run: onDelete, pending: deleting } = useAsyncAction(
    async (id: string) => {
      const ok = await confirm({
        title: "Supprimer cet avis",
        message: "Supprimer définitivement cet avis ? Cette action ne peut pas être annulée.",
        confirmLabel: "Supprimer",
        danger: true,
      });
      if (!ok) return;
      await deleteReview(id);
      void queryClient.invalidateQueries({ queryKey: ["bo-reviews"] });
    },
    { successMessage: "Avis supprimé." },
  );

  const { run: onReply, pending: replying } = useAsyncAction(
    async (id: string) => {
      const text = replyDrafts[id];
      if (!text) return;
      await replyToReview(id, text, userName);
      setReplyDrafts((d) => ({ ...d, [id]: "" }));
      void queryClient.invalidateQueries({ queryKey: ["bo-reviews"] });
    },
    { successMessage: "Réponse envoyée." },
  );

  return (
    <div>
      <PageHeader
        title="Avis"
        actions={
          <Button size="sm" variant="secondary" onClick={exportCsv}>
            Exporter CSV
          </Button>
        }
      />
      <div style={{ display: "flex", gap: 12, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>
        <Segmented
          options={[
            { value: "all", label: "Toutes" },
            { value: "5", label: "5★" },
            { value: "4", label: "4★" },
            { value: "low", label: "≤2★" },
          ]}
          value={rating}
          onChange={(v) => setRating(v as RatingFilter)}
        />
        <Select
          label="Statut"
          value={status}
          onChange={(e) => setStatus(e.target.value as StatusFilter)}
          style={{ minWidth: 160 }}
        >
          {STATUS_VALUES.map((v) => (
            <option key={v} value={v}>
              {STATUS_FILTER_LABEL[v]}
            </option>
          ))}
        </Select>
        <div style={{ maxWidth: 260 }}>
          <Input placeholder="Auteur, parc ou texte…" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
      </div>

      {filtered.length === 0 ? (
        <p style={{ color: "var(--color-text-muted)" }}>Aucun avis ne correspond.</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {filtered.map((r) => (
            <div key={r.id} style={{ padding: 14, background: "var(--color-surface)", borderRadius: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <strong>{r.author_name}</strong>
                    <ReviewStatusTag status={r.status} />
                  </div>
                  <div style={{ fontSize: 12.5, color: "var(--color-text-muted)", marginTop: 2 }}>
                    {r.parks ? (
                      <a
                        href={`/parks/${r.park_id}`}
                        onClick={(e) => {
                          e.preventDefault();
                          navigate(`/parks/${r.park_id}`);
                        }}
                        style={{ color: "inherit", textDecoration: "underline" }}
                      >
                        {r.parks.name}
                      </a>
                    ) : (
                      "Parc inconnu"
                    )}
                    {" · "}
                    {dateFmt.format(new Date(r.created_at))}
                  </div>
                </div>
                {canDeleteReview && (
                  <button
                    disabled={deleting}
                    onClick={() => onDelete(r.id)}
                    style={{ background: "none", border: "none", color: "var(--color-error)", cursor: "pointer", fontSize: 12.5, flexShrink: 0 }}
                  >
                    Supprimer
                  </button>
                )}
              </div>
              <StarRating value={r.rating} size="sm" />
              {r.comment && <p style={{ fontSize: 13.5, marginTop: 6 }}>{r.comment}</p>}

              <div style={{ marginTop: 10 }}>
                {r.reply ? (
                  <div style={{ background: "var(--color-bg-alt)", borderRadius: 10, padding: 10, fontSize: 12.5 }}>
                    <strong>Réponse :</strong> {r.reply}
                  </div>
                ) : canReplyToReview ? (
                  <div style={{ display: "flex", gap: 8 }}>
                    <Input
                      placeholder="Répondre à cet avis…"
                      value={replyDrafts[r.id] ?? ""}
                      onChange={(e) => setReplyDrafts((d) => ({ ...d, [r.id]: e.target.value }))}
                    />
                    <Button size="sm" disabled={replying || !(replyDrafts[r.id] ?? "").trim()} onClick={() => onReply(r.id)}>
                      Répondre
                    </Button>
                  </div>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
