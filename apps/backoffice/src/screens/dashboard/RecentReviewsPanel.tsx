import { useNavigate } from "react-router-dom";
import { Button, StarRating, Tag } from "@toboggo/design-system";
import type { Review } from "@toboggo/shared";
import { ParkLink } from "../../components/ParkLink";
import { Panel, PanelEmpty } from "../../components/Panel";
import { relativeTime } from "../../lib/relativeTime";
import styles from "../CommuneDashboard.module.css";

const MAX_ROWS = 5;
const EXCERPT_LENGTH = 90;

function excerpt(comment: string | null): string | null {
  if (!comment) return null;
  return comment.length > EXCERPT_LENGTH ? `${comment.slice(0, EXCERPT_LENGTH).trimEnd()}…` : comment;
}

export function RecentReviewsPanel({
  reviews,
  lowCount = 0,
}: {
  reviews: (Review & { parks?: { name: string } })[];
  /** Real count of ≤2★ reviews needing a look — replaces the old "À traiter"
   * row (COLL-02D §2), shown only when > 0. */
  lowCount?: number;
}) {
  const navigate = useNavigate();
  const recent = reviews.slice(0, MAX_ROWS);

  return (
    <Panel
      title="Avis récents"
      icon="ic-review"
      action={
        (reviews.length > 0 || lowCount > 0) && (
          <span className={styles.panelHeaderActions}>
            {/* Always paired with "Voir tout" below (a low review is still a
             * review, so reviews.length > 0 whenever lowCount > 0) — purely
             * informational, no separate click target needed. */}
            {lowCount > 0 && <Tag tone="warning">{lowCount} ≤2★</Tag>}
            {reviews.length > 0 && (
              <Button variant="ghost" size="sm" onClick={() => navigate("/reviews")}>
                Voir tout
              </Button>
            )}
          </span>
        )
      }
    >
      {recent.length === 0 ? (
        <PanelEmpty icon="ic-review" text="Aucun avis pour le moment." />
      ) : (
        <ul className={styles.panelList}>
          {recent.map((r) => (
            <li key={r.id} className={styles.panelRow}>
              <div className={styles.panelRowBody}>
                <div className={styles.panelRowTitle}>
                  <StarRating value={r.rating} size="sm" showValue={false} /> <ParkLink parkId={r.park_id}>{r.parks?.name ?? "Parc"}</ParkLink>
                </div>
                {excerpt(r.comment) && <div className={styles.panelRowComment}>« {excerpt(r.comment)} »</div>}
                <div className={styles.panelRowMeta}>
                  {r.author_name}
                  {" · "}
                  <time dateTime={r.created_at} title={new Date(r.created_at).toLocaleString("fr-FR")}>
                    {relativeTime(r.created_at)}
                  </time>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
