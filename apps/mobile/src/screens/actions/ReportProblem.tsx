import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Button, Select, Textarea, Icon, IconButton, reportReasonIcon } from "@toboggo/design-system";
import { createReport, uploadPhoto, REPORT_REASON_LABEL, type ReportReason } from "@toboggo/shared";
import { WizardHeader } from "../../components/WizardHeader";
import { ParkPicker } from "../../components/ParkPicker";
import { PhotoTip } from "../../components/PhotoTip";
import { usePark } from "../../lib/parksQuery";
import { useSession } from "../../lib/session";
import { useToastStore } from "../../lib/toast";
import { queryClient } from "../../lib/queryClient";
import { clearDraft, loadDraft, saveDraft, setResumeRoute } from "../../lib/contributionDraft";

interface ReportDraft {
  reason: ReportReason | null;
  equipment: string;
  comment: string;
}

// Catégories sans pictogramme validé dans le sprite (docs/DESIGN-SYSTEM.md §7) —
// emoji conservé en attendant. Les autres passent par reportReasonIcon().
const REASON_EMOJI: Partial<Record<ReportReason, string>> = {
  vegetation: "🌿",
  accessibility: "♿",
  wrong_info: "✏️",
};

const EQUIPMENT_CHOICES = ["Toboggan", "Balançoire", "Structure d'escalade", "Bac à sable", "Autre"];

// Stepper nommé, partagé avec les autres wizards de contribution via
// WizardHeader (voir AddPark / AddPhotos / RatePark). Contrairement à ceux-ci,
// l'étape "Parc" ne fait PAS partie de la chronologie cible : la sélection /
// présélection du parc est un préambule (step interne 0) qui n'affiche PAS le
// stepper — il apparaît seulement à partir du choix du problème. Les trois
// libellés sont stables quel que soit le point d'entrée.
//   step interne 0 (ParkPicker) → header minimal, pas de stepper
//   step interne 1 (choix du problème) → stepper, "Problème" courant  (step-1 = 0)
//   step interne 2 (détails)           → stepper, "Détails" courant   (step-1 = 1)
//   done → confirmation autonome, "Confirmation" n'est jamais l'étape courante
const STEPPER = ["Problème", "Détails", "Confirmation"];

