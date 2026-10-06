import { useEffect, useRef, useState } from "react";
import { Navigate, useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Button, EmptyState, Icon, StarInput, Textarea, usePersistentDraft, useAdoptedDraftKey } from "@toboggo/design-system";
import { addMedia, buildDraftKey, createReview, getParkDisplayName, getReview, ImageValidationError, listMyReviews, updateMyReview, uploadPhoto, type AgeBand, type Park, type Review, type ReviewSubRatings } from "@toboggo/shared";
import { ThankYou } from "../../components/flow/ThankYou";
import { PhotoPicker } from "../../components/PhotoPicker";
import { addParkFromHref } from "../../lib/addParkEntry";
import { FaceChoice } from "../../components/flow/FaceChoice";
import { FlowShell, useLeaveGuard } from "../../components/flow/FlowShell";
import { ParkCardMini, ParkChooser } from "../../components/flow/ParkChooser";
import { RecapCard, RecapRow, PhotoThumbs, dedupeAddress } from "../../components/flow/Recap";
import { ParkPhoto } from "../../components/ParkPhoto";
import styles from "../../components/flow/Flow.module.css";
import { usePark } from "../../lib/parksQuery";
import { useSession } from "../../lib/session";
import { useToastStore } from "../../lib/toast";
import { queryClient } from "../../lib/queryClient";
import { setResumeRoute } from "../../lib/resumeRoute";
import { trackEvent } from "../../lib/analytics";

const CRITERIA: { key: keyof ReviewSubRatings; labelKey: string }[] = [
  { key: "clean", labelKey: "rate.criteria.clean" },
  { key: "safety", labelKey: "rate.criteria.safety" },
  { key: "equipment", labelKey: "rate.criteria.equipment" },
  { key: "comfort", labelKey: "rate.criteria.comfort" },
];
const AGE_BANDS: AgeBand[] = ["under3", "3-6", "6-12"];

/** `?stars=N` (1–5) — note déjà choisie dans le rappel de visite post-itinéraire. */
function parsePresetStars(raw: string | null): number {
  const n = Number(raw);
  return Number.isInteger(n) && n >= 1 && n <= 5 ? n : 0;
}

// Brouillon persistant (LOT 3D.E) — socle partagé `usePersistentDraft`.
// v2 : étapes 0 Parc · 1 Mon expérience (note, critères, commentaire, photo) · 2 Vérifier.
// Un brouillon v1 (étape 2 = commentaire) est migré vers l'étape 1.
const RATE_PARK_DRAFT_VERSION = 2;
const RATE_PARK_DRAFT_TTL_MS = 24 * 60 * 60 * 1000; // 24 h

interface RateParkDraft {
  /** 0 = choix du parc (no data of its own) · 1 = mon expérience · 2 = vérification. */
  step: number;
  stars: number;
  subRatings: ReviewSubRatings;
  /** `null`/`"all"` only when editing a review whose age recommendation has no chip. */
  ageBand: AgeBand | null;
  comment: string;
  /** Already-uploaded photo URL only — onPickFile requires `userId`, so a
   * guest never has one to persist. */
  photo: string | null;
}

const DEFAULT_SUB_RATINGS: ReviewSubRatings = { clean: 2, safety: 2, equipment: 2, comfort: 2 };

/** `/review/:reviewId/edit` — loads the caller's own review, then mounts the
 * rating form in edit mode. Anything that is not the caller's editable review
 * (missing, someone else's, no longer published) gets a neutral dead end: the
 * real guard is RLS (migration 0042), this only avoids offering a form that
 * could never save. */
