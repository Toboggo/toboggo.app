import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import {
  Button,
  Chip,
  Icon,
  Input,
  Segmented,
  Textarea,
  DualRangeSlider,
  usePersistentDraft,
  useAdoptedDraftKey,
  type IconName,
} from "@toboggo/design-system";
import {
  buildDraftKey,
  listFeatures,
  submitParkEdit,
  type FeatureCategory,
  type FeatureStatus,
  type Json,
} from "@toboggo/shared";
import { FlowShell, useLeaveGuard } from "../../components/flow/FlowShell";
import { RecapCard, RecapRow, dedupeAddress } from "../../components/flow/Recap";
import { ParkCover } from "../../components/ParkCover";
import styles from "../../components/flow/Flow.module.css";
import { ThankYou } from "../../components/flow/ThankYou";
import { DiffRow } from "../../components/DiffRow";
import { PinField } from "../../components/PinField";
import { useFormat } from "../../i18n/useFormat";
import { useFeatureLabel } from "../../lib/featureLabel";
import { usePark } from "../../lib/parksQuery";
import { useSession } from "../../lib/session";
import { useToastStore } from "../../lib/toast";
import { setResumeRoute } from "../../lib/resumeRoute";
import { trackEvent } from "../../lib/analytics";

// Brouillon persistant (LOT 3D.D) — socle partagé `usePersistentDraft`.
const EDIT_INFO_DRAFT_VERSION = 1;
const EDIT_INFO_DRAFT_TTL_MS = 24 * 60 * 60 * 1000; // 24 h

// Stepper nommé, partagé avec les autres wizards de contribution via
// WizardHeader (voir AddPark / AddPhotos / RatePark / ReportProblem). Les trois
// étapes correspondent 1:1 à `d.step` (0 → Type, 1 → Correction, 2 →
// Vérification) : `current` = `d.step`, aucune conversion. "Vérification" est la
// dernière étape AVANT soumission ; la confirmation de succès reste un écran
// autonome séparé (bloc `done`) et n'apparaît donc pas dans le stepper.
const STEPPER = ["steps.type", "steps.correction", "steps.verify"];

type Target = "general" | "ages" | "play" | "service" | "accessibility" | "characteristics" | "location" | "other";

const TARGETS: { value: Target; icon: IconName }[] = [
  { value: "general", icon: "ic-list" },
  { value: "ages", icon: "ic-age" },
  { value: "play", icon: "ic-slide" },
  { value: "service", icon: "ic-bench" },
  { value: "accessibility", icon: "ic-pmr" },
  { value: "characteristics", icon: "ic-fence" },
  { value: "location", icon: "ic-explore" },
  { value: "other", icon: "ic-question" },
];

const TARGET_CATEGORIES: Partial<Record<Target, FeatureCategory[]>> = {
  play: ["play"],
  service: ["service"],
  accessibility: ["accessibility"],
  characteristics: ["environment", "safety"],
};

const STATUS_OPTIONS: { value: FeatureStatus; labelKey: string }[] = [
  { value: "available", labelKey: "status.available" },
  { value: "unavailable", labelKey: "status.unavailable" },
  { value: "unknown", labelKey: "status.unknown" },
];

interface EditDraft {
  step: number;
  target: Target | null;
  seeded: boolean;
  name: string;
  description: string;
  ageLow: number;
  ageHigh: number;
  /** The age slider seeds to 0–12 for a park with no known age. That default is
   * NOT a proposal — only a real slider interaction turns it into one. */
  agesTouched: boolean;
  featureStatus: Record<string, FeatureStatus>;
  lat: number | null;
  lng: number | null;
  freeText: string;
  note: string;
}

const EMPTY: EditDraft = {
  step: 0,
  target: null,
  seeded: false,
  name: "",
  description: "",
  ageLow: 0,
  ageHigh: 12,
  agesTouched: false,
  featureStatus: {},
  lat: null,
  lng: null,
  freeText: "",
  note: "",
};

