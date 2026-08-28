import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button, Chip, Input, Textarea, DualRangeSlider, Tag } from "@toboggo/design-system";
import { createPark, logActivity, uploadPhoto, type Park } from "@toboggo/shared";
import { WizardHeader } from "../../components/WizardHeader";
import { ParkPicker } from "../../components/ParkPicker";
import { PhotoTip } from "../../components/PhotoTip";
import { EQUIPMENT_ICON, SERVICE_LABEL } from "../../lib/equipmentIcons";
import { useGeo } from "../../lib/geo";
import { useSession } from "../../lib/session";
import { useToastStore } from "../../lib/toast";

const EQUIPMENT_OPTIONS = Object.keys(EQUIPMENT_ICON);
const SERVICE_OPTIONS = Object.keys(SERVICE_LABEL) as (keyof typeof SERVICE_LABEL)[];
const DIRECTIONS = [
  { label: "Nord", dLat: 0.002, dLng: 0 },
  { label: "Sud", dLat: -0.002, dLng: 0 },
  { label: "Est", dLat: 0, dLng: 0.002 },
  { label: "Ouest", dLat: 0, dLng: -0.002 },
  { label: "Ici", dLat: 0, dLng: 0 },
];

const TOTAL_STEPS = 5;

export default function AddPark() {
  const navigate = useNavigate();
  const { lat, lng } = useGeo();
  const userId = useSession((s) => s.userId);
  const showToast = useToastStore((s) => s.show);
  const [step, setStep] = useState(0);
  const [createdId, setCreatedId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [coords, setCoords] = useState({ lat, lng });
  const [address, setAddress] = useState("");
  const [name, setName] = useState("");
  const [ageLow, setAgeLow] = useState(0);
  const [ageHigh, setAgeHigh] = useState(12);
  const [services, setServices] = useState<Set<string>>(new Set());
  const [equipment, setEquipment] = useState<Set<string>>(new Set());
  const [description, setDescription] = useState("");
  const [photos, setPhotos] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);

  function toggle(set: Set<string>, setSet: (s: Set<string>) => void, key: string) {
    const next = new Set(set);
    next.has(key) ? next.delete(key) : next.add(key);
    setSet(next);
  }

  async function onPickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !userId) return;
    setUploading(true);
    try {
      const url = await uploadPhoto("parkPhotos", file, userId);
      setPhotos((p) => [...p, url].slice(0, 4));
    } catch {
      showToast("Échec de l'envoi de la photo");
    } finally {
      setUploading(false);
    }
  }

  async function publish() {
    if (!userId) return;
    setSaving(true);
    try {
      const park: Park = await createPark({
        name,
        formatted_address: address || "Adresse non précisée",
        lat: coords.lat,
        lng: coords.lng,
        age_min: ageLow,
        age_max: ageHigh,
        surface: "non_precise",
        wc: services.has("wc"),
        shade: services.has("shade"),
        fenced: services.has("fenced"),
        pmr: services.has("pmr"),
        benches: services.has("benches"),
        water: services.has("water"),
        parking: services.has("parking"),
        play_equipment: Array.from(equipment),
        photos,
        description: description || null,
        status: "pending",
        created_by: userId,
      } as Partial<Park>);
      await logActivity(park.commune_id, "Vous", `Parc ajouté : ${park.name}`, "primary");
      setCreatedId(park.id);
      setStep(TOTAL_STEPS);
    } catch (err: any) {
      showToast(err.message ?? "Une erreur est survenue");
    } finally {
      setSaving(false);
    }
  }

  if (step === TOTAL_STEPS) {
    return (
      <div className="screen" style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 32, textAlign: "center" }}>
        <div style={{ fontSize: 64 }}>🎉</div>
        <h1 style={{ fontSize: 22, marginTop: 12 }}>Merci !</h1>
        <p style={{ color: "var(--color-text-muted)", marginTop: 8, maxWidth: 280 }}>
          Votre parc a bien été ajouté. Il sera visible après vérification par notre équipe.
        </p>
        <Tag tone="warning" style={{ marginTop: 12 }}>
          En cours de vérification
        </Tag>
        <div style={{ display: "flex", flexDirection: "column", gap: 10, width: "100%", maxWidth: 320, marginTop: 28 }}>
          <Button block onClick={() => navigate(`/park/${createdId}`)}>
            Voir le parc
          </Button>
          <Button variant="secondary" block onClick={() => window.location.reload()}>
            Ajouter un autre parc
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="screen">
      <WizardHeader step={step} total={TOTAL_STEPS} onBack={() => (step === 0 ? navigate(-1) : setStep(step - 1))} />

      {step === 0 && (
        <ParkPicker onPick={(p) => navigate(`/park/${p.id}`)} onNone={() => setStep(1)} />
      )}

      {step === 1 && (
        <div style={{ padding: "0 20px" }}>
          <h2 style={{ fontSize: 18, marginBottom: 12 }}>Où se trouve le parc ?</h2>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
            {DIRECTIONS.map((d) => (
              <Chip key={d.label} onClick={() => setCoords({ lat: lat + d.dLat, lng: lng + d.dLng })}>
                {d.label}
              </Chip>
            ))}
          </div>
          <Input label="Adresse" value={address} onChange={(e) => setAddress(e.target.value)} placeholder="12 rue des Tilleuls, 69000 Lyon" />
          <Button variant="secondary" block style={{ marginTop: 16 }} onClick={() => setCoords({ lat, lng })}>
            📍 Utiliser ma position actuelle
          </Button>
          <Button block style={{ marginTop: 24 }} disabled={!address} onClick={() => setStep(2)}>
            Continuer
          </Button>
        </div>
      )}

      {step === 2 && (
        <div style={{ padding: "0 20px" }}>
          <Input label="Nom du parc" value={name} onChange={(e) => setName(e.target.value)} placeholder="Square Voltaire" />
          <div style={{ margin: "20px 0" }}>
            <div style={{ fontFamily: "var(--font-heading)", fontWeight: 600, fontSize: 13, marginBottom: 6 }}>Tranche d'âge</div>
            <DualRangeSlider min={0} max={12} low={ageLow} high={ageHigh} onChange={(l, h) => (setAgeLow(l), setAgeHigh(h))} />
          </div>
          <div style={{ fontFamily: "var(--font-heading)", fontWeight: 600, fontSize: 13, marginBottom: 8 }}>Caractéristiques</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 20 }}>
            {SERVICE_OPTIONS.map((s) => (
              <Chip key={s} active={services.has(s)} onClick={() => toggle(services, setServices, s)}>
                {SERVICE_LABEL[s]}
              </Chip>
            ))}
          </div>
          <div style={{ fontFamily: "var(--font-heading)", fontWeight: 600, fontSize: 13, marginBottom: 8 }}>Jeux disponibles</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 20 }}>
            {EQUIPMENT_OPTIONS.map((e) => (
              <Chip key={e} active={equipment.has(e)} onClick={() => toggle(equipment, setEquipment, e)}>
                {EQUIPMENT_ICON[e]} {e}
              </Chip>
            ))}
          </div>
          <Textarea label="Description (facultatif)" value={description} onChange={(e) => setDescription(e.target.value)} rows={3} />
          <Button block style={{ marginTop: 20 }} disabled={!name} onClick={() => setStep(3)}>
            Continuer
          </Button>
        </div>
      )}

      {step === 3 && (
        <div style={{ padding: "0 20px" }}>
          <h2 style={{ fontSize: 18, marginBottom: 12 }}>Photos</h2>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            {photos.map((p, i) => (
              <div key={i} style={{ width: 80, height: 80, borderRadius: 14, backgroundImage: `url(${p})`, backgroundSize: "cover" }} />
            ))}
            {photos.length < 4 && (
              <label
                style={{
                  width: 80,
                  height: 80,
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
                {uploading ? "…" : "+"}
                <input type="file" accept="image/*" hidden onChange={onPickFile} disabled={uploading} />
              </label>
            )}
          </div>
          <PhotoTip />
          <div style={{ display: "flex", gap: 10, marginTop: 24 }}>
            <Button variant="secondary" block onClick={() => setStep(4)}>
              Passer
            </Button>
            <Button block onClick={() => setStep(4)}>
              Continuer
            </Button>
          </div>
        </div>
      )}

      {step === 4 && (
        <div style={{ padding: "0 20px" }}>
          <h2 style={{ fontSize: 18, marginBottom: 12 }}>Vérifiez avant de publier</h2>
          <div style={{ background: "var(--color-surface)", borderRadius: 18, padding: 16 }}>
            <div style={{ fontFamily: "var(--font-heading)", fontWeight: 700, fontSize: 16 }}>{name}</div>
            <div style={{ fontSize: 13, color: "var(--color-text-muted)", marginTop: 4 }}>{address}</div>
            <div style={{ marginTop: 10, display: "flex", flexWrap: "wrap", gap: 6 }}>
              <Tag>{ageLow}-{ageHigh} ans</Tag>
              {Array.from(services).map((s) => (
                <Tag key={s} tone="primary">
                  {SERVICE_LABEL[s as keyof typeof SERVICE_LABEL]}
                </Tag>
              ))}
            </div>
          </div>
          <Button block loading={saving} style={{ marginTop: 24 }} onClick={publish}>
            Publier le parc
          </Button>
        </div>
      )}
    </div>
  );
}
