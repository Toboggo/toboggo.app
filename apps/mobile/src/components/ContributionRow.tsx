import { useTranslation } from "react-i18next";
import { Icon } from "@toboggo/design-system";
import type { UserContribution } from "@toboggo/shared";
import {
  getContributionDetail,
  getContributionStatusPresentation,
  getContributionTitle,
  getContributionTypeIcon,
} from "../lib/contributionPresentation";
import { useFormat } from "../i18n/useFormat";
import { ReviewMenu } from "./ReviewMenu";
import styles from "./ContributionRow.module.css";

/** One row of a parent's contribution history — used both on the hub's "Vos
 * dernières contributions" and on the full history list, so the two always
 * read the same way. */
export function ContributionRow({
  item,
  onClick,
  onEditReview,
}: {
  item: UserContribution;
  onClick: () => void;
  /** Reviews only: adds the « ⋯ » → « Modifier mon avis » action (published reviews). */
  onEditReview?: (item: UserContribution) => void;
}) {
  const { t } = useTranslation("contribute");
  const f = useFormat();
  const typeIcon = getContributionTypeIcon(item.type);
  const status = getContributionStatusPresentation(item.type, item.status);
  const title = getContributionTitle(item, t);
  const detail = getContributionDetail(item, t);
  
  const canEdit = item.type === "review" && item.status === "published" && !!onEditReview;

  const photo = item.thumbnail ?? item.parkPhoto ?? null;

  const place = [item.parkName, item.city].filter(Boolean).join(" · ");
  const rating = item.type === "review" && typeof item.rating === "number" ? `★ ${f.rating(item.rating)}` : null;

  // miniature → pictogramme (carré pastel) → titre + parc → badge + date → chevron
  const row = (
    <button type="button" className={canEdit ? `${styles.row} ${styles.rowGrow}` : styles.row} onClick={onClick}>
      <span className={styles.thumb} style={photo ? { backgroundImage: `url(${photo})` } : undefined} aria-hidden>
        {!photo && <Icon name="ic-slide" size={20} />}
      </span>
      <span className={styles.typeIcon} data-tone={typeIcon.tone} aria-hidden>
        <Icon name={typeIcon.iconName} size={20} />
      </span>

      <span className={styles.body}>
        <span className={styles.title}>{title}</span>
        {place && <span className={styles.subtitle}>{place}</span>}
        {detail && <span className={styles.subtitle}>{detail}</span>}
        {rating && <span className={styles.subtitle}>{rating}</span>}
      </span>

      <span className={styles.trailing}>
        <span className={styles.badge} data-tone={status.tone}>
          {status.tone === "primary" && <Icon name="ic-check" size={12} />}
          {t(status.labelKey)}
        </span>
        <span className={styles.meta}>
          {f.relativeDate(item.createdAt)}
          {item.type === "review" && item.editedAt && ` · ${t("review.editedOn", { date: f.date(item.editedAt) })}`}
        </span>
      </span>

      <Icon name="ic-back" size={14} style={{ flex: "none", color: "var(--color-text-faint)", transform: "rotate(180deg)" }} />
    </button>
  );

  if (!canEdit) return row;
  return (
    <div className={styles.rowWrap}>
      {row}
      <ReviewMenu onEdit={() => onEditReview(item)} parkName={item.parkName} />
    </div>
  );
}
