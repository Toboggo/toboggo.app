import { useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { Input } from "@toboggo/design-system";
import { fetchNearbyParks, getParkDisplayName, haversineMeters, searchParks, type Park } from "@toboggo/shared";
import { ParkPhoto } from "./ParkPhoto";
import { useFormat } from "../i18n/useFormat";
import { useGeo } from "../lib/geo";

/**
 * Dedup-focused radius (autour du repère) for "Parcs à proximité" — wide enough to catch the park
 * down the street that a parent wouldn't think to search by name, tight enough
 * to stay relevant (`find_duplicate_parks` itself defaults to 200 m for its
 * stricter, name-aware score — see the module doc comment below).
 */
const NEARBY_RADIUS_M = 1000;

/** Results shown before an explicit "Voir plus" — keeps "Aucun de ceux-ci"
 * within immediate reach instead of pushed below a long list. */
const VISIBLE_CAP = 5;

/** Nearby results specifically stay to 3 by default — "Aucun de ceux-ci"
 * must be reachable right after them without scrolling past a longer list. */
const NEARBY_VISIBLE_CAP = 3;

/**
 * Caps a result list to `cap` rows (defaults to `VISIBLE_CAP`) with a "Voir
 * plus" reveal. Once expanded, the extra rows live in a scrollable box of
 * bounded height so growing the list never pushes whatever comes after it
 * (the "Aucun de ceux-ci" CTA) further down the screen.
 */
function CappedRows<T>({ items, renderRow, cap = VISIBLE_CAP }: { items: T[]; renderRow: (item: T) => ReactNode; cap?: number }) {
  const { t } = useTranslation("contribute");
  const [expanded, setExpanded] = useState(false);
  const hidden = items.length - cap;
  const shown = expanded ? items : items.slice(0, cap);
  return (
    <>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 8,
          ...(expanded && hidden > 0 ? { maxHeight: 340, overflowY: "auto" as const, paddingRight: 2 } : {}),
        }}
      >
        {shown.map(renderRow)}
      </div>
      {!expanded && hidden > 0 && (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          style={{
            marginTop: 8,
            background: "none",
            border: "none",
            padding: 0,
            color: "var(--color-primary)",
            fontFamily: "var(--font-heading)",
            fontWeight: 700,
            fontSize: 12.5,
            cursor: "pointer",
          }}
        >
          {t("addParkSearch.seeMore", { count: hidden })}
        </button>
      )}
    </>
  );
}

function ChevronRight() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" style={{ color: "var(--color-text-faint)", flexShrink: 0 }} aria-hidden>
      <path d="M9 6l6 6-6 6" />
    </svg>
  );
}

