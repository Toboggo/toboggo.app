import { useTranslation } from "react-i18next";
import { Icon, Tag } from "@toboggo/design-system";
import type { UserContribution } from "@toboggo/shared";
import {
  getContributionDetail,
  getContributionStatusPresentation,
  getContributionTitle,
  getContributionTypeIcon,
} from "../lib/contributionPresentation";
import { useFormat } from "../i18n/useFormat";
import styles from "./ContributionRow.module.css";

const TONE_TO_TAG: Record<string, "primary" | "warning" | "info" | "error" | "neutral"> = {
  primary: "primary",
  warning: "warning",
  info: "info",
  error: "error",
  neutral: "neutral",
};

/** One row of a parent's contribution history — used both on the hub's "Vos
 * dernières contributions" and on the full history list, so the two always
 * read the same way. */
export function ContributionRow({ item, onClick }: { item: UserContribution; onClick: () => void }) {
  const { t } = useTranslation("contribute");
  const f = useFormat();
  const typeIcon = getContributionTypeIcon(item.type);
  const status = getContributionStatusPresentation(item.type, item.status);
  const title = getContributionTitle(item, t);
  const detail = getContributionDetail(item, t);
  const location = [item.parkName, item.city].filter(Boolean).join(" · ");

  return (
    <button type="button" className={styles.row} onClick={onClick}>
      <span className={styles.thumb} style={item.thumbnail ? { backgroundImage: `url(${item.thumbnail})` } : undefined}>
        {!item.thumbnail && ("iconName" in typeIcon ? <Icon name={typeIcon.iconName} size={22} /> : <span aria-hidden>{typeIcon.emoji}</span>)}
        {item.thumbnail && (
          <span className={styles.badge} aria-hidden>
            {"iconName" in typeIcon ? <Icon name={typeIcon.iconName} size={13} /> : typeIcon.emoji}
          </span>
        )}
      </span>

      <span className={styles.body}>
        <span className={styles.title}>{title}</span>
        {location && <span className={styles.subtitle}>{location}</span>}
        {detail && <span className={styles.subtitle}>{detail}</span>}
        {item.type === "review" && typeof item.rating === "number" && (
          <span className={styles.subtitle}>★ {f.rating(item.rating)}</span>
        )}
        <span className={styles.meta}>{f.relativeDate(item.createdAt)}</span>
      </span>

      <span className={styles.trailing}>
        <Tag tone={TONE_TO_TAG[status.tone]}>{t(status.labelKey)}</Tag>
        <Icon name="ic-back" size={16} style={{ color: "var(--color-text-faint)", transform: "rotate(180deg)" }} />
      </span>
    </button>
  );
}
