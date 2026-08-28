import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { searchParks } from "@toboggo/shared";
import { CITIES } from "../../lib/geo";
import { EmptyState } from "@toboggo/design-system";
import styles from "./SearchOverlay.module.css";

const RECENT_KEY = "toboggo-recent-searches";

function loadRecent(): string[] {
  try {
    return JSON.parse(localStorage.getItem(RECENT_KEY) || "[]");
  } catch {
    return [];
  }
}

function saveRecent(q: string) {
  const recent = [q, ...loadRecent().filter((r) => r !== q)].slice(0, 5);
  localStorage.setItem(RECENT_KEY, JSON.stringify(recent));
}

export function SearchOverlay({
  onClose,
  onSelectPark,
  onSelectCity,
}: {
  onClose: () => void;
  onSelectPark: (parkId: string) => void;
  onSelectCity: (city: (typeof CITIES)[number]) => void;
}) {
  const [query, setQuery] = useState("");
  const recent = useMemo(loadRecent, []);
  const active = query.trim().length >= 2;

  const { data: results } = useQuery({
    queryKey: ["search-parks", query],
    queryFn: () => searchParks(query),
    enabled: active,
  });

  const matchedCities = active
    ? CITIES.filter((c) => c.name.toLowerCase().includes(query.trim().toLowerCase()))
    : [];

  useEffect(() => {
    const el = document.getElementById("toboggo-search-input");
    el?.focus();
  }, []);

  return (
    <div className={styles.overlay}>
      <div className={styles.searchBar}>
        <input
          id="toboggo-search-input"
          className={styles.input}
          placeholder="Rechercher un parc, une ville…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <button className={styles.cancel} onClick={onClose}>
          Annuler
        </button>
      </div>

      <div className={styles.content}>
        {!active && (
          <>
            <div className={styles.sectionTitle}>À proximité</div>
            {CITIES.slice(0, 3).map((c) => (
              <button key={c.name} className={styles.row} onClick={() => onSelectCity(c)}>
                <span className={styles.rowIcon}>📍</span>
                {c.name}
                <span className={styles.rowSub}>{c.region}</span>
              </button>
            ))}
            {recent.length > 0 && (
              <>
                <div className={styles.sectionTitle}>Recherches récentes</div>
                {recent.map((r) => (
                  <button key={r} className={styles.row} onClick={() => setQuery(r)}>
                    <span className={styles.rowIcon}>🕓</span>
                    {r}
                  </button>
                ))}
              </>
            )}
            <div className={styles.sectionTitle}>Villes suggérées</div>
            {CITIES.map((c) => (
              <button key={c.name} className={styles.row} onClick={() => onSelectCity(c)}>
                <span className={styles.rowIcon}>🏙️</span>
                {c.name}
                <span className={styles.rowSub}>{c.region}</span>
              </button>
            ))}
          </>
        )}

        {active && (
          <>
            {(results?.length ?? 0) > 0 && (
              <>
                <div className={styles.sectionTitle}>Parcs</div>
                {results!.map((p) => (
                  <button
                    key={p.id}
                    className={styles.row}
                    onClick={() => {
                      saveRecent(query);
                      onSelectPark(p.id);
                    }}
                  >
                    <span className={styles.rowIcon}>🛝</span>
                    {p.name}
                    <span className={styles.rowSub}>{p.formatted_address}</span>
                  </button>
                ))}
              </>
            )}
            {matchedCities.length > 0 && (
              <>
                <div className={styles.sectionTitle}>Lieux</div>
                {matchedCities.map((c) => (
                  <button
                    key={c.name}
                    className={styles.row}
                    onClick={() => {
                      saveRecent(query);
                      onSelectCity(c);
                    }}
                  >
                    <span className={styles.rowIcon}>🏙️</span>
                    {c.name}
                    <span className={styles.rowSub}>{c.region}</span>
                  </button>
                ))}
              </>
            )}
            {!results?.length && !matchedCities.length && (
              <EmptyState icon="🔍" title={`Aucun résultat pour « ${query} ».`} />
            )}
          </>
        )}
      </div>
    </div>
  );
}