interface DiffItem {
  field: string;
  label: string;
  currentText: string;
  proposedText: string;
  current: Json;
  proposed: Json;
}

export default function EditInfo() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { t } = useTranslation("contribute");
  const { t: tErr } = useTranslation("errors");
  const { t: tCommon } = useTranslation("common");
  const fmt = useFormat();
  const featureLabel = useFeatureLabel();
  const parkId = params.get("park");
  const wantsResume = params.get("resume") === "1";

  const { data: park, isLoading, isError } = usePark(parkId ?? undefined);
  const userId = useSession((s) => s.userId);
  const showToast = useToastStore((s) => s.show);
  const { data: catalogue = [] } = useQuery({ queryKey: ["features"], queryFn: () => listFeatures() });

  // Draft: scoped to this flow + park + principal, autosaved by the socle. A
  // guest draft is handed over to the user key on return from just-in-time auth
  // — the handover runs in an effect (never during render); usePersistentDraft
  // is held (key = null) until it has settled, so it can never load a user
  // draft that hasn't been arbitrated against a same-flow guest draft yet (see
  // useAdoptedDraftKey). Restoration is automatic within the 24 h TTL — the
  // "Type" step re-picks a target anyway, and the X (`closeAndDiscard`) is the
  // explicit way to drop it.
  const guestDraftKey = parkId
    ? buildDraftKey({ surface: "mobile", flow: "park.edit-info", scope: { parkId }, principal: "guest" })
    : null;
  const userDraftKey =
    parkId && userId
      ? buildDraftKey({ surface: "mobile", flow: "park.edit-info", scope: { parkId }, principal: { userId } })
      : null;
  const draftKey = useAdoptedDraftKey(guestDraftKey, userDraftKey);

  const {
    value: d,
    patch,
    restored,
    clear: clearEditDraft,
    flush: flushEditDraft,
  } = usePersistentDraft<EditDraft>(draftKey, EMPTY, {
    schemaVersion: EDIT_INFO_DRAFT_VERSION,
    ttlMs: EDIT_INFO_DRAFT_TTL_MS,
    restore: "auto",
  });

  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);
  const [submitError, setSubmitError] = useState(false);
  // Verrou synchrone anti double envoi.
  const submittingRef = useRef(false);
  const autoSubmitted = useRef(false);

  // `contribution_started` — une fois par montage. `parkId` est toujours
  // requis pour ce wizard (route `/contribute/edit?park=`), donc pas de cas
  // "direct_link" possible ici.
  const contributionStartedTracked = useRef(false);
  useEffect(() => {
    if (contributionStartedTracked.current) return;
    contributionStartedTracked.current = true;
    trackEvent("contribution_started", {
      contribution_type: "edit_info",
      park_id: parkId ?? undefined,
      entry_point: wantsResume ? "contribution_resume" : "park_detail_contribute_sheet",
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const relevantFeatures = useMemo(() => {
    if (!d.target) return [];
    const cats = TARGET_CATEGORIES[d.target];
    if (!cats) return [];
    return catalogue
      .filter((f) => cats.includes(f.category))
      .sort((a, b) => a.sort_order - b.sort_order);
  }, [catalogue, d.target]);

  function seedFromPark(target: Target) {
    if (!park) return;
    const featureStatus: Record<string, FeatureStatus> = {};
    const cats = TARGET_CATEGORIES[target];
    if (cats) {
      for (const f of catalogue) {
        if (cats.includes(f.category)) featureStatus[f.code] = park.features[f.code]?.status ?? "unknown";
      }
    }
    patch({
      target,
      step: 1,
      seeded: true,
      name: park.name ?? "",
      description: park.description ?? "",
      ageLow: park.age_min ?? 0,
      ageHigh: park.age_max ?? 12,
      agesTouched: false,
      featureStatus,
      lat: park.latitude,
      lng: park.longitude,
      freeText: "",
    });
  }

  const items: DiffItem[] = useMemo(() => {
    if (!park || !d.target) return [];
    const out: DiffItem[] = [];
    if (d.target === "general") {
      if (d.name.trim() && d.name.trim() !== (park.name ?? "")) {
        out.push({ field: "name", label: t("edit.diff.name"), currentText: park.name ?? "—", proposedText: d.name.trim(), current: park.name ?? null, proposed: d.name.trim() });
      }
      if ((d.description ?? "").trim() !== (park.description ?? "")) {
        out.push({
          field: "description",
          label: t("edit.diff.description"),
          currentText: park.description || "—",
          proposedText: d.description.trim() || "—",
          current: park.description ?? null,
          proposed: d.description.trim() || null,
        });
      }
    } else if (d.target === "ages") {
      // An untouched slider is never a proposal — a park with no known age must
      // stay "unknown", not silently become the 0–12 default.
      if (d.agesTouched && (d.ageLow !== park.age_min || d.ageHigh !== park.age_max)) {
        out.push({
          field: "ages",
          label: t("edit.diff.ages"),
          currentText: fmt.ageRange(park.age_min, park.age_max),
          proposedText: fmt.ageRange(d.ageLow, d.ageHigh),
          current: { min: park.age_min, max: park.age_max },
          proposed: { min: d.ageLow, max: d.ageHigh },
        });
      }
    } else if (d.target === "location") {
      const changed =
        d.lat != null &&
        d.lng != null &&
        (Math.abs(d.lat - park.latitude) > 1e-6 || Math.abs(d.lng - park.longitude) > 1e-6);
      if (changed) {
        out.push({
          field: "location",
          label: t("edit.diff.location"),
          currentText: `${park.latitude.toFixed(5)}, ${park.longitude.toFixed(5)}`,
          proposedText: `${d.lat!.toFixed(5)}, ${d.lng!.toFixed(5)}`,
          current: { latitude: park.latitude, longitude: park.longitude },
          proposed: { latitude: d.lat, longitude: d.lng },
        });
      }
    } else if (d.target === "other") {
      if (d.freeText.trim()) {
        out.push({ field: "free_text", label: t("edit.diff.freeText"), currentText: "—", proposedText: d.freeText.trim(), current: null, proposed: d.freeText.trim() });
      }
    } else {
      for (const feat of relevantFeatures) {
        const before = park.features[feat.code]?.status ?? "unknown";
        // Fall back to the park's current value for features the user hasn't
        // touched (covers the case where the catalogue wasn't loaded at seed time).
        const after = d.featureStatus[feat.code] ?? before;
        if (after !== before) {
          out.push({
            field: `feature:${feat.code}`,
            label: featureLabel(feat.code),
            currentText: t(`statusLabel.${before}`),
            proposedText: t(`statusLabel.${after}`),
            current: before,
            proposed: after,
          });
        }
      }
    }
    return out;
  }, [park, d, relevantFeatures, t, fmt, featureLabel]);

  async function doSubmit(uid: string) {
    if (!park || !parkId || !d.target || !items.length) return;
    submittingRef.current = true;
    setSaving(true);
    setSubmitError(false);
    const changes = {
      kind: "correction",
      target: d.target,
      park_name: park.name,
      items: items.map((i) => ({ field: i.field, label: i.label, current: i.current, proposed: i.proposed })),
      note: d.note.trim() || null,
    } as unknown as Json;
    try {
      await submitParkEdit({ parkId, userId: uid, changes, organizationId: park.organization_id ?? null });
      // Sent — drop the draft before the confirmation screen. clear() also
      // blocks any later flush, so it cannot come back on unmount / pagehide.
      clearEditDraft();
      trackEvent("contribution_completed", {
        contribution_type: "edit_info",
        park_id: parkId,
        had_just_in_time_auth: wantsResume,
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
    if (submittingRef.current) return;
    if (!items.length) {
      showToast(t("edit.noChanges"));
      return;
    }
    const uid = useSession.getState().userId;
    if (uid) {
      void doSubmit(uid);
      return;
    }
    // Guest: the draft is already autosaved; force the latest to disk before the
    // full-page sign-in detour. On return (?resume=1) the effect below finishes
    // the send (works for both the in-page email login and the OAuth redirect).
    flushEditDraft();
    setResumeRoute(`/contribute/edit?park=${parkId}&resume=1`);
    // `replace` : la sortie vers /login REMPLACE l'entrée de ce wizard (idem
    // ReportProblem). Avec le retour d'auth qui remplace /login et le CTA de
    // confirmation qui remplace la resume route, une correction invité menée à
    // son terme ne laisse aucune entrée d'historique — Retour depuis la fiche
    // parc revient au contexte normal, jamais dans /contribute/edit ni /login.
    // Le brouillon reste en localStorage (repris via ?resume=1 / reload).
    navigate("/login", { replace: true });
  }

  // Back from sign-in with the draft intact: finish the send once.
  useEffect(() => {
    if (!wantsResume || autoSubmitted.current) return;
    if (!userId || !park || !d.target || !restored || !items.length) return;
    autoSubmitted.current = true;
    void doSubmit(userId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wantsResume, userId, park, d.target, restored, items.length]);

  /**
   * "Quels jeux sont présents ?" — a single tap marks an equipment observed
   * (→ available). Toggling off a chip that Toboggo already had as available
   * is the explicit "I don't see this anymore" signal (→ unavailable); toggling
   * off anything else just reverts to the park's current value (no forced
   * "I don't know" per item — items untouched stay untouched, current → proposed
   * still lands in park_edits.changes exactly as for the other targets).
   */
  function togglePlayChip(code: string) {
    if (!park) return;
    const before = park.features[code]?.status ?? "unknown";
    const isActive = (d.featureStatus[code] ?? before) === "available";
    const next: FeatureStatus = isActive ? (before === "available" ? "unavailable" : before) : "available";
    patch({ featureStatus: { ...d.featureStatus, [code]: next } });
  }

  function closeAndDiscard() {
    clearEditDraft();
    navigate(parkId ? `/park/${parkId}` : "/map");
  }

  const guard = useLeaveGuard({
    dirty: items.length > 0 || d.note.trim() !== "",
    onLeave: closeAndDiscard,
    body: t("edit.leaveBody"),
  });

  // ── Render ──────────────────────────────────────────────────────────────
  if (!parkId || isError) {
    return (
      <div className="screen" style={{ padding: 32, textAlign: "center" }}>
        <h1 style={{ fontSize: 20, marginTop: 24 }}>{t("edit.notFoundTitle")}</h1>
        <p style={{ color: "var(--color-text-muted)", marginTop: 8 }}>
          {t("edit.notFoundBody")}
        </p>
        <Button block style={{ marginTop: 24, maxWidth: 280, marginInline: "auto" }} onClick={() => navigate("/map")}>
          {t("edit.backToMap")}
        </Button>
      </div>
    );
  }

  if (isLoading || !park) {
    return <div className="screen" style={{ padding: 40, textAlign: "center" }}>{t("common.loading")}</div>;
  }

  if (done) {
    return <ThankYou body={t("thanks.body.complete", { park: park.name })} moderation={t("thanks.moderation.complete")} parkId={parkId} />;
  }

  const targetIcon = TARGETS.find((x) => x.value === d.target)?.icon ?? "ic-list";
  let footer: React.ReactNode;
  if (d.step === 0) footer = null;
  else if (d.step === 1)
    footer = (
      <>
        <Button block disabled={!items.length} onClick={() => patch({ step: 2 })}>
          {t("common.verify")}
        </Button>
      </>
    );
  else
    footer = (
      <Button block loading={saving} onClick={submit}>
        {t("edit.submit")}
      </Button>
    );

  return (
    <>
      <FlowShell
        title={t("edit.headerTitle")}
        step={d.step}
        total={STEPPER.length}
        stepKey={d.step}
        onBack={() => (d.step === 0 ? navigate(-1) : patch({ step: d.step - 1 }))}
        onClose={guard.request}
        footer={footer}
      >
        {restored && d.step > 0 && <p className={styles.muted} style={{ margin: "0 0 8px" }}>{t("edit.draftResumed")}</p>}

        {d.step === 0 && (
          <>
            <h2 className={styles.title}>{t("edit.step0Title")}</h2>
            <p className={styles.subtitle}>{t("edit.step0Hint")}</p>
            <div className={styles.catGrid}>
              {TARGETS.map((tgt) => (
                <button key={tgt.value} type="button" className={styles.catCard} onClick={() => seedFromPark(tgt.value)}>
                  <Icon name={tgt.icon} size={22} />
                  <span className={styles.catLabel}>{t(`edit.target.${tgt.value}`)}</span>
                </button>
              ))}
            </div>
          </>
        )}

        {d.step === 1 && (
          <>
            <h2 className={styles.title}>{t(`edit.target.${d.target ?? "general"}`)}</h2>
            <p className={styles.subtitle}>{park.name}</p>
          {d.target === "general" && (
            <>
              <Input label={t("edit.diff.name")} value={d.name} onChange={(e) => patch({ name: e.target.value })} />
              <p style={{ fontSize: 12, color: "var(--color-text-muted)", margin: "4px 0 16px" }}>
                {t("edit.currently", { value: park.name })}
              </p>
              <Textarea
                label={t("edit.descriptionLabel")}
                rows={3}
                value={d.description}
                onChange={(e) => patch({ description: e.target.value })}
              />
              {park.description && (
                <p style={{ fontSize: 12, color: "var(--color-text-muted)", marginTop: 4 }}>
                  {t("edit.currently", { value: park.description })}
                </p>
              )}
            </>
          )}

          {d.target === "ages" && (
            <>
              <div style={{ fontFamily: "var(--font-heading)", fontWeight: 600, fontSize: 13, marginBottom: 6 }}>
                {t("field.ageRange")}
              </div>
              <p style={{ fontSize: 12, color: "var(--color-text-muted)", marginBottom: 10 }}>
                {t("edit.currently", { value: fmt.ageRange(park.age_min, park.age_max) })}
              </p>
              <DualRangeSlider
                min={0}
                max={12}
                low={d.ageLow}
                high={d.ageHigh}
                formatLabel={
                  !d.agesTouched && park.age_min == null && park.age_max == null
                    ? () => tCommon("age.notSpecified")
                    : (l, h) => fmt.ageRange(l, h)
                }
                onChange={(l, h) => patch({ ageLow: l, ageHigh: h, agesTouched: true })}
              />
            </>
          )}

          {d.target === "location" && (
            <>
              <div style={{ fontFamily: "var(--font-heading)", fontWeight: 600, fontSize: 13, marginBottom: 8 }}>
                {t("edit.locationHeading")}
              </div>
              <PinField
                lat={d.lat ?? park.latitude}
                lng={d.lng ?? park.longitude}
                onChange={(lat, lng) => patch({ lat, lng })}
              />
              {park.formatted_address && (
                <p style={{ fontSize: 12, color: "var(--color-text-muted)", marginTop: 8 }}>
                  {t("edit.currentAddress", { value: park.formatted_address })}
                </p>
              )}
            </>
          )}

          {d.target === "other" && (
            <Textarea
              label={t("edit.otherLabel")}
              rows={4}
              maxLength={400}
              value={d.freeText}
              onChange={(e) => patch({ freeText: e.target.value })}
              help={`${d.freeText.length}/400`}
            />
          )}

          {d.target === "play" && (
            <>
              <div style={{ fontFamily: "var(--font-heading)", fontWeight: 600, fontSize: 13, marginBottom: 6 }}>
                {t("edit.playQuestion")}
              </div>
              <p style={{ fontSize: 12, color: "var(--color-text-muted)", marginBottom: 12 }}>
                {t("edit.playHint")}
              </p>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {relevantFeatures.map((feat) => {
                  const before = park.features[feat.code]?.status ?? "unknown";
                  const active = (d.featureStatus[feat.code] ?? before) === "available";
                  return (
                    <Chip key={feat.code} active={active} onClick={() => togglePlayChip(feat.code)}>
                      {featureLabel(feat.code)}
                    </Chip>
                  );
                })}
              </div>
            </>
          )}

          {d.target !== "play" && TARGET_CATEGORIES[d.target ?? "other"] && (
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              {relevantFeatures.map((feat) => {
                const before = park.features[feat.code]?.status ?? "unknown";
                const value = d.featureStatus[feat.code] ?? before;
                return (
                  <div key={feat.code}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 6 }}>
                      <span style={{ fontSize: 13.5, fontWeight: 600, fontFamily: "var(--font-heading)" }}>
                        {featureLabel(feat.code)}
                      </span>
                      <span style={{ fontSize: 11.5, color: "var(--color-text-muted)" }}>
                        {t("edit.current", { value: t(`statusLabel.${before}`) })}
                      </span>
                    </div>
                    <Segmented
                      options={STATUS_OPTIONS.map((o) => ({ value: o.value, label: t(o.labelKey) }))}
                      value={value}
                      onChange={(v) => patch({ featureStatus: { ...d.featureStatus, [feat.code]: v } })}
                    />
                  </div>
                );
              })}
            </div>
          )}

          {/* Own section, clearly set apart from the fields above (which propose the
              correction itself) — this is an optional note for the moderator, not a
              continuation of "Description". */}
          <div style={{ height: 1, background: "var(--color-border)", margin: "24px 0 16px" }} />
          <div
            style={{
              fontSize: 11,
              fontWeight: 800,
              textTransform: "uppercase",
              letterSpacing: "0.06em",
              color: "var(--color-text-muted)",
              marginBottom: 8,
            }}
          >
            {t("edit.noteSection")}
          </div>
          <Textarea
            label={t("edit.noteLabel")}
            rows={2}
            maxLength={200}
            value={d.note}
            onChange={(e) => patch({ note: e.target.value })}
            help={`${d.note.length}/200`}
          />

            {!items.length && <p className={styles.legend} style={{ textAlign: "center" }}>{t("edit.needOneChange")}</p>}
          </>
        )}

        {d.step === 2 && (
          <>
            <h2 className={styles.title}>{t("edit.verifyTitle")}</h2>
            <p className={styles.subtitle}>{t("edit.verifyHint")}</p>
            <RecapCard
              thumb={<ParkCover park={park} className={styles.recapThumb} markSize={24} badge={false} />}
              name={park.name ?? ""}
              address={dedupeAddress(park.formatted_address)}
            >
              {items.map((i) => (
                <RecapRow key={i.field} icon={targetIcon} title={i.label} onEdit={() => patch({ step: 1 })}>
                  {`${i.currentText} → ${i.proposedText}`}
                </RecapRow>
              ))}
              {d.note.trim() && (
                <RecapRow icon="ic-pencil" title={t("edit.noteSection")} onEdit={() => patch({ step: 1 })}>
                  {d.note.trim()}
                </RecapRow>
              )}
            </RecapCard>
            <p className={styles.recapNote}>
              <Icon name="ic-shield" size={16} />
              {t("edit.moderationNote")}
            </p>
            {!userId && <p className={styles.legend}>{t("common.accountRequiredDraft")}</p>}
            <div aria-live="polite" role="status">{saving && <p className={styles.muted}>{t("addPark.submitting")}</p>}</div>
            {submitError && (
              <div className={styles.errorBox} role="alert">
                {t("edit.submitError")}
              </div>
            )}
          </>
        )}
      </FlowShell>
      {guard.dialog}
    </>
  );
}
