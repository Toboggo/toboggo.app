import { useTranslation } from "react-i18next";
import { Icon } from "@toboggo/design-system";
import type { UserContribution } from "@toboggo/shared";
import {
  getStatusVisual,
  getContributionDetail,
  getContributionStatusPresentation,
  getContributionTitle,
  getContributionTypeIcon,
} from "../lib/contributionPresentation";
import { useFormat } from "../i18n/useFormat";
import { ReviewMenu } from "./ReviewMenu";
import { StatusPill } from "./StatusPill";
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

  const rating = item.type === "review" && typeof item.rating === "number" ? `★ ${f.rating(item.rating)}` : null;
  // Park name first (bold, never cut), then the kind of addition, smaller.
  const name = item.parkName || title;
  const kindTitle = item.parkName ? title : null;
  const kindRest = [detail, rating, item.city].filter(Boolean).join(" · ");
  const statusLabel = t(status.labelKey);

  // One horizontal row, same columns on every entry:
  // miniature | pictogramme (carré pastel) | nom du parc + type | pastille statut + date | chevron.
  // The row's click target is the text block (stretched over the whole row); the status pill
  // is a separate control above it. « Modifier mon avis » takes the chevron's slot on editable reviews.
  return (
    <div className={styles.rowWrap}>
      <span className={styles.thumb} style={photo ? { backgroundImage: `url(${photo})` } : undefined} aria-hidden>
        {!photo && <Icon name="ic-slide" size={20} />}
      </span>
      <span className={styles.typeIcon} data-tone={typeIcon.tone} aria-hidden>
        <Icon name={typeIcon.iconName} size={18} />
      </span>

      <button type="button" className={styles.body} onClick={onClick}>
        <span className={styles.name}>{name}</span>
        {(kindTitle || kindRest) && (
          <span className={styles.kind}>
            {kindTitle && <span>{kindTitle}</span>}
            {kindTitle && kindRest && " · "}
            {kindRest}
          </span>
        )}
      </button>

      <span className={styles.trailing}>
        <StatusPill label={statusLabel} visual={getStatusVisual(status.labelKey)} />
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
      {canEdit && (
        <span className={styles.menu}>
          <ReviewMenu onEdit={() => onEditReview(item)} parkName={item.parkName} />
        </span>
      )}
    </div>
  );
}
