import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Input } from "@toboggo/design-system";
import { isGeocodingConfigured, searchPlaces } from "@toboggo/shared";
import styles from "./ParkNew.module.css";

// Débounce dédié au géocodage distant (facturé) — même convention que
// PinField.tsx / SearchOverlay.tsx côté mobile.
const GEOCODE_DEBOUNCE_MS = 300;
const MIN_CHARS = 2;

/**
 * Recherche géographique d'aide au positionnement (étape 1 de /parks/new).
 *
 * IMPORTANT : ne sert QUʼà obtenir des coordonnées. Sélectionner un résultat
 * appelle `onSelect(lat, lng)` — l'adresse structurée du formulaire
 * (address_line / postal_code / city) n'est JAMAIS remplie ici.
 *
 * `VITE_MAPTILER_KEY` absente → `isGeocodingConfigured()` faux → le composant
 * ne rend rien (carte + saisie manuelle restent le chemin de positionnement).
 */
export function PlaceSearch({ onSelect }: { onSelect: (lat: number, lng: number) => void }) {
  const configured = useMemo(() => isGeocodingConfigured(), []);

  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(query), GEOCODE_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [query]);

  const trimmed = debounced.trim();
  const enabled = configured && trimmed.length >= MIN_CHARS;

  const { data: places = [], isFetching, isError } = useQuery({
    queryKey: ["parknew-place-search", trimmed],
    // `signal` (React Query) annule les réponses obsolètes pendant une frappe rapide.
    queryFn: ({ signal }) => searchPlaces(debounced, signal),
    enabled,
  });

  // Ferme la liste sur clic extérieur.
  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  useEffect(() => setActive(-1), [places]);

  if (!configured) return null;

  function choose(index: number) {
    const place = places[index];
    if (!place) return;
    onSelect(place.lat, place.lng);
    setQuery("");
    setDebounced("");
    setOpen(false);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (!open || places.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => (i + 1) % places.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => (i - 1 + places.length) % places.length);
    } else if (e.key === "Enter" && active >= 0) {
      e.preventDefault();
      choose(active);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  const showStatus = enabled && open && !isError && places.length === 0;

  return (
    <div className={styles.searchWrap} ref={rootRef}>
      <div className={styles.searchField}>
        <Input
          label="Rechercher une ville ou une adresse"
          placeholder="Ex. Millau — ou 11 Cité du Parc, Millau"
          value={query}
          role="combobox"
          aria-expanded={open && places.length > 0}
          aria-autocomplete="list"
          aria-controls="parknew-place-suggestions"
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
        />

        {open && places.length > 0 && (
          <div id="parknew-place-suggestions" role="listbox" className={styles.suggestions}>
            {places.map((p, i) => (
              <button
                key={p.id}
                type="button"
                role="option"
                aria-selected={i === active}
                className={`${styles.suggestion} ${i === active ? styles.suggestionActive : ""}`}
                onMouseEnter={() => setActive(i)}
                onClick={() => choose(i)}
              >
                <span className={styles.suggestionName}>{p.name}</span>
                <span className={styles.suggestionLabel}>{p.label}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      <p className={styles.searchNote}>
        Recherchez un lieu, puis ajustez précisément le repère sur la carte.
      </p>

      {isError && (
        <p className={styles.searchStatus}>La recherche est momentanément indisponible.</p>
      )}
      {showStatus && (
        <p className={styles.searchStatus}>{isFetching ? "Recherche…" : "Aucun lieu trouvé."}</p>
      )}
    </div>
  );
}
