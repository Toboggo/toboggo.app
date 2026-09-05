import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Button, Chip, Icon, Input, Segmented, Textarea, DualRangeSlider, type IconName } from "@toboggo/design-system";
import {
  FEATURE_STATUS_LABEL,
  featureLabel,
  formatAgeRange,
  listFeatures,
  submitParkEdit,
  type FeatureCategory,
  type FeatureStatus,
  type Json,
} from "@toboggo/shared";
import { WizardHeader } from "../../components/WizardHeader";
import { DiffRow } from "../../components/DiffRow";
import { PinField } from "../../components/PinField";
import { usePark } from "../../lib/parksQuery";
import { useSession } from "../../lib/session";
import { useToastStore } from "../../lib/toast";
import { clearDraft, loadDraft, saveDraft, setResumeRoute } from "../../lib/contributionDraft";

type Target = "general" | "ages" | "play" | "service" | "accessibility" | "characteristics" | "location" | "other";

const TARGETS: { value: Target; label: string; icon: IconName }[] = [
  { value: "general", label: "Informations générales", icon: "ic-list" },
  { value: "ages", label: "Tranche d'âge", icon: "ic-age" },
  { value: "play", label: "Jeux & équipements", icon: "ic-slide" },
  { value: "service", label: "Services", icon: "ic-bench" },
  { value: "accessibility", label: "Accessibilité", icon: "ic-pmr" },
  { value: "characteristics", label: "Caractéristiques du parc", icon: "ic-fence" },
  { value: "location", label: "Localisation", icon: "ic-explore" },
  { value: "other", label: "Autre", icon: "ic-question" },
];

const TARGET_CATEGORIES: Partial<Record<Target, FeatureCategory[]>> = {
  play: ["play"],
  service: ["service"],
  accessibility: ["accessibility"],
  characteristics: ["environment", "safety"],
};

const STATUS_OPTIONS: { value: FeatureStatus; label: string }[] = [
  { value: "available", label: "Disponible" },
  { value: "unavailable", label: "Absent" },
  { value: "unknown", label: "Je ne sais pas" },
];

interface EditDraft {
  step: number;
  target: Target | null;
  seeded: boolean;
  name: string;
  description: string;
  ageLow: number;
  ageHigh: number;
  /** The age slider seeds to 0–12 for a park with no known age. That default is
   * NOT a proposal — only a real slider interaction turns it into one. */
  agesTouched: boolean;
  featureStatus: Record<string, FeatureStatus>;
  lat: number | null;
  lng: number | null;
  freeText: string;
  note: string;
}

const EMPTY: EditDraft = {
  step: 0,
  target: null,
  seeded: false,
  name: "",
  description: "",
  ageLow: 0,
  ageHigh: 12,
  agesTouched: false,
  featureStatus: {},
  lat: null,
  lng: null,
  freeText: "",
  note: "",
};

interface DiffItem {
  field: string;
  label: string;
  currentText: string;
  proposedText: string;
  current: Json;
  proposed: Json;
}

