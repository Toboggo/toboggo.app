import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import {
  Button,
  Dialog,
  Input,
  Textarea,
  Tag,
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
import { ContributionSuccessSheet } from "./ContributionSuccessSheet";
import { AddParkSearch } from "../../components/AddParkSearch";
import { PinField } from "../../components/PinField";
import { PhotoPicker } from "../../components/PhotoPicker";
import { AddParkHeader, AgeButtons, GameGrid, SummaryCard, TriStateRow, type GameOption } from "../../components/addPark/AddParkParts";
import styles from "../../components/addPark/AddPark.module.css";
import { useFormat } from "../../i18n/useFormat";
import { addressToParkInput, applyResolvedAddress, formatLocality, localityFor, type DraftLocality } from "../../lib/addressDraft";
import { useAddressResolver } from "../../lib/useAddressResolver";
import { useFeatureLabel } from "../../lib/featureLabel";
import { useGeo } from "../../lib/geo";
import { useSession } from "../../lib/session";
import { useToastStore } from "../../lib/toast";
import { setResumeRoute } from "../../lib/resumeRoute";
import { trackEvent } from "../../lib/analytics";
import {
  GENERIC_PARK_NAME,
  PRIMARY_GAME_CODES,
  SERVICE_GROUPS,
  ageRangeFromBands,
  applyAnswers,
  setAnswer,
  toggleAgeBand,
  type AgeBandId,
  type Answers,
  type ServiceKey,
} from "../../lib/addParkModel";

// Plafond client des photos du brouillon (inchangé).
const MAX_PHOTOS = 4;

// 3 étapes : 0 Localisation · 1 Informations · 2 Photos et vérification.
const TOTAL_STEPS = 3;

// Brouillon persistant (LOT 3D.E) — socle partagé `usePersistentDraft`.
// v2 : parcours à 3 étapes, tranches d'âge, réponses Oui/Non/inconnu (un brouillon
// v1 — étapes 0-4, plage d'âge continue — est ignoré, jamais mal interprété).
const ADD_PARK_DRAFT_VERSION = 2;
const ADD_PARK_DRAFT_TTL_MS = 24 * 60 * 60 * 1000; // 24 h

interface AddParkDraft {
  step: number;
  lat: number;
  lng: number;
  address: string;
  /** Adresse saisie/corrigée à la main : un reverse geocoding ne l'écrase plus
   * (voir `applyResolvedAddress`). Absent des anciens brouillons = non édité. */
  addressEdited?: boolean;
  /** Code postal / ville / régions / pays du repère (reverse geocoding). */
  locality?: DraftLocality | null;
  /** L'utilisateur a validé l'emplacement (étape 0 franchie). */
  locationConfirmed: boolean;
  name: string;
  equipment: Set<string>;
  /** Tranches d'âge choisies (contiguës — voir `toggleAgeBand`). */
  ageBands: AgeBandId[];
  /** « Je ne sais pas » choisi explicitement (exclusif des tranches). */
  ageUnknown: boolean;
  /** Oui / Non ; une clé absente = inconnu. */
  answers: Answers;
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

/** Fait remonter un champ focalisé au-dessus du clavier / du bouton fixe. */
function scrollFieldIntoView(e: { target: EventTarget }) {
  const el = e.target as HTMLElement;
  setTimeout(() => el.scrollIntoView?.({ block: "center", behavior: "smooth" }), 250);
}

export default function AddPark() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const wantsResume = params.get("resume") === "1";
  const { t } = useTranslation("contribute");
  const { t: tErr } = useTranslation("errors");
  const f = useFormat();
  const featureLabel = useFeatureLabel();
  const { lat, lng } = useGeo();
  const userId = useSession((s) => s.userId);
  const showToast = useToastStore((s) => s.show);
  const [createdId, setCreatedId] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [saving, setSaving] = useState(false);
  const [submitError, setSubmitError] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);
  const [showAllGames, setShowAllGames] = useState(false);
  const [ageRejected, setAgeRejected] = useState(false);
  // Garde synchrone contre le double envoi (le `saving` React arrive un rendu trop tard).
  const submittingRef = useRef(false);

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
      locationConfirmed: false,
      name: "",
      equipment: new Set(),
      ageBands: [],
      ageUnknown: false,
      answers: {},
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

  // Reverse geocoding (Geoapify, via Edge Function) d'une position réellement
  // choisie — jamais au montage ni à la restauration d'un brouillon.
  // Dès qu'une nouvelle résolution démarre (ou échoue), la localité de l'ancien
  // repère est retirée : elle ne peut ni s'afficher ni partir avec les nouvelles
  // coordonnées. Le texte de l'adresse, lui, est conservé (jamais vidé par un échec).
  const dropLocality = () => setDraft((d) => (d.locality ? { ...d, locality: null } : d));
  const { resolve: resolveAddress, resolving: resolvingAddress } = useAddressResolver({
    onStart: dropLocality,
    onResolved: (a, pos) => setDraft((d) => ({ ...d, ...applyResolvedAddress(d, a, pos) })),
    onUnresolved: dropLocality,
  });
  const pinLocality = localityFor(draft, { lat: draft.lat, lng: draft.lng });

  // Un brouillon restauré à l'étape 1 ou 2 sans emplacement confirmé (la seule
  // précondition dure) retombe à l'étape 0 au lieu de la sauter. Ne modifie
  // jamais le stockage.
  const clampedStep = Math.min(Math.max(draft.step, 0), TOTAL_STEPS - 1);
  const step = clampedStep >= 1 && !draft.locationConfirmed ? 0 : clampedStep;
  const setStep = (next: number) => {
    patch({ step: next });
    window.scrollTo?.(0, 0);
  };

  const [uploading, setUploading] = useState(false);
  const autoSubmitted = useRef(false);

  // `contribution_started` — une fois par montage, quelle que soit l'étape.
  // Pas de `?park=` possible pour ce wizard (il en crée un), donc pas de cas
  // "park_detail_contribute_sheet" ici — voir RatePark.tsx pour la
  // justification complète de cette heuristique d'entry_point.
  const contributionStartedTracked = useRef(false);
  useEffect(() => {
    if (contributionStartedTracked.current) return;
    contributionStartedTracked.current = true;
    trackEvent("contribution_started", {
      contribution_type: "add_park",
      entry_point: wantsResume ? "contribution_resume" : "direct_link",
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Jeux : les six premiers sont fixes (libellés du parcours) ; « Voir tous les
  // jeux » ajoute TOUS les autres équipements `play` du catalogue — aucun ne disparaît.
  const { data: featureCatalogue = [] } = useQuery({ queryKey: ["features"], queryFn: () => listFeatures() });
  const gameLabel = (code: string) =>
    t(`addPark.game.${code}`, { defaultValue: featureLabel(code) });
  const primaryGames: GameOption[] = PRIMARY_GAME_CODES.map((code) => ({ code, label: gameLabel(code) }));
  const otherGames: GameOption[] = useMemo(
    () =>
      featureCatalogue
        .filter((c) => c.category === "play" && !(PRIMARY_GAME_CODES as readonly string[]).includes(c.code))
        .sort((a, b) => a.sort_order - b.sort_order)
        .map((c) => ({ code: c.code, label: gameLabel(c.code) })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [featureCatalogue, t, featureLabel],
  );
  // Un jeu restauré d'un brouillon mais absent du catalogue reste visible (jamais perdu).
  const knownCodes = new Set([...primaryGames, ...otherGames].map((g) => g.code));
  const orphanGames: GameOption[] = Array.from(draft.equipment)
    .filter((c) => !knownCodes.has(c))
    .map((code) => ({ code, label: gameLabel(code) }));
  const visibleGames = showAllGames ? [...primaryGames, ...otherGames, ...orphanGames] : primaryGames;
  const hasMoreGames = otherGames.length + orphanGames.length > 0;

  function toggleGame(code: string) {
    setDraft((d) => {
      const next = new Set(d.equipment);
      next.has(code) ? next.delete(code) : next.add(code);
      return { ...d, equipment: next };
    });
  }

  function onToggleBand(id: AgeBandId) {
    const { rejected } = toggleAgeBand(draft.ageBands, id);
    setAgeRejected(rejected);
    if (rejected) return;
    setDraft((d) => ({ ...d, ageBands: toggleAgeBand(d.ageBands, id).next, ageUnknown: false }));
  }
  function onAgeUnknown() {
    setAgeRejected(false);
    patch({ ageBands: [], ageUnknown: !draft.ageUnknown });
  }

  // Caméra (1 fichier) ou photothèque (plusieurs) : chaque fichier est envoyé
  // tout de suite (le brouillon ne garde que des URLs), dans la limite des
  // places restantes. Un fichier refusé n'empêche pas les suivants.
  async function addFiles(files: File[]) {
    if (!files.length || !userId) return;
    const remaining = Math.max(0, MAX_PHOTOS - draft.photos.length);
    const accepted = files.slice(0, remaining);
    setUploading(true);
    try {
      for (const file of accepted) {
        try {
          const url = await uploadPhoto("parkPhotos", file, userId);
          setDraft((d) => ({ ...d, photos: [...d.photos, url].slice(0, MAX_PHOTOS) }));
        } catch (err) {
          showToast(
            err instanceof ImageValidationError
              ? tErr(`image.${err.code}`)
              : tErr("image.uploadFailed"),
          );
        }
      }
      if (files.length > accepted.length) showToast(tErr("image.tooMany", { max: MAX_PHOTOS }));
    } finally {
      setUploading(false);
    }
  }

  function removePhoto(i: number) {
    setDraft((d) => ({ ...d, photos: d.photos.filter((_, idx) => idx !== i) }));
  }

  const ageRange = ageRangeFromBands(draft.ageBands);

  // Des données saisies existent-elles ? (même sans, le brouillon est gardé 24 h,
  // mais on prévient avant de quitter pour ne pas surprendre.)
  const isDirty =
    draft.locationConfirmed ||
    Boolean(draft.addressEdited) ||
    draft.name.trim() !== "" ||
    draft.equipment.size > 0 ||
    draft.ageBands.length > 0 ||
    draft.ageUnknown ||
    Object.keys(draft.answers).length > 0 ||
    draft.description.trim() !== "" ||
    draft.photos.length > 0;

  function handleBack() {
    if (step > 0) return setStep(step - 1);
    if (isDirty) return setConfirmClose(true);
    navigate(-1);
  }
  function handleClose() {
    if (isDirty) return setConfirmClose(true);
    navigate("/map");
  }

  function publish() {
    if (submittingRef.current) return;
    const uid = useSession.getState().userId;
    if (uid) {
      submittingRef.current = true;
      setSaving(true);
      setSubmitError(false);
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
      // Only ever send what the parent actually stated. A game left
      // unselected, an unanswered « ? », an unknown age or an empty address
      // must never be written as a confirmed "false" / a fake value — they
      // simply stay absent from the payload (`createPark`/`splitParkInput`
      // already skips any field that isn't provided).
      const input: Partial<Park> = {
        name: draft.name.trim() || GENERIC_PARK_NAME,
        lat: draft.lat,
        lng: draft.lng,
        play_equipment: Array.from(draft.equipment),
        description: draft.description.trim() || null,
        status: "pending",
        created_by: uid,
      };
      Object.assign(input, addressToParkInput(draft, { lat: draft.lat, lng: draft.lng }));
      const range = ageRangeFromBands(draft.ageBands);
      if (range) {
        input.age_min = range.min;
        input.age_max = range.max;
      }
      applyAnswers(input, draft.answers);

      let park: Park;
      try {
        park = await createPark(input);
      } catch {
        // Rien n'a été créé : on reste sur le récapitulatif, données intactes.
        setSubmitError(true);
        return;
      }
      // Created — drop the draft BEFORE the secondary calls below, so the draft
      // can never resurrect a form that would call createPark again and
      // produce a duplicate park. Secondary failures (photos, audit log) are
      // no longer fatal for the same reason: the park exists, retrying would dupe.
      clearAddParkDraft();
      const photos = draft.photos;
      if (photos.length) {
        try {
          await addParkPhotos(park.id, photos, { source: "user", userId: uid });
        } catch {
          showToast(t("addPark.photosPartial"));
        }
      }
      // Back-office audit trail (`activity_log`) — internal, not user-facing UI:
      // kept in French, out of the i18n scope (see i18n audit).
      try {
        await logActivity(park.commune_id, "Vous", `Parc ajouté : ${park.name}`, "primary");
      } catch {
        /* journal interne : sans incidence pour le parent */
      }
      trackEvent("contribution_completed", {
        contribution_type: "add_park",
        park_id: park.id,
        had_just_in_time_auth: wantsResume,
        has_photo: photos.length > 0,
      });
      setCreatedId(park.id);
      setDone(true);
    } finally {
      submittingRef.current = false;
      setSaving(false);
    }
  }

  // Back from sign-in with the draft intact (guest draft now adopted under the
  // user key and restored): send it once. `locationConfirmed` mirrors the same
  // completeness gate the UI itself enforces before step 1.
  useEffect(() => {
    if (!wantsResume || autoSubmitted.current) return;
    if (!userId || !draft.locationConfirmed) return;
    autoSubmitted.current = true;
    submittingRef.current = true;
    setSaving(true);
    void doPublish(userId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wantsResume, userId, draft.locationConfirmed]);

  if (done) {
    // Contribution terminée : le wizard (formulaire, boutons d'étape) ne doit
    // plus rester visible ni interactif derrière la confirmation — remplacé
    // par un fond neutre, la Success Sheet porte tout le contenu et les CTA.
    // "Voir le parc" et "Retour à la carte" remplacent (jamais n'empilent)
    // l'entrée d'historique du wizard : Retour ne ramène jamais aux étapes
    // déjà soumises ni à cette confirmation. Voir aussi RatePark / AddPhotos /
    // ReportProblem / EditInfo (même pattern, non touché par ce prototype).
    return (
      <>
        <div className="screen" />
        <ContributionSuccessSheet
          open={done}
          title={t("addPark.success.title")}
          body={t("addPark.success.body")}
          primaryCta={{ label: t("common.seePark"), onPress: () => navigate(`/park/${createdId}`, { replace: true }) }}
          secondaryCta={{ label: t("common.backToMap"), onPress: () => navigate("/map", { replace: true }) }}
          onDismiss={() => navigate("/map", { replace: true })}
        />
      </>
    );
  }

  const cta =
    step === 0 ? t("addPark.confirmLocation") : step === 1 ? t("common.continue") : t("addPark.submit");
  const onCta = () => {
    if (step === 0) {
      patch({ locationConfirmed: true, step: 1 });
      window.scrollTo?.(0, 0);
    } else if (step === 1) setStep(2);
    else publish();
  };

  const answerText = (a: "yes" | "no") => t(`addPark.answer.${a}`);
  const answeredServices = SERVICE_GROUPS.flatMap((g) => g.keys).filter((k) => draft.answers[k]);

  return (
    <div className={styles.page}>
      <AddParkHeader step={step} total={TOTAL_STEPS} onBack={handleBack} onClose={handleClose} />

      {step === 0 && (
        <main className={styles.content}>
          <h2 className={styles.title}>{t("addPark.locationTitle")}</h2>
          <p className={styles.subtitle}>{t("addPark.locationHint")}</p>
          <PinField
            lat={draft.lat}
            lng={draft.lng}
            onChange={(lat, lng) => patch({ lat, lng })}
            onPositionCommitted={resolveAddress}
          />
          <p style={{ fontSize: 12, color: "var(--color-text-muted)", margin: "6px 0 0" }}>{t("addPark.pinHint")}</p>
          <Input
            label={t("addPark.addressLabel")}
            value={draft.address}
            onChange={(e) => patch({ address: e.target.value, addressEdited: e.target.value.trim() !== "" })}
            onFocus={scrollFieldIntoView}
            placeholder={t("addPark.addressPlaceholder")}
            style={{ marginTop: 16 }}
          />
          {(resolvingAddress || formatLocality(pinLocality)) && (
            <p style={{ fontSize: 12, color: "var(--color-text-muted)", margin: "6px 0 0" }} aria-live="polite">
              {resolvingAddress ? t("addPark.addressResolving") : formatLocality(pinLocality)}
            </p>
          )}
          <AddParkSearch lat={draft.lat} lng={draft.lng} onPickExisting={(p) => navigate(`/park/${p.id}`)} />
        </main>
      )}

      {step === 1 && (
        <main className={styles.content}>
          <h2 className={styles.title}>{t("addPark.infoTitle")}</h2>
          <p className={styles.subtitle}>{t("addPark.infoHint")}</p>

          <Input
            label={t("addPark.nameLabel")}
            value={draft.name}
            onChange={(e) => patch({ name: e.target.value })}
            onFocus={scrollFieldIntoView}
            placeholder={t("addPark.namePlaceholder")}
            autoComplete="off"
          />

          <section className={styles.section} aria-labelledby="add-park-games">
            <h3 className={styles.sectionTitle} id="add-park-games">
              {t("addPark.games.title")}
            </h3>
            <GameGrid games={visibleGames} selected={draft.equipment} onToggle={toggleGame} />
            {hasMoreGames && (
              <button
                type="button"
                className={styles.linkButton}
                aria-expanded={showAllGames}
                onClick={() => setShowAllGames((v) => !v)}
              >
                {showAllGames ? t("addPark.games.seeLess") : t("addPark.games.seeAll")}
              </button>
            )}
          </section>

          <section className={styles.section} aria-labelledby="add-park-ages">
            <h3 className={styles.sectionTitle} id="add-park-ages">
              {t("addPark.ages.title")}
            </h3>
            <AgeButtons
              bands={draft.ageBands}
              unknown={draft.ageUnknown}
              onToggleBand={onToggleBand}
              onUnknown={onAgeUnknown}
              rejected={ageRejected}
            />
          </section>

          <section className={styles.section} aria-labelledby="add-park-details">
            <h3 className={styles.sectionTitle} id="add-park-details">
              {t("addPark.details.title")}
            </h3>
            <p className={styles.sectionHint}>{t("addPark.details.hint")}</p>
            {SERVICE_GROUPS.map((group) => (
              <div key={group.titleKey}>
                <div className={styles.groupTitle}>{t(group.titleKey)}</div>
                <div className={styles.detailsCard}>
                  {group.keys.map((key: ServiceKey) => (
                    <TriStateRow
                      key={key}
                      serviceKey={key}
                      label={t(`addPark.service.${key}`)}
                      value={draft.answers[key]}
                      onChange={(v) => setDraft((d) => ({ ...d, answers: setAnswer(d.answers, key, v) }))}
                    />
                  ))}
                </div>
              </div>
            ))}
            <p className={styles.legend}>{t("addPark.answer.legend")}</p>
          </section>

          <section className={styles.section}>
            <Textarea
              label={t("addPark.descriptionLabel")}
              value={draft.description}
              onChange={(e) => patch({ description: e.target.value })}
              onFocus={scrollFieldIntoView}
              placeholder={t("addPark.descriptionPlaceholder")}
              rows={3}
            />
          </section>
        </main>
      )}

      {step === 2 && (
        <main className={styles.content}>
          <h2 className={styles.title}>{t("addPark.finalTitle")}</h2>
          <p className={styles.subtitle}>{t("addPark.finalHint")}</p>

          <h3 className={styles.sectionTitle}>{t("addPark.photosSection")}</h3>
          <p className={styles.sectionHint}>{t("addPark.photosHint")}</p>
          <PhotoPicker
            previews={draft.photos}
            max={MAX_PHOTOS}
            onFiles={addFiles}
            onRemove={removePhoto}
            canPick={Boolean(userId)}
            onRequireAuth={() => showToast(t("common.accountRequiredPhotos"))}
            busy={uploading}
          />

          <h3 className={styles.sectionTitle} style={{ marginTop: 26, marginBottom: 12 }}>
            {t("addPark.summaryTitle")}
          </h3>

          <SummaryCard title={t("steps.location")} onEdit={() => setStep(0)}>
            <div className={styles.muted}>
              {[draft.address.trim(), formatLocality(pinLocality)].filter(Boolean).join(", ") || t("addPark.locationOnMap")}
            </div>
          </SummaryCard>

          <SummaryCard title={t("addPark.section.park")} onEdit={() => setStep(1)}>
            <div style={{ fontFamily: "var(--font-heading)", fontWeight: 700, fontSize: 16 }}>
              {draft.name.trim() || <span className={styles.muted}>{t("addPark.summary.unnamed")}</span>}
            </div>
          </SummaryCard>

          <SummaryCard title={t("addPark.games.title")} onEdit={() => setStep(1)}>
            {draft.equipment.size > 0 ? (
              <div className={styles.tags}>
                {Array.from(draft.equipment).map((code) => (
                  <Tag key={code} tone="primary">
                    {gameLabel(code)}
                  </Tag>
                ))}
              </div>
            ) : (
              <span className={styles.muted}>{t("addPark.summary.notProvided")}</span>
            )}
          </SummaryCard>

          <SummaryCard title={t("addPark.ages.title")} onEdit={() => setStep(1)}>
            {ageRange ? (
              <Tag>{f.ageRange(ageRange.min, ageRange.max)}</Tag>
            ) : (
              <span className={styles.muted}>{t("addPark.summary.notProvided")}</span>
            )}
          </SummaryCard>

          <SummaryCard title={t("addPark.details.title")} onEdit={() => setStep(1)}>
            {answeredServices.length > 0 ? (
              <div className={styles.tags}>
                {answeredServices.map((k) => (
                  <Tag key={k} tone={draft.answers[k] === "yes" ? "primary" : undefined}>
                    {t(`addPark.service.${k}`)} : {answerText(draft.answers[k]!)}
                  </Tag>
                ))}
              </div>
            ) : (
              <span className={styles.muted}>{t("addPark.summary.notProvided")}</span>
            )}
          </SummaryCard>

          {draft.description.trim() && (
            <SummaryCard title={t("addPark.section.description")} onEdit={() => setStep(1)}>
              <p className={styles.muted} style={{ margin: 0 }}>
                {draft.description}
              </p>
            </SummaryCard>
          )}

          <div aria-live="polite" role="status">
            {saving && <p className={styles.muted}>{t("addPark.submitting")}</p>}
          </div>
          {submitError && (
            <div className={styles.errorBox} role="alert">
              {t("addPark.submitError")}
            </div>
          )}
        </main>
      )}

      <div className={styles.footer}>
        <Button block loading={saving} onClick={onCta}>
          {cta}
        </Button>
      </div>

      <Dialog
        open={confirmClose}
        onClose={() => setConfirmClose(false)}
        title={t("addPark.close.title")}
        actions={
          <>
            <Button variant="secondary" onClick={() => setConfirmClose(false)}>
              {t("addPark.close.stay")}
            </Button>
            <Button onClick={() => navigate("/map")}>{t("addPark.close.leave")}</Button>
          </>
        }
      >
        <p style={{ margin: 0, fontSize: 14, color: "var(--color-text-muted)" }}>{t("addPark.close.body")}</p>
      </Dialog>
    </div>
  );
}
