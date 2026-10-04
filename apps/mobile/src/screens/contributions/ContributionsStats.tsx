import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { Button, Icon, type IconName } from "@toboggo/design-system";
import {
  computeCompletedByType,
  computeImpactStats,
  countMyConfirmations,
  listMyContributions,
  type UserContributionType,
} from "@toboggo/shared";
import { DetailHeader } from "../../components/DetailHeader";
import { useFormat } from "../../i18n/useFormat";
import { useSession } from "../../lib/session";
import styles from "./Contributions.module.css";

const BREAKDOWN: { type: UserContributionType; icon: IconName; labelKey: string }[] = [
  { type: "media", icon: "ic-camera", labelKey: "stats.byType.media" },
  { type: "edit", icon: "ic-pencil", labelKey: "stats.byType.edit" },
  { type: "park", icon: "ic-plus", labelKey: "stats.byType.park" },
  { type: "report", icon: "ic-warning", labelKey: "stats.byType.report" },
  { type: "review", icon: "ic-star", labelKey: "stats.byType.review" },
];

/** « Voir mes stats » — only figures computed from the user's real rows. */
export default function ContributionsStats() {
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
  });

  const items = contributions.data;
  const impact = items ? computeImpactStats(items) : null;
  const byType = items ? computeCompletedByType(items) : null;

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
        {impact && byType && (
          <>
            <div className={styles.statTiles}>
              <div className={styles.statTile}>
                <strong>{f.number(impact.publishedCount)}</strong>
                <span>{t("hub.impact.published")}</span>
              </div>
              <div className={styles.statTile}>
                <strong>{f.number(impact.parksImprovedCount)}</strong>
                <span>{t("hub.impact.parksImproved")}</span>
              </div>
            </div>

            <div className={styles.subCard}>
              <h2 className={styles.subTitle}>{t("stats.byTypeTitle")}</h2>
              <ul className={styles.breakdown}>
                {BREAKDOWN.map((b) => (
                  <li key={b.type}>
                    <span className={styles.breakdownIcon} aria-hidden>
                      <Icon name={b.icon} size={16} />
                    </span>
                    <span className={styles.breakdownLabel}>{t(b.labelKey)}</span>
                    <strong>{f.number(byType[b.type])}</strong>
                  </li>
                ))}
                {confirmations.data != null && (
                  <li>
                    <span className={styles.breakdownIcon} aria-hidden>
                      <Icon name="ic-check" size={16} />
                    </span>
                    <span className={styles.breakdownLabel}>{t("stats.byType.confirmations")}</span>
                    <strong>{f.number(confirmations.data)}</strong>
                  </li>
                )}
              </ul>
            </div>
            <p className={styles.subNote}>{t("stats.note", { total: f.number(items?.length ?? 0) })}</p>
          </>
        )}
      </div>
    </div>
  );
}
