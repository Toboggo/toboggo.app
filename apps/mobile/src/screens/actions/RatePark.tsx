import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Button, Chip, StarInput, Textarea, usePersistentDraft, useAdoptedDraftKey } from "@toboggo/design-system";
import { addMedia, buildDraftKey, createReview, getParkDisplayName, uploadPhoto, type AgeBand, type ReviewSubRatings } from "@toboggo/shared";
import { WizardHeader } from "../../components/WizardHeader";
import { ContributionSuccessSheet } from "./ContributionSuccessSheet";
import { ParkPicker } from "../../components/ParkPicker";
import { PhotoTip } from "../../components/PhotoTip";
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
const FACES = ["😞", "😐", "😄"];
// Named stepper shared with the other contribution wizards (see AddPark /
// AddPhotos). The three stages are stable across entry points: arriving with
// `?park=` just starts on "Avis" with "Parc" already checked — the step is
// never dropped dynamically. Keys resolved against the `contribute` namespace.
const STEPPER = ["steps.park", "steps.opinion", "steps.comment"];
const AGE_BANDS: AgeBand[] = ["under3", "3-6", "6-12"];

/** `?stars=N` (1–5) — note déjà choisie dans le rappel de visite post-itinéraire. */
function parsePresetStars(raw: string | null): number {
  const n = Number(raw);
  return Number.isInteger(n) && n >= 1 && n <= 5 ? n : 0;
}

// Brouillon persistant (LOT 3D.E) — socle partagé `usePersistentDraft`.
const RATE_PARK_DRAFT_VERSION = 1;
const RATE_PARK_DRAFT_TTL_MS = 24 * 60 * 60 * 1000; // 24 h

interface RateParkDraft {
  /** 0 = ParkPicker (no data of its own) · 1 = notes · 2 = commentaire. */
  step: number;
  stars: number;
  subRatings: ReviewSubRatings;
  ageBand: AgeBand;
  comment: string;
  /** Already-uploaded photo URL only — onPickFile requires `userId`, so a
   * guest never has one to persist. */
  photo: string | null;
}

