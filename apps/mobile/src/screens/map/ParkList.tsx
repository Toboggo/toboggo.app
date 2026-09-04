import type { ReactNode } from "react";
import { type Park } from "@toboggo/shared";
import { Icon } from "@toboggo/design-system";
import { ParkCard } from "../../components/ParkCard";
import { useSession } from "../../lib/session";
import { useFilters, type SortMode } from "../../lib/filters";
import styles from "./ParkList.module.css";

const SORT_OPTIONS: { value: SortMode; label: string }[] = [
  { value: "distance", label: "Proximité" },
  { value: "rating", label: "Mieux notés" },
  { value: "recent", label: "Récents" },
];

export function ParkList({
  parks,
  onToggleFavorite,
  forChildren,
  setForChildren,
  header,
}: {
  parks: (Park & { distance_m: number })[];
  onToggleFavorite: (id: string) => void;
  forChildren: boolean;
  setForChildren: (v: boolean) => void;
  header?: ReactNode;
}) {
  const { sort, setSort } = useFilters();
  const favorites = useSession((s) => s.profile?.favorites ?? []);
  const childAges = useSession((s) => s.profile?.children ?? []).map((c) => c.age);

  let rows = [...parks];
  if (forChildren && childAges.length > 0) {
    rows = rows.filter((p) => childAges.some((a) => a >= p.age_min && a <= p.age_max));
  }
  rows.sort((a, b) => {
    if (sort === "rating") return b.rating - a.rating;
    if (sort === "recent") return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    return a.distance_m - b.distance_m;
  });

  return (
    <div className={styles.wrap}>
      <div className={styles.stickyHead}>
        {header}
        <div className={styles.controls}>
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
          {childAges.length > 0 && (
            <button
              type="button"
              className={styles.childChip}
              data-on={forChildren ? "1" : undefined}
              onClick={() => setForChildren(!forChildren)}
            >
              <Icon name="ic-star" size={12} />
              Pour mes enfants
            </button>
          )}
        </div>
      </div>

      <div className={styles.list}>
        {rows.length === 0 && (
          <div className={styles.empty}>Aucun parc adapté à l’âge de vos enfants dans cette zone.</div>
        )}
        {rows.map((p) => (
          <ParkCard
            key={p.id}
            park={p}
            distanceM={p.distance_m}
            favorite={favorites.includes(p.id)}
            onToggleFavorite={() => onToggleFavorite(p.id)}
            variant="list"
          />
        ))}
      </div>
    </div>
  );
}
