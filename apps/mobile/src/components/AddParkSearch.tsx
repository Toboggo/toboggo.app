import { useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button, Icon, Input } from "@toboggo/design-system";
import { fetchNearbyParks, formatDistance, haversineMeters, searchParks, type Park } from "@toboggo/shared";
import { ParkPhoto } from "./ParkPhoto";
import { ageRangeLabel } from "../lib/parkDisplay";
import { useGeo } from "../lib/geo";

/**
 * Dedup-focused radius for "Parcs à proximité" — wide enough to catch the park
 * down the street that a parent wouldn't think to search by name, tight enough
 * to stay relevant (`find_duplicate_parks` itself defaults to 200 m for its
 * stricter, name-aware score — see the module doc comment below).
 */
const NEARBY_RADIUS_M = 2000;

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
          Voir plus ({hidden})
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
  const age = ageRangeLabel(park);
  const meta = [distanceM != null ? formatDistance(distanceM) : null, age].filter(Boolean).join(" · ");
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
          {park.name}
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
 * "Quel parc souhaitez-vous ajouter ?" — the dedup step of the Add Park wizard.
 * Dedicated to this flow rather than folded into the shared `ParkPicker`
 * (also used by ReportProblem/AddPhotos/RatePark, which have no "nearby"
 * concept): here we additionally surface a "Parcs à proximité" list so a
 * parent recognises an existing park before creating a duplicate.
 *
 * Guest-friendly by construction: `searchParks` and `fetchNearbyParks` are
 * both readable by `anon`. `find_duplicate_parks` (authenticated-only, and
 * scored in part on name similarity) is intentionally NOT called here — at
 * this step the parent hasn't named the park yet (that's the Informations
 * step), so a name-aware score would have nothing meaningful to compare
 * against. Revisit once a candidate name exists earlier in the flow.
 */
export function AddParkSearch({
  query,
  onQueryChange,
  onPickExisting,
  onNone,
  onUseMyLocation,
  locating,
}: {
  query: string;
  onQueryChange: (q: string) => void;
  onPickExisting: (park: Park) => void;
  onNone: () => void;
  onUseMyLocation: () => void;
  locating: boolean;
}) {
  const { hasFix, lat, lng, permission } = useGeo();

  const { data: searchResults = [], isFetching: searching } = useQuery({
    queryKey: ["add-park-search", query],
    queryFn: () => searchParks(query),
    enabled: query.trim().length >= 2,
  });

  const { data: nearbyParks = [], isFetching: loadingNearby } = useQuery({
    queryKey: ["add-park-nearby", lat, lng],
    queryFn: () => fetchNearbyParks({ lat, lng, radiusMeters: NEARBY_RADIUS_M }),
    enabled: hasFix,
  });

  return (
    <div style={{ padding: "0 20px" }}>
      <h2 style={{ fontSize: 18, marginBottom: 4 }}>Quel parc souhaitez-vous ajouter ?</h2>
      <p style={{ fontSize: 12.5, color: "var(--color-text-muted)", marginBottom: 16 }}>
        Vérifions d'abord qu'il n'est pas déjà référencé.
      </p>

      <Input
        label="Rechercher un parc ou une adresse"
        value={query}
        onChange={(e) => onQueryChange(e.target.value)}
        placeholder="Nom du parc, rue, ville…"
      />
      {query.trim().length >= 2 && (
        <div style={{ marginTop: 10 }}>
          {searching && <p style={{ fontSize: 12, color: "var(--color-text-muted)" }}>Recherche…</p>}
          {!searching && searchResults.length === 0 && (
            <p style={{ fontSize: 12, color: "var(--color-text-muted)" }}>Aucun parc trouvé pour cette recherche.</p>
          )}
          <CappedRows
            items={searchResults}
            renderRow={(p) => (
              <ParkResultRow
                key={p.id}
                park={p}
                distanceM={hasFix ? haversineMeters(lat, lng, p.latitude, p.longitude) : undefined}
                onOpen={() => onPickExisting(p)}
              />
            )}
          />
        </div>
      )}

      <Button variant="secondary" block loading={locating} style={{ marginTop: 20 }} onClick={onUseMyLocation}>
        <Icon name="ic-explore" size={16} style={{ marginRight: 6, display: "inline-block", verticalAlign: "-2px" }} />
        Utiliser ma position actuelle
      </Button>
      {permission === "denied" && (
        <p style={{ fontSize: 12, color: "var(--color-text-muted)", marginTop: 8 }}>
          Position non autorisée — vous pouvez continuer sans, ou rechercher une adresse ci-dessus.
        </p>
      )}

      {hasFix && (
        <div style={{ marginTop: 24 }}>
          <div style={{ fontFamily: "var(--font-heading)", fontWeight: 600, fontSize: 13, marginBottom: 8 }}>
            Parcs à proximité
          </div>
          {loadingNearby && (
            <p style={{ fontSize: 12, color: "var(--color-text-muted)" }}>Recherche des parcs autour de vous…</p>
          )}
          {!loadingNearby && nearbyParks.length === 0 && (
            <p style={{ fontSize: 12.5, color: "var(--color-text-muted)" }}>Aucun parc connu à proximité.</p>
          )}
          <CappedRows
            items={nearbyParks}
            cap={NEARBY_VISIBLE_CAP}
            renderRow={(p) => (
              <ParkResultRow key={p.id} park={p} distanceM={p.distance_m} onOpen={() => onPickExisting(p)} />
            )}
          />
        </div>
      )}

      <Button variant="ghost" block style={{ marginTop: 24 }} onClick={onNone}>
        Aucun de ceux-ci
      </Button>
    </div>
  );
}