export function EditReviewRoute() {
  const { reviewId } = useParams();
  const navigate = useNavigate();
  const { t } = useTranslation("contribute");
  const { t: tErr } = useTranslation("errors");
  const { t: tCommon } = useTranslation("common");
  const userId = useSession((s) => s.userId);
  const sessionLoading = useSession((s) => s.loading);
  const { data: review, isLoading, isError, refetch } = useQuery({
    queryKey: ["review", reviewId],
    queryFn: () => getReview(reviewId!),
    enabled: !!reviewId && !!userId,
  });

  if (sessionLoading) return <div className="screen" />;
  if (!userId) return <Navigate to="/login" replace />;
  if (isLoading) return <div className="screen" />;
  if (isError) {
    return (
      <div className="screen" style={{ padding: "calc(40px + var(--safe-top)) 20px 0" }}>
        <EmptyState icon="⚠️" title={tErr("generic")} />
        <Button variant="secondary" block style={{ marginTop: 12 }} onClick={() => void refetch()}>
          {tCommon("action.retry")}
        </Button>
      </div>
    );
  }
  if (!review || review.user_id !== userId || review.status !== "published") {
    return (
      <div className="screen" style={{ padding: "calc(40px + var(--safe-top)) 20px 0" }}>
        <EmptyState icon="🔒" title={t("review.edit.unavailable")} />
        <Button variant="secondary" block style={{ marginTop: 12 }} onClick={() => navigate(-1)}>
          {tCommon("action.back")}
        </Button>
      </div>
    );
  }
  return <RatePark editing={review} />;
}

function sameSubRatings(a: ReviewSubRatings, b: ReviewSubRatings): boolean {
  return CRITERIA.every((c) => a[c.key] === b[c.key]);
}

