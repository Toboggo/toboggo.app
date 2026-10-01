import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { Button, EmptyState, Icon } from "@toboggo/design-system";
import { computeImpactStats, listMyContributions } from "@toboggo/shared";
import { BottomTabs } from "../../components/BottomTabs";
import { ContributionRow } from "../../components/ContributionRow";
import { useSession } from "../../lib/session";
import styles from "./Contributions.module.css";

const QUICK_ACTIONS: { key: "photos" | "editInfo" | "report" | "rate"; to: string; emoji: string; tone: "green" | "amber" | "red" | "blue" }[] = [
  { key: "photos", to: "/photo-add", emoji: "📷", tone: "green" },
  { key: "editInfo", to: "/contribute/edit/pick-park", emoji: "✏️", tone: "amber" },
  { key: "report", to: "/report", emoji: "⚠️", tone: "red" },
  { key: "rate", to: "/rate", emoji: "⭐", tone: "blue" },
];

const RECENT_COUNT = 3;

export default function Contributions() {
  const navigate = useNavigate();
  const { t } = useTranslation("contribute");
  const { t: tCommon } = useTranslation("common");
  const { t: tErr } = useTranslation("errors");
  const userId = useSession((s) => s.userId);

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

  const hasContributed = !!items && items.length > 0;
  const impactStats = items && hasContributed ? computeImpactStats(items) : null;
  // Nothing published/approved yet — a "0 / 0" box the moment a first, still-
  // pending contribution is submitted would read as discouraging rather than
  // informative, so the block only appears once there is real impact to show.
  const impact = impactStats && impactStats.publishedCount > 0 ? impactStats : null;
  const recent = items?.slice(0, RECENT_COUNT) ?? [];

  function openContribution(parkId: string | null) {
    if (parkId) navigate(`/park/${parkId}`);
  }

  return (
    <div className={styles.screen}>
      <div className={styles.header}>
        <h1>{t("hub.title")}</h1>
        <p>{t("hub.subtitle")}</p>
      </div>

      <div className={styles.body}>
        <button type="button" className={styles.addPark} onClick={() => navigate("/action-intro/add")}>
          <span className={styles.addParkIcon}>
            <Icon name="ic-plus" size={20} />
          </span>
          <span className={styles.addParkBody}>
            <span className={styles.addParkTitle}>{t("hub.addPark.title")}</span>
            <span className={styles.addParkSubtitle}>{t("hub.addPark.subtitle")}</span>
          </span>
          <Icon name="ic-back" size={16} style={{ transform: "rotate(180deg)", flex: "none" }} />
        </button>

        <div className={styles.quickGrid}>
          {QUICK_ACTIONS.map((action) => (
            <button
              key={action.key}
              type="button"
              className={styles.quickCard}
              data-tone={action.tone}
              onClick={() => navigate(action.to)}
            >
              <span className={styles.quickIcon} aria-hidden>
                {action.emoji}
              </span>
              {t(`hub.quickActions.${action.key}`)}
            </button>
          ))}
        </div>

        {impact && (
          <div className={styles.impactCard}>
            <div className={styles.impactTitle}>{t("hub.impact.title")}</div>
            <div className={styles.impactStats}>
              <div className={styles.impactStat}>
                <strong>{impact.publishedCount}</strong>
                <span>{t("hub.impact.published")}</span>
              </div>
              <div className={styles.impactStat}>
                <strong>{impact.parksImprovedCount}</strong>
                <span>{t("hub.impact.parksImproved")}</span>
              </div>
            </div>
          </div>
        )}

        <div>
          <div className={styles.sectionHeader}>
            <h2>{t("hub.recent.title")}</h2>
            {hasContributed && (
              <button type="button" className={styles.seeAll} onClick={() => navigate("/contributions/history")}>
                {tCommon("action.seeAll")}
              </button>
            )}
          </div>

          {isError && (
            <>
              <EmptyState icon="⚠️" title={tErr("generic")} />
              <Button variant="secondary" block style={{ marginTop: 12 }} onClick={() => refetch()}>
                {tCommon("action.retry")}
              </Button>
            </>
          )}

          {!isLoading && !isError && !hasContributed && (
            <>
              <EmptyState iconName="ic-list" title={t("hub.empty.title")} description={t("hub.empty.body")} />
              <Button variant="secondary" block style={{ marginTop: 12 }} onClick={() => navigate("/map")}>
                {t("hub.empty.cta")}
              </Button>
            </>
          )}

          {recent.length > 0 && (
            <div className={styles.recentList}>
              {recent.map((item) => (
                <ContributionRow key={item.id} item={item} onClick={() => openContribution(item.parkId)} />
              ))}
            </div>
          )}
        </div>
      </div>

      <BottomTabs />
    </div>
  );
}
