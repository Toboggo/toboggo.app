import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Button, Icon } from "@toboggo/design-system";
import {
  addParkPhotos,
  canDecodeImage,
  getParkDisplayName,
  type Park,
  ImageValidationError,
  looksLikeHeic,
  uploadPhoto,
  validateImageFile,
} from "@toboggo/shared";
import { ThankYou } from "../../components/flow/ThankYou";
import { PhotoPicker } from "../../components/PhotoPicker";
import { FlowShell, useLeaveGuard } from "../../components/flow/FlowShell";
import { ParkCardMini, ParkChooser } from "../../components/flow/ParkChooser";
import { PhotoThumbs, RecapCard, RecapRow, dedupeAddress } from "../../components/flow/Recap";
import { ParkPhoto } from "../../components/ParkPhoto";
import styles from "../../components/flow/Flow.module.css";
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

export default function AddPhotos() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { t } = useTranslation("contribute");
  const { t: tErr } = useTranslation("errors");
  const [parkId, setParkId] = useState<string | null>(params.get("park"));
  const { data: fetchedPark } = usePark(parkId ?? undefined);
  const [chosen, setChosen] = useState<Park | null>(null);
  const park = chosen ?? fetchedPark;
  const userId = useSession((s) => s.userId);
  const showToast = useToastStore((s) => s.show);
  const preselected = useRef(Boolean(params.get("park"))).current;

  const [step, setStep] = useState(parkId ? 1 : 0);
  const [picks, setPicks] = useState<PhotoPick[]>([]);
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);
  const [submitError, setSubmitError] = useState(false);
  // Verrou synchrone anti double envoi + URLs déjà téléversées : un nouvel essai
  // après un échec partiel ne re-téléverse jamais une photo déjà envoyée.
  const submittingRef = useRef(false);
  const uploadedRef = useRef(new Map<File, string>());

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
    for (const file of files) {
      let url = uploadedRef.current.get(file);
      if (!url) {
        url = await uploadPhoto("parkPhotos", file, uid);
        uploadedRef.current.set(file, url);
      }
      urls.push(url);
    }
    await addParkPhotos(targetPark, urls, { source: "user", userId: uid });
    void queryClient.invalidateQueries({ queryKey: ["park", targetPark] });
    return true;
  }

  function submit() {
    if (submittingRef.current || !parkId || !park || !picks.length) return;
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

    submittingRef.current = true;
    setSaving(true);
    setSubmitError(false);
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
      .catch(() => setSubmitError(true))
      .finally(() => {
        submittingRef.current = false;
        setSaving(false);
      });
  }

  // Parc fourni par la fiche : l'étape « Choisir le parc » n'est pas affichée, la
  // progression ne compte que les étapes réellement présentées.
  const offset = preselected ? 1 : 0;
  const total = 3 - offset;
  const guard = useLeaveGuard({ dirty: picks.length > 0, onLeave: () => navigate("/map"), body: t("addPhotos.leaveBody") });
  const back = () => (step === offset ? (picks.length ? guard.request() : navigate(-1)) : setStep(step - 1));

  if (done) {
    return (
      <ThankYou
        body={t("thanks.body.photos", { count: picks.length })}
        moderation={t("thanks.moderation.photos", { count: picks.length })}
        parkId={parkId}
      />
    );
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
      <Button block disabled={!picks.length} onClick={() => setStep(2)}>
        {t("common.continue")}
      </Button>
    );
  } else {
    footer = (
      <Button block loading={saving} disabled={!picks.length} onClick={submit}>
        {t("addPhotos.submit")}
      </Button>
    );
  }

  return (
    <>
      <FlowShell
        title={t("addPhotos.headerTitle")}
        step={step - offset}
        total={total}
        stepKey={step}
        onBack={back}
        onClose={guard.request}
        footer={footer}
      >
        {step === 0 && (
          <ParkChooser
            selected={park && chosen ? park : null}
            onSelect={(p) => setChosen(p)}
            onNone={() => navigate("/add")}
          />
        )}

        {step === 1 && (
          <>
            <h2 className={styles.title}>{t("addPhotos.title")}</h2>
            <p className={styles.subtitle}>{t("addPhotos.subtitle")}</p>
            {park && <div style={{ marginBottom: 16 }}><ParkCardMini park={park} /></div>}
            <PhotoPicker
              previews={picks.map((p) => p.preview)}
              max={MAX_PHOTOS}
              onFiles={addFiles}
              onRemove={removePick}
              canPick={Boolean(userId)}
              onRequireAuth={requirePhotoAuth}
            />
            {!userId && <p className={styles.muted} style={{ marginTop: 12 }}>{t("common.accountRequiredPhotos")}</p>}
          </>
        )}

        {step === 2 && (
          <>
            <h2 className={styles.title}>{t("addPhotos.verifyTitle")}</h2>
            <p className={styles.subtitle}>{t("addPhotos.readyCount", { count: picks.length })}</p>
            <RecapCard
              thumb={<ParkPhoto park={park ?? { photos: [] }} className={styles.recapThumb} markSize={24} />}
              name={park ? getParkDisplayName(park, t) : ""}
              address={dedupeAddress(park?.formatted_address)}
            >
              <RecapRow icon="ic-camera" title={t("steps.photos")} onEdit={() => setStep(1)}>
                {t("flow.photoCount", { count: picks.length })}
                <PhotoThumbs urls={picks.map((p) => p.preview)} />
              </RecapRow>
            </RecapCard>
            <p className={styles.recapNote}><Icon name="ic-shield" size={16} />{t("addPhotos.moderation")}</p>
            <div aria-live="polite" role="status">
              {saving && <p className={styles.muted}>{t("addPark.submitting")}</p>}
            </div>
            {submitError && (
              <div className={styles.errorBox} role="alert">
                {t("addPhotos.submitError")}
              </div>
            )}
          </>
        )}
      </FlowShell>
      {guard.dialog}
    </>
  );
}
