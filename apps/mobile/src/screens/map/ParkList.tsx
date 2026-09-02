import { useNavigate } from "react-router-dom";
import { formatDistance, type Park } from "@toboggo/shared";
import { ParkPhoto } from "../../components/ParkPhoto";
import { useSession } from "../../lib/session";
import { useFilters, type SortMode } from "../../lib/filters";
import styles from "./ParkList.module.css";

const SORT_OPTIONS: { value: SortMode; label: string }[] = [
  { value: "distance", label: "Proximité" },
  { value: "rating", label: "Mieux notés" },
  { value: "recent", label: "Récents" },
];

const SURFACE_LABEL: Record<string, string> = {
  sable: "Sable",
  gazon: "Gazon",
  sol_souple: "Sol souple",
  non_precise: "",
};

function Stars({ value }: { value: number }) {
  return (
    <>
      {Array.from({ length: 5 }).map((_, i) => (
        <svg key={i} width="11" height="11" viewBox="0 0 24 24" fill={i < Math.round(value) ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.5" style={{ color: "var(--color-accent)" }} aria-hidden>
          <path d="M12 2l3.1 6.3 6.9 1-5 4.9 1.2 6.8L12 17.8 5.8 21l1.2-6.8-5-4.9 6.9-1z" />
        </svg>
      ))}
    </>
  );
}

export function ParkList({
  parks,
  onToggleFavorite,
  forChildren,
  setForChildren,
}: {
  parks: (Park & { distance_m: number })[];
  onToggleFavorite: (id: string) => void;
  forChildren: boolean;
  setForChildren: (v: boolean) => void;
}) {
  const navigate = useNavigate();
  const { sort, setSort } = useFilters();
  const favorites = useSession((s) => s.profile?.favorites ?? []);
  const hasChildren = (useSession((s) => s.profile?.children)?.length ?? 0) > 0;

  const sorted = [...parks].sort((a, b) => {
    if (sort === "rating") return b.rating - a.rating;
    if (sort === "recent") return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    return a.distance_m - b.distance_m;
  });

  return (
    <div className={styles.wrap}>
      <div className={styles.head}>
        <span>Parcs à proximité</span>
        {hasChildren && (
          <button type="button" className={styles.childChip} data-on={forChildren ? "1" : undefined} onClick={() => setForChildren(!forChildren)}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ color: "var(--color-primary)" }} aria-hidden>
              <path d="M12 2l3.1 6.3 6.9 1-5 4.9 1.2 6.8L12 17.8 5.8 21l1.2-6.8-5-4.9 6.9-1z" />
            </svg>
            Pour mes enfants
          </button>
        )}
      </div>
      <div className={styles.divider} />

      <div className={styles.sortRow}>
        {SORT_OPTIONS.map((o) => (
          <button
            key={o.value}
            type="button"
            className={styles.sortChip}
            data-on={sort === o.value ? "1" : undefined}
            onClick={() => setSort(o.value)}
          >
            {o.label}
          </button>
        ))}
      </div>

      <div className={styles.list}>
        {sorted.length === 0 && <div className={styles.empty}>Aucun parc ne correspond à ces filtres.</div>}
        {sorted.map((p) => {
          const isFav = favorites.includes(p.id);
          const bits = [formatDistance(p.distance_m), `${p.age_min}–${p.age_max} ans`, SURFACE_LABEL[p.surface] ?? ""].filter(Boolean);
          return (
            <div key={p.id} className={styles.row}>
              <ParkPhoto park={p} className={styles.thumb} markSize={22} />
              <div className={styles.rowBody} onClick={() => navigate(`/park/${p.id}`)}>
                <div className={styles.rowName}>{p.name}</div>
                <div className={styles.rowMeta}>{bits.join(" · ")}</div>
                <div className={styles.rowStars}>
                  <Stars value={p.rating} />
                  <span>({p.review_count} avis)</span>
                </div>
              </div>
              <button
                type="button"
                className={styles.fav}
                data-on={isFav ? "1" : undefined}
                onClick={() => onToggleFavorite(p.id)}
                aria-label={isFav ? "Retirer des favoris" : "Ajouter aux favoris"}
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill={isFav ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" style={{ color: "var(--color-error)" }} aria-hidden>
                  <path d="M12 21s-7.5-4.6-10-9.3C.5 7.8 2.7 4 6.5 4c2 0 3.5 1.2 5.5 3.3C14 5.2 15.5 4 17.5 4c3.8 0 6 3.8 4.5 7.7C19.5 16.4 12 21 12 21z" />
                </svg>
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
