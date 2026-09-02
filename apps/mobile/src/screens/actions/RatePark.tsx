import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Button, Chip, StarInput, Textarea } from "@toboggo/design-system";
import { addMedia, createReview, uploadPhoto, type AgeBand, type ReviewSubRatings } from "@toboggo/shared";
import { WizardHeader } from "../../components/WizardHeader";
import { ParkPicker } from "../../components/ParkPicker";
import { PhotoTip } from "../../components/PhotoTip";
import { usePark } from "../../lib/parksQuery";
import { useSession } from "../../lib/session";
import { queryClient } from "../../lib/queryClient";

const CRITERIA: { key: keyof ReviewSubRatings; label: string }[] = [
  { key: "clean", label: "Propreté" },
  { key: "safety", label: "Sécurité" },
  { key: "equipment", label: "Équipements" },
  { key: "comfort", label: "Confort" },
];
const FACES = ["😞", "😐", "😄"];
const AGE_BANDS: { value: AgeBand; label: string }[] = [
  { value: "under3", label: "-3 ans" },
  { value: "3-6", label: "3-6 ans" },
  { value: "6-12", label: "6-12 ans" },
];

export default function RatePark() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [parkId, setParkId] = useState<string | null>(params.get("park"));
  const { data: park } = usePark(parkId ?? undefined);
  const userId = useSession((s) => s.userId);
  const profile = useSession((s) => s.profile);

  const [step, setStep] = useState(parkId ? 1 : 0);
  const [stars, setStars] = useState(0);
  const [subRatings, setSubRatings] = useState<ReviewSubRatings>({ clean: 2, safety: 2, equipment: 2, comfort: 2 });
  const [ageBand, setAgeBand] = useState<AgeBand>("3-6");
  const [comment, setComment] = useState("");
  const [photo, setPhoto] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);

  async function onPickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !userId) return;
    setPhoto(await uploadPhoto("parkPhotos", file, userId));
  }

  async function submit() {
    if (!userId || !parkId) return;
    setSaving(true);
    try {
      await createReview({
        park_id: parkId,
        user_id: userId,
        author_name: profile?.name ?? "Vous",
        stars,
        sub_ratings: subRatings,
        comment: comment || null,
        age_band: ageBand,
      });
      if (photo) {
        // A photo attached to a review is a real contributor photo of the park.
        await addMedia({ park_id: parkId, url: photo, source: "user", user_id: userId });
      }
      void queryClient.invalidateQueries({ queryKey: ["park-reviews", parkId] });
      void queryClient.invalidateQueries({ queryKey: ["park", parkId] });
      setDone(true);
    } finally {
      setSaving(false);
    }
  }

  if (done) {
    return (
      <div className="screen" style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 32, textAlign: "center" }}>
        <div style={{ fontSize: 64 }}>🎉</div>
        <h1 style={{ fontSize: 22, marginTop: 12 }}>Merci !</h1>
        <p style={{ color: "var(--color-text-muted)", marginTop: 8, maxWidth: 280 }}>
          Votre avis a été publié et aide d'autres parents à choisir {park?.name}.
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

      {step === 1 && park && (
        <div style={{ padding: "0 20px", textAlign: "center" }}>
          <h2 style={{ fontSize: 16, marginBottom: 4 }}>{park.name}</h2>
          <p style={{ fontSize: 12.5, color: "var(--color-text-muted)", marginBottom: 20 }}>Comment était votre visite ?</p>
          <StarInput value={stars} onChange={setStars} />

          <div style={{ marginTop: 28, textAlign: "left" }}>
            {CRITERIA.map((c) => (
              <div key={c.key} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
                <span style={{ fontSize: 14 }}>{c.label}</span>
                <div style={{ display: "flex", gap: 6 }}>
                  {FACES.map((face, i) => (
                    <button
                      key={i}
                      onClick={() => setSubRatings((s) => ({ ...s, [c.key]: i + 1 }))}
                      style={{
                        fontSize: 20,
                        background: subRatings[c.key] === i + 1 ? "var(--color-primary-tint)" : "none",
                        border: "none",
                        borderRadius: "50%",
                        width: 36,
                        height: 36,
                        cursor: "pointer",
                      }}
                    >
                      {face}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <div style={{ marginTop: 12, textAlign: "left" }}>
            <div style={{ fontFamily: "var(--font-heading)", fontWeight: 600, fontSize: 13, marginBottom: 8 }}>Âge de l'enfant</div>
            <div style={{ display: "flex", gap: 8 }}>
              {AGE_BANDS.map((b) => (
                <Chip key={b.value} active={ageBand === b.value} onClick={() => setAgeBand(b.value)}>
                  {b.label}
                </Chip>
              ))}
            </div>
          </div>

          <Button block style={{ marginTop: 24 }} disabled={stars === 0} onClick={() => setStep(2)}>
            Continuer
          </Button>
        </div>
      )}

      {step === 2 && (
        <div style={{ padding: "0 20px" }}>
          <Textarea
            label="Votre commentaire (facultatif)"
            value={comment}
            maxLength={200}
            onChange={(e) => setComment(e.target.value)}
            help={`${comment.length}/200`}
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
            Publier mon avis
          </Button>
        </div>
      )}
    </div>
  );
}
