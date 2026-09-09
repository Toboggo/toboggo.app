import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { searchParks, searchPlaces } from "@toboggo/shared";
import { CITIES } from "../../lib/geo";
import { EmptyState, Icon } from "@toboggo/design-system";
import styles from "./SearchOverlay.module.css";

const RECENT_KEY = "toboggo-recent-searches";
// Laisse l'utilisateur finir de taper avant d'interroger MapTiler — évite un
// appel réseau (facturé) par frappe.
const GEOCODE_DEBOUNCE_MS = 300;

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
  onSelectPlace,
}: {
  onClose: () => void;
  onSelectPark: (parkId: string) => void;
  onSelectPlace: (place: { lat: number; lng: number; name: string }) => void;
}) {
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const recent = useMemo(loadRecent, []);
  const active = query.trim().length >= 2;
  const geoActive = debouncedQuery.trim().length >= 2;

  // Débounce dédié au géocodage distant — la recherche de parcs Toboggo
  // (ci-dessous) garde son comportement inchangé, à chaque frappe.
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query), GEOCODE_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [query]);

  const { data: results } = useQuery({
    queryKey: ["search-parks", query],
    queryFn: () => searchParks(query),
    enabled: active,
  });

  // `signal` est fourni par React Query et annulé automatiquement dès qu'une
  // frappe plus récente change la clé — pas de résultat obsolète qui écrase
  // le plus récent.
  const { data: places } = useQuery({
    queryKey: ["search-places", debouncedQuery.trim()],
    queryFn: ({ signal }) => searchPlaces(debouncedQuery, signal),
    enabled: geoActive,
  });

  useEffect(() => {
    const el = document.getElementById("toboggo-search-input");
    el?.focus();
  }, []);

  // Sélection d'un résultat — partagée entre le clic sur une ligne et la
  // validation du champ (Entrée / touche « Rechercher » du clavier virtuel),
  // pour ne pas dupliquer la logique de sélection.
  function selectPark(id: string) {
    saveRecent(query);
    onSelectPark(id);
  }
  function selectPlace(place: { lat: number; lng: number; name: string }) {
    saveRecent(query);
    onSelectPlace(place);
  }

  // Entrée / soumission du champ : sélectionne le premier résultat dans le
  // même ordre de priorité que la liste affichée (parcs Toboggo, puis lieux
  // géocodés). Aucun résultat ⇒ ne rien faire. `preventDefault` évite le
  // rechargement natif du formulaire (pas d'`action`) et tout double submit.
  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (results && results.length > 0) {
      selectPark(results[0].id);
      return;
    }
    if (places && places.length > 0) {
      selectPlace(places[0]);
    }
  }

  return (
    <div className={styles.overlay}>
      <form className={styles.searchBar} onSubmit={handleSubmit}>
        <input
          id="toboggo-search-input"
          className={styles.input}
          placeholder="Rechercher un parc, une ville…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <button type="button" className={styles.cancel} onClick={onClose}>
          Annuler
        </button>
      </form>

      <div className={styles.content}>
        {!active && (
          <>
            <div className={styles.sectionTitle}>À proximité</div>
            {CITIES.slice(0, 3).map((c) => (
              <button key={c.name} className={styles.row} onClick={() => onSelectPlace(c)}>
                <span className={styles.rowIcon}><Icon name="ic-explore" size={16} /></span>
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
              <button key={c.name} className={styles.row} onClick={() => onSelectPlace(c)}>
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
                    onClick={() => selectPark(p.id)}
                  >
                    <span className={styles.rowIcon}><Icon name="ic-slide" size={16} /></span>
                    {p.name}
                    <span className={styles.rowSub}>{p.formatted_address}</span>
                  </button>
                ))}
              </>
            )}
            {(places?.length ?? 0) > 0 && (
              <>
                <div className={styles.sectionTitle}>Lieux</div>
                {places!.map((place) => (
                  <button
                    key={place.id}
                    className={styles.row}
                    onClick={() => selectPlace(place)}
                  >
                    <span className={styles.rowIcon}>🏙️</span>
                    {place.name}
                    <span className={styles.rowSub}>{place.label}</span>
                  </button>
                ))}
              </>
            )}
            {!results?.length && !places?.length && (
              <EmptyState icon="🔍" title={`Aucun résultat pour « ${query} ».`} />
            )}
          </>
        )}
      </div>
    </div>
  );
}