export default function RatePark() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const wantsResume = params.get("resume") === "1";
  // Navigation origin, explicit and independent from `?stars=` (which only
  // preselects the rating). Any other/invalid value is ignored.
  const fromVisitPrompt = params.get("source") === "visit_prompt";
  const { t } = useTranslation("contribute");
  const { t: tErr } = useTranslation("errors");
  const { t: tCommon } = useTranslation("common");
  const [parkId, setParkId] = useState<string | null>(params.get("park"));
  const { data: park } = usePark(parkId ?? undefined);
  const userId = useSession((s) => s.userId);
  const profile = useSession((s) => s.profile);
  // Entered with a park already chosen (`?park=`): "Parc" is pre-checked and
  // Back from "Avis" leaves the flow — the user never saw the picker.
  const preselected = useRef(Boolean(params.get("park"))).current;
  // Only meaningful with a park already chosen, and never over a resumed send.
  const presetStars = useRef(params.get("park") && !wantsResume ? parsePresetStars(params.get("stars")) : 0).current;

  // Draft: scoped to this flow + park + principal, mirrors ReportProblem. No
  // parkId yet (still on the picker) ⇒ no key ⇒ no persistence — step 0 has no
  // form data of its own anyway. Guest → signed-in handover runs in an effect
  // (useAdoptedDraftKey), never during render.
  const guestDraftKey = parkId
    ? buildDraftKey({ surface: "mobile", flow: "park.rate", scope: { parkId }, principal: "guest" })
    : null;
  const userDraftKey =
    parkId && userId
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
    { step: parkId ? 1 : 0, stars: presetStars, subRatings: { clean: 2, safety: 2, equipment: 2, comfort: 2 }, ageBand: "3-6", comment: "", photo: null },
    { schemaVersion: RATE_PARK_DRAFT_VERSION, ttlMs: RATE_PARK_DRAFT_TTL_MS, restore: "auto" },
  );

  // A restored draft claiming step 2 (commentaire) without stars — the one
  // hard precondition step 1 enforces before letting you past it — falls back
  // to step 1. Never mutates storage.
  const clampedStep = Math.min(Math.max(draft.step, 0), 2);
  const step = clampedStep >= 2 && draft.stars === 0 ? 1 : clampedStep;
  const setStep = (next: number) => patch({ step: next });

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
    if (contributionStartedTracked.current) return;
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

  async function onPickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !userId) return;
    patch({ photo: await uploadPhoto("parkPhotos", file, userId) });
  }

  function submit() {
    if (!parkId) return;
    const uid = useSession.getState().userId;
    if (uid) {
      setSaving(true);
      void doSubmit(uid);
      return;
    }
    // Guest: the draft is already autosaved; force the latest to disk before
    // the full-page sign-in detour, then come back here (?resume=1) after auth.
    flushRateDraft();
    setResumeRoute(`/rate?park=${parkId}&resume=1`);
    navigate("/login", { replace: true });
  }

  async function doSubmit(uid: string) {
    if (!parkId) return;
    try {
      await createReview({
        park_id: parkId,
        user_id: uid,
        author_name: profile?.name ?? "Vous",
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
      useToastStore.getState().show(tErr("generic"));
    } finally {
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

  if (done) {
    // Contribution terminée : le wizard ne doit plus rester visible ni
    // interactif derrière la confirmation — remplacé par un fond neutre, la
    // Success Sheet porte tout le contenu et les CTA. "Voir le parc" et
    // "Retour à la carte" remplacent (jamais n'empilent) l'entrée d'historique
    // du wizard : Retour ne ramène jamais aux étapes déjà soumises ni à cette
    // confirmation. Idem AddPark / AddPhotos / EditInfo / ReportProblem.
    return (
      <>
        <div className="screen" />
        <ContributionSuccessSheet
          open={done}
          title={t("common.thanks")}
          body={
            <>
              {t("rate.doneBody", { park: park ? getParkDisplayName(park, t) : "" })}
              {photoPending && ` ${t("rate.photoPendingNote")}`}
            </>
          }
          primaryCta={{ label: t("common.seePark"), onPress: () => navigate(`/park/${parkId}`, { replace: true }) }}
          secondaryCta={{ label: t("common.backToMap"), onPress: () => navigate("/map", { replace: true }) }}
          onDismiss={() => navigate("/map", { replace: true })}
        />
      </>
    );
  }

  return (
    <div className="screen">
      <WizardHeader
        step={step}
        total={STEPPER.length}
        steps={STEPPER.map((k) => t(k))}
        onBack={() =>
          step === 0 || (step === 1 && preselected) ? navigate(-1) : setStep(step - 1)
        }
      />

      {step === 0 && (
        <ParkPicker
          onPick={(p) => {
            setParkId(p.id);
            setStep(1);
          }}
          onNone={() => navigate("/action-intro/add")}
        />
      )}

      {step === 1 && park && (
        <div style={{ padding: "0 20px", textAlign: "center" }}>
          <h2 style={{ fontSize: 16, marginBottom: 4 }}>{getParkDisplayName(park, t)}</h2>
          <p style={{ fontSize: 12.5, color: "var(--color-text-muted)", marginBottom: 20 }}>{t("rate.visitQuestion")}</p>
          <StarInput value={draft.stars} onChange={(stars) => patch({ stars })} starLabel={(n) => t("rate.starLabel", { count: n })} />

          <div style={{ marginTop: 28, textAlign: "left" }}>
            {CRITERIA.map((c) => (
              <div key={c.key} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
                <span style={{ fontSize: 14 }}>{t(c.labelKey)}</span>
                <div style={{ display: "flex", gap: 6 }}>
                  {FACES.map((face, i) => (
                    <button
                      key={i}
                      onClick={() => patch({ subRatings: { ...draft.subRatings, [c.key]: i + 1 } })}
                      style={{
                        fontSize: 20,
                        background: draft.subRatings[c.key] === i + 1 ? "var(--color-primary-tint)" : "none",
                        border: "none",
                        borderRadius: "50%",
                        width: 36,
                        height: 36,
                        cursor: "pointer",
                      }}
                    >
                      {face}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <div style={{ marginTop: 12, textAlign: "left" }}>
            <div style={{ fontFamily: "var(--font-heading)", fontWeight: 600, fontSize: 13, marginBottom: 8 }}>{t("rate.childAge")}</div>
            <div style={{ display: "flex", gap: 8 }}>
              {AGE_BANDS.map((b) => (
                <Chip key={b} active={draft.ageBand === b} onClick={() => patch({ ageBand: b })}>
                  {tCommon(`age.band.${b}`)}
                </Chip>
              ))}
            </div>
          </div>

          <Button block style={{ marginTop: 24 }} disabled={draft.stars === 0} onClick={() => setStep(2)}>
            {t("common.continue")}
          </Button>
        </div>
      )}

      {step === 2 && (
        <div style={{ padding: "0 20px" }}>
          <Textarea
            label={t("rate.commentLabel")}
            value={draft.comment}
            maxLength={200}
            onChange={(e) => patch({ comment: e.target.value })}
            help={`${draft.comment.length}/200`}
          />
          {draft.photo ? (
            <div style={{ width: 90, height: 90, borderRadius: 14, backgroundImage: `url(${draft.photo})`, backgroundSize: "cover", marginTop: 12 }} />
          ) : (
            <label
              style={{
                display: "inline-flex",
                width: 90,
                height: 90,
                borderRadius: 14,
                border: "2px dashed var(--color-border-strong)",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 24,
                cursor: "pointer",
                marginTop: 12,
                color: "var(--color-text-faint)",
              }}
            >
              +<input type="file" accept="image/*" hidden onChange={onPickFile} />
            </label>
          )}
          <PhotoTip />
          <Button block loading={saving} style={{ marginTop: 24 }} onClick={submit}>
            {t("rate.submit")}
          </Button>
        </div>
      )}
    </div>
  );
}