export default function EditInfo() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const parkId = params.get("park");
  const wantsResume = params.get("resume") === "1";
  const draftKey = `edit:${parkId ?? "none"}`;

  const { data: park, isLoading, isError } = usePark(parkId ?? undefined);
  const userId = useSession((s) => s.userId);
  const showToast = useToastStore((s) => s.show);
  const { data: catalogue = [] } = useQuery({ queryKey: ["features"], queryFn: () => listFeatures() });

  // A saved draft should only come back after a genuine recovery — a browser
  // refresh, or the return trip from just-in-time auth (`?resume=1`) — never on
  // a normal in-app open (e.g. re-entering "Corriger" for the same park), even
  // if an older, abandoned draft still lingers in storage (cleared on send/close,
  // otherwise self-expires — see lib/contributionDraft.ts). The Navigation Timing
  // API reliably tells a real page reload apart from a client-side route change.
  const [isPageReload] = useState(
    () =>
      typeof performance !== "undefined" &&
      (performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined)?.type === "reload",
  );
  const shouldRecoverDraft = wantsResume || isPageReload;

  const [d, setD] = useState<EditDraft>(() => (shouldRecoverDraft ? loadDraft<EditDraft>(draftKey) ?? EMPTY : EMPTY));
  const [restored] = useState(() => shouldRecoverDraft && loadDraft<EditDraft>(draftKey) != null);
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);
  const autoSubmitted = useRef(false);

  const patch = (p: Partial<EditDraft>) => setD((cur) => ({ ...cur, ...p }));

  // Persist on every change so the draft survives a full-page OAuth redirect.
  useEffect(() => {
    if (!parkId || done) return;
    if (d.target === null && d.step === 0 && !restored) return; // nothing worth keeping yet
    saveDraft(draftKey, d);
  }, [d, parkId, done, draftKey, restored]);

  const relevantFeatures = useMemo(() => {
    if (!d.target) return [];
    const cats = TARGET_CATEGORIES[d.target];
    if (!cats) return [];
    return catalogue
      .filter((f) => cats.includes(f.category))
      .sort((a, b) => a.sort_order - b.sort_order);
  }, [catalogue, d.target]);

  function seedFromPark(target: Target) {
    if (!park) return;
    const featureStatus: Record<string, FeatureStatus> = {};
    const cats = TARGET_CATEGORIES[target];
    if (cats) {
      for (const f of catalogue) {
        if (cats.includes(f.category)) featureStatus[f.code] = park.features[f.code]?.status ?? "unknown";
      }
    }
    patch({
      target,
      step: 1,
      seeded: true,
      name: park.name ?? "",
      description: park.description ?? "",
      ageLow: park.age_min ?? 0,
      ageHigh: park.age_max ?? 12,
      agesTouched: false,
      featureStatus,
      lat: park.latitude,
      lng: park.longitude,
      freeText: "",
    });
  }

  const items: DiffItem[] = useMemo(() => {
    if (!park || !d.target) return [];
    const out: DiffItem[] = [];
    if (d.target === "general") {
      if (d.name.trim() && d.name.trim() !== (park.name ?? "")) {
        out.push({ field: "name", label: "Nom", currentText: park.name ?? "—", proposedText: d.name.trim(), current: park.name ?? null, proposed: d.name.trim() });
      }
      if ((d.description ?? "").trim() !== (park.description ?? "")) {
        out.push({
          field: "description",
          label: "Description",
          currentText: park.description || "—",
          proposedText: d.description.trim() || "—",
          current: park.description ?? null,
          proposed: d.description.trim() || null,
        });
      }
    } else if (d.target === "ages") {
      // An untouched slider is never a proposal — a park with no known age must
      // stay "unknown", not silently become the 0–12 default.
      if (d.agesTouched && (d.ageLow !== park.age_min || d.ageHigh !== park.age_max)) {
        out.push({
          field: "ages",
          label: "Tranche d'âge",
          currentText: formatAgeRange(park.age_min, park.age_max),
          proposedText: `${d.ageLow}–${d.ageHigh} ans`,
          current: { min: park.age_min, max: park.age_max },
          proposed: { min: d.ageLow, max: d.ageHigh },
        });
      }
    } else if (d.target === "location") {
      const changed =
        d.lat != null &&
        d.lng != null &&
        (Math.abs(d.lat - park.latitude) > 1e-6 || Math.abs(d.lng - park.longitude) > 1e-6);
      if (changed) {
        out.push({
          field: "location",
          label: "Position",
          currentText: `${park.latitude.toFixed(5)}, ${park.longitude.toFixed(5)}`,
          proposedText: `${d.lat!.toFixed(5)}, ${d.lng!.toFixed(5)}`,
          current: { latitude: park.latitude, longitude: park.longitude },
          proposed: { latitude: d.lat, longitude: d.lng },
        });
      }
    } else if (d.target === "other") {
      if (d.freeText.trim()) {
        out.push({ field: "free_text", label: "Correction proposée", currentText: "—", proposedText: d.freeText.trim(), current: null, proposed: d.freeText.trim() });
      }
    } else {
      for (const f of relevantFeatures) {
        const before = park.features[f.code]?.status ?? "unknown";
        // Fall back to the park's current value for features the user hasn't
        // touched (covers the case where the catalogue wasn't loaded at seed time).
        const after = d.featureStatus[f.code] ?? before;
        if (after !== before) {
          out.push({
            field: `feature:${f.code}`,
            label: featureLabel(f.code),
            currentText: FEATURE_STATUS_LABEL[before],
            proposedText: FEATURE_STATUS_LABEL[after],
            current: before,
            proposed: after,
          });
        }
      }
    }
    return out;
  }, [park, d, relevantFeatures]);

  async function doSubmit(uid: string) {
    if (!park || !parkId || !d.target || !items.length) return;
    const changes = {
      kind: "correction",
      target: d.target,
      park_name: park.name,
      items: items.map((i) => ({ field: i.field, label: i.label, current: i.current, proposed: i.proposed })),
      note: d.note.trim() || null,
    } as unknown as Json;
    try {
      await submitParkEdit({ parkId, userId: uid, changes, organizationId: park.organization_id ?? null });
      clearDraft(draftKey);
      setDone(true);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Envoi impossible";
      showToast(msg);
    } finally {
      setSaving(false);
    }
  }

  function submit() {
    if (!items.length) {
      showToast("Aucune modification à proposer.");
      return;
    }
    const uid = useSession.getState().userId;
    if (uid) {
      setSaving(true);
      void doSubmit(uid);
      return;
    }
    // Guest: persist the draft + where to come back, then start the sign-in
    // flow. On return, the effect below finishes the send (works for both the
    // in-page email login and the full-page OAuth redirect).
    saveDraft(draftKey, d);
    setResumeRoute(`/contribute/edit?park=${parkId}&resume=1`);
    navigate("/login");
  }

  // Back from sign-in with the draft intact: finish the send once.
  useEffect(() => {
    if (!wantsResume || autoSubmitted.current) return;
    if (!userId || !park || !d.target || !restored || !items.length) return;
    autoSubmitted.current = true;
    setSaving(true);
    void doSubmit(userId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wantsResume, userId, park, d.target, restored, items.length]);

  /**
   * "Quels jeux sont présents ?" — a single tap marks an equipment observed
   * (→ available). Toggling off a chip that Toboggo already had as available
   * is the explicit "I don't see this anymore" signal (→ unavailable); toggling
   * off anything else just reverts to the park's current value (no forced
   * "I don't know" per item — items untouched stay untouched, current → proposed
   * still lands in park_edits.changes exactly as for the other targets).
   */
  function togglePlayChip(code: string) {
    if (!park) return;
    const before = park.features[code]?.status ?? "unknown";
    const isActive = (d.featureStatus[code] ?? before) === "available";
    const next: FeatureStatus = isActive ? (before === "available" ? "unavailable" : before) : "available";
    patch({ featureStatus: { ...d.featureStatus, [code]: next } });
  }

  function closeAndDiscard() {
    clearDraft(draftKey);
    navigate(parkId ? `/park/${parkId}` : "/map");
  }

  // ── Render ──────────────────────────────────────────────────────────────
  if (!parkId || isError) {
    return (
      <div className="screen" style={{ padding: 32, textAlign: "center" }}>
        <h1 style={{ fontSize: 20, marginTop: 24 }}>Parc introuvable</h1>
        <p style={{ color: "var(--color-text-muted)", marginTop: 8 }}>
          Impossible d'ouvrir ce parc pour le moment.
        </p>
        <Button block style={{ marginTop: 24, maxWidth: 280, marginInline: "auto" }} onClick={() => navigate("/map")}>
          Retour à la carte
        </Button>
      </div>
    );
  }

  if (isLoading || !park) {
    return <div className="screen" style={{ padding: 40, textAlign: "center" }}>Chargement…</div>;
  }

  if (done) {
    return (
      <div className="screen" style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 32, textAlign: "center" }}>
        {/* Same icon-in-circle motif as ActionIntro's step badges — no emoji, no new asset. */}
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
        <h1 style={{ fontSize: 22, marginTop: 12 }}>Merci !</h1>
        <p style={{ color: "var(--color-text-muted)", marginTop: 8, maxWidth: 300 }}>
          Votre proposition de correction pour <strong>{park.name}</strong> a bien été reçue.
          Elle sera vérifiée par notre équipe avant d'être appliquée.
        </p>
        <Button block style={{ marginTop: 24, maxWidth: 280 }} onClick={() => navigate(`/park/${parkId}`)}>
          Retour au parc
        </Button>
      </div>
    );
  }

  return (
    <div className="screen">
      <WizardHeader
        step={d.step}
        total={3}
        onBack={() => (d.step === 0 ? navigate(-1) : patch({ step: d.step - 1 }))}
        onClose={closeAndDiscard}
      />

      {restored && d.step > 0 && (
        <p style={{ fontSize: 12, color: "var(--color-text-muted)", padding: "0 20px", marginTop: -4 }}>
          Brouillon repris.
        </p>
      )}

      {d.step === 0 && (
        <div style={{ padding: "0 20px" }}>
          <h2 style={{ fontSize: 18, marginBottom: 4 }}>{park.name}</h2>
          <p style={{ fontSize: 12.5, color: "var(--color-text-muted)", marginBottom: 16 }}>
            Que souhaitez-vous corriger ?
          </p>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            {TARGETS.map((t) => (
              <button
                key={t.value}
                onClick={() => seedFromPark(t.value)}
                style={{
                  padding: 16,
                  borderRadius: 14,
                  border: "1.5px solid var(--color-border-strong)",
                  background: "var(--color-surface)",
                  textAlign: "center",
                  cursor: "pointer",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: 8,
                }}
              >
                <Icon name={t.icon} size={22} />
                <span style={{ fontSize: 12.5 }}>{t.label}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {d.step === 1 && (
        <div style={{ padding: "0 20px" }}>
          {d.target === "general" && (
            <>
              <Input label="Nom du parc" value={d.name} onChange={(e) => patch({ name: e.target.value })} />
              <p style={{ fontSize: 12, color: "var(--color-text-muted)", margin: "4px 0 16px" }}>
                Actuellement : {park.name}
              </p>
              <Textarea
                label="Description"
                rows={3}
                value={d.description}
                onChange={(e) => patch({ description: e.target.value })}
              />
              {park.description && (
                <p style={{ fontSize: 12, color: "var(--color-text-muted)", marginTop: 4 }}>
                  Actuellement : {park.description}
                </p>
              )}
            </>
          )}

          {d.target === "ages" && (
            <>
              <div style={{ fontFamily: "var(--font-heading)", fontWeight: 600, fontSize: 13, marginBottom: 6 }}>
                Tranche d'âge
              </div>
              <p style={{ fontSize: 12, color: "var(--color-text-muted)", marginBottom: 10 }}>
                Actuellement : {formatAgeRange(park.age_min, park.age_max)}
              </p>
              <DualRangeSlider
                min={0}
                max={12}
                low={d.ageLow}
                high={d.ageHigh}
                formatLabel={
                  !d.agesTouched && park.age_min == null && park.age_max == null
                    ? () => "Âge non renseigné"
                    : undefined
                }
                onChange={(l, h) => patch({ ageLow: l, ageHigh: h, agesTouched: true })}
              />
            </>
          )}

          {d.target === "location" && (
            <>
              <div style={{ fontFamily: "var(--font-heading)", fontWeight: 600, fontSize: 13, marginBottom: 8 }}>
                Position du parc
              </div>
              <PinField
                lat={d.lat ?? park.latitude}
                lng={d.lng ?? park.longitude}
                onChange={(lat, lng) => patch({ lat, lng })}
              />
              {park.formatted_address && (
                <p style={{ fontSize: 12, color: "var(--color-text-muted)", marginTop: 8 }}>
                  Adresse actuelle : {park.formatted_address}
                </p>
              )}
            </>
          )}

          {d.target === "other" && (
            <Textarea
              label="Quelle information faut-il corriger ?"
              rows={4}
              maxLength={400}
              value={d.freeText}
              onChange={(e) => patch({ freeText: e.target.value })}
              help={`${d.freeText.length}/400`}
            />
          )}

          {d.target === "play" && (
            <>
              <div style={{ fontFamily: "var(--font-heading)", fontWeight: 600, fontSize: 13, marginBottom: 6 }}>
                Quels jeux sont présents ?
              </div>
              <p style={{ fontSize: 12, color: "var(--color-text-muted)", marginBottom: 12 }}>
                Sélectionnez ce que vous observez sur place. Les jeux déjà connus de Toboggo sont
                pré-sélectionnés — décochez-en un pour signaler son absence.
              </p>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {relevantFeatures.map((f) => {
                  const before = park.features[f.code]?.status ?? "unknown";
                  const active = (d.featureStatus[f.code] ?? before) === "available";
                  return (
                    <Chip key={f.code} active={active} onClick={() => togglePlayChip(f.code)}>
                      {featureLabel(f.code)}
                    </Chip>
                  );
                })}
              </div>
            </>
          )}

          {d.target !== "play" && TARGET_CATEGORIES[d.target ?? "other"] && (
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              {relevantFeatures.map((f) => {
                const before = park.features[f.code]?.status ?? "unknown";
                const value = d.featureStatus[f.code] ?? before;
                return (
                  <div key={f.code}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 6 }}>
                      <span style={{ fontSize: 13.5, fontWeight: 600, fontFamily: "var(--font-heading)" }}>
                        {featureLabel(f.code)}
                      </span>
                      <span style={{ fontSize: 11.5, color: "var(--color-text-muted)" }}>
                        Actuel : {FEATURE_STATUS_LABEL[before]}
                      </span>
                    </div>
                    <Segmented
                      options={STATUS_OPTIONS}
                      value={value}
                      onChange={(v) => patch({ featureStatus: { ...d.featureStatus, [f.code]: v } })}
                    />
                  </div>
                );
              })}
            </div>
          )}

          {/* Own section, clearly set apart from the fields above (which propose the
              correction itself) — this is an optional note for the moderator, not a
              continuation of "Description". */}
          <div style={{ height: 1, background: "var(--color-border)", margin: "24px 0 16px" }} />
          <div
            style={{
              fontSize: 11,
              fontWeight: 800,
              textTransform: "uppercase",
              letterSpacing: "0.06em",
              color: "var(--color-text-muted)",
              marginBottom: 8,
            }}
          >
            Précision
          </div>
          <Textarea
            label="Un détail à ajouter ? (facultatif)"
            rows={2}
            maxLength={200}
            value={d.note}
            onChange={(e) => patch({ note: e.target.value })}
            help={`${d.note.length}/200`}
          />

          <Button block style={{ marginTop: 20 }} disabled={!items.length} onClick={() => patch({ step: 2 })}>
            Vérifier
          </Button>
          {!items.length && (
            <p style={{ fontSize: 12, color: "var(--color-text-muted)", textAlign: "center", marginTop: 8 }}>
              Modifiez au moins une valeur pour continuer.
            </p>
          )}
        </div>
      )}

      {d.step === 2 && (
        <div style={{ padding: "0 20px" }}>
          <h2 style={{ fontSize: 18, marginBottom: 4 }}>Vérifiez votre correction</h2>
          <p style={{ fontSize: 12.5, color: "var(--color-text-muted)", marginBottom: 12 }}>
            {park.name}
          </p>
          <div style={{ background: "var(--color-surface)", borderRadius: 16, padding: "4px 16px 12px" }}>
            {items.map((i) => (
              <DiffRow key={i.field} label={i.label} current={i.currentText} proposed={i.proposedText} />
            ))}
          </div>
          {d.note.trim() && (
            <p style={{ fontSize: 13, color: "var(--color-text-muted)", marginTop: 12 }}>
              Précision : {d.note.trim()}
            </p>
          )}
          {!userId && (
            <p style={{ fontSize: 12.5, color: "var(--color-text-muted)", marginTop: 12 }}>
              Un compte gratuit est demandé au moment de l'envoi. Votre brouillon est conservé.
            </p>
          )}
          <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
            <Button variant="secondary" block onClick={() => patch({ step: 1 })}>
              Modifier
            </Button>
            <Button block loading={saving} onClick={submit}>
              Proposer la modification
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