export default function ReportProblem() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [parkId, setParkId] = useState<string | null>(params.get("park"));
  const { data: park } = usePark(parkId ?? undefined);
  const userId = useSession((s) => s.userId);
  const profile = useSession((s) => s.profile);
  const showToast = useToastStore((s) => s.show);
  const preselected = useRef(Boolean(params.get("park"))).current;
  const wantsResume = params.get("resume") === "1";
  const draftKey = `report:${parkId ?? "none"}`;

  const initial = useRef<ReportDraft | null>(loadDraft<ReportDraft>(draftKey)).current;
  const [step, setStep] = useState(parkId ? (initial?.reason ? 2 : 1) : 0);
  const [reason, setReason] = useState<ReportReason | null>(initial?.reason ?? null);
  const [equipment, setEquipment] = useState(initial?.equipment ?? EQUIPMENT_CHOICES[0]);
  const [comment, setComment] = useState(initial?.comment ?? "");
  const [photo, setPhoto] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);
  const autoSubmitted = useRef(false);

  async function onPickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !userId) return;
    setPhoto(await uploadPhoto("reportPhotos", file, userId));
  }

  async function doSubmit(uid: string) {
    if (!parkId || !reason) return;
    setSaving(true);
    try {
      await createReport({
        park_id: parkId,
        user_id: uid,
        reported_by_name: profile?.name ?? "Vous",
        reason,
        equipment,
        comment: comment || null,
        photo,
      });
      clearDraft(draftKey);
      void queryClient.invalidateQueries({ queryKey: ["park", parkId] });
      setDone(true);
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Envoi impossible");
    } finally {
      setSaving(false);
    }
  }

  function submit() {
    if (!parkId || !reason) return;
    const uid = useSession.getState().userId;
    if (uid) {
      void doSubmit(uid);
      return;
    }
    // Guest: keep what was filled in, come back here after sign-in.
    saveDraft<ReportDraft>(draftKey, { reason, equipment, comment });
    setResumeRoute(`/report?park=${parkId}&resume=1`);
    // `replace` : la sortie vers /login REMPLACE l'entrée de ce wizard. Combiné
    // au retour d'auth qui remplace /login (AuthForm) puis au CTA de
    // confirmation qui remplace la resume route, une contribution invité menée
    // à son terme ne laisse AUCUNE entrée d'historique — un Retour depuis la
    // fiche parc revient au contexte normal, jamais dans ce wizard soumis ni
    // sur /login. Le brouillon reste en localStorage (repris au remount).
    navigate("/login", { replace: true });
  }

  // Back from sign-in with the report intact: send it once.
  useEffect(() => {
    if (!wantsResume || autoSubmitted.current) return;
    if (!userId || !parkId || !reason || !initial) return;
    autoSubmitted.current = true;
    void doSubmit(userId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wantsResume, userId, parkId, reason]);

  if (done) {
    // Écran terminal autonome, aligné sur AddPark / AddPhotos / RatePark /
    // EditInfo : pas de WizardHeader (ni Stepper, ni Retour, ni X), même motif
    // visuel cercle + ic-check, tokens, pas d'emoji. Message métier conservé.
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
        <h1 style={{ fontSize: 22, marginTop: 12 }}>Signalement envoyé !</h1>
        <p style={{ color: "var(--color-text-muted)", marginTop: 8, maxWidth: 280 }}>
          Merci de contribuer à la sécurité des enfants. Nous vous tiendrons informé de l'avancement.
        </p>
        {/* Signalement envoyé : on remplace l'entrée d'historique du wizard par
            la fiche parc. Depuis la fiche, Retour ramène au contexte antérieur
            (carte / ParkPreview), jamais dans ReportProblem ni sur cette
            confirmation. Idem AddPark / RatePark / AddPhotos / EditInfo. */}
        <Button block style={{ marginTop: 24, maxWidth: 280 }} onClick={() => navigate(`/park/${parkId}`, { replace: true })}>
          Retour au parc
        </Button>
      </div>
    );
  }

  return (
    <div className="screen">
      {step === 0 ? (
        // Choix du parc = préambule hors chronologie : header minimal (Retour +
        // Fermer, même gabarit que WizardHeader) et titre, sans stepper. Le
        // stepper n'apparaît qu'à partir de "Problème".
        <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "calc(14px + var(--safe-top)) 16px 14px" }}>
          <IconButton aria-label="Retour" onClick={() => navigate(-1)}>
            <Icon name="ic-back" size={18} />
          </IconButton>
          <h1 style={{ flex: 1, fontSize: 16, margin: 0 }}>Signaler un problème</h1>
          <IconButton aria-label="Fermer" onClick={() => navigate("/map")}>
            <Icon name="ic-close" size={18} />
          </IconButton>
        </div>
      ) : (
        <WizardHeader
          step={step - 1}
          total={STEPPER.length}
          steps={STEPPER}
          onBack={() => (step === 1 && preselected ? navigate(-1) : setStep(step - 1))}
        />
      )}

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
            {(Object.keys(REPORT_REASON_LABEL) as ReportReason[]).map((r) => {
              const ic = reportReasonIcon(r);
              return (
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
                  <div style={{ fontSize: 24, minHeight: 24, display: "flex", justifyContent: "center", alignItems: "center" }}>
                    {ic ? <Icon name={ic} size={24} /> : REASON_EMOJI[r]}
                  </div>
                  <div style={{ fontSize: 12, marginTop: 6 }}>{REPORT_REASON_LABEL[r]}</div>
                </button>
              );
            })}
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