function ParkResultRow({ park, distanceM, onOpen }: { park: Park; distanceM?: number; onOpen: () => void }) {
  const { t } = useTranslation("contribute");
  const f = useFormat();
  const displayName = getParkDisplayName(park, t);
  const age = f.ageRangeOrNull(park.age_min, park.age_max);
  const meta = [distanceM != null ? f.distance(distanceM) : null, age].filter(Boolean).join(" · ");
  return (
    <button
      type="button"
      onClick={onOpen}
      style={{
        display: "flex",
        gap: 12,
        alignItems: "center",
        textAlign: "left",
        padding: 10,
        borderRadius: 14,
        border: "1.5px solid var(--color-border-strong)",
        background: "var(--color-surface)",
        cursor: "pointer",
        width: "100%",
      }}
    >
      <ParkPhoto
        park={park}
        markSize={20}
        style={{ width: 52, height: 52, borderRadius: 10, flexShrink: 0, backgroundSize: "cover", backgroundPosition: "center" }}
      />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontFamily: "var(--font-heading)", fontWeight: 600, fontSize: 14, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {displayName}
        </div>
        <div style={{ fontSize: 12, color: "var(--color-text-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {meta || park.formatted_address || " "}
        </div>
      </div>
      <ChevronRight />
    </button>
  );
}

/**
 * Détection des doublons de l'étape Localisation du parcours « Ajouter un parc ».
 * Dédiée à ce flux (et non au `ParkPicker` partagé) : elle montre les parcs déjà
 * référencés AUTOUR DU REPÈRE choisi + une recherche par nom, pour qu'un parent
 * reconnaisse un parc existant avant d'en créer un en double.
 *
 * Accessible aux invités : `searchParks` et `fetchNearbyParks` sont lisibles par
 * `anon`. `find_duplicate_parks` (authentifié, scoré en partie sur le nom) n'est
 * volontairement pas appelé ici : le nom n'est saisi qu'à l'étape suivante.
 */
export function AddParkSearch({
  lat,
  lng,
  onPickExisting,
}: {
  /** Position actuelle du repère (le voisinage suit le repère, pas le GPS). */
  lat: number;
  lng: number;
  onPickExisting: (park: Park) => void;
}) {
  const { t } = useTranslation("contribute");
  const { hasFix, lat: userLat, lng: userLng } = useGeo();
  const [query, setQuery] = useState("");

  const { data: searchResults = [], isFetching: searching } = useQuery({
    queryKey: ["add-park-search", query],
    queryFn: () => searchParks(query),
    enabled: query.trim().length >= 2,
  });

  // Arrondi ~100 m : évite de relancer la requête à chaque micro-déplacement.
  const nlat = Number(lat.toFixed(3));
  const nlng = Number(lng.toFixed(3));
  const { data: nearbyParks = [], isFetching: loadingNearby } = useQuery({
    queryKey: ["add-park-nearby", nlat, nlng],
    queryFn: () => fetchNearbyParks({ lat: nlat, lng: nlng, radiusMeters: NEARBY_RADIUS_M }),
  });

  return (
    <section style={{ marginTop: 26 }} aria-labelledby="add-park-dup-title">
      <h2 id="add-park-dup-title" style={{ fontSize: 16, margin: "0 0 4px" }}>
        {t("addParkSearch.title")}
      </h2>
      <p style={{ fontSize: 13, color: "var(--color-text-muted)", margin: "0 0 12px" }}>
        {t("addParkSearch.subtitle")}
      </p>

      <div style={{ fontFamily: "var(--font-heading)", fontWeight: 600, fontSize: 13, marginBottom: 8 }}>
        {t("addParkSearch.nearby")}
      </div>
      <div aria-live="polite">
        {loadingNearby && (
          <p style={{ fontSize: 12, color: "var(--color-text-muted)" }}>{t("addParkSearch.nearbyLoading")}</p>
        )}
        {!loadingNearby && nearbyParks.length === 0 && (
          <p style={{ fontSize: 12.5, color: "var(--color-text-muted)" }}>{t("addParkSearch.nearbyNone")}</p>
        )}
      </div>
      <CappedRows
        items={nearbyParks}
        cap={NEARBY_VISIBLE_CAP}
        renderRow={(p) => <ParkResultRow key={p.id} park={p} distanceM={p.distance_m} onOpen={() => onPickExisting(p)} />}
      />

      <div style={{ marginTop: 16 }}>
        <Input
          label={t("addParkSearch.searchLabel")}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("addParkSearch.searchPlaceholder")}
        />
        {query.trim().length >= 2 && (
          <div style={{ marginTop: 10 }}>
            {searching && <p style={{ fontSize: 12, color: "var(--color-text-muted)" }}>{t("common.searching")}</p>}
            {!searching && searchResults.length === 0 && (
              <p style={{ fontSize: 12, color: "var(--color-text-muted)" }}>{t("addParkSearch.noResults")}</p>
            )}
            <CappedRows
              items={searchResults}
              renderRow={(p) => (
                <ParkResultRow
                  key={p.id}
                  park={p}
                  distanceM={hasFix ? haversineMeters(userLat, userLng, p.latitude, p.longitude) : undefined}
                  onOpen={() => onPickExisting(p)}
                />
              )}
            />
          </div>
        )}
      </div>
    </section>
  );
}
