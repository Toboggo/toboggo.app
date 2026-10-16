import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Input, Select, FilterBar } from "@toboggo/design-system";
import { listActivity, listTeam } from "@toboggo/shared";
import { PageHeader } from "@toboggo/backoffice-core/components/PageHeader";
import { PanelEmpty } from "@toboggo/backoffice-core/components/Panel";
import { useOrgScope } from "@toboggo/backoffice-core/lib/orgScope";
import styles from "@toboggo/backoffice-core/components/Records.module.css";

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
      <FilterBar>
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
      </FilterBar>

      {filtered.length === 0 ? (
        <PanelEmpty icon="ic-list" text="Aucune activité." />
      ) : (
        <div className={styles.feed}>
          {filtered.map((a) => (
            <div key={a.id} className={styles.feedItem}>
              <span className={styles.feedDot} aria-hidden="true" />
              <div>
                <div className={styles.feedText}>{a.text}</div>
                <div className={styles.feedMeta}>
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
