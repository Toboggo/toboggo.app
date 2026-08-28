import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Input, Select } from "@toboggo/design-system";
import { listActivity, listTeam } from "@toboggo/shared";
import { PageHeader } from "../components/PageHeader";
import { useOrgScope } from "../lib/orgScope";

export default function Journal() {
  const { isAdmin, communeId } = useOrgScope();
  const [query, setQuery] = useState("");
  const [author, setAuthor] = useState("");

  const { data: activity = [] } = useQuery({ queryKey: ["bo-journal", communeId, isAdmin], queryFn: () => listActivity(isAdmin ? null : communeId!) });
  const { data: team = [] } = useQuery({ queryKey: ["bo-team", communeId, isAdmin], queryFn: () => listTeam(isAdmin ? null : communeId!) });

  const filtered = activity
    .filter((a) => !author || a.actor === author)
    .filter((a) => !query || a.text.toLowerCase().includes(query.toLowerCase()));

  return (
    <div>
      <PageHeader title="Journal" />
      <div style={{ display: "flex", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
        <div style={{ maxWidth: 260 }}>
          <Input placeholder="Rechercher dans le journal…" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
        <Select value={author} onChange={(e) => setAuthor(e.target.value)} style={{ maxWidth: 200 }}>
          <option value="">Tous les auteurs</option>
          {Array.from(new Set(team.map((t) => t.name))).map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </Select>
      </div>

      {filtered.length === 0 ? (
        <p style={{ color: "var(--color-text-muted)" }}>Aucune activité.</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {filtered.map((a) => (
            <div key={a.id} style={{ display: "flex", gap: 10, padding: "10px 0", borderBottom: "1px solid var(--color-border)" }}>
              <span style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--color-primary)", marginTop: 5, flexShrink: 0 }} />
              <div>
                <div style={{ fontSize: 13.5 }}>{a.text}</div>
                <div style={{ fontSize: 11.5, color: "var(--color-text-faint)" }}>
                  {a.actor} · {new Date(a.created_at).toLocaleString("fr-FR")}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
