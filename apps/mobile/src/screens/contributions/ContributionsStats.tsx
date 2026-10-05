import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { Button, Icon } from "@toboggo/design-system";
import {
  computeImpactStats,
  computeStatsBreakdown,
  countMyConfirmations,
  listMyContributions,
  type UserContributionType,
} from "@toboggo/shared";
import { DetailHeader } from "../../components/DetailHeader";
import { useFormat } from "../../i18n/useFormat";
import { countByStatus, getContributionTypeIcon, getStatusVisual, statusKeyToParam } from "../../lib/contributionPresentation";
import { useSession } from "../../lib/session";
import styles from "./Contributions.module.css";

const HISTORY = "/contributions/history";

/** « Mes stats » — only figures computed from the user's real rows. Every row
 * that shows a chevron opens the matching filtered list (`/contributions/history`). */
export default function ContributionsStats() {
  const navigate = useNavigate();
  const { t } = useTranslation("contribute");
  const { t: tErr } = useTranslation("errors");
  const { t: tCommon } = useTranslation("common");
  const f = useFormat();
  const userId = useSession((s) => s.userId);

  const contributions = useQuery({
    queryKey: ["my-contributions", userId],
    queryFn: () => listMyContributions(userId!),
    enabled: !!userId,
  });
  const confirmations = useQuery({
    queryKey: ["my-confirmations-count", userId],
    queryFn: () => countMyConfirmations(userId!),
    enabled: !!userId,
    retry: false,
  });

  const items = contributions.data;
  const impact = items ? computeImpactStats(items) : null;
  const byType = items ? computeStatsBreakdown(items) : [];
  const byStatus = items ? countByStatus(items) : [];

  function typeValue(row: (typeof byType)[number]): { value: number; hint: string | null } {
    if (row.type === "media") {
      // Units differ: the number is PHOTOS, the hint counts the contributions (batches).
      return { value: row.completedPhotos ?? 0, hint: t("stats.photosHint", { count: row.completed }) };
    }
    return { value: row.completed, hint: null };
  }

  return (
    <div className={styles.subScreen}>
      <DetailHeader title={t("stats.title")} />
      <div className={styles.subBody}>
        {contributions.isError && (
          <>
            <p className={styles.subMessage}>{tErr("generic")}</p>
            <Button variant="secondary" block onClick={() => contributions.refetch()}>
              {tCommon("action.retry")}
            </Button>
          </>
        )}
        {!userId && <p className={styles.subMessage}>{t("stats.signedOut")}</p>}
        {impact && items && (
          <>
            <div className={styles.hero}>
              <span className={styles.heroBadge} aria-hidden>
                <Icon name="ic-leaf" size={24} />
              </span>
              <div>
                <h2>{t("stats.heroTitle")}</h2>
                <p>{t("stats.heroSubtitle")}</p>
              </div>
            </div>

            <div className={styles.statTiles}>
              <div className={styles.statTile}>
                <strong>{f.number(impact.publishedCount)}</strong>
                <span>{t("stats.published")}</span>
              </div>
              <div className={styles.statTile}>
                <strong>{f.number(impact.parksImprovedCount)}</strong>
                <span>{t("stats.parksImproved")}</span>
              </div>
            </div>

            {byType.length > 0 && (
              <>
                <h2 className={styles.sectionTitle}>{t("stats.byTypeTitle")}</h2>
                <ul className={styles.statList}>
                  {byType.map((row) => {
                    const icon = getContributionTypeIcon(row.type as UserContributionType);
                    const { value, hint } = typeValue(row);
                    return (
                      <li key={row.type}>
                        <button
                          type="button"
                          className={styles.statRow}
                          onClick={() => navigate(`${HISTORY}?type=${row.type}&status=published`)}
                        >
                          <span className={styles.statIcon} data-tone={icon.tone} aria-hidden>
                            <Icon name={icon.iconName} size={18} />
                          </span>
                          <span className={styles.statText}>
                            <span className={styles.statLabel}>{t(`stats.byType.${row.type}`)}</span>
                            {hint && <span className={styles.statHint}>{hint}</span>}
                          </span>
                          <span className={styles.statValue}>{f.number(value)}</span>
                          <Icon name="ic-back" size={14} style={{ flex: "none", color: "var(--color-text-faint)", transform: "rotate(180deg)" }} />
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </>
            )}

            {confirmations.data != null && (
              <>
                <h2 className={styles.sectionTitle}>{t("stats.confirmedTitle")}</h2>
                <div className={styles.confirmedBlock}>
                  <div className={`${styles.statRow} ${styles.statRowStatic}`}>
                    <span className={styles.statIcon} aria-hidden>
                      <Icon name="ic-check" size={18} />
                    </span>
                    <span className={styles.statText}>
                      <span className={styles.statLabel}>{t("stats.byType.confirmations")}</span>
                      <span className={styles.statHint}>{t("stats.confirmedHint")}</span>
                    </span>
                    <span className={styles.statValue}>{f.number(confirmations.data)}</span>
                  </div>
                </div>
              </>
            )}

            {byStatus.length > 0 && (
              <>
                <h2 className={styles.sectionTitle}>{t("stats.statusTitle")}</h2>
                <ul className={styles.statList}>
                  {byStatus.map(({ labelKey, count }) => {
                    const visual = getStatusVisual(labelKey);
                    return (
                    <li key={labelKey}>
                      <button
                        type="button"
                        className={styles.statRow}
                        onClick={() => navigate(`${HISTORY}?status=${statusKeyToParam(labelKey)}`)}
                      >
                        <span className={styles.statusIcon} data-tone={visual.tone} aria-hidden>
                          <Icon name={visual.icon} size={18} />
                        </span>
                        <span className={styles.statText}>
                          <span className={styles.statLabel}>{t(labelKey)}</span>
                          <span className={styles.statHint}>{t(`stats.statusHint.${statusKeyToParam(labelKey)}`)}</span>
                        </span>
                        <span className={styles.statValue} data-tone={visual.tone}>
                          {f.number(count)}
                        </span>
                        <Icon name="ic-back" size={14} style={{ flex: "none", color: "var(--color-text-faint)", transform: "rotate(180deg)" }} />
                      </button>
                    </li>
                    );
                  })}
                </ul>
              </>
            )}
            <p className={styles.subNote}>{t("stats.note")}</p>
          </>
        )}
      </div>
    </div>
  );
}
