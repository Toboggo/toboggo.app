import { useNavigate } from "react-router-dom";
import { formatDistance, walkMinutes, type Park } from "@toboggo/shared";
import { parkPhotoUrl } from "../../lib/photos";
import { useSession } from "../../lib/session";
import styles from "./ParkPreview.module.css";

function Stars({ value }: { value: number }) {
  return (
    <>
      {Array.from({ length: 5 }).map((_, i) => (
        <svg key={i} width="10" height="10" viewBox="0 0 24 24" fill={i < Math.round(value) ? "#FFC107" : "none"} stroke="#FFC107" strokeWidth="1.5" aria-hidden>
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
  const photoCount = Math.max(gallery.length, 3);

  return (
    <div className={styles.wrap}>
      {onBack && (
        <button type="button" className={styles.back} onClick={onBack}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M15 18l-6-6 6-6" />
          </svg>
          Tous les parcs
        </button>
      )}

      <div className={styles.headRow}>
        <div className={styles.photo} style={{ backgroundImage: `url(${parkPhotoUrl(park, 0, 260, 260)})` }} />
        <div className={styles.headBody}>
          <div className={styles.titleRow}>
            <div className={styles.name}>{park.name}</div>
            <div className={styles.circleRow}>
              <button type="button" className={styles.circleBtn} onClick={() => navigate(`/park/${park.id}?share=1`)} aria-label="Partager">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#24303A" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M12 3v12" />
                  <path d="M8 7l4-4 4 4" />
                  <rect x="4" y="12" width="16" height="9" rx="2" />
                </svg>
              </button>
              <button type="button" className={styles.circleBtn} data-on={isFav ? "1" : undefined} onClick={onToggleFavorite} aria-label={isFav ? "Retirer des favoris" : "Ajouter aux favoris"}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill={isFav ? "#EF4444" : "none"} stroke="#EF4444" strokeWidth="2" aria-hidden>
                  <path d="M12 21s-7.5-4.6-10-9.3C.5 7.8 2.7 4 6.5 4c2 0 3.5 1.2 5.5 3.3C14 5.2 15.5 4 17.5 4c3.8 0 6 3.8 4.5 7.7C19.5 16.4 12 21 12 21z" />
                </svg>
              </button>
            </div>
          </div>

          <div className={styles.ratingRow}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="#FFC107" stroke="#FFC107" strokeWidth="1.5" aria-hidden>
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
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" aria-hidden>
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
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#8A8578" strokeWidth="2" aria-hidden>
            <path d="M12 21s7-6.5 7-12a7 7 0 1 0-14 0c0 5.5 7 12 7 12z" />
            <circle cx="12" cy="9" r="2.5" />
          </svg>
          {park.formatted_address}
        </div>
      </div>

      {gallery.length > 0 && (
        <div className={styles.section}>
          <div className={styles.kicker}>Photos</div>
          <div className={styles.photoStrip}>
            {Array.from({ length: photoCount }).map((_, i) => (
              <div key={i} className={styles.stripThumb} style={{ backgroundImage: `url(${parkPhotoUrl(park, i, 160, 160)})` }} />
            ))}
          </div>
        </div>
      )}

      <button type="button" className={styles.report} onClick={() => navigate(`/action-intro/report?park=${park.id}`)}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" />
        </svg>
        Signaler un problème
      </button>
    </div>
  );
}
