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

export default function AddPhotos() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [parkId, setParkId] = useState<string | null>(params.get("park"));
  const { data: park } = usePark(parkId ?? undefined);
  const userId = useSession((s) => s.userId);
  const showToast = useToastStore((s) => s.show);

  const [step, setStep] = useState(parkId ? 1 : 0);
  const [picks, setPicks] = useState<PhotoPick[]>([]);
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);

  // Browsing (incl. previewing a photo) stays anonymous; the account is only
  // required at "Envoyer". Keep the object URLs alive until unmount.
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

    if (uid) {
      setSaving(true);
      upload(uid, targetPark, files)
        .then(() => setDone(true))
        .catch((err) => showToast(err?.message ?? "Échec de l'envoi de la photo"))
        .finally(() => setSaving(false));
      return;
    }

    // Guest: just-in-time login, then resume the upload. This screen has
    // unmounted by then, so the resume reports via toast + navigation.
    requireAccount(navigate, () => {
      const newUid = useSession.getState().userId;
      if (!newUid) return;
      upload(newUid, targetPark, files)
        .then(() => useToastStore.getState().show("Photo envoyée, en attente de validation."))
        .catch((err) => useToastStore.getState().show(err?.message ?? "Échec de l'envoi de la photo"))
        .finally(() => navigate(`/park/${targetPark}`));
    });
  }

  if (done) {
    return (
      <div className="screen" style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 32, textAlign: "center" }}>
        <div style={{ fontSize: 64 }}>📸</div>
        <h1 style={{ fontSize: 22, marginTop: 12, color: "var(--color-info)" }}>Photo envoyée !</h1>
        <p style={{ color: "var(--color-text-muted)", marginTop: 8, maxWidth: 300 }}>
          Merci ! Votre {picks.length > 1 ? "photos seront visibles" : "photo sera visible"} sur la fiche du parc
          après vérification par notre équipe.
        </p>
        <Button block style={{ marginTop: 24, maxWidth: 280 }} onClick={() => navigate(`/park/${parkId}`)}>
          Voir le parc
        </Button>
      </div>
    );
  }

  return (
    <div className="screen">
      <WizardHeader step={step} total={2} onBack={() => (step === 0 ? navigate(-1) : setStep(step - 1))} />

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
                ) : (
                  <label
                    style={{
                      aspectRatio: "1",
                      borderRadius: 14,
                      border: "2px dashed var(--color-border-strong)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: 24,
                      cursor: "pointer",
                      color: "var(--color-text-faint)",
                    }}
                  >
                    +<input type="file" accept="image/*" capture="environment" hidden onChange={onPickFile} />
                  </label>
                )}
              </div>
            ))}
          </div>
          <PhotoTip />
          {!userId && (
            <p style={{ fontSize: 12.5, color: "var(--color-text-muted)", marginTop: 12 }}>
              Un compte gratuit est demandé au moment de l'envoi.
            </p>
          )}
          <Button block loading={saving} disabled={!picks.length} style={{ marginTop: 16, background: "var(--color-info)" }} onClick={submit}>
            Envoyer {picks.length || ""} photo{picks.length > 1 ? "s" : ""}
          </Button>
        </div>
      )}
    </div>
  );
}
