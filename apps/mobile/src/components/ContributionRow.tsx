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
  const subtitle = [place, detail, rating].filter(Boolean).join(" · ");

  // One horizontal row, same columns on every entry:
  // miniature | pictogramme (carré pastel) | titre + parc | statut + date | chevron.
  // Long texts are cut with an ellipsis (full text in `title`), never pushing the status.
  // « Modifier mon avis » takes the chevron's slot on editable reviews: no extra column.
  return (
    <div className={styles.rowWrap}>
      <button type="button" className={styles.row} onClick={onClick}>
        <span className={styles.thumb} style={photo ? { backgroundImage: `url(${photo})` } : undefined} aria-hidden>
          {!photo && <Icon name="ic-slide" size={20} />}
        </span>
        <span className={styles.typeIcon} data-tone={typeIcon.tone} aria-hidden>
          <Icon name={typeIcon.iconName} size={18} />
        </span>

        <span className={styles.body}>
          <span className={styles.title} title={title}>
            {title}
          </span>
          {subtitle && (
            <span className={styles.subtitle} title={subtitle}>
              {subtitle}
            </span>
          )}
        </span>

        <span className={styles.trailing}>
          <span className={styles.badge} data-tone={status.tone}>
            {status.tone === "primary" && <Icon name="ic-check" size={11} />}
            {t(status.labelKey)}
          </span>
          <span className={styles.meta}>
            {f.relativeDate(item.createdAt)}
            {item.type === "review" && item.editedAt && ` · ${t("review.editedOn", { date: f.date(item.editedAt) })}`}
          </span>
        </span>

        <span className={styles.chevron} aria-hidden>
          {!canEdit && (
            <Icon name="ic-back" size={14} style={{ color: "var(--color-text-faint)", transform: "rotate(180deg)" }} />
          )}
        </span>
      </button>
      {canEdit && (
        <span className={styles.menu}>
          <ReviewMenu onEdit={() => onEditReview(item)} parkName={item.parkName} />
        </span>
      )}
    </div>
  );
}
