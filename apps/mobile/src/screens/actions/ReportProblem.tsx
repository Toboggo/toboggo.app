import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  Button,
  Select,
  Textarea,
  Icon,
  reportReasonIcon,
  usePersistentDraft,
  useAdoptedDraftKey,
} from "@toboggo/design-system";
import {
  buildDraftKey,
  createReport,
  getParkDisplayName,
  uploadPhoto,
  ImageValidationError,
  REPORT_REASON_LABEL,
  type Park,
  type ReportReason,
} from "@toboggo/shared";
import { ThankYou } from "../../components/flow/ThankYou";
import { PhotoPicker } from "../../components/PhotoPicker";
import { FlowShell, useLeaveGuard } from "../../components/flow/FlowShell";
import { ParkCardMini, ParkChooser } from "../../components/flow/ParkChooser";
import { PhotoThumbs, RecapCard, RecapRow, dedupeAddress } from "../../components/flow/Recap";
import { ParkPhoto } from "../../components/ParkPhoto";
import styles from "../../components/flow/Flow.module.css";
import { usePark } from "../../lib/parksQuery";
import { useSession } from "../../lib/session";
import { useToastStore } from "../../lib/toast";
import { queryClient } from "../../lib/queryClient";
import { setResumeRoute } from "../../lib/resumeRoute";
import { trackEvent } from "../../lib/analytics";

interface ReportDraft {
  reason: ReportReason | null;
  equipment: string;
  comment: string;
}

// Brouillon persistant (LOT 3D.D) — socle partagé `usePersistentDraft`.
const REPORT_DRAFT_VERSION = 2;
const REPORT_DRAFT_TTL_MS = 24 * 60 * 60 * 1000; // 24 h

// Catégories sans pictogramme validé dans le sprite (docs/DESIGN-SYSTEM.md §7) —
// emoji conservé en attendant. Les autres passent par reportReasonIcon().
const REASON_EMOJI: Partial<Record<ReportReason, string>> = {
  vegetation: "🌿",
  accessibility: "♿",
  wrong_info: "✏️",
};

// `value` is the stable string persisted to `reports.equipment` (unchanged
// across locales, so moderation keeps a single vocabulary); only the visible
// label is localized via `contribute:equipment.*`.
const EQUIPMENT_CHOICES: { value: string; key: string }[] = [
  { value: "Toboggan", key: "equipment.slide" },
  { value: "Balançoire", key: "equipment.swing" },
  { value: "Structure d'escalade", key: "equipment.climbing" },
  { value: "Bac à sable", key: "equipment.sandbox" },
  { value: "Autre", key: "equipment.other" },
];

// Aucun équipement présélectionné : « Non précisé » (valeur vide) par défaut.
const EMPTY_REPORT_DRAFT: ReportDraft = { reason: null, equipment: "", comment: "" };

/** Le champ « Équipement concerné » n'a de sens que pour ces catégories. */
const EQUIPMENT_RELEVANT: ReportReason[] = ["broken_equipment", "safety"];

