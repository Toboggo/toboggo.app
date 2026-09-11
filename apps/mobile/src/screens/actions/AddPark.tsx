import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import {
  Button,
  Chip,
  Icon,
  Input,
  Textarea,
  DualRangeSlider,
  Tag,
  equipmentIcon,
  serviceIcon,
  usePersistentDraft,
  useAdoptedDraftKey,
} from "@toboggo/design-system";
import {
  addParkPhotos,
  buildDraftKey,
  createPark,
  listFeatures,
  logActivity,
  uploadPhoto,
  ImageValidationError,
  type Park,
} from "@toboggo/shared";
import { WizardHeader } from "../../components/WizardHeader";
import { AddParkSearch } from "../../components/AddParkSearch";
import { PinField } from "../../components/PinField";
import { PhotoTip } from "../../components/PhotoTip";
import { useFormat } from "../../i18n/useFormat";
import { useFeatureLabel } from "../../lib/featureLabel";
import { DEFAULT_GEO_LABEL, requestBrowserLocation, useGeo } from "../../lib/geo";
import { useSession } from "../../lib/session";
import { useToastStore } from "../../lib/toast";
import { setResumeRoute } from "../../lib/resumeRoute";

// Stepper keys resolved against the `contribute` namespace.
const STEPS = ["steps.park", "steps.location", "steps.info", "steps.photos", "steps.verify"];
const TOTAL_STEPS = STEPS.length;

// Brouillon persistant (LOT 3D.E) — socle partagé `usePersistentDraft`.
// Step 0 (recherche d'un parc existant) n'a pas de données de formulaire propre
// et n'est jamais persisté ; le brouillon ne couvre que les étapes 1-4.
const ADD_PARK_DRAFT_VERSION = 1;
const ADD_PARK_DRAFT_TTL_MS = 24 * 60 * 60 * 1000; // 24 h

interface AddParkDraft {
  step: number;
  lat: number;
  lng: number;
  address: string;
  name: string;
  ageLow: number;
  ageHigh: number;
  ageTouched: boolean;
  services: Set<string>;
  equipment: Set<string>;
  description: string;
  /** Already-uploaded photo URLs only — see onPickFile: a guest can never pick
   * a photo here (it requires `userId`), so this never holds a raw File. */
  photos: string[];
}

/** `Set` isn't JSON-native — round-trip it as a tagged array. */
function replaceSets(_key: string, value: unknown): unknown {
  return value instanceof Set ? { __set: [...value] } : value;
}
function reviveSets(_key: string, value: unknown): unknown {
  return value && typeof value === "object" && Array.isArray((value as { __set?: unknown[] }).__set)
    ? new Set((value as { __set: unknown[] }).__set)
    : value;
}

/**
 * The 7 amenities `createPark` already knows how to persist (its flat V1-shape
 * input — see `packages/shared/src/api/parks.ts` `splitParkInput`). Mapped to
 * their real catalogue code purely to look up the real French label
 * (`featureLabel`) — no second wording is introduced, this only bridges the
 * legacy key to the catalogue code. The rest of the real `service` /
 * `environment` / `accessibility` catalogue (picnic_tables, lighting,
 * bike_parking, surface_type, stroller_access, accessible_toilets,
 * accessible_parking, inclusive_play) isn't settable at creation today without
 * extending that shared API — left for the existing Correction flow.
 */
const SERVICE_TO_FEATURE_CODE: Record<string, string> = {
  wc: "toilets",
  benches: "benches",
  water: "drinking_water",
  parking: "parking",
  shade: "shade_level",
  fenced: "fence_status",
  pmr: "wheelchair_access",
};
const SERVICE_GROUPS: { titleKey: string; keys: string[] }[] = [
  { titleKey: "addPark.serviceGroup.comfort", keys: ["wc", "benches", "water", "parking"] },
  { titleKey: "addPark.serviceGroup.characteristics", keys: ["shade", "fenced", "pmr"] },
];

