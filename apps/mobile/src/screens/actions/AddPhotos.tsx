import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Button } from "@toboggo/design-system";
import {
  addParkPhotos,
  canDecodeImage,
  getParkDisplayName,
  ImageValidationError,
  looksLikeHeic,
  uploadPhoto,
  validateImageFile,
} from "@toboggo/shared";
import { WizardHeader } from "../../components/WizardHeader";
import { ContributionSuccessSheet } from "./ContributionSuccessSheet";
import { ParkPicker } from "../../components/ParkPicker";
import { PhotoPicker, TipBlock } from "../../components/PhotoPicker";
import { usePark } from "../../lib/parksQuery";
import { requireAccount, useSession } from "../../lib/session";
import { useToastStore } from "../../lib/toast";
import { queryClient } from "../../lib/queryClient";
import { trackEvent } from "../../lib/analytics";

interface PhotoPick {
  file: File;
  preview: string;
}

// Photothèque (LOT photo-library) — plafond client uniquement, aucune règle
// serveur ne le contraint (`addParkPhotos` accepte n'importe quel nombre
// d'URLs). Remplace l'ancienne grille figée à 4 cases : ce chiffre-là ne
// répondait à aucune règle produit documentée, juste à la mise en page 2x2
// d'origine.
const MAX_PHOTOS = 5;

// Brouillon persistant (LOT 3D.F) — délibérément absent ici, et `requireAccount`
// / `pendingResume` délibérément conservés tels quels. Raisons :
// - `picks` ne porte aucune information sérialisable qui vaille la peine d'un
//   brouillon (pas de légende, pas d'étape à mémoriser au-delà de `parkId` déjà
//   dans l'URL) : c'est juste « choisir des fichiers → envoyer ». Un
//   `persistentDraft` n'apporterait donc rien.
// - Un `File`/`Blob` ne peut JAMAIS être stocké dans `localStorage` (règle du
//   socle) : tant que ce composant reste monté, `picks` survit déjà en mémoire
//   aux changements d'onglet / app / Finder (protection LOT 3D.A) — un vrai
//   rechargement, une fermeture ou une éviction du process perd les fichiers
//   choisis. C'est une limite V1 assumée, pas un bug : il faut resélectionner
//   les photos dans ce cas.
// - Basculer vers `resumeRoute` (au lieu de `requireAccount`/`pendingResume`)
//   régresserait le chemin invité → connexion in-SPA (email ou lien magique) :
//   `pendingResume` referme sur les `File` déjà choisis et les envoie dès le
//   retour de session, sans reformulaire. Aucun mécanisme ne peut de toute
//   façon faire traverser un `File` à une redirection OAuth pleine page (le tas
//   JS, donc la closure, est détruit) — le gain espéré n'existe pas.
//
// Micro-correctif (LOT 3D.F, point auth) — le compte est désormais requis
// AVANT d'ouvrir le sélecteur de fichiers, pas seulement à l'envoi : un invité
// ne doit jamais se retrouver avec des `File` en main que nous savons ne pas
// pouvoir restaurer après une redirection OAuth pleine page. Le sélecteur
// natif (`<input type="file">`) n'est même pas rendu tant que l'utilisateur
// n'est pas connecté (voir le rendu conditionnel ci-dessous).

// Named stepper shared with the other contribution wizards (see AddPark). The
// three stages are stable across entry points: arriving with `?park=` just
// starts on "Photos" with "Parc" already checked — the step is never dropped.
// Keys resolved against the `contribute` namespace.
const STEPPER = ["steps.park", "steps.photos", "steps.confirmation"];