export default function ReportProblem() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { t } = useTranslation("contribute");
  const { t: tErr } = useTranslation("errors");
  const { t: tCommon } = useTranslation("common");
  const [parkId, setParkId] = useState<string | null>(params.get("park"));
  const { data: fetchedPark } = usePark(parkId ?? undefined);
  const [chosen, setChosen] = useState<Park | null>(null);
  const park = chosen ?? fetchedPark;
  const userId = useSession((s) => s.userId);
  const profile = useSession((s) => s.profile);
  const showToast = useToastStore((s) => s.show);
  const preselected = useRef(Boolean(params.get("park"))).current;
  const wantsResume = params.get("resume") === "1";

  // Draft: scoped to this flow + park + principal. A guest draft is handed over
  // to the user key on return from just-in-time auth — the handover itself runs
  // in an effect (never during render); usePersistentDraft is held (key = null)
  // until it has settled, so it can never load a user draft that hasn't been
  // arbitrated against a same-flow guest draft yet (see useAdoptedDraftKey).
  const guestDraftKey = parkId
    ? buildDraftKey({ surface: "mobile", flow: "park.report", scope: { parkId }, principal: "guest" })
    : null;
  const userDraftKey =
    parkId && userId
      ? buildDraftKey({ surface: "mobile", flow: "park.report", scope: { parkId }, principal: { userId } })
      : null;
  const draftKey = useAdoptedDraftKey(guestDraftKey, userDraftKey);

  const {
    value: report,
    patch: patchReport,
    clear: clearReportDraft,
    flush: flushReportDraft,
  } = usePersistentDraft<ReportDraft>(draftKey, EMPTY_REPORT_DRAFT, {
    schemaVersion: REPORT_DRAFT_VERSION,
    ttlMs: REPORT_DRAFT_TTL_MS,
    restore: "auto",
    // v1 : même forme, mais `equipment` valait « Toboggan » par défaut sans choix
    // de l'utilisateur — on ne le garde que si le brouillon avait une catégorie
    // qui le justifie.
    migrate: (data, from) => {
      if (from !== 1 || !data || typeof data !== "object") return null;
      const d = data as ReportDraft;
      return { ...d, equipment: d.reason && EQUIPMENT_RELEVANT.includes(d.reason) ? d.equipment : "" };
    },
  });
  const { reason, equipment, comment } = report;

  // 0 Choisir le parc · 1 Décrire le problème · 2 Vérifier le signalement.
  const [step, setStep] = useState(parkId ? 1 : 0);
  const [photo, setPhoto] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);
  const [submitError, setSubmitError] = useState(false);
  const submittingRef = useRef(false);
  const autoSubmitted = useRef(false);

  // `contribution_started` — une fois par montage, quelle que soit l'étape
  // interne (même le choix du parc, step 0).
  const contributionStartedTracked = useRef(false);
  useEffect(() => {
    if (contributionStartedTracked.current) return;
    contributionStartedTracked.current = true;
    trackEvent("contribution_started", {
      contribution_type: "report",
      park_id: parkId ?? undefined,
      entry_point: wantsResume ? "contribution_resume" : preselected ? "park_detail_contribute_sheet" : "direct_link",
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The draft key can resolve a render after mount (guest → user handover, or a
  // signed-in user's own draft loading once the key is held-then-settled) —
  // resume on the describe step the first time a reason shows up, without
  // overriding a step the user already navigated to by hand.
  const resumedStepRef = useRef(false);
  useEffect(() => {
    if (resumedStepRef.current || !parkId || !reason) return;
    resumedStepRef.current = true;
    setStep((s) => (s < 1 ? 1 : s));
  }, [parkId, reason]);

  async function addFiles(files: File[]) {
    const file = files[0];
    if (!file || !userId) return;
    setUploading(true);
    try {
      setPhoto(await uploadPhoto("reportPhotos", file, userId));
    } catch (err) {
      showToast(err instanceof ImageValidationError ? tErr(`image.${err.code}`) : tErr("image.uploadFailed"));
    } finally {
      setUploading(false);
    }
  }

  const needsEquipment = reason !== null && EQUIPMENT_RELEVANT.includes(reason);
  const equipmentChoice = EQUIPMENT_CHOICES.find((c) => c.value === equipment);

  async function doSubmit(uid: string) {
    if (!parkId || !reason) return;
    submittingRef.current = true;
    setSaving(true);
    setSubmitError(false);
    try {
      await createReport({
        park_id: parkId,
        user_id: uid,
        reported_by_name: profile?.name || tCommon("anonymousAuthor"),
        reason,
        equipment: needsEquipment && equipment ? equipment : undefined,
        comment: comment.trim() || null,
        photo,
      });
      // Sent — drop the draft BEFORE the confirmation screen. clear() also
      // blocks any later flush (debounce / pagehide / unmount), so the draft
      // cannot come back on the way out.
      clearReportDraft();
      void queryClient.invalidateQueries({ queryKey: ["park", parkId] });
      trackEvent("contribution_completed", {
        contribution_type: "report",
        park_id: parkId,
        had_just_in_time_auth: wantsResume,
        has_photo: Boolean(photo),
      });
      setDone(true);
    } catch {
      // Failed — keep the form and the (autosaved) draft, surface the error.
      setSubmitError(true);
    } finally {
      submittingRef.current = false;
      setSaving(false);
    }
  }

  function submit() {
    if (submittingRef.current || !parkId || !reason) return;
    const uid = useSession.getState().userId;
    if (uid) {
      void doSubmit(uid);
      return;
    }
    // Guest: the draft is already autosaved; force the latest to disk before the
    // full-page sign-in detour, then come back here (?resume=1) after auth.
    flushReportDraft();
    setResumeRoute(`/report?park=${parkId}&resume=1`);
    // `replace` : la sortie vers /login REMPLACE l'entrée de ce wizard. Combiné
    // au retour d'auth qui remplace /login (AuthForm) puis au CTA de
    // confirmation qui remplace la resume route, une contribution invité menée
    // à son terme ne laisse AUCUNE entrée d'historique — un Retour depuis la
    // fiche parc revient au contexte normal, jamais dans ce wizard soumis ni
    // sur /login. Le brouillon reste en localStorage (repris au remount).
    navigate("/login", { replace: true });
  }

  // Back from sign-in with the report intact (guest draft now adopted under the
  // user key and restored): send it once.
  useEffect(() => {
    if (!wantsResume || autoSubmitted.current) return;
    if (!userId || !parkId || !reason) return;
    autoSubmitted.current = true;
    void doSubmit(userId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wantsResume, userId, parkId, reason]);

  const offset = preselected ? 1 : 0;
  const total = 3 - offset;
  const dirty = reason !== null || comment.trim() !== "" || Boolean(photo);
  const guard = useLeaveGuard({ dirty, onLeave: () => navigate("/map"), body: t("report.leaveBody") });
  const back = () => (step === offset ? (dirty ? guard.request() : navigate(-1)) : setStep(step - 1));

  if (done) {
    return <ThankYou body={t("thanks.body.report")} parkId={parkId} />;
  }

  let footer: React.ReactNode;
  if (step === 0) {
    footer = (
      <Button block disabled={!park} onClick={() => park && (setParkId(park.id), setStep(1))}>
        {t("common.continue")}
      </Button>
    );
  } else if (step === 1) {
    footer = (
      <Button block disabled={!reason || uploading} onClick={() => setStep(2)}>
        {t("common.continue")}
      </Button>
    );
  } else {
    footer = (
      <Button block loading={saving} onClick={submit}>
        {t("report.submit")}
      </Button>
    );
  }

  return (
    <>
      <FlowShell
        title={t("menu.report")}
        step={step - offset}
        total={total}
        stepKey={step}
        onBack={back}
        onClose={guard.request}
        footer={footer}
      >
        {step === 0 && (
          <ParkChooser selected={park && chosen ? park : null} onSelect={(p) => setChosen(p)} onNone={() => navigate(-1)} />
        )}

        {step === 1 && (
          <>
            <h2 className={styles.title}>{t("report.describeTitle")}</h2>
            <p className={styles.subtitle}>{t("report.problemQuestion")}</p>
            {park && <div style={{ marginBottom: 16 }}><ParkCardMini park={park} /></div>}
            <div className={styles.catGrid} role="group" aria-label={t("report.problemQuestion")}>
              {(Object.keys(REPORT_REASON_LABEL) as ReportReason[]).map((r) => {
                const ic = reportReasonIcon(r);
                return (
                  <button
                    key={r}
                    type="button"
                    className={styles.catCard}
                    aria-pressed={reason === r}
                    onClick={() => patchReport({ reason: r, ...(EQUIPMENT_RELEVANT.includes(r) ? {} : { equipment: "" }) })}
                  >
                    <span aria-hidden="true" style={{ fontSize: 24, minHeight: 24, display: "flex", alignItems: "center" }}>
                      {ic ? <Icon name={ic} size={24} /> : REASON_EMOJI[r]}
                    </span>
                    <span className={styles.catLabel}>{t(`reason.${r}`)}</span>
                  </button>
                );
              })}
            </div>

            {needsEquipment && (
              <div style={{ marginTop: 20 }}>
                <Select label={t("report.equipmentLabel")} value={equipment} onChange={(e) => patchReport({ equipment: e.target.value })}>
                  <option value="">{t("report.equipmentUnspecified")}</option>
                  {EQUIPMENT_CHOICES.map((c) => (
                    <option key={c.value} value={c.value}>{t(c.key)}</option>
                  ))}
                </Select>
              </div>
            )}

            <div style={{ marginTop: 20 }}>
              <Textarea
                label={t("report.describeLabel")}
                value={comment}
                maxLength={200}
                onChange={(e) => patchReport({ comment: e.target.value })}
                help={`${comment.length}/200`}
                rows={3}
              />
            </div>

            <section className={styles.section}>
              <h3 className={styles.sectionTitle}>{t("flow.photoOptional")}</h3>
              <PhotoPicker
                previews={photo ? [photo] : []}
                max={1}
                onFiles={addFiles}
                onRemove={() => setPhoto(null)}
                canPick={Boolean(userId)}
                onRequireAuth={() => showToast(t("common.accountRequiredPhotos"))}
                busy={uploading}
                showCounter={false}
              />
            </section>
          </>
        )}

        {step === 2 && (
          <>
            <h2 className={styles.title}>{t("report.verifyTitle")}</h2>
            <p className={styles.subtitle}>{t("report.verifyHint")}</p>
            <RecapCard
              thumb={<ParkPhoto park={park ?? { photos: [] }} className={styles.recapThumb} markSize={24} />}
              name={park ? getParkDisplayName(park, t) : ""}
              address={dedupeAddress(park?.formatted_address)}
            >
              <RecapRow icon="ic-flag" title={t("steps.problem")} onEdit={() => setStep(1)}>
                {reason ? t(`reason.${reason}`) : "—"}
                {needsEquipment && `\n${t("report.equipmentLabel")} : ${equipmentChoice ? t(equipmentChoice.key) : t("report.equipmentUnspecified")}`}
              </RecapRow>
              <RecapRow icon="ic-pencil" title={t("report.descriptionTitle")} onEdit={() => setStep(1)}>
                {comment.trim() || t("report.noDescription")}
              </RecapRow>
              <RecapRow icon="ic-camera" title={t("steps.photos")} onEdit={() => setStep(1)}>
                {photo ? t("flow.photoCount", { count: 1 }) : t("addPark.summary.noPhotos")}
                <PhotoThumbs urls={photo ? [photo] : []} />
              </RecapRow>
            </RecapCard>
            <div aria-live="polite" role="status">
              {saving && <p className={styles.muted}>{t("addPark.submitting")}</p>}
            </div>
            {submitError && (
              <div className={styles.errorBox} role="alert">
                {t("report.submitError")}
              </div>
            )}
          </>
        )}
      </FlowShell>
      {guard.dialog}
    </>
  );
}
