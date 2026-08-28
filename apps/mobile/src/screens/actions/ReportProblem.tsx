import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Button, Select, Textarea } from "@toboggo/design-system";
import { createReport, uploadPhoto, REPORT_REASON_LABEL, type ReportReason } from "@toboggo/shared";
import { WizardHeader } from "../../components/WizardHeader";
import { ParkPicker } from "../../components/ParkPicker";
import { PhotoTip } from "../../components/PhotoTip";
import { usePark } from "../../lib/parksQuery";
import { useSession } from "../../lib/session";
import { queryClient } from "../../lib/queryClient";

const REASON_ICON: Record<ReportReason, string> = {
  broken_equipment: "🔧",
  safety: "⚠️",
  cleanliness: "🧹",
  vegetation: "🌿",
  accessibility: "♿",
  wrong_info: "✏️",
  other: "❓",
};

const EQUIPMENT_CHOICES = ["Toboggan", "Balançoire", "Structure d'escalade", "Bac à sable", "Autre"];

export default function ReportProblem() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [parkId, setParkId] = useState<string | null>(params.get("park"));
  const { data: park } = usePark(parkId ?? undefined);
  const userId = useSession((s) => s.userId);
  const profile = useSession((s) => s.profile);

  const [step, setStep] = useState(parkId ? 1 : 0);
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [equipment, setEquipment] = useState(EQUIPMENT_CHOICES[0]);
  const [comment, setComment] = useState("");
  const [photo, setPhoto] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);

  async function onPickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !userId) return;
    setPhoto(await uploadPhoto("reportPhotos", file, userId));
  }

  async function submit() {
    if (!userId || !parkId || !reason) return;
    setSaving(true);
    try {
      await createReport({
        park_id: parkId,
        user_id: userId,
        reported_by_name: profile?.name ?? "Vous",
        reason,
        equipment,
        comment: comment || null,
        photo,
      });
      void queryClient.invalidateQueries({ queryKey: ["park", parkId] });
      setDone(true);
    } finally {
      setSaving(false);
    }
  }

  if (done) {
    return (
      <div className="screen" style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 32, textAlign: "center" }}>
        <div style={{ fontSize: 64 }}>🎊</div>
        <h1 style={{ fontSize: 22, marginTop: 12 }}>Signalement envoyé !</h1>
        <p style={{ color: "var(--color-text-muted)", marginTop: 8, maxWidth: 280 }}>
          Merci de contribuer à la sécurité des enfants. Nous vous tiendrons informé de l'avancement.
        </p>
        <Button block style={{ marginTop: 24, maxWidth: 280 }} onClick={() => navigate(`/park/${parkId}`)}>
          Retour au parc
        </Button>
      </div>
    );
  }

  return (
    <div className="screen">
      <WizardHeader step={step} total={4} onBack={() => (step === 0 ? navigate(-1) : setStep(step - 1))} />

      {step === 0 && (
        <ParkPicker
          onPick={(p) => {
            setParkId(p.id);
            setStep(1);
          }}
          onNone={() => navigate(-1)}
        />
      )}

      {step === 1 && park && (
        <div style={{ padding: "0 20px" }}>
          <h2 style={{ fontSize: 16, marginBottom: 4 }}>{park.name}</h2>
          <p style={{ fontSize: 12.5, color: "var(--color-text-muted)", marginBottom: 16 }}>Quel est le problème ?</p>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            {(Object.keys(REPORT_REASON_LABEL) as ReportReason[]).map((r) => (
              <button
                key={r}
                onClick={() => {
                  setReason(r);
                  setStep(2);
                }}
                style={{
                  padding: 16,
                  borderRadius: 14,
                  border: reason === r ? "2px solid var(--color-primary)" : "1.5px solid var(--color-border-strong)",
                  background: "var(--color-surface)",
                  textAlign: "center",
                  cursor: "pointer",
                }}
              >
                <div style={{ fontSize: 24 }}>{REASON_ICON[r]}</div>
                <div style={{ fontSize: 12, marginTop: 6 }}>{REPORT_REASON_LABEL[r]}</div>
              </button>
            ))}
          </div>
        </div>
      )}

      {step === 2 && (
        <div style={{ padding: "0 20px" }}>
          <Select label="Équipement concerné" value={equipment} onChange={(e) => setEquipment(e.target.value)}>
            {EQUIPMENT_CHOICES.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </Select>
          <Textarea
            label="Décrivez le problème"
            value={comment}
            maxLength={200}
            onChange={(e) => setComment(e.target.value)}
            help={`${comment.length}/200`}
            style={{ marginTop: 14 }}
          />
          {photo ? (
            <div style={{ width: 90, height: 90, borderRadius: 14, backgroundImage: `url(${photo})`, backgroundSize: "cover", marginTop: 12 }} />
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
            Envoyer le signalement
          </Button>
        </div>
      )}
    </div>
  );
}
