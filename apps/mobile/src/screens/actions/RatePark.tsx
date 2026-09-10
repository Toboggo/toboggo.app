import { useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Button, Chip, Icon, StarInput, Textarea } from "@toboggo/design-system";
import { addMedia, createReview, uploadPhoto, type AgeBand, type ReviewSubRatings } from "@toboggo/shared";
import { WizardHeader } from "../../components/WizardHeader";
import { ParkPicker } from "../../components/ParkPicker";
import { PhotoTip } from "../../components/PhotoTip";
import { usePark } from "../../lib/parksQuery";
import { requireAccount, useSession } from "../../lib/session";
import { useToastStore } from "../../lib/toast";
import { queryClient } from "../../lib/queryClient";

const CRITERIA: { key: keyof ReviewSubRatings; labelKey: string }[] = [
  { key: "clean", labelKey: "rate.criteria.clean" },
  { key: "safety", labelKey: "rate.criteria.safety" },
  { key: "equipment", labelKey: "rate.criteria.equipment" },
  { key: "comfort", labelKey: "rate.criteria.comfort" },
];
const FACES = ["😞", "😐", "😄"];
// Named stepper shared with the other contribution wizards (see AddPark /
// AddPhotos). The three stages are stable across entry points: arriving with
// `?park=` just starts on "Avis" with "Parc" already checked — the step is
// never dropped dynamically. Keys resolved against the `contribute` namespace.
const STEPPER = ["steps.park", "steps.opinion", "steps.comment"];
const AGE_BANDS: AgeBand[] = ["under3", "3-6", "6-12"];

export default function RatePark() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { t } = useTranslation("contribute");
  const { t: tErr } = useTranslation("errors");
  const { t: tCommon } = useTranslation("common");
  const [parkId, setParkId] = useState<string | null>(params.get("park"));
  const { data: park } = usePark(parkId ?? undefined);
  const userId = useSession((s) => s.userId);
  const profile = useSession((s) => s.profile);
  // Entered with a park already chosen (`?park=`): "Parc" is pre-checked and
  // Back from "Avis" leaves the flow — the user never saw the picker.
  const preselected = useRef(Boolean(params.get("park"))).current;

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

  function submit() {
    if (!parkId) return;
    const uid = useSession.getState().userId;
    if (uid) {
      setSaving(true);
      void doSubmit(uid, true);
      return;
    }
    // Guest: just-in-time login, then resume (this screen unmounts meanwhile).
    requireAccount(navigate, () => {
      const newUid = useSession.getState().userId;
      if (newUid) void doSubmit(newUid, false);
    });
  }

  async function doSubmit(uid: string, inline: boolean) {
    const toast = useToastStore.getState().show;
    if (!parkId) return;
    try {
      await createReview({
        park_id: parkId,
        user_id: uid,
        author_name: profile?.name ?? "Vous",
        stars,
        sub_ratings: subRatings,
        comment: comment || null,
        age_band: ageBand,
      });
      if (photo) {
        // A photo attached to a review is a real contributor photo of the park
        // and enters the moderation queue (source = "user" → status pending).
        await addMedia({ park_id: parkId, url: photo, source: "user", user_id: uid });
      }
      void queryClient.invalidateQueries({ queryKey: ["park-reviews", parkId] });
      void queryClient.invalidateQueries({ queryKey: ["park", parkId] });
      if (inline) {
        setDone(true);
      } else {
        toast(t("rate.published"));
        navigate(`/park/${parkId}`);
      }
    } catch {
      toast(tErr("generic"));
    } finally {
      if (inline) setSaving(false);
    }
  }

  if (done) {
    // Écran terminal autonome, aligné sur AddPark / AddPhotos / EditInfo :
    // pas de WizardHeader (ni Stepper, ni Retour, ni X), même motif visuel
    // cercle + ic-check, tokens, pas d'emoji.
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
          {t("rate.doneBody", { park: park?.name ?? "" })}
        </p>
        {/* Avis soumis : on remplace l'entrée d'historique du wizard par la
            fiche parc. Depuis la fiche, Retour ramène au contexte antérieur
            (fiche parc d'origine / carte), jamais dans RatePark ni sur cette
            confirmation. Idem AddPark / AddPhotos / ReportProblem / EditInfo. */}
        <Button block style={{ marginTop: 24, maxWidth: 280 }} onClick={() => navigate(`/park/${parkId}`, { replace: true })}>
          {t("common.seePark")}
        </Button>
      </div>
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

      {step === 1 && park && (
        <div style={{ padding: "0 20px", textAlign: "center" }}>
          <h2 style={{ fontSize: 16, marginBottom: 4 }}>{park.name}</h2>
          <p style={{ fontSize: 12.5, color: "var(--color-text-muted)", marginBottom: 20 }}>{t("rate.visitQuestion")}</p>
          <StarInput value={stars} onChange={setStars} starLabel={(n) => t("rate.starLabel", { count: n })} />

          <div style={{ marginTop: 28, textAlign: "left" }}>
            {CRITERIA.map((c) => (
              <div key={c.key} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
                <span style={{ fontSize: 14 }}>{t(c.labelKey)}</span>
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
            <div style={{ fontFamily: "var(--font-heading)", fontWeight: 600, fontSize: 13, marginBottom: 8 }}>{t("rate.childAge")}</div>
            <div style={{ display: "flex", gap: 8 }}>
              {AGE_BANDS.map((b) => (
                <Chip key={b} active={ageBand === b} onClick={() => setAgeBand(b)}>
                  {tCommon(`age.band.${b}`)}
                </Chip>
              ))}
            </div>
          </div>

          <Button block style={{ marginTop: 24 }} disabled={stars === 0} onClick={() => setStep(2)}>
            {t("common.continue")}
          </Button>
        </div>
      )}

      {step === 2 && (
        <div style={{ padding: "0 20px" }}>
          <Textarea
            label={t("rate.commentLabel")}
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
            {t("rate.submit")}
          </Button>
        </div>
      )}
    </div>
  );
}