export default function RatePark({ editing }: { editing?: Review } = {}) {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const location = useLocation();
  const wantsResume = params.get("resume") === "1";
  // Navigation origin, explicit and independent from `?stars=` (which only
  // preselects the rating). Any other/invalid value is ignored.
  const fromVisitPrompt = params.get("source") === "visit_prompt";
  const { t } = useTranslation("contribute");
  const { t: tErr } = useTranslation("errors");
  const { t: tCommon } = useTranslation("common");
  const [parkId, setParkId] = useState<string | null>(editing?.park_id ?? params.get("park"));
  const { data: fetchedPark } = usePark(parkId ?? undefined);
  const [chosen, setChosen] = useState<Park | null>(null);
  const park = chosen ?? fetchedPark;
  const userId = useSession((s) => s.userId);
  const profile = useSession((s) => s.profile);
  // Entered with a park already chosen (`?park=`): "Parc" is pre-checked and
  // Back from "Avis" leaves the flow — the user never saw the picker.
  const preselected = useRef(Boolean(editing ?? params.get("park"))).current;
  // Only meaningful with a park already chosen, and never over a resumed send.
  const presetStars = useRef(params.get("park") && !wantsResume ? parsePresetStars(params.get("stars")) : 0).current;

  // Draft: scoped to this flow + park + principal, mirrors ReportProblem. No
  // parkId yet (still on the picker) ⇒ no key ⇒ no persistence — step 0 has no
  // form data of its own anyway. Guest → signed-in handover runs in an effect
  // (useAdoptedDraftKey), never during render.
  // Edit mode never uses the creation draft: the source of truth is the
  // published review, and its unsaved changes are guarded by `dirty` instead.
  const guestDraftKey = parkId && !editing
    ? buildDraftKey({ surface: "mobile", flow: "park.rate", scope: { parkId }, principal: "guest" })
    : null;
  const userDraftKey =
    parkId && userId && !editing
      ? buildDraftKey({ surface: "mobile", flow: "park.rate", scope: { parkId }, principal: { userId } })
      : null;
  const draftKey = useAdoptedDraftKey(guestDraftKey, userDraftKey);

  const {
    value: draft,
    patch,
    clear: clearRateDraft,
    flush: flushRateDraft,
  } = usePersistentDraft<RateParkDraft>(
    draftKey,
    editing
      ? {
          step: 1,
          stars: editing.rating,
          subRatings: editing.sub_ratings ?? DEFAULT_SUB_RATINGS,
          ageBand: editing.age_band,
          comment: editing.comment ?? "",
          photo: null,
        }
      : { step: parkId ? 1 : 0, stars: presetStars, subRatings: DEFAULT_SUB_RATINGS, ageBand: "3-6", comment: "", photo: null },
    {
      schemaVersion: RATE_PARK_DRAFT_VERSION,
      ttlMs: RATE_PARK_DRAFT_TTL_MS,
      restore: "auto",
      migrate: (data, from) => {
        if (from !== 1 || !data || typeof data !== "object") return null;
        const d = data as RateParkDraft;
        return { ...d, step: d.step >= 2 ? 1 : d.step };
      },
    },
  );

  // A restored draft claiming step 2 (commentaire) without stars — the one
  // hard precondition step 1 enforces before letting you past it — falls back
  // to step 1. Never mutates storage.
  const clampedStep = Math.min(Math.max(draft.step, 0), 2);
  const step = clampedStep >= 2 && draft.stars === 0 ? 1 : clampedStep;
  const setStep = (next: number) => patch({ step: next });

  // Edit mode: unsaved changes + leave guard (BrowserRouter has no route
  // blocker, so the in-app back/close buttons and a tab close are guarded).
  const dirty =
    !!editing &&
    (draft.stars !== editing.rating ||
      draft.ageBand !== editing.age_band ||
      draft.comment !== (editing.comment ?? "") ||
      !sameSubRatings(draft.subRatings, editing.sub_ratings ?? DEFAULT_SUB_RATINGS));
  const savedRef = useRef(false);
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => {
      if (savedRef.current) return;
      e.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  /** Back to where the edit started (park sheet or Contributions); direct
   * entry with no history falls back to the park. */
  function leaveEdit() {
    if ((window.history.state as { idx?: number } | null)?.idx) navigate(-1);
    else navigate(`/park/${parkId}`, { replace: true });
  }

  // The rating picked in the visit prompt is the user's latest explicit
  // choice: it wins over a star count restored from an older draft. Applied
  // once the draft key has resolved (adoption runs in an effect), so it is
  // persisted and not overwritten by the draft loaded for that key.
  const presetApplied = useRef(false);
  useEffect(() => {
    if (presetApplied.current || !presetStars || !draftKey) return;
    presetApplied.current = true;
    patch({ stars: presetStars });
  }, [draftKey, presetStars, patch]);

  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);
  const [submitError, setSubmitError] = useState(false);
  // Verrou synchrone anti double envoi.
  const submittingRef = useRef(false);
  // Snapshot at submit time — `draft.photo` is gone once the draft is cleared,
  // but the success message still needs to know whether a photo was attached
  // (it enters moderation separately from the review text/stars, see doSubmit).
  const [photoPending, setPhotoPending] = useState(false);
  const autoSubmitted = useRef(false);

  // `contribution_started` — une fois par montage du wizard, quelle que soit
  // l'étape. `entry_point` : le rappel de visite post-itinéraire
  // (`GlobalOverlays.tsx`) marque explicitement son origine avec
  // `?source=visit_prompt` → `"visit_prompt"`. Sans ce marqueur, `/rate?park=`
  // (préselection non-resume) n'implique PAS de façon fiable "depuis la fiche
  // parc" (lien direct, etc.) → `"unknown"` plutôt que d'affirmer à tort
  // `"park_detail_contribute_sheet"` — voir events.ts. `?stars=` ne sert
  // jamais à déduire l'origine. `wantsResume` reste 100% fiable
  // (`?resume=1` explicite) et prime.
  const contributionStartedTracked = useRef(false);
  useEffect(() => {
    if (editing || contributionStartedTracked.current) return;
    contributionStartedTracked.current = true;
    trackEvent("contribution_started", {
      contribution_type: "review",
      park_id: parkId ?? undefined,
      entry_point: wantsResume
        ? "contribution_resume"
        : fromVisitPrompt
          ? "visit_prompt"
          : preselected
            ? "unknown"
            : "direct_link",
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [uploading, setUploading] = useState(false);
  async function addFiles(files: File[]) {
    const file = files[0];
    if (!file || !userId) return;
    setUploading(true);
    try {
      patch({ photo: await uploadPhoto("parkPhotos", file, userId) });
    } catch (err) {
      useToastStore.getState().show(err instanceof ImageValidationError ? tErr(`image.${err.code}`) : tErr("image.uploadFailed"));
    } finally {
      setUploading(false);
    }
  }

  function submit() {
    if (submittingRef.current) return;
    if (editing) {
      void doSaveEdit();
      return;
    }
    if (!parkId) return;
    const uid = useSession.getState().userId;
    if (uid) {
      void doSubmit(uid);
      return;
    }
    // Guest: the draft is already autosaved; force the latest to disk before
    // the full-page sign-in detour, then come back here (?resume=1) after auth.
    flushRateDraft();
    setResumeRoute(`/rate?park=${parkId}&resume=1`);
    navigate("/login", { replace: true });
  }

  async function doSaveEdit() {
    if (!editing || !userId) return;
    submittingRef.current = true;
    setSaving(true);
    setSubmitError(false);
    try {
      await updateMyReview(editing.id, userId, {
        stars: draft.stars,
        // Untouched criteria keep the stored value (incl. "none") rather than
        // materialising the form defaults on a review that never had them.
        sub_ratings: sameSubRatings(draft.subRatings, editing.sub_ratings ?? DEFAULT_SUB_RATINGS)
          ? editing.sub_ratings
          : draft.subRatings,
        age_band: draft.ageBand,
        comment: draft.comment || null,
      });
      savedRef.current = true;
      void queryClient.invalidateQueries({ queryKey: ["park-reviews", editing.park_id] });
      void queryClient.invalidateQueries({ queryKey: ["park", editing.park_id] });
      void queryClient.invalidateQueries({ queryKey: ["review", editing.id] });
      void queryClient.invalidateQueries({ queryKey: ["my-contributions"] });
      void queryClient.invalidateQueries({ queryKey: ["my-reviews"] });
      void queryClient.invalidateQueries({ queryKey: ["nearby-parks"] });
      // Succès confirmé → page de remerciement partagée (le toast ne sert plus).
      setDone(true);
    } catch {
      // Form state is untouched: the user keeps everything they typed.
      setSubmitError(true);
    } finally {
      submittingRef.current = false;
      setSaving(false);
    }
  }

  async function doSubmit(uid: string) {
    if (!parkId) return;
    submittingRef.current = true;
    setSaving(true);
    setSubmitError(false);
    try {
      await createReview({
        park_id: parkId,
        user_id: uid,
        author_name: profile?.name || tCommon("anonymousAuthor"),
        stars: draft.stars,
        sub_ratings: draft.subRatings,
        comment: draft.comment || null,
        age_band: draft.ageBand,
      });
      // Sent — drop the draft before the secondary call below, so a later
      // photo-attach failure can never resurrect a form that would call
      // createReview again and publish a duplicate review.
      clearRateDraft();
      if (draft.photo) {
        // A photo attached to a review is a real contributor photo of the park
        // and enters the moderation queue (source = "user" → status pending).
        // The review itself (stars + comment) is published immediately — only
        // the photo is held back, so the success message must say so.
        await addMedia({ park_id: parkId, url: draft.photo, source: "user", user_id: uid });
        setPhotoPending(true);
      }
      void queryClient.invalidateQueries({ queryKey: ["park-reviews", parkId] });
      void queryClient.invalidateQueries({ queryKey: ["park", parkId] });
      trackEvent("contribution_completed", {
        contribution_type: "review",
        park_id: parkId,
        had_just_in_time_auth: wantsResume,
        has_photo: Boolean(draft.photo),
      });
      setDone(true);
    } catch {
      setSubmitError(true);
    } finally {
      submittingRef.current = false;
      setSaving(false);
    }
  }

  // Back from sign-in with the review intact (guest draft now adopted under
  // the user key and restored): send it once.
  useEffect(() => {
    if (!wantsResume || autoSubmitted.current) return;
    if (!userId || !parkId || draft.stars === 0) return;
    autoSubmitted.current = true;
    void doSubmit(userId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wantsResume, userId, parkId, draft.stars]);

  // Parc fourni (fiche, rappel de visite, édition) : « Choisir le parc » n'est pas
  // affiché et la progression ne compte que les étapes présentées.
  const offset = preselected ? 1 : 0;
  const total = 3 - offset;
  const rateDirty = draft.stars > 0 || draft.comment.trim() !== "" || Boolean(draft.photo);
  const guard = useLeaveGuard(
    editing
      ? {
          dirty: dirty && !savedRef.current,
          onLeave: () => {
            savedRef.current = true;
            leaveEdit();
          },
          body: t("review.edit.leaveBody"),
          title: t("review.edit.leaveTitle"),
          stay: t("review.edit.leaveStay"),
          leave: t("review.edit.leaveConfirm"),
        }
      : {
          dirty: rateDirty,
          onLeave: () => {
            flushRateDraft();
            navigate("/map");
          },
          onDiscard: () => {
            clearRateDraft();
            navigate("/map");
          },
          body: t("rate.leaveBody"),
        },
  );
  const back = () => {
    if (step > offset) return setStep(step - 1);
    if (editing) return guard.request();
    if (rateDirty) return guard.request();
    navigate(-1);
  };

  // Un avis existe déjà pour ce parc : on propose son édition plutôt qu'un doublon.
  const { data: myReviews } = useQuery({
    queryKey: ["my-reviews", userId],
    queryFn: () => listMyReviews(userId!),
    enabled: !editing && !!userId && !!parkId,
  });
  const existingReview = !editing && parkId ? myReviews?.find((r) => r.park_id === parkId && r.status === "published") : undefined;

  if (done) {
    return editing ? (
      <ThankYou body={t("thanks.body.reviewEdit")} parkId={editing.park_id} />
    ) : (
      <ThankYou
        body={t("thanks.body.review", { park: park ? getParkDisplayName(park, t) : "" })}
        moderation={photoPending ? t("thanks.moderation.reviewPhoto") : undefined}
        parkId={parkId}
      />
    );
  }

  const starWord = draft.stars > 0 ? t(`rate.starWord.${draft.stars}`) : "";
  const faceLabel = (v: number) => t(`rate.face.${v}`);

  let footer: React.ReactNode;
  if (step === 0) {
    footer = (
      <Button block disabled={!park} onClick={() => park && (setParkId(park.id), setStep(1))}>
        {t("common.continue")}
      </Button>
    );
  } else if (step === 1) {
    footer = existingReview ? (
      <Button block onClick={() => navigate(`/review/${existingReview.id}/edit`)}>
        {t("review.edit.menu")}
      </Button>
    ) : (
      <Button block disabled={draft.stars === 0 || uploading} onClick={() => setStep(2)}>
        {t("common.continue")}
      </Button>
    );
  } else {
    footer = (
      <Button block loading={saving} disabled={editing ? !dirty : false} onClick={submit}>
        {editing ? t("review.edit.save") : t("rate.submit")}
      </Button>
    );
  }

  const noteCriteria = CRITERIA.map((c) => ({ ...c, value: draft.subRatings[c.key] }));

  return (
    <>
      <FlowShell
        title={editing ? t("review.edit.title") : t("menu.rate")}
        step={step - offset}
        total={total}
        stepKey={step}
        onBack={back}
        onClose={guard.request}
        footer={footer}
      >
        {step === 0 && (
          <ParkChooser selected={park && chosen ? park : null} onSelect={(p) => setChosen(p)} onAddPark={() => navigate(addParkFromHref(location.pathname + location.search))} />
        )}

        {step === 1 && park && (
          <>
            <h2 className={styles.title}>{t("rate.experienceTitle")}</h2>
            <p className={styles.subtitle}>{t("rate.visitQuestion")}</p>
            <div style={{ marginBottom: 16 }}>
              <ParkCardMini park={park} />
            </div>

            {existingReview ? (
              <div className={styles.banner} role="status">
                <span>{t("rate.alreadyReviewed")}</span>
              </div>
            ) : (
              <>
                <div className={styles.ratingBlock}>
                  <StarInput value={draft.stars} onChange={(stars) => patch({ stars })} starLabel={(n) => t("rate.starLabel", { count: n })} />
                  <p className={styles.ratingWord} aria-live="polite">{starWord}</p>
                </div>

                <section className={styles.section} aria-labelledby="rate-criteria">
                  <h3 className={styles.sectionTitle} id="rate-criteria">{t("rate.criteriaTitle")}</h3>
                  <div className={styles.detailsCard}>
                    {CRITERIA.map((c) => (
                      <FaceChoice
                        key={c.key}
                        id={c.key}
                        label={t(c.labelKey)}
                        value={draft.subRatings[c.key]}
                        onChange={(v) => patch({ subRatings: { ...draft.subRatings, [c.key]: v } })}
                      />
                    ))}
                  </div>
                </section>

                <section className={styles.section} aria-labelledby="rate-age">
                  <h3 className={styles.sectionTitle} id="rate-age">{t("rate.childAge")}</h3>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 8 }}>
                    {AGE_BANDS.map((b) => (
                      <button key={b} type="button" className={styles.pill} aria-pressed={draft.ageBand === b} onClick={() => patch({ ageBand: b })}>
                        {tCommon(`age.band.${b}`)}
                      </button>
                    ))}
                  </div>
                </section>

                <section className={styles.section}>
                  <Textarea
                    label={t("rate.commentLabel")}
                    value={draft.comment}
                    maxLength={200}
                    onChange={(e) => patch({ comment: e.target.value })}
                    help={`${draft.comment.length}/200`}
                    rows={3}
                  />
                </section>

                {!editing && (
                  <section className={styles.section}>
                    <h3 className={styles.sectionTitle}>{t("flow.photoOptional")}</h3>
                    <PhotoPicker
                      previews={draft.photo ? [draft.photo] : []}
                      max={1}
                      onFiles={addFiles}
                      onRemove={() => patch({ photo: null })}
                      canPick={Boolean(userId)}
                      onRequireAuth={() => useToastStore.getState().show(t("common.accountRequiredPhotos"))}
                      busy={uploading}
                      showCounter={false}
                    />
                  </section>
                )}
              </>
            )}
          </>
        )}

        {step === 2 && park && (
          <>
            <h2 className={styles.title}>{t("rate.verifyTitle")}</h2>
            <p className={styles.subtitle}>{editing ? t("rate.verifyHintEdit") : t("rate.verifyHint")}</p>
            <RecapCard
              thumb={<ParkPhoto park={park} className={styles.recapThumb} markSize={24} />}
              name={getParkDisplayName(park, t)}
              address={dedupeAddress(park.formatted_address)}
            >
              <RecapRow icon="ic-star" title={t("steps.opinion")} onEdit={() => setStep(1)}>
                <span style={{ color: "var(--color-accent)", fontSize: 16 }}>{"★".repeat(draft.stars)}</span>
                <span style={{ color: "var(--color-border)", fontSize: 16 }}>{"★".repeat(5 - draft.stars)}</span> {starWord}
              </RecapRow>
              <RecapRow icon="ic-list" title={t("rate.criteriaSummaryTitle")} onEdit={() => setStep(1)}>
                {noteCriteria.map((c) => `${t(c.labelKey)} : ${faceLabel(c.value)}`).join(" · ")}
                {draft.ageBand && `\n${t("rate.childAge")} : ${tCommon(`age.band.${draft.ageBand}`)}`}
              </RecapRow>
              <RecapRow icon="ic-review" title={t("rate.commentTitle")} onEdit={() => setStep(1)}>
                {draft.comment.trim() || t("rate.noComment")}
              </RecapRow>
              {!editing && (
                <RecapRow icon="ic-camera" title={t("steps.photos")} onEdit={() => setStep(1)}>
                  {draft.photo ? t("flow.photoCount", { count: 1 }) : t("addPark.summary.noPhotos")}
                  <PhotoThumbs urls={draft.photo ? [draft.photo] : []} />
                </RecapRow>
              )}
            </RecapCard>
            {!editing && <p className={styles.recapNote}><Icon name="ic-shield" size={16} />{t("rate.verifyNote")}</p>}
            {editing && !dirty && <p className={styles.legend}>{t("rate.editNoChange")}</p>}
            <div aria-live="polite" role="status">
              {saving && <p className={styles.muted}>{t("addPark.submitting")}</p>}
            </div>
            {submitError && (
              <div className={styles.errorBox} role="alert">
                {editing ? t("review.edit.error") : t("rate.submitError")}
              </div>
            )}
          </>
        )}
      </FlowShell>
      {guard.dialog}
    </>
  );
}
