import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  getParkDisplayName,
  rankPlaces,
  searchParks,
  searchPlaces,
  type GeoPlace,
  type Park,
} from "@toboggo/shared";
import { CITIES } from "../../lib/geo";
import { useLocale } from "../../i18n/useLocale";
import { Icon } from "@toboggo/design-system";
import { trackEvent } from "../../lib/analytics";
import { SearchIcon } from "./nearbyIcons";
import styles from "./SearchOverlay.module.css";

const RECENT_KEY = "toboggo-recent-searches";
// Laisse l'utilisateur finir de taper avant d'interroger MapTiler — évite un
// appel réseau (facturé) par frappe.
const GEOCODE_DEBOUNCE_MS = 300;
// Un résultat de géocodage déjà en cache (affiché ou résolu pour Entrée) reste
// réutilisable pour la validation sans nouvel appel facturé.
const PLACES_STALE_MS = 5 * 60 * 1000;

/** Destination géographique transmise à l'écran carte (clic lieu, Entrée, ville suggérée). */
export type SelectedPlace = Pick<GeoPlace, "lat" | "lng" | "name"> & Partial<Pick<GeoPlace, "bbox" | "placeType">>;

/** Parc choisi explicitement : l'écran carte se recentre sur ses coordonnées. */
export interface SelectedPark {
  id: string;
  lat: number | null;
  lng: number | null;
  /** Ville du parc — sert de libellé de zone « Autour de … » après le recentrage. */
  city: string | null;
  name: string;
}

function placesQuery(query: string, language: string) {
  return {
    queryKey: ["search-places", query, language] as const,
    // `throwOnError` : une erreur réseau / HTTP reste distincte de « aucun lieu ».
    queryFn: ({ signal }: { signal?: AbortSignal }) => searchPlaces(query, signal, language, { throwOnError: true }),
    staleTime: PLACES_STALE_MS,
  };
}

function toSelectedPark(p: Park): SelectedPark {
  const lat = Number(p.latitude ?? p.lat);
  const lng = Number(p.longitude ?? p.lng);
  const valid = Number.isFinite(lat) && Number.isFinite(lng) && !(lat === 0 && lng === 0);
  return { id: p.id, lat: valid ? lat : null, lng: valid ? lng : null, city: p.city ?? null, name: p.name };
}

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

/**
 * Décision pure (testable sans rendre l'écran) : à partir du nombre de parcs
 * et de lieux trouvés pour une même recherche déjà débouncée/réglée, calcule
 * les événements analytics à émettre. `search_results_viewed` et
 * `zero_results` sont TOUJOURS mutuellement exclusifs (`resultEvent` ne
 * contient jamais les deux) — voir `SearchOverlay.test.ts`.
 */
export function classifySearchOutcome(
  parkCount: number,
  placeCount: number,
): {
  queryType: "park" | "place";
  resultsCount: number;
  resultEvent: "search_results_viewed" | "zero_results";
} {
  const resultsCount = parkCount + placeCount;
  return {
    queryType: parkCount > 0 ? "park" : "place",
    resultsCount,
    resultEvent: resultsCount > 0 ? "search_results_viewed" : "zero_results",
  };
}