export default function AddPhotos() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { t } = useTranslation("contribute");
  const { t: tErr } = useTranslation("errors");
  const [parkId, setParkId] = useState<string | null>(params.get("park"));
  const { data: park } = usePark(parkId ?? undefined);
  const userId = useSession((s) => s.userId);
  const showToast = useToastStore((s) => s.show);
  const preselected = useRef(Boolean(params.get("park"))).current;

  const [step, setStep] = useState(parkId ? 1 : 0);
  const [picks, setPicks] = useState<PhotoPick[]>([]);
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);

  // `contribution_started` — une fois par montage. Limite documentée : ce
  // wizard n'a pas de marqueur `?resume=1` (il utilise `requireAccount`, pas
  // `resumeRoute` — voir le commentaire de tête de fichier) : un retour post-
  // auth juste-à-temps remonte ce composant à l'identique d'une entrée
  // fraîche avec `?park=`, donc `entry_point` ne peut pas distinguer
  // "contribution_resume" ici, contrairement aux 4 autres wizards.
  const contributionStartedTracked = useRef(false);
  useEffect(() => {
    if (contributionStartedTracked.current) return;
    contributionStartedTracked.current = true;
    trackEvent("contribution_started", {
      contribution_type: "add_photo",
      park_id: parkId ?? undefined,
      entry_point: preselected ? "park_detail_contribute_sheet" : "direct_link",
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Browsing (picking a park) stays anonymous; the account is required before
  // the file picker itself opens (see `requirePhotoAuth`). Keep the object
  // URLs alive until unmount.
  const picksRef = useRef(picks);
  picksRef.current = picks;
  useEffect(() => () => picksRef.current.forEach((p) => URL.revokeObjectURL(p.preview)), []);

  // Sert les deux sources (caméra et photothèque) : la caméra ne renvoie
  // jamais qu'un seul fichier, la photothèque peut en renvoyer plusieurs
  // (jusqu'à MAX_PHOTOS au total). Chaque fichier passe par la même
  // validation que l'ancien chemin caméra-only ; un fichier invalide ne bloque
  // pas les autres.
  //
  // Cas HEIC/HEIF (LOT photo-library, point 3) : un HEIC que ce navigateur ne
  // sait pas décoder serait de toute façon rejeté par Storage plus tard (le
  // bucket `park-photos` n'accepte que jpeg/png/webp) — mais alors caché
  // derrière le toast générique `image.uploadFailed`, potentiellement bien
  // après la sélection, mêlé à d'autres photos valides déjà en attente. La
  // sonde `canDecodeImage` l'intercepte ici, avant même l'aperçu, avec un
  // message explicite. Safari (HEIC nativement décodable) n'est jamais
  // concerné par ce détour : `canDecodeImage` y réussit comme `compressImage`
  // le fera ensuite à l'envoi.
  async function addFiles(files: File[]) {
    const remaining = Math.max(0, MAX_PHOTOS - picks.length);
    const accepted = files.slice(0, remaining);
    const overflow = files.length > accepted.length;

    const newPicks: PhotoPick[] = [];
    for (const file of accepted) {
      try {
        validateImageFile(file);
      } catch (err) {
        showToast(err instanceof ImageValidationError ? tErr(`image.${err.code}`) : tErr("image.invalid"));
        continue;
      }
      if (looksLikeHeic(file) && !(await canDecodeImage(file))) {
        showToast(tErr("image.heicUnsupported"));
        continue;
      }
      newPicks.push({ file, preview: URL.createObjectURL(file) });
    }
    if (newPicks.length) setPicks((p) => [...p, ...newPicks].slice(0, MAX_PHOTOS));
    if (overflow) showToast(tErr("image.tooMany", { max: MAX_PHOTOS }));
  }

  function removePick(i: number) {
    setPicks((p) => {
      const target = p[i];
      if (target) URL.revokeObjectURL(target.preview);
      return p.filter((_, idx) => idx !== i);
    });
  }

  // Gate before the file picker (guest) — never carries File objects across
  // auth: just routes back to this same screen, ready to pick, once signed in.
  function requirePhotoAuth() {
    if (!parkId) return;
    const targetPark = parkId;
    requireAccount(navigate, () => navigate(`/photo-add?park=${targetPark}`, { replace: true }));
  }

  // Contributor photos: real photos of this park, recorded provenance
  // (source = "user"). They enter the moderation queue (status = pending).
  async function upload(uid: string, targetPark: string, files: File[]): Promise<boolean> {
    const urls: string[] = [];
    for (const file of files) urls.push(await uploadPhoto("parkPhotos", file, uid));
    await addParkPhotos(targetPark, urls, { source: "user", userId: uid });
    void queryClient.invalidateQueries({ queryKey: ["park", targetPark] });
    return true;
  }

  function submit() {
    if (!parkId || !park || !picks.length) return;
    const targetPark = parkId;
    const files = picks.map((p) => p.file);
    const uid = useSession.getState().userId;

    if (!uid) {
      // Defensive only: the pick-time gate (`requirePhotoAuth`) normally makes
      // this unreachable — `picks` can't be non-empty without an account. If
      // the session was lost since (e.g. signed out elsewhere), route through
      // the same gate again rather than trying to carry the already-picked
      // `File`s across a fresh login — that's exactly what we no longer do.
      requirePhotoAuth();
      return;
    }

    setSaving(true);
    upload(uid, targetPark, files)
      .then(() => {
        // `had_just_in_time_auth` est volontairement OMISE (propriété
        // optionnelle, voir events.ts) : ce wizard ne peut pas distinguer de
        // manière fiable "déjà connecté à l'entrée" de "vient de se connecter
        // via requireAccount" (voir commentaire de tête de fichier — pas de
        // marqueur `?resume=1` ici, contrairement aux 4 autres wizards).
        // Mieux vaut omettre l'info que d'affirmer `false` à tort.
        trackEvent("contribution_completed", {
          contribution_type: "add_photo",
          park_id: targetPark,
          has_photo: true,
        });
        setDone(true);
      })
      .catch(() => showToast(tErr("image.uploadFailed")))
      .finally(() => setSaving(false));
  }

  if (done) {
    // Contribution terminée : le wizard ne doit plus rester visible ni
    // interactif derrière la confirmation. Même motif que AddPark / RatePark /
    // EditInfo / ReportProblem : Success Sheet, jamais un nouvel écran plein
    // format. "Voir le parc" / "Retour à la carte" remplacent (jamais
    // n'empilent) l'entrée d'historique du wizard.
    return (
      <>
        <div className="screen" />
        <ContributionSuccessSheet
          open={done}
          title={t("addPhotos.doneTitle")}
          body={t("addPhotos.doneBody", { count: picks.length })}
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

      {step === 1 && (
        <div style={{ padding: "0 20px" }}>
          <h2 style={{ fontSize: 16, marginBottom: 4 }}>{park && getParkDisplayName(park, t)}</h2>
          <p style={{ fontSize: 13.5, color: "var(--color-text-muted)", marginBottom: 12 }}>
            {t("addPhotos.subtitle")}
          </p>

          <PhotoPicker
            previews={picks.map((p) => p.preview)}
            max={MAX_PHOTOS}
            onFiles={addFiles}
            onRemove={removePick}
            canPick={Boolean(userId)}
            onRequireAuth={requirePhotoAuth}
          />
          {!userId && (
            <p style={{ fontSize: 12.5, color: "var(--color-text-muted)", marginTop: 12 }}>
              {t("common.accountRequiredPhotos")}
            </p>
          )}
          <Button block disabled={!picks.length} style={{ marginTop: 16 }} onClick={() => setStep(2)}>
            {t("common.continue")}
          </Button>
        </div>
      )}

      {step === 2 && (
        // Étape réellement atteinte désormais — jusqu'ici "Confirmation" n'était
        // qu'un libellé de stepper jamais rendu (le bouton de l'étape Photos
        // envoyait directement). L'upload/la création de la contribution ne se
        // déclenchent qu'ici, sur clic explicite ; "Modifier les photos" revient
        // à l'étape 1 sans toucher à `picks` (état du composant, inchangé par un
        // simple changement de `step`).
        <div style={{ padding: "0 20px" }}>
          <h2 style={{ fontSize: 18, marginBottom: 4 }}>{t("steps.confirmation")}</h2>
          <p style={{ fontFamily: "var(--font-heading)", fontWeight: 700, fontSize: 16, marginBottom: 4 }}>
            {park && getParkDisplayName(park, t)}
          </p>
          <p style={{ fontSize: 13, color: "var(--color-text-muted)", marginBottom: 16 }}>
            {t("addPhotos.readyCount", { count: picks.length })}
          </p>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 16 }}>
            {picks.map((pick, i) => (
              <div
                key={i}
                style={{ aspectRatio: "1", borderRadius: 14, backgroundImage: `url(${pick.preview})`, backgroundSize: "cover", backgroundPosition: "center" }}
              />
            ))}
          </div>

          <TipBlock label={t("photoTip.label")} text={t("photoTip.text")} />

          <Button block loading={saving} disabled={!picks.length} style={{ marginTop: 16 }} onClick={submit}>
            {t("addPhotos.submit", { count: picks.length })}
          </Button>
          <button
            type="button"
            onClick={() => setStep(1)}
            style={{
              display: "block",
              width: "100%",
              textAlign: "center",
              background: "none",
              border: "none",
              color: "var(--color-primary)",
              fontFamily: "var(--font-heading)",
              fontWeight: 700,
              fontSize: 14,
              cursor: "pointer",
              padding: 12,
              marginTop: 4,
            }}
          >
            {t("addPhotos.editPhotos")}
          </button>
        </div>
      )}
    </div>
  );
}
