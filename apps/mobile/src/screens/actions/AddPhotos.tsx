import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Button, Icon } from "@toboggo/design-system";
import { addParkPhotos, ImageValidationError, uploadPhoto, validateImageFile } from "@toboggo/shared";
import { WizardHeader } from "../../components/WizardHeader";
import { ParkPicker } from "../../components/ParkPicker";
import { PhotoTip } from "../../components/PhotoTip";
import { usePark } from "../../lib/parksQuery";
import { requireAccount, useSession } from "../../lib/session";
import { useToastStore } from "../../lib/toast";
import { queryClient } from "../../lib/queryClient";

interface PhotoPick {
  file: File;
  preview: string;
}

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
// n'est pas connecté (voir `pickTileStyle` / le rendu conditionnel ci-dessous).

const pickTileStyle: React.CSSProperties = {
  aspectRatio: "1",
  borderRadius: 14,
  border: "2px dashed var(--color-border-strong)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  fontSize: 24,
  cursor: "pointer",
  color: "var(--color-text-faint)",
  width: "100%",
  background: "transparent",
  padding: 0,
  font: "inherit",
};

// Named stepper shared with the other contribution wizards (see AddPark). The
// three stages are stable across entry points: arriving with `?park=` just
// starts on "Photos" with "Parc" already checked — the step is never dropped.
const STEPPER = ["Parc", "Photos", "Confirmation"];

export default function AddPhotos() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [parkId, setParkId] = useState<string | null>(params.get("park"));
  const { data: park } = usePark(parkId ?? undefined);
  const userId = useSession((s) => s.userId);
  const showToast = useToastStore((s) => s.show);
  const preselected = useRef(Boolean(params.get("park"))).current;

  const [step, setStep] = useState(parkId ? 1 : 0);
  const [picks, setPicks] = useState<PhotoPick[]>([]);
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);

  // Browsing (picking a park) stays anonymous; the account is required before
  // the file picker itself opens (see `requirePhotoAuth`). Keep the object
  // URLs alive until unmount.
  const picksRef = useRef(picks);
  picksRef.current = picks;
  useEffect(() => () => picksRef.current.forEach((p) => URL.revokeObjectURL(p.preview)), []);

  function onPickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      validateImageFile(file);
    } catch (err) {
      showToast(err instanceof ImageValidationError ? err.message : "Image invalide");
      return;
    }
    setPicks((p) => [...p, { file, preview: URL.createObjectURL(file) }].slice(0, 4));
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
      .then(() => setDone(true))
      .catch((err) => showToast(err?.message ?? "Échec de l'envoi de la photo"))
      .finally(() => setSaving(false));
  }

  if (done) {
    // Écran terminal autonome, aligné sur les confirmations AddPark / EditInfo :
    // pas de WizardHeader (ni Stepper, ni Retour, ni X) — l'envoi est fait et
    // passé en modération. Même motif visuel : cercle + ic-check, tokens, pas
    // d'emoji, titre sans bleu legacy, CTA primaire.
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
        <h1 style={{ fontSize: 22, marginTop: 12 }}>Photo envoyée !</h1>
        <p style={{ color: "var(--color-text-muted)", marginTop: 8, maxWidth: 300 }}>
          Merci ! Votre {picks.length > 1 ? "photos seront visibles" : "photo sera visible"} sur la fiche du parc
          après vérification par notre équipe.
        </p>
        {/* Photos envoyées : on remplace l'entrée d'historique du wizard par la
            fiche parc. Depuis la fiche, Retour ramène au contexte antérieur,
            jamais dans AddPhotos ni sur cette confirmation. Idem AddPark /
            RatePark / ReportProblem / EditInfo. */}
        <Button block style={{ marginTop: 24, maxWidth: 280 }} onClick={() => navigate(`/park/${parkId}`, { replace: true })}>
          Voir le parc
        </Button>
      </div>
    );
  }

  return (
    <div className="screen">
      <WizardHeader
        step={step}
        total={STEPPER.length}
        steps={STEPPER}
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
          <h2 style={{ fontSize: 16, marginBottom: 16 }}>{park?.name}</h2>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i}>
                {picks[i] ? (
                  <div style={{ position: "relative" }}>
                    <div style={{ aspectRatio: "1", borderRadius: 14, backgroundImage: `url(${picks[i].preview})`, backgroundSize: "cover", backgroundPosition: "center" }} />
                    <button
                      type="button"
                      aria-label="Retirer cette photo"
                      onClick={() => removePick(i)}
                      style={{ position: "absolute", top: 6, right: 6, width: 26, height: 26, borderRadius: "50%", border: "none", background: "rgba(0,0,0,0.55)", color: "#fff", cursor: "pointer", display: "grid", placeItems: "center" }}
                    >
                      <Icon name="ic-close" size={14} />
                    </button>
                  </div>
                ) : userId ? (
                  <label style={pickTileStyle}>
                    +<input type="file" accept="image/*" capture="environment" hidden onChange={onPickFile} />
                  </label>
                ) : (
                  // Invité : pas de <input type="file"> du tout — le sélecteur
                  // natif ne doit jamais s'ouvrir avant l'authentification.
                  <button type="button" style={pickTileStyle} onClick={requirePhotoAuth}>
                    +
                  </button>
                )}
              </div>
            ))}
          </div>
          <PhotoTip />
          {!userId && (
            <p style={{ fontSize: 12.5, color: "var(--color-text-muted)", marginTop: 12 }}>
              Un compte gratuit est demandé pour ajouter des photos.
            </p>
          )}
          <Button block loading={saving} disabled={!picks.length} style={{ marginTop: 16 }} onClick={submit}>
            Envoyer {picks.length || ""} photo{picks.length > 1 ? "s" : ""}
          </Button>
        </div>
      )}
    </div>
  );
}