function VerifySection({ title, onEdit, children }: { title: string; onEdit: () => void; children: ReactNode }) {
  const { t } = useTranslation("contribute");
  return (
    <div style={{ background: "var(--color-surface)", borderRadius: 14, padding: 14, marginBottom: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <span style={{ fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.04em", color: "var(--color-text-muted)" }}>
          {title}
        </span>
        <button
          type="button"
          onClick={onEdit}
          style={{ background: "none", border: "none", color: "var(--color-primary)", fontFamily: "var(--font-heading)", fontWeight: 700, fontSize: 12.5, cursor: "pointer", padding: 0 }}
        >
          {t("common.edit")}
        </button>
      </div>
      {children}
    </div>
  );
}

export default function AddPark() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const wantsResume = params.get("resume") === "1";
  const { t } = useTranslation("contribute");
  const { t: tErr } = useTranslation("errors");
  const { t: tCommon } = useTranslation("common");
  const f = useFormat();
  const featureLabel = useFeatureLabel();
  const { lat, lng } = useGeo();
  const userId = useSession((s) => s.userId);
  const showToast = useToastStore((s) => s.show);
  const [createdId, setCreatedId] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [saving, setSaving] = useState(false);

  // Draft: no parkId (there isn't one yet — this flow creates it), scoped only
  // by principal. Guest → signed-in handover mirrors EditInfo/ReportProblem:
  // the actual localStorage move runs in an effect (useAdoptedDraftKey), never
  // during render, and usePersistentDraft is held until any same-flow guest
  // draft has been arbitrated against the user's.
  const guestDraftKey = buildDraftKey({ surface: "mobile", flow: "park.add", principal: "guest" });
  const userDraftKey = userId ? buildDraftKey({ surface: "mobile", flow: "park.add", principal: { userId } }) : null;
  const draftKey = useAdoptedDraftKey(guestDraftKey, userDraftKey);

  const initialDraft = useMemo<AddParkDraft>(
    () => ({
      step: 0,
      lat,
      lng,
      address: "",
      name: "",
      ageLow: 0,
      ageHigh: 12,
      ageTouched: false,
      services: new Set(),
      equipment: new Set(),
      description: "",
      photos: [],
    }),
    // Only the very first evaluation matters (mount, or the moment a draft
    // key first resolves) — see usePersistentDraft's `initialValue` contract.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const {
    value: draft,
    setValue: setDraft,
    patch,
    clear: clearAddParkDraft,
    flush: flushAddParkDraft,
  } = usePersistentDraft<AddParkDraft>(draftKey, initialDraft, {
    schemaVersion: ADD_PARK_DRAFT_VERSION,
    ttlMs: ADD_PARK_DRAFT_TTL_MS,
    restore: "auto",
    serialize: replaceSets,
    deserialize: reviveSets,
  });

  // A restored draft claiming step 3 (Photos) or 4 (Vérification) without a
  // name — the one hard precondition step 2 enforces before letting you past
  // it — falls back to step 2 instead of skipping it. Never mutates storage.
  const clampedStep = Math.min(Math.max(draft.step, 0), TOTAL_STEPS - 1);
  const step = clampedStep >= 3 && !draft.name.trim() ? 2 : clampedStep;
  const setStep = (next: number) => patch({ step: next });

  const [parkQuery, setParkQuery] = useState("");
  const [locating, setLocating] = useState(false);
  const [uploading, setUploading] = useState(false);
  const autoSubmitted = useRef(false);

  const { data: featureCatalogue = [] } = useQuery({ queryKey: ["features"], queryFn: () => listFeatures() });
  const playFeatures = useMemo(
    () => featureCatalogue.filter((f) => f.category === "play").sort((a, b) => a.sort_order - b.sort_order),
    [featureCatalogue],
  );

  function toggle(field: "services" | "equipment", key: string) {
    const next = new Set(draft[field]);
    next.has(key) ? next.delete(key) : next.add(key);
    patch({ [field]: next } as Partial<AddParkDraft>);
  }

  // Real GPS fix (not just re-reading whatever useGeo already held) — updates
  // the shared geo store (same convention as MapExplore/Permissions) so a
  // fix obtained here is also available if the parent later revisits the
  // map, plus the draft's own coordinates so the Localisation step starts
  // from it immediately.
  async function handleUseMyLocation() {
    setLocating(true);
    try {
      const pos = await requestBrowserLocation();
      useGeo.getState().setLocation(pos.lat, pos.lng, DEFAULT_GEO_LABEL);
      useGeo.getState().setPermission("granted");
      patch({ lat: pos.lat, lng: pos.lng });
    } catch {
      useGeo.getState().setPermission("denied");
    } finally {
      setLocating(false);
    }
  }

  async function onPickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !userId) return;
    setUploading(true);
    try {
      const url = await uploadPhoto("parkPhotos", file, userId);
      setDraft((d) => ({ ...d, photos: [...d.photos, url].slice(0, 4) }));
    } catch (err) {
      showToast(
        err instanceof ImageValidationError
          ? tErr(`image.${err.code}`)
          : tErr("image.uploadFailed"),
      );
    } finally {
      setUploading(false);
    }
  }

  function removePhoto(i: number) {
    setDraft((d) => ({ ...d, photos: d.photos.filter((_, idx) => idx !== i) }));
  }

  function publish() {
    const uid = useSession.getState().userId;
    if (uid) {
      setSaving(true);
      void doPublish(uid);
      return;
    }
    // Guest: the draft is already autosaved; force the latest to disk before
    // the full-page sign-in detour, then come back here (?resume=1) — the
    // effect below finishes the send once signed in (email login or OAuth).
    flushAddParkDraft();
    setResumeRoute("/add?resume=1");
    navigate("/login", { replace: true });
  }

  async function doPublish(uid: string) {
    try {
      // Only ever send what the parent actually stated. A chip left
      // unselected, an untouched age slider, or an empty address must never
      // be written as a confirmed "false" / a fake value — they simply stay
      // absent from the payload (`createPark`/`splitParkInput` already skips
      // any field that isn't provided).
      const input: Partial<Park> = {
        name: draft.name,
        lat: draft.lat,
        lng: draft.lng,
        play_equipment: Array.from(draft.equipment),
        description: draft.description || null,
        status: "pending",
        created_by: uid,
      };
      if (draft.address.trim()) input.formatted_address = draft.address.trim();
      if (draft.ageTouched) {
        input.age_min = draft.ageLow;
        input.age_max = draft.ageHigh;
      }
      if (draft.services.has("wc")) input.wc = true;
      if (draft.services.has("shade")) input.shade = true;
      if (draft.services.has("fenced")) input.fenced = true;
      if (draft.services.has("pmr")) input.pmr = true;
      if (draft.services.has("benches")) input.benches = true;
      if (draft.services.has("water")) input.water = true;
      if (draft.services.has("parking")) input.parking = true;

      const park: Park = await createPark(input);
      // Created — drop the draft BEFORE the secondary calls below. If photos
      // or the activity log fail afterwards, the error still surfaces, but
      // the draft can no longer resurrect a form that would call createPark
      // again and produce a duplicate park.
      clearAddParkDraft();
      const photos = draft.photos;
      if (photos.length) {
        await addParkPhotos(park.id, photos, { source: "user", userId: uid });
      }
      // Back-office audit trail (`activity_log`) — internal, not user-facing UI:
      // kept in French, out of the i18n scope (see i18n audit).
      await logActivity(park.commune_id, "Vous", `Parc ajouté : ${park.name}`, "primary");
      setCreatedId(park.id);
      setDone(true);
    } catch {
      showToast(tErr("generic"));
    } finally {
      setSaving(false);
    }
  }

  // Back from sign-in with the draft intact (guest draft now adopted under the
  // user key and restored): send it once. `draft.name` mirrors the same
  // completeness gate the UI itself enforces before step 3.
  useEffect(() => {
    if (!wantsResume || autoSubmitted.current) return;
    if (!userId || !draft.name.trim()) return;
    autoSubmitted.current = true;
    void doPublish(userId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wantsResume, userId, draft.name]);

  if (done) {
    return (
      <div className="screen" style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 32, textAlign: "center" }}>
        <div
          style={{
            width: 76,
            height: 76,
            borderRadius: "50%",
            background: "var(--color-primary-tint)",
            color: "var(--color-primary)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Icon name="ic-check" size={36} />
        </div>
        <h1 style={{ fontSize: 22, marginTop: 12 }}>{t("common.thanks")}</h1>
        <p style={{ color: "var(--color-text-muted)", marginTop: 8, maxWidth: 280 }}>
          {t("addPark.doneBody")}
        </p>
        <Tag tone="warning" style={{ marginTop: 12 }}>
          {t("addPark.pendingTag")}
        </Tag>
        <div style={{ display: "flex", flexDirection: "column", gap: 10, width: "100%", maxWidth: 320, marginTop: 28 }}>
          {/* Contribution terminée : on remplace l'entrée d'historique du wizard
              par la fiche parc. Depuis la fiche, Retour ramène à l'origine
              (carte / QuickMenu / écran précédent), jamais aux étapes déjà
              soumises ni à cette confirmation. Voir aussi RatePark / AddPhotos /
              ReportProblem / EditInfo. */}
          <Button block onClick={() => navigate(`/park/${createdId}`, { replace: true })}>
            {t("common.seePark")}
          </Button>
          <Button variant="secondary" block onClick={() => window.location.reload()}>
            {t("addPark.addAnother")}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="screen">
      <WizardHeader
        step={step}
        total={TOTAL_STEPS}
        steps={STEPS.map((k) => t(k))}
        onBack={() => (step === 0 ? navigate(-1) : setStep(step - 1))}
      />

      {step === 0 && (
        <AddParkSearch
          query={parkQuery}
          onQueryChange={setParkQuery}
          onPickExisting={(p) => navigate(`/park/${p.id}`)}
          onNone={() => setStep(1)}
          onUseMyLocation={handleUseMyLocation}
          locating={locating}
        />
      )}

      {step === 1 && (
        <div style={{ padding: "0 20px" }}>
          <h2 style={{ fontSize: 18, marginBottom: 4 }}>{t("addPark.locationTitle")}</h2>
          <p style={{ fontSize: 12.5, color: "var(--color-text-muted)", marginBottom: 16 }}>
            {t("addPark.locationHint")}
          </p>
          <PinField
            lat={draft.lat}
            lng={draft.lng}
            onChange={(lat, lng) => patch({ lat, lng })}
            onAddressResolved={(address) => patch({ address })}
          />
          <p style={{ fontSize: 11.5, color: "var(--color-text-faint)", margin: "6px 0 0" }}>
            {t("addPark.pinHint")}
          </p>
          <Input
            label={t("addPark.addressLabel")}
            value={draft.address}
            onChange={(e) => patch({ address: e.target.value })}
            placeholder={t("addPark.addressPlaceholder")}
            style={{ marginTop: 16 }}
          />
          <Button block style={{ marginTop: 24 }} onClick={() => setStep(2)}>
            {t("common.continue")}
          </Button>
        </div>
      )}

      {step === 2 && (
        <div style={{ padding: "0 20px" }}>
          <h2 style={{ fontSize: 18, marginBottom: 4 }}>{t("addPark.infoTitle")}</h2>
          <p style={{ fontSize: 12.5, color: "var(--color-text-muted)", marginBottom: 16 }}>
            {t("addPark.infoHint")}
          </p>

          <Input label={t("addPark.nameLabel")} value={draft.name} onChange={(e) => patch({ name: e.target.value })} placeholder={t("addPark.namePlaceholder")} />

          <div style={{ marginTop: 20, marginBottom: 20 }}>
            <div style={{ fontFamily: "var(--font-heading)", fontWeight: 600, fontSize: 13, marginBottom: 6 }}>{t("field.ageRange")}</div>
            <DualRangeSlider
              min={0}
              max={12}
              low={draft.ageLow}
              high={draft.ageHigh}
              formatLabel={draft.ageTouched ? (l, h) => f.ageRange(l, h) : () => tCommon("age.notSpecified")}
              onChange={(l, h) => patch({ ageLow: l, ageHigh: h, ageTouched: true })}
            />
          </div>

          {SERVICE_GROUPS.map((group) => (
            <div key={group.titleKey} style={{ marginBottom: 20 }}>
              <div style={{ fontFamily: "var(--font-heading)", fontWeight: 600, fontSize: 13, marginBottom: 8 }}>{t(group.titleKey)}</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {group.keys.map((key) => {
                  const ic = serviceIcon(key);
                  return (
                    <Chip key={key} active={draft.services.has(key)} onClick={() => toggle("services", key)}>
                      {ic && <Icon name={ic} size={15} style={{ marginRight: 4, display: "inline-block", verticalAlign: "-2px" }} />}
                      {featureLabel(SERVICE_TO_FEATURE_CODE[key])}
                    </Chip>
                  );
                })}
              </div>
            </div>
          ))}

          <div style={{ marginBottom: 20 }}>
            <div style={{ fontFamily: "var(--font-heading)", fontWeight: 600, fontSize: 13, marginBottom: 8 }}>{t("field.playEquipment")}</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {playFeatures.map((feat) => {
                const ic = equipmentIcon(feat.code);
                return (
                  <Chip key={feat.code} active={draft.equipment.has(feat.code)} onClick={() => toggle("equipment", feat.code)}>
                    {ic && <Icon name={ic} size={15} style={{ marginRight: 4, display: "inline-block", verticalAlign: "-2px" }} />}
                    {featureLabel(feat.code)}
                  </Chip>
                );
              })}
            </div>
          </div>

          <Textarea label={t("addPark.descriptionLabel")} value={draft.description} onChange={(e) => patch({ description: e.target.value })} rows={3} />
          <Button block style={{ marginTop: 20 }} disabled={!draft.name} onClick={() => setStep(3)}>
            {t("common.continue")}
          </Button>
        </div>
      )}

      {step === 3 && (
        <div style={{ padding: "0 20px" }}>
          <h2 style={{ fontSize: 18, marginBottom: 4 }}>{t("addPark.photosTitle")}</h2>
          <p style={{ fontSize: 12.5, color: "var(--color-text-muted)", marginBottom: 16 }}>
            {t("addPark.photosHint")}
          </p>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            {draft.photos.map((p, i) => (
              <div key={i} style={{ position: "relative", width: 80, height: 80 }}>
                <div style={{ width: 80, height: 80, borderRadius: 14, backgroundImage: `url(${p})`, backgroundSize: "cover" }} />
                <button
                  type="button"
                  aria-label={t("common.removePhoto")}
                  onClick={() => removePhoto(i)}
                  style={{ position: "absolute", top: -6, right: -6, width: 24, height: 24, borderRadius: "50%", border: "none", background: "rgba(0,0,0,0.6)", color: "#fff", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
                >
                  <Icon name="ic-close" size={12} />
                </button>
              </div>
            ))}
            {draft.photos.length < 4 && (
              <label
                style={{
                  width: 80,
                  height: 80,
                  borderRadius: 14,
                  border: "2px dashed var(--color-border-strong)",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 4,
                  cursor: "pointer",
                  color: "var(--color-text-faint)",
                }}
              >
                {uploading ? (
                  <span style={{ fontSize: 11 }}>…</span>
                ) : (
                  <>
                    <Icon name="ic-plus" size={20} />
                    <span style={{ fontSize: 9.5, fontWeight: 600, textAlign: "center", padding: "0 4px", lineHeight: 1.15 }}>
                      {t("common.addPhoto")}
                    </span>
                  </>
                )}
                <input type="file" accept="image/*" hidden onChange={onPickFile} disabled={uploading} />
              </label>
            )}
          </div>
          <PhotoTip />
          <Button block style={{ marginTop: 24 }} onClick={() => setStep(4)}>
            {draft.photos.length > 0 ? t("common.continue") : t("common.skip")}
          </Button>
        </div>
      )}

      {step === 4 && (
        <div style={{ padding: "0 20px" }}>
          <h2 style={{ fontSize: 18, marginBottom: 4 }}>{t("addPark.verifyTitle")}</h2>
          <p style={{ fontSize: 12.5, color: "var(--color-text-muted)", marginBottom: 16 }}>
            {t("addPark.verifyHint")}
          </p>

          <VerifySection title={t("addPark.section.park")} onEdit={() => setStep(2)}>
            <div style={{ fontFamily: "var(--font-heading)", fontWeight: 700, fontSize: 16 }}>{draft.name || "—"}</div>
          </VerifySection>

          <VerifySection title={t("steps.location")} onEdit={() => setStep(1)}>
            <div style={{ fontSize: 13, color: "var(--color-text-muted)" }}>
              {draft.address.trim() || t("addPark.locationOnMap")}
            </div>
          </VerifySection>

          {draft.ageTouched && (
            <VerifySection title={t("field.ageRange")} onEdit={() => setStep(2)}>
              <Tag>{f.ageRange(draft.ageLow, draft.ageHigh)}</Tag>
            </VerifySection>
          )}

          {draft.equipment.size > 0 && (
            <VerifySection title={t("field.playEquipment")} onEdit={() => setStep(2)}>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {Array.from(draft.equipment).map((code) => (
                  <Tag key={code} tone="primary">
                    {featureLabel(code)}
                  </Tag>
                ))}
              </div>
            </VerifySection>
          )}

          {draft.services.size > 0 && (
            <VerifySection title={t("addPark.section.services")} onEdit={() => setStep(2)}>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {Array.from(draft.services).map((key) => (
                  <Tag key={key} tone="primary">
                    {featureLabel(SERVICE_TO_FEATURE_CODE[key])}
                  </Tag>
                ))}
              </div>
            </VerifySection>
          )}

          {draft.description.trim() && (
            <VerifySection title={t("addPark.section.description")} onEdit={() => setStep(2)}>
              <p style={{ fontSize: 13, color: "var(--color-text-muted)", margin: 0 }}>{draft.description}</p>
            </VerifySection>
          )}

          {draft.photos.length > 0 && (
            <VerifySection title={t("steps.photos")} onEdit={() => setStep(3)}>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {draft.photos.map((p, i) => (
                  <div key={i} style={{ width: 56, height: 56, borderRadius: 10, backgroundImage: `url(${p})`, backgroundSize: "cover" }} />
                ))}
              </div>
            </VerifySection>
          )}

          <Button block loading={saving} style={{ marginTop: 24 }} onClick={publish}>
            {t("addPark.submit")}
          </Button>
        </div>
      )}
    </div>
  );
}
