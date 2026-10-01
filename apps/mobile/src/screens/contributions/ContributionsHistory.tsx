import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { Button, EmptyState } from "@toboggo/design-system";
import { listMyContributions } from "@toboggo/shared";
import { DetailHeader } from "../../components/DetailHeader";
import { ContributionRow } from "../../components/ContributionRow";
import { FilterSelect, type FilterSelectOption } from "../../components/FilterSelect";
import { CONTRIBUTION_TYPES, getContributionStatusPresentation, getContributionTypeFilterLabel } from "../../lib/contributionPresentation";
import { useSession } from "../../lib/session";
import styles from "./ContributionsHistory.module.css";

const ALL = "all";
type DateFilter = "all" | "last7" | "last30" | "thisYear";

/** Accent/case-insensitive so "millau" also matches "Millau". */
function normalize(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

function withinDateFilter(createdAt: string, filter: DateFilter): boolean {
  if (filter === "all") return true;
  const created = new Date(createdAt);
  const now = new Date();
  if (filter === "thisYear") return created.getFullYear() === now.getFullYear();
  const days = filter === "last7" ? 7 : 30;
  return created.getTime() >= now.getTime() - days * 86_400_000;
}

const STATUS_LABEL_ORDER = [
  "hub.status.published",
  "hub.status.pending",
  "hub.status.inProgress",
  "hub.status.resolved",
  "hub.status.rejected",
  "hub.status.dismissed",
];

/**
 * Phase 3+4: the full contribution history, filterable and searchable.
 * Filtering/search run entirely client-side over the single
 * `listMyContributions` fetch (shared react-query cache key with the hub) —
 * no request is re-issued while typing or changing a dropdown.
 */
export default function ContributionsHistory() {
  const navigate = useNavigate();
  const { t } = useTranslation("contribute");
  const { t: tCommon } = useTranslation("common");
  const { t: tErr } = useTranslation("errors");
  const userId = useSession((s) => s.userId);

  const [type, setType] = useState(ALL);
  const [status, setStatus] = useState(ALL);
  const [date, setDate] = useState(ALL);
  const [city, setCity] = useState(ALL);
  const [search, setSearch] = useState("");

  const {
    data: items,
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey: ["my-contributions", userId],
    queryFn: () => listMyContributions(userId!),
    enabled: !!userId,
  });

  const typeOptions: FilterSelectOption[] = useMemo(
    () => [
      { value: ALL, label: t("history.filters.type.all") },
      ...CONTRIBUTION_TYPES.map((ct) => ({ value: ct, label: getContributionTypeFilterLabel(ct, t) })),
    ],
    [t],
  );

  // Only the statuses actually present in the loaded history — an empty
  // "Refusé" bucket would just be a dead-end filter choice.
  const statusOptions: FilterSelectOption[] = useMemo(() => {
    const present = new Set((items ?? []).map((i) => getContributionStatusPresentation(i.type, i.status).labelKey));
    const known = STATUS_LABEL_ORDER.filter((k) => present.has(k));
    return [{ value: ALL, label: t("history.filters.status.all") }, ...known.map((k) => ({ value: k, label: t(k) }))];
  }, [items, t]);

  // Only the cities present in the loaded history — never a national list.
  const cityOptions: FilterSelectOption[] = useMemo(() => {
    const cities = Array.from(new Set((items ?? []).map((i) => i.city).filter((c): c is string => !!c))).sort((a, b) =>
      a.localeCompare(b, undefined, { sensitivity: "base" }),
    );
    return [{ value: ALL, label: t("history.filters.city.all") }, ...cities.map((c) => ({ value: c, label: c }))];
  }, [items, t]);

  const dateOptions: FilterSelectOption[] = useMemo(
    () => [
      { value: "all", label: t("history.filters.date.all") },
      { value: "last7", label: t("history.filters.date.last7") },
      { value: "last30", label: t("history.filters.date.last30") },
      { value: "thisYear", label: t("history.filters.date.thisYear") },
    ],
    [t],
  );

  const filtersActive = type !== ALL || status !== ALL || date !== ALL || city !== ALL;

  const filteredItems = useMemo(() => {
    if (!items) return [];
    const query = normalize(search.trim());
    return items.filter((item) => {
      if (type !== ALL && item.type !== type) return false;
      if (status !== ALL && getContributionStatusPresentation(item.type, item.status).labelKey !== status) return false;
      if (city !== ALL && item.city !== city) return false;
      if (!withinDateFilter(item.createdAt, date as DateFilter)) return false;
      if (query && !normalize(`${item.parkName ?? ""} ${item.city ?? ""}`).includes(query)) return false;
      return true;
    });
  }, [items, type, status, city, date, search]);

  function resetFilters() {
    setType(ALL);
    setStatus(ALL);
    setDate(ALL);
    setCity(ALL);
    setSearch("");
  }

  function openContribution(parkId: string | null) {
    if (parkId) navigate(`/park/${parkId}`);
  }

  const hasItems = !!items && items.length > 0;

  return (
    <div className={styles.screen}>
      <DetailHeader title={t("history.title")} />
      <p className={styles.subtitle}>{t("history.subtitle")}</p>

      <div className={styles.body}>
        {isLoading && (
          <div className={styles.skeletonList} aria-hidden="true">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className={styles.skeletonRow} />
            ))}
          </div>
        )}

        {isError && (
          <>
            <EmptyState icon="⚠️" title={tErr("generic")} />
            <Button variant="secondary" block style={{ marginTop: 12 }} onClick={() => refetch()}>
              {tCommon("action.retry")}
            </Button>
          </>
        )}

        {!isLoading && !isError && !hasItems && (
          <>
            <EmptyState iconName="ic-list" title={t("hub.empty.title")} description={t("hub.empty.body")} />
            <Button variant="secondary" block style={{ marginTop: 12 }} onClick={() => navigate("/map")}>
              {t("hub.empty.cta")}
            </Button>
          </>
        )}

        {!isLoading && !isError && hasItems && (
          <>
            <div className={styles.filterRow}>
              <FilterSelect value={type} options={typeOptions} onChange={setType} ariaLabel={t("history.filters.type.all")} />
              <FilterSelect value={status} options={statusOptions} onChange={setStatus} ariaLabel={t("history.filters.status.all")} />
              <FilterSelect value={date} options={dateOptions} onChange={setDate} ariaLabel={t("history.filters.date.all")} />
              <FilterSelect value={city} options={cityOptions} onChange={setCity} ariaLabel={t("history.filters.city.all")} />
            </div>

            <div className={styles.searchRow}>
              <input
                className={styles.search}
                type="search"
                placeholder={t("history.search.placeholder")}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                aria-label={t("history.search.placeholder")}
              />
              {filtersActive && (
                <button type="button" className={styles.reset} onClick={resetFilters}>
                  {t("history.filters.reset")}
                </button>
              )}
            </div>

            {filteredItems.length === 0 && (
              <>
                <EmptyState icon="🔍" title={t("history.emptyFiltered.title")} />
                <Button variant="secondary" block style={{ marginTop: 12 }} onClick={resetFilters}>
                  {t("history.emptyFiltered.cta")}
                </Button>
              </>
            )}

            {filteredItems.length > 0 && (
              <div className={styles.list}>
                {filteredItems.map((item) => (
                  <ContributionRow key={item.id} item={item} onClick={() => openContribution(item.parkId)} />
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
