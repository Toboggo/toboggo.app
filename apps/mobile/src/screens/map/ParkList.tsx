import { useEffect, useRef, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { type Park } from "@toboggo/shared";
import { Icon } from "@toboggo/design-system";
import { ParkCard } from "../../components/ParkCard";
import { useSession } from "../../lib/session";
import { useChildAges } from "../../lib/children";
import { useFilters, type SortMode } from "../../lib/filters";
import { pushShownToEnd } from "./parkListOrder";
import { trackEvent } from "../../lib/analytics";
import styles from "./ParkList.module.css";

const SORT_VALUES: SortMode[] = ["distance", "rating", "recent"];

export function ParkList({
  parks,
  onToggleFavorite,
  forChildren,
  setForChildren,
  header,
  contextualIds,
}: {
  parks: (Park & { distance_m: number })[];
  onToggleFavorite: (id: string) => void;
  forChildren: boolean;
  setForChildren: (v: boolean) => void;
  header?: ReactNode;
  /** Ids already shown in the carousel above — pushed after the rest here
   *  instead of removed, so "all the parks" still means all of them. */
  contextualIds?: string[];
}) {
  const { t } = useTranslation("map");
  const { sort, setSort } = useFilters();
  const favorites = useSession((s) => s.profile?.favorites ?? []);
  const childAges = useChildAges();

  let rows = [...parks];
  if (forChildren && childAges.length > 0) {
    rows = rows.filter((p) => {
      // A park with no recorded age range is never assumed compatible.
      if (p.age_min == null || p.age_max == null) return false;
      const lo = p.age_min;
      const hi = p.age_max;
      return childAges.some((a) => a >= lo && a <= hi);
    });
  }
  rows.sort((a, b) => {
    if (sort === "rating") return b.rating - a.rating;
    if (sort === "recent") return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    return a.distance_m - b.distance_m;
  });
  rows = pushShownToEnd(rows, contextualIds ?? []);

  // `ParkList` n'est monté par `MapExplore` que lorsque `parks` (la prop
  // reçue) est déjà non vide (mode "list" ⇐ `hasResults`) — si `rows` est
  // vide ICI, c'est donc uniquement parce que le filtre "Pour mes enfants" a
  // réduit une liste non vide à zéro, jamais une absence de parcs à la base.
  // `zero_results` ne doit se déclencher qu'à la TRANSITION vers cet état
  // vide, pas à chaque re-render tant qu'on y reste.
  const isEmpty = rows.length === 0;
  const wasEmptyRef = useRef(false);
  useEffect(() => {
    if (isEmpty && !wasEmptyRef.current) {
      trackEvent("zero_results", { reason: "children_age_no_match" });
    }
    wasEmptyRef.current = isEmpty;
  }, [isEmpty]);

  function handleSetSort(value: SortMode) {
    setSort(value);
    trackEvent("filter_applied", { filter_type: "sort", filter_value: value });
  }

  function handleSetForChildren(next: boolean) {
    setForChildren(next);
    trackEvent("filter_applied", { filter_type: "for_children", filter_value: String(next) });
  }

  return (
    <div className={styles.wrap}>
      <div className={styles.stickyHead}>
        {header}
        <div className={styles.controls}>
          <div className={styles.sortRow}>
            {SORT_VALUES.map((value) => (
              <button
                key={value}
                type="button"
                className={styles.sortChip}
                data-on={sort === value ? "1" : undefined}
                onClick={() => handleSetSort(value)}
              >
                {t(`sort.${value}`)}
              </button>
            ))}
          </div>
          {childAges.length > 0 && (
            <button
              type="button"
              className={styles.childChip}
              data-on={forChildren ? "1" : undefined}
              onClick={() => handleSetForChildren(!forChildren)}
            >
              <Icon name="ic-star" size={12} />
              {t("sort.forChildren")}
            </button>
          )}
        </div>
      </div>

      <div className={styles.list}>
        {rows.length === 0 && <div className={styles.empty}>{t("state.listEmpty")}</div>}
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