export function SearchOverlay({
  onClose,
  onSelectPark,
  onSelectPlace,
}: {
  onClose: () => void;
  onSelectPark: (park: SelectedPark) => void;
  onSelectPlace: (place: SelectedPlace) => void;
}) {
  const { t } = useTranslation("map");
  const { language } = useLocale();
  const queryClient = useQueryClient();
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const recent = useMemo(loadRecent, []);
  const active = query.trim().length >= 2;
  const geoActive = debouncedQuery.trim().length >= 2;
  // Validation (Entrée) : `requestIdRef` ne garde que la dernière intention de
  // l'utilisateur (nouvelle frappe, clic, autre Entrée) ; une résolution plus
  // ancienne qui revient après coup est ignorée. `resolvingRef` absorbe les
  // Entrée répétées pendant qu'une résolution est en cours.
  const requestIdRef = useRef(0);
  const resolvingRef = useRef(false);
  const [resolving, setResolving] = useState(false);
  const [feedback, setFeedback] = useState<{ kind: "noPlace" | "error"; query: string } | null>(null);

  // Débounce dédié au géocodage distant — la recherche de parcs Toboggo
  // (ci-dessous) garde son comportement inchangé, à chaque frappe.
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query), GEOCODE_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [query]);

  const { data: results, isFetching: resultsFetching } = useQuery({
    queryKey: ["search-parks", query],
    queryFn: () => searchParks(query),
    enabled: active,
  });

  // `signal` est fourni par React Query et annulé automatiquement dès qu'une
  // frappe plus récente change la clé — pas de résultat obsolète qui écrase
  // le plus récent.
  const {
    data: rawPlaces,
    isFetching: placesFetching,
    isError: placesError,
  } = useQuery({ ...placesQuery(debouncedQuery.trim(), language), enabled: geoActive });
  // Même classement que la validation (Entrée) : la 1re ligne LIEUX est
  // exactement la destination qu'Entrée choisira.
  const places = useMemo(() => (rawPlaces ? rankPlaces(debouncedQuery, rawPlaces) : rawPlaces), [rawPlaces, debouncedQuery]);

  // Analytics — une seule fois par recherche "réelle" (débouncée sur
  // `debouncedQuery`, déjà utilisé pour le géocodage ci-dessus, pas un
  // débounce inventé pour l'occasion), une fois les deux requêtes réglées
  // (pas en cours de chargement). `search_results_viewed` et `zero_results`
  // sont mutuellement exclusifs pour une même recherche (l'un OU l'autre,
  // jamais les deux). `trackedQueryRef` évite de ré-émettre tant que
  // `debouncedQuery` ne change pas.
  const trackedQueryRef = useRef<string | null>(null);
  useEffect(() => {
    if (!geoActive) return;
    if (resultsFetching || placesFetching) return;
    if (trackedQueryRef.current === debouncedQuery) return;
    trackedQueryRef.current = debouncedQuery;

    const { queryType, resultsCount, resultEvent } = classifySearchOutcome(results?.length ?? 0, places?.length ?? 0);
    trackEvent("search_performed", { query_type: queryType, results_count: resultsCount });
    if (resultEvent === "search_results_viewed") {
      trackEvent("search_results_viewed", { query_type: queryType, results_count: resultsCount });
    } else {
      trackEvent("zero_results", { reason: "search_no_match" });
    }
  }, [debouncedQuery, geoActive, resultsFetching, placesFetching, results, places]);

  useEffect(() => {
    const el = document.getElementById("toboggo-search-input");
    el?.focus();
  }, []);

  useEffect(
    () => () => {
      requestIdRef.current += 1; // une résolution en vol ne doit plus rien déclencher une fois l'écran fermé
    },
    [],
  );

  function cancelPendingResolution() {
    requestIdRef.current += 1;
    resolvingRef.current = false;
    setResolving(false);
  }

  function dismissKeyboard() {
    document.getElementById("toboggo-search-input")?.blur();
  }

  // Clic sur un parc : comportement parc (recentrage + sélection côté carte).
  function selectPark(p: Park) {
    cancelPendingResolution();
    if (query.trim()) saveRecent(query);
    dismissKeyboard();
    onSelectPark(toSelectedPark(p));
  }

  // UNIQUE point d'entrée « explorer cette zone » : clic sur un lieu, villes
  // suggérées et Entrée convergent ici — jamais deux flux de déplacement.
  function selectGeographicLocation(place: SelectedPlace) {
    cancelPendingResolution();
    setFeedback(null);
    if (query.trim()) saveRecent(query);
    dismissKeyboard();
    onSelectPlace(place);
  }

  // Entrée / « Rechercher » du clavier virtuel = recherche GÉOGRAPHIQUE : on
  // résout la saisie en lieu (cache React Query si déjà là, sinon fetch), on ne
  // regarde jamais la liste PARCS. Aucun lieu / erreur ⇒ message, carte inchangée.
  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const q = query.trim();
    if (q.length < 2 || resolvingRef.current) return;
    const id = ++requestIdRef.current;
    resolvingRef.current = true;
    setResolving(true);
    setFeedback(null);
    try {
      const ranked = rankPlaces(q, await queryClient.fetchQuery(placesQuery(q, language)));
      if (id !== requestIdRef.current) return;
      resolvingRef.current = false;
      setResolving(false);
      if (ranked.length === 0) {
        setFeedback({ kind: "noPlace", query: q });
        return;
      }
      selectGeographicLocation(ranked[0]);
    } catch {
      if (id !== requestIdRef.current) return;
      resolvingRef.current = false;
      setResolving(false);
      setFeedback({ kind: "error", query: q });
    }
  }

  const noParks = !results?.length;
  const noPlaces = !places?.length;
  const pending =
    active && (resolving || resultsFetching || placesFetching || debouncedQuery.trim() !== query.trim());

  return (
    <div className={styles.overlay}>
      <form className={styles.searchBar} onSubmit={(e) => void handleSubmit(e)}>
        <input
          id="toboggo-search-input"
          className={styles.input}
          placeholder={t("searchPlaceholder")}
          value={query}
          onChange={(e) => {
            cancelPendingResolution();
            setFeedback(null);
            setQuery(e.target.value);
          }}
        />
        <button type="button" className={styles.cancel} onClick={onClose}>
          {t("search.cancel")}
        </button>
      </form>

      <div className={styles.content}>
        {!active && (
          <>
            <div className={styles.sectionTitle}>{t("search.nearby")}</div>
            {CITIES.slice(0, 3).map((c) => (
              <button key={c.name} className={styles.row} onClick={() => selectGeographicLocation(c)}>
                <span className={styles.rowIcon}><Icon name="ic-explore" size={18} /></span>
                <span className={styles.rowBody}>
                  <span className={styles.rowName}>{c.name}</span>
                  <span className={styles.rowSub}>{c.region}</span>
                </span>
              </button>
            ))}
            {recent.length > 0 && (
              <>
                <div className={styles.sectionTitle}>{t("search.recent")}</div>
                {recent.map((r) => (
                  <button key={r} className={styles.row} onClick={() => setQuery(r)}>
                    <span className={styles.rowIcon}><SearchIcon size={18} /></span>
                    <span className={styles.rowBody}>
                      <span className={styles.rowName}>{r}</span>
                    </span>
                  </button>
                ))}
              </>
            )}
            <div className={styles.sectionTitle}>{t("search.suggestedCities")}</div>
            {CITIES.map((c) => (
              <button key={c.name} className={styles.row} onClick={() => selectGeographicLocation(c)}>
                <span className={styles.rowIcon}><Icon name="ic-explore" size={18} /></span>
                <span className={styles.rowBody}>
                  <span className={styles.rowName}>{c.name}</span>
                  <span className={styles.rowSub}>{c.region}</span>
                </span>
              </button>
            ))}
          </>
        )}

        {active && (
          <>
            {(results?.length ?? 0) > 0 && (
              <>
                <div className={styles.sectionTitle}>{t("search.parks")}</div>
                {results!.map((p) => (
                  <button
                    key={p.id}
                    className={styles.row}
                    onClick={() => selectPark(p)}
                  >
                    <span className={styles.rowIcon}><Icon name="ic-slide" size={18} /></span>
                    <span className={styles.rowBody}>
                      <span className={styles.rowName}>{getParkDisplayName(p, t)}</span>
                      {p.formatted_address && <span className={styles.rowSub}>{p.formatted_address}</span>}
                    </span>
                  </button>
                ))}
              </>
            )}
            {(places?.length ?? 0) > 0 && (
              <>
                <div className={styles.sectionTitle}>{t("search.places")}</div>
                {places!.map((place) => (
                  <button
                    key={place.id}
                    className={styles.row}
                    onClick={() => selectGeographicLocation(place)}
                  >
                    <span className={styles.rowIcon}><Icon name="ic-explore" size={18} /></span>
                    <span className={styles.rowBody}>
                      <span className={styles.rowName}>{place.name}</span>
                      <span className={styles.rowSub}>{place.context ?? place.label}</span>
                    </span>
                  </button>
                ))}
              </>
            )}
            {feedback && (
              <p className={styles.note} role="status">
                {feedback.kind === "error" ? t("search.error") : t("search.noPlace", { query: feedback.query })}
              </p>
            )}
            {!feedback && noParks && noPlaces && (
              <div className={styles.empty} role="status">
                <SearchIcon size={28} />
                <div className={styles.emptyTitle}>
                  {pending
                    ? t("search.searching")
                    : placesError
                      ? t("search.error")
                      : t("search.noPlace", { query: query.trim() })}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
