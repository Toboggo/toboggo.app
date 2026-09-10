import { useEffect, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { incrementParkViews } from "@toboggo/shared";
import { Icon, LogoMark, equipmentIcon } from "@toboggo/design-system";
import { usePark, useParkReviews } from "../../lib/parksQuery";
import { EQUIPMENT_ICON } from "../../lib/equipmentIcons";
import { hasRating } from "../../lib/parkDisplay";
import { useFeatureLabel } from "../../lib/featureLabel";
import { useFormat } from "../../i18n/useFormat";
import { useSession } from "../../lib/session";
import { ShareSheet } from "../../components/ShareSheet";
import { ContributeSheet } from "../../components/ContributeSheet";
import styles from "./Detail.module.css";

function Stars({ value, size = 15 }: { value: number; size?: number }) {
  return (
    <span style={{ display: "inline-flex", color: "var(--color-accent)" }}>
      {Array.from({ length: 5 }).map((_, i) => (
        <svg key={i} width={size} height={size} viewBox="0 0 24 24" fill={i < Math.round(value) ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.5" aria-hidden>
          <path d="M12 2l3.1 6.3 6.9 1-5 4.9 1.2 6.8L12 17.8 5.8 21l1.2-6.8-5-4.9 6.9-1z" />
        </svg>
      ))}
    </span>
  );
}

function CircleBtn({ label, onClick, children, on }: { label: string; onClick: () => void; children: React.ReactNode; on?: boolean }) {
  return (
    <button type="button" className={styles.heroBtn} data-on={on ? "1" : undefined} onClick={onClick} aria-label={label}>
      {children}
    </button>
  );
}

export default function ParkDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { t } = useTranslation("detail");
  const { t: tf } = useTranslation("features");
  const f = useFormat();
  const featureLabel = useFeatureLabel();
  const [params] = useSearchParams();
  const { data: park, isLoading } = usePark(id);
  const { data: reviews = [] } = useParkReviews(id);
  const [photoIndex, setPhotoIndex] = useState(0);
  const [shareOpen, setShareOpen] = useState(params.get("share") === "1");
  const [contribOpen, setContribOpen] = useState(false);
  const userId = useSession((s) => s.userId);
  const favorites = useSession((s) => s.profile?.favorites ?? []);
  const patchProfile = useSession((s) => s.patchProfile);

  useEffect(() => {
    if (id) void incrementParkViews(id);
  }, [id]);

  if (isLoading || !park) {
    return <div className="screen" style={{ padding: 40, textAlign: "center" }}>{t("loading")}</div>;
  }

  const photos = park.photos;
  const hasPhotos = photos.length > 0;
  const isFav = favorites.includes(park.id);
  const score = f.rating(park.rating * 2);
  const tierColor =
    park.rating * 2 >= 8 ? "var(--color-success)" : park.rating * 2 >= 6 ? "var(--color-accent)" : "var(--color-error)";
  const equip = park.play_equipment ?? [];

  function toggleFavorite() {
    if (!userId) return navigate("/login");
    const next = isFav ? favorites.filter((f) => f !== park!.id) : [...favorites, park!.id];
    void patchProfile({ favorites: next });
  }

  const ageClause = f.ageClause(park.age_min, park.age_max);
  const rated = hasRating(park);
  const chips: string[] = [f.ageRange(park.age_min, park.age_max)];

  if (park.fenced) chips.push(tf("attr.fenced"));
  if (park.shade) chips.push(tf("attr.shaded"));
  if (park.wc) chips.push(tf("attr.toilets"));
  if (park.water) chips.push(tf("attr.water"));

  return (
    <div className={styles.wrap}>
      <div
        className={styles.hero}
        data-empty={hasPhotos ? undefined : "1"}
        style={hasPhotos ? { backgroundImage: `url(${photos[photoIndex]})` } : undefined}
      >
        {!hasPhotos && (
          <button
            type="button"
            className={styles.heroEmpty}
            onClick={() => navigate(`/photo-add?park=${park.id}`)}
            aria-label={t("addPhotoAria")}
          >
            <LogoMark size={40} rounded={false} />
            <span>{t("addPhoto")}</span>
          </button>
        )}
        <div className={styles.heroTop}>
          <CircleBtn label={t("a11y.back")} onClick={() => navigate(-1)}>
            <Icon name="ic-back" size={18} style={{ color: "var(--color-text)" }} />
          </CircleBtn>
          <div className={styles.heroTopRight}>
            <CircleBtn label={t("a11y.share")} onClick={() => setShareOpen(true)}>
              <Icon name="ic-share" size={18} style={{ color: "var(--color-text)" }} />
            </CircleBtn>
            <CircleBtn label={t("a11y.favorite")} on={isFav} onClick={toggleFavorite}>
              <svg width="17" height="17" viewBox="0 0 24 24" fill={isFav ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" style={{ color: "var(--color-error)" }} aria-hidden>
                <path d="M12 21s-7.5-4.6-10-9.3C.5 7.8 2.7 4 6.5 4c2 0 3.5 1.2 5.5 3.3C14 5.2 15.5 4 17.5 4c3.8 0 6 3.8 4.5 7.7C19.5 16.4 12 21 12 21z" />
              </svg>
            </CircleBtn>
          </div>
        </div>
        {photos.length > 1 && (
          <>
            <div className={styles.heroTapL} onClick={() => setPhotoIndex((i) => (i > 0 ? i - 1 : photos.length - 1))} />
            <div className={styles.heroTapR} onClick={() => setPhotoIndex((i) => (i + 1) % photos.length)} />
            <div className={styles.dots}>
              {photos.map((_, i) => (
                <span key={i} className={styles.dot} data-on={i === photoIndex ? "1" : undefined} />
              ))}
            </div>
            <span className={styles.counter}>
              {photoIndex + 1}/{photos.length}
            </span>
          </>
        )}
      </div>

      <div className={styles.body}>
        <h1 className={styles.name}>{park.name}</h1>
        {park.formatted_address && <div className={styles.sub}>{park.formatted_address}</div>}

        <div className={styles.ratingRow} onClick={() => navigate(`/park/${park.id}/reviews`)}>
          {rated ? (
            <>
              <Stars value={park.rating} />
              <span>
                {t("ratingWithReviews", { rating: f.rating(park.rating), count: park.review_count })}
              </span>
            </>
          ) : (
            <span>{t("noReviews")}</span>
          )}
        </div>

        {chips.length > 0 && (
          <div className={styles.chips}>
            {chips.map((c) => (
              <span key={c} className={styles.chip}>
                {c}
              </span>
            ))}
          </div>
        )}

        {park.has_score && (
          <button type="button" className={styles.scoreCard} onClick={() => navigate(`/park/${park.id}/score`)}>
            <span className={styles.scoreIcon}>
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: "var(--color-primary)" }} aria-hidden>
                <circle cx="12" cy="8" r="6" />
                <path d="M15.477 12.89 17 22l-5-3-5 3 1.523-9.11" />
              </svg>
            </span>
            <span className={styles.scoreBody}>
              <span className={styles.scoreTitle}>
                Toboggo Score
                <span className={styles.scorePill} style={{ background: tierColor }}>
                  {score}
                </span>
              </span>
              <span className={styles.scoreSub}>
                {ageClause ? t("score.suitable", { clause: ageClause }) : t("score.ageUnknown")}
              </span>
            </span>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" style={{ color: "var(--color-text-muted)" }} aria-hidden>
              <path d="M9 6l6 6-6 6" />
            </svg>
          </button>
        )}

        {park.has_open_report ? (
          <div className={styles.issue}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ color: "var(--color-warning-text)" }} aria-hidden>
              <path d="M12 9v4M12 17h.01" />
              <path d="M10.3 3.9 2.5 17a1.8 1.8 0 0 0 1.5 2.7h16a1.8 1.8 0 0 0 1.5-2.7L13.7 3.9a1.8 1.8 0 0 0-3.4 0z" />
            </svg>
            <span>{t("issueReported")}</span>
          </div>
        ) : (
          <div className={styles.ok}>
            <span className={styles.okDot}>
              <Icon name="ic-check" size={12} style={{ color: "var(--color-on-primary)" }} />
            </span>
            {t("noIssue")}
          </div>
        )}

        {park.description && <p className={styles.desc}>{park.description}</p>}

        <div className={styles.section}>
          <div className={styles.kickerRow}>
            <span className={styles.kicker}>{t("equipment.title")}</span>
            <button type="button" className={styles.seeAll} onClick={() => navigate(`/park/${park.id}/amenities`)}>
              {t("action.seeAll", { ns: "common" })}
            </button>
          </div>
          {equip.length === 0 ? (
            <div className={styles.emptyCard}>
              <span>{t("equipment.unavailable")}</span>
              <button type="button" onClick={() => navigate(`/contribute/edit?park=${park.id}`)}>
                {t("equipment.complete")}
              </button>
            </div>
          ) : (
            <div className={styles.equipRow}>
              {equip.slice(0, 3).map((eq) => {
                const ic = equipmentIcon(eq);
                return (
                  <div key={eq} className={styles.equip}>
                    <span className={styles.equipIcon}>
                      {ic ? <Icon name={ic} size={24} /> : (EQUIPMENT_ICON[eq] ?? "🧩")}
                    </span>
                    <span>{featureLabel(eq)}</span>
                  </div>
                );
              })}
              {equip.length > 3 && (
                <button type="button" className={styles.equip} onClick={() => navigate(`/park/${park.id}/amenities`)}>
                  <span className={styles.equipMore}>{t("equipment.more", { count: equip.length - 3 })}</span>
                  <span>{t("action.seeAll", { ns: "common" })}</span>
                </button>
              )}
            </div>
          )}
        </div>

        <div className={styles.section}>
          <div className={styles.kickerRow}>
            <span className={styles.kicker}>{t("communityPhotos")}</span>
            {hasPhotos && (
              <div className={styles.kickerActions}>
                <button type="button" className={styles.seeAll} onClick={() => navigate(`/photo-add?park=${park.id}`)}>
                  {t("action.add", { ns: "common" })}
                </button>
                <button type="button" className={styles.seeAll} onClick={() => navigate(`/park/${park.id}/photos`)}>
                  {t("action.seeAll", { ns: "common" })}
                </button>
              </div>
            )}
          </div>
          {hasPhotos ? (
            <div className={styles.photoStrip}>
              {photos.map((p, i) => (
                <div key={i} className={styles.photoThumb} style={{ backgroundImage: `url(${p})` }} />
              ))}
              <button
                type="button"
                className={styles.photoAdd}
                onClick={() => navigate(`/photo-add?park=${park.id}`)}
                aria-label={t("addPhoto")}
              >
                <Icon name="ic-plus" size={24} />
              </button>
            </div>
          ) : (
            <div className={styles.emptyCard}>
              <span>{t("noPhotos")}</span>
              <button type="button" onClick={() => navigate(`/photo-add?park=${park.id}`)}>
                {t("addPhoto")}
              </button>
            </div>
          )}
        </div>

        <button type="button" className={styles.reportLink} onClick={() => setContribOpen(true)}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
            <path d="M4 21V4h14l-3 4 3 4H4" />
          </svg>
          {t("contribute")}
        </button>

        <div className={styles.hr} />

        <div className={styles.kickerRow} style={{ marginBottom: 14 }}>
          <h4 className={styles.avisTitle}>{t("parentsReviews")}</h4>
          <button type="button" className={styles.seeAll} onClick={() => navigate(`/park/${park.id}/reviews`)}>
            {t("action.seeAll", { ns: "common" })}
          </button>
        </div>
        {reviews.slice(0, 2).map((r) => (
          <div key={r.id} className={styles.review}>
            <div className={styles.reviewName}>{r.author_name}</div>
            <div className={styles.reviewStars}>
              <Stars value={r.stars} size={11} />
            </div>
            {r.comment && <p>{r.comment}</p>}
          </div>
        ))}
        <button type="button" className={styles.giveReview} onClick={() => navigate(`/rate?park=${park.id}`)}>
          {t("giveReview")}
        </button>
      </div>

      <div className={styles.footer}>
        <button type="button" className={styles.footFav} data-on={isFav ? "1" : undefined} onClick={toggleFavorite} aria-label={t("a11y.favorite")}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill={isFav ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" style={{ color: "var(--color-error)" }} aria-hidden>
            <path d="M12 21s-7.5-4.6-10-9.3C.5 7.8 2.7 4 6.5 4c2 0 3.5 1.2 5.5 3.3C14 5.2 15.5 4 17.5 4c3.8 0 6 3.8 4.5 7.7C19.5 16.4 12 21 12 21z" />
          </svg>
        </button>
        <button type="button" className={styles.footGo} onClick={() => navigate(`/park/${park.id}/directions`)}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" style={{ color: "var(--color-on-primary)" }} aria-hidden>
            <path d="M5 12h14M13 6l6 6-6 6" />
          </svg>
          {t("directions")}
        </button>
      </div>

      <ShareSheet open={shareOpen} onClose={() => setShareOpen(false)} park={park} />
      <ContributeSheet open={contribOpen} onClose={() => setContribOpen(false)} parkId={park.id} />
    </div>
  );
}
