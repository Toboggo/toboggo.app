import { useState } from "react";
import { useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Icon } from "@toboggo/design-system";
import { DetailHeader } from "../../components/DetailHeader";
import { usePark } from "../../lib/parksQuery";
import { useFormat } from "../../i18n/useFormat";
import styles from "./ScoreDetail.module.css";

const FACTOR_KEYS = ["clean", "safety", "equipment", "accessibility"] as const;

export default function ScoreDetail() {
  const { id } = useParams();
  const { t } = useTranslation("detail");
  const f = useFormat();
  const { data: park } = usePark(id);
  const [open, setOpen] = useState(false);
  if (!park) return null;

  const score = park.rating * 2;
  const ageClause = f.ageClause(park.age_min, park.age_max);
  const tier =
    score >= 8 ? t("score.tierExcellent") : score >= 6 ? t("score.tierGood") : t("score.tierImprove");
  const tierColor =
    score >= 8 ? "var(--color-success)" : score >= 6 ? "var(--color-accent)" : "var(--color-error)";
  const breakdown = [
    { key: "clean", label: t("score.factors.cleanLabel"), pct: Math.min(100, Math.round(park.rating * 18)) },
    { key: "safety", label: t("score.factors.safetyLabel"), pct: park.has_open_report ? 55 : Math.min(100, Math.round(park.rating * 20)) },
    { key: "equipment", label: t("score.factors.equipmentLabel"), pct: Math.min(100, (park.play_equipment?.length ?? 0) * 15) },
    { key: "accessibility", label: t("score.factors.accessibilityLabel"), pct: park.pmr ? 90 : 45 },
  ];

  return (
    <div className={styles.screen}>
      <DetailHeader title={t("score.title")} />
      <div className={styles.body}>
        <div className={styles.hero}>
          <div className={styles.big}>
            <span style={{ color: tierColor }}>{f.rating(score)}</span>
            <span className={styles.slash}>/10</span>
          </div>
          <span className={styles.tier} style={{ background: tierColor }}>
            {tier}
          </span>
          <div className={styles.heroSub}>
            {ageClause ? t("score.suitableVery", { clause: ageClause }) : t("score.ageUnknown")}
          </div>
        </div>

        {breakdown.map((b) => (
          <div key={b.key}>
            <div className={styles.barLabel}>
              <span>{b.label}</span>
              <span>{f.percent(b.pct)}</span>
            </div>
            <div className={styles.bar}>
              <div style={{ width: `${b.pct}%` }} />
            </div>
          </div>
        ))}

        <div className={styles.card}>
          <div className={styles.cardRow}>
            <Icon name="ic-check" size={16} style={{ color: "var(--color-primary)" }} />
            <span>
              {t("score.verifiedByCommunityPrefix")} <em>{t("score.verifiedByCommunitySuffix")}</em>
            </span>
          </div>
          <div className={styles.cardRow}>
            <Icon name="ic-users" size={16} style={{ color: "var(--color-primary)" }} />
            <span>{t("score.reviewsCounted", { count: park.review_count })}</span>
          </div>
          <div className={styles.cardRow}>
            <Icon
              name="ic-shield"
              size={16}
              style={{ color: park.has_open_report ? "var(--color-error)" : "var(--color-primary)" }}
            />
            <span>
              {park.has_open_report
                ? t("score.openReports", { count: 1 })
                : t("score.noOpenReports")}
            </span>
          </div>
        </div>

        <div className={styles.infoCard}>
          <button type="button" className={styles.infoToggle} onClick={() => setOpen((o) => !o)}>
            <Icon name="ic-question" size={16} style={{ color: "var(--color-text-muted)" }} />
            <span>{t("score.howCalculated")}</span>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" style={{ color: "var(--color-text-muted)", transform: open ? "rotate(90deg)" : "none", transition: "transform .15s" }} aria-hidden>
              <path d="M9 6l6 6-6 6" />
            </svg>
          </button>
          {open && (
            <div className={styles.factors}>
              {FACTOR_KEYS.map((key) => (
                <div key={key} className={styles.factor}>
                  <div className={styles.factorLabel}>{t(`score.factors.${key}Label`)}</div>
                  <div className={styles.factorDesc}>{t(`score.factors.${key}Desc`)}</div>
                </div>
              ))}
            </div>
          )}
        </div>

        <p className={styles.foot}>{t("score.foot")}</p>
      </div>
    </div>
  );
}
