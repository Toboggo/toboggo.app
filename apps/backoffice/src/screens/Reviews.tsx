import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button, Input, Segmented, StarRating } from "@toboggo/design-system";
import { deleteReview, listReviews, replyToReview, toCsv, downloadCsv } from "@toboggo/shared";
import { PageHeader } from "../components/PageHeader";
import { useOrgScope } from "../lib/orgScope";
import { useOrgSession } from "../lib/orgSession";
import { queryClient } from "../lib/queryClient";

type RatingFilter = "all" | "5" | "4" | "low";

export default function Reviews() {
  const { isAdmin, communeId } = useOrgScope();
  const userName = useOrgSession((s) => s.userName);
  const [query, setQuery] = useState("");
  const [rating, setRating] = useState<RatingFilter>("all");
  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({});

  const { data: reviews = [] } = useQuery({ queryKey: ["bo-reviews", communeId], queryFn: () => listReviews({ communeId }) });

  const filtered = reviews
    .filter((r) => {
      if (rating === "5") return r.stars === 5;
      if (rating === "4") return r.stars === 4;
      if (rating === "low") return r.stars <= 2;
      return true;
    })
    .filter((r: any) => !query || r.author_name.toLowerCase().includes(query.toLowerCase()) || r.parks?.name?.toLowerCase().includes(query.toLowerCase()) || r.comment?.toLowerCase().includes(query.toLowerCase()));

  function exportCsv() {
    const csv = toCsv(
      filtered.map((r: any) => ({ Auteur: r.author_name, Parc: r.parks?.name, Note: r.stars, Commentaire: r.comment ?? "" })),
      ["Auteur", "Parc", "Note", "Commentaire"],
    );
    downloadCsv("toboggo-avis.csv", csv);
  }

  async function onDelete(id: string) {
    if (!confirm("Supprimer cet avis ?")) return;
    await deleteReview(id);
    void queryClient.invalidateQueries({ queryKey: ["bo-reviews"] });
  }

  async function onReply(id: string) {
    const text = replyDrafts[id];
    if (!text) return;
    await replyToReview(id, text, userName);
    void queryClient.invalidateQueries({ queryKey: ["bo-reviews"] });
  }

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
      <div style={{ display: "flex", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
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
        <div style={{ maxWidth: 260 }}>
          <Input placeholder="Auteur, parc ou texte…" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
      </div>

      {filtered.length === 0 ? (
        <p style={{ color: "var(--color-text-muted)" }}>Aucun avis ne correspond.</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {filtered.map((r: any) => (
            <div key={r.id} style={{ padding: 14, background: "var(--color-surface)", borderRadius: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <div>
                  <strong>{r.author_name}</strong> sur {r.parks?.name}
                </div>
                {isAdmin && (
                  <button onClick={() => onDelete(r.id)} style={{ background: "none", border: "none", color: "var(--color-error)", cursor: "pointer", fontSize: 12.5 }}>
                    Supprimer
                  </button>
                )}
              </div>
              <StarRating value={r.stars} size="sm" />
              {r.comment && <p style={{ fontSize: 13.5, marginTop: 6 }}>{r.comment}</p>}

              {!isAdmin && (
                <div style={{ marginTop: 10 }}>
                  {r.reply ? (
                    <div style={{ background: "var(--color-bg-alt)", borderRadius: 10, padding: 10, fontSize: 12.5 }}>
                      <strong>Réponse :</strong> {r.reply}
                    </div>
                  ) : (
                    <div style={{ display: "flex", gap: 8 }}>
                      <Input
                        placeholder="Répondre à cet avis…"
                        value={replyDrafts[r.id] ?? ""}
                        onChange={(e) => setReplyDrafts((d) => ({ ...d, [r.id]: e.target.value }))}
                      />
                      <Button size="sm" onClick={() => onReply(r.id)}>
                        Répondre
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
