import { useNavigate } from "react-router-dom";
import { Icon } from "@toboggo/design-system";
import { formatDistance, walkMinutes, type Park } from "@toboggo/shared";
import { ParkPhoto } from "../../components/ParkPhoto";
import { useSession } from "../../lib/session";
import styles from "./ParkPreview.module.css";

function Stars({ value }: { value: number }) {
  return (
    <>
      {Array.from({ length: 5 }).map((_, i) => (
        <svg key={i} width="10" height="10" viewBox="0 0 24 24" fill={i < Math.round(value) ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.5" style={{ color: "var(--color-accent)" }} aria-hidden>
          <path d="M12 2l3.1 6.3 6.9 1-5 4.9 1.2 6.8L12 17.8 5.8 21l1.2-6.8-5-4.9 6.9-1z" />
        </svg>
      ))}
    </>
  );
}

export function ParkPreview({
  park,
  distanceM,
  onToggleFavorite,
  onBack,
}: {
  park: Park & { distance_m?: number };
  distanceM?: number;
  onToggleFavorite: () => void;
  onBack?: () => void;
}) {
  const navigate = useNavigate();
  const favorites = useSession((s) => s.profile?.favorites ?? []);
  const isFav = favorites.includes(park.id);
  const dist = distanceM ?? park.distance_m ?? 0;

  const criteria: string[] = [`${park.age_min}–${park.age_max} ans`];
  if (park.fenced) criteria.push("Clôturé");
  if (park.shade) criteria.push("Ombragé");
  if (park.wc) criteria.push("WC");

  const gallery = (park.photos ?? []).slice(0, 6);

  return (
    <div className={styles.wrap}>
      {onBack && (
        <button type="button" className={styles.back} onClick={onBack}>
          <Icon name="ic-back" size={13} />
          Tous les parcs
        </button>
      )}

      <div className={styles.headRow}>
        <ParkPhoto park={park} className={styles.photo} markSize={30} />
        <div className={styles.headBody}>
          <div className={styles.titleRow}>
            <div className={styles.name}>{park.name}</div>
            <div className={styles.circleRow}>
              <button type="button" className={styles.circleBtn} onClick={() => navigate(`/park/${park.id}?share=1`)} aria-label="Partager">
                <Icon name="ic-share" size={15} style={{ color: "var(--color-text)" }} />
              </button>
              <button type="button" className={styles.circleBtn} data-on={isFav ? "1" : undefined} onClick={onToggleFavorite} aria-label={isFav ? "Retirer des favoris" : "Ajouter aux favoris"}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill={isFav ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" style={{ color: "var(--color-error)" }} aria-hidden>
                  <path d="M12 21s-7.5-4.6-10-9.3C.5 7.8 2.7 4 6.5 4c2 0 3.5 1.2 5.5 3.3C14 5.2 15.5 4 17.5 4c3.8 0 6 3.8 4.5 7.7C19.5 16.4 12 21 12 21z" />
                </svg>
              </button>
            </div>
          </div>

          <div className={styles.ratingRow}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth="1.5" style={{ color: "var(--color-accent)" }} aria-hidden>
              <path d="M12 2l3.1 6.3 6.9 1-5 4.9 1.2 6.8L12 17.8 5.8 21l1.2-6.8-5-4.9 6.9-1z" />
            </svg>
            <strong>{park.rating.toFixed(1)}</strong>
            <span className={styles.reviewsLink} onClick={() => navigate(`/park/${park.id}/reviews`)}>
              ({park.review_count} avis)
            </span>
            <span className={styles.walk}>{walkMinutes(dist)} min · {formatDistance(dist)}</span>
          </div>

          <div className={styles.chips}>
            {criteria.map((c) => (
              <span key={c} className={styles.chip}>
                {c}
              </span>
            ))}
          </div>
        </div>
      </div>

      <div className={styles.actions}>
        <button type="button" className={styles.primary} onClick={() => navigate(`/park/${park.id}/directions`)}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" style={{ color: "var(--color-on-primary)" }} aria-hidden>
            <path d="M5 12h14M13 6l6 6-6 6" />
          </svg>
          Itinéraire
        </button>
        <button type="button" className={styles.secondary} onClick={() => navigate(`/park/${park.id}`)}>
          Voir la fiche
        </button>
      </div>

      <div className={styles.hr} />

      <div className={styles.infoRows}>
        <div className={styles.infoRow}>
          <Icon name="ic-explore" size={16} style={{ color: "var(--color-text-muted)" }} />
          {park.formatted_address}
        </div>
      </div>

      {gallery.length > 0 && (
        <div className={styles.section}>
          <div className={styles.kicker}>Photos</div>
          <div className={styles.photoStrip}>
            {gallery.map((url, i) => (
              <div key={i} className={styles.stripThumb} style={{ backgroundImage: `url(${url})` }} />
            ))}
          </div>
        </div>
      )}

      <button type="button" className={styles.report} onClick={() => navigate(`/action-intro/report?park=${park.id}`)}>
        <Icon name="ic-flag" size={14} />
        Signaler un problème
      </button>
    </div>
  );
}
