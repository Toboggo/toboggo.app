import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Button } from "@toboggo/design-system";
import { addParkPhotos, uploadPhoto } from "@toboggo/shared";
import { WizardHeader } from "../../components/WizardHeader";
import { ParkPicker } from "../../components/ParkPicker";
import { PhotoTip } from "../../components/PhotoTip";
import { usePark } from "../../lib/parksQuery";
import { useSession } from "../../lib/session";
import { queryClient } from "../../lib/queryClient";

export default function AddPhotos() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [parkId, setParkId] = useState<string | null>(params.get("park"));
  const { data: park } = usePark(parkId ?? undefined);
  const userId = useSession((s) => s.userId);

  const [step, setStep] = useState(parkId ? 1 : 0);
  const [photos, setPhotos] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);

  async function onPickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !userId) return;
    const url = await uploadPhoto("parkPhotos", file, userId);
    setPhotos((p) => [...p, url].slice(0, 4));
  }

  async function submit() {
    if (!parkId || !park || !photos.length) return;
    setSaving(true);
    try {
      // Contributor photos: stored as park_media rows with recorded provenance
      // (source = "user"). They must be real photos of this park.
      await addParkPhotos(parkId, photos, { source: "user", userId });
      void queryClient.invalidateQueries({ queryKey: ["park", parkId] });
      setDone(true);
    } finally {
      setSaving(false);
    }
  }

  if (done) {
    return (
      <div className="screen" style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 32, textAlign: "center" }}>
        <div style={{ fontSize: 64 }}>📸</div>
        <h1 style={{ fontSize: 22, marginTop: 12, color: "var(--color-info)" }}>Photos publiées !</h1>
        <p style={{ color: "var(--color-text-muted)", marginTop: 8, maxWidth: 280 }}>
          Merci d'aider la communauté en partageant des photos du parc.
        </p>
        <Button block style={{ marginTop: 24, maxWidth: 280 }} onClick={() => navigate(`/park/${parkId}`)}>
          Voir le parc
        </Button>
      </div>
    );
  }

  return (
    <div className="screen">
      <WizardHeader step={step} total={3} onBack={() => (step === 0 ? navigate(-1) : setStep(step - 1))} />

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
                {photos[i] ? (
                  <div style={{ aspectRatio: "1", borderRadius: 14, backgroundImage: `url(${photos[i]})`, backgroundSize: "cover" }} />
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
                    +<input type="file" accept="image/*" hidden onChange={onPickFile} />
                  </label>
                )}
              </div>
            ))}
          </div>
          <PhotoTip />
          <Button block loading={saving} disabled={!photos.length} style={{ marginTop: 24, background: "var(--color-info)" }} onClick={submit}>
            Publier {photos.length || ""} photo(s)
          </Button>
        </div>
      )}
    </div>
  );
}
