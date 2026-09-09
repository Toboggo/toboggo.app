import { useMemo, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Button, Chip, Icon, Input, Textarea, DualRangeSlider, Tag, equipmentIcon, serviceIcon } from "@toboggo/design-system";
import {
  addParkPhotos,
  createPark,
  featureLabel,
  formatAgeRange,
  listFeatures,
  logActivity,
  uploadPhoto,
  ImageValidationError,
  type Park,
} from "@toboggo/shared";
import { WizardHeader } from "../../components/WizardHeader";
import { AddParkSearch } from "../../components/AddParkSearch";
import { PinField } from "../../components/PinField";
import { PhotoTip } from "../../components/PhotoTip";
import { requestBrowserLocation, useGeo } from "../../lib/geo";
import { requireAccount, useSession } from "../../lib/session";
import { useToastStore } from "../../lib/toast";

const STEPS = ["Parc", "Localisation", "Informations", "Photos", "Vérification"];
const TOTAL_STEPS = STEPS.length;

/**
 * The 7 amenities `createPark` already knows how to persist (its flat V1-shape
 * input — see `packages/shared/src/api/parks.ts` `splitParkInput`). Mapped to
 * their real catalogue code purely to look up the real French label
 * (`featureLabel`) — no second wording is introduced, this only bridges the
 * legacy key to the catalogue code. The rest of the real `service` /
 * `environment` / `accessibility` catalogue (picnic_tables, lighting,
 * bike_parking, surface_type, stroller_access, accessible_toilets,
 * accessible_parking, inclusive_play) isn't settable at creation today without
 * extending that shared API — left for the existing Correction flow.
 */
const SERVICE_TO_FEATURE_CODE: Record<string, string> = {
  wc: "toilets",
  benches: "benches",
  water: "drinking_water",
  parking: "parking",
  shade: "shade_level",
  fenced: "fence_status",
  pmr: "wheelchair_access",
};
const SERVICE_GROUPS: { title: string; keys: string[] }[] = [
  { title: "Services & confort", keys: ["wc", "benches", "water", "parking"] },
  { title: "Caractéristiques du parc", keys: ["shade", "fenced", "pmr"] },
];

function VerifySection({ title, onEdit, children }: { title: string; onEdit: () => void; children: ReactNode }) {
  return (
    <div style={{ background: "var(--color-surface)", borderRadius: 14, padding: 14, marginBottom: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <span style={{ fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.04em", color: "var(--color-text-muted)" }}>
          {title}
        </span>
        <button
          type="button"
          onClick={onEdit}
          style={{ background: "none", border: "none", color: "var(--color-primary)", fontFamily: "var(--font-heading)", fontWeight: 700, fontSize: 12.5, cursor: "pointer", padding: 0 }}
        >
          Modifier
        </button>
      </div>
      {children}
    </div>
  );
}

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
  const [parkQuery, setParkQuery] = useState("");
  const [locating, setLocating] = useState(false);
  const [name, setName] = useState("");
  const [ageLow, setAgeLow] = useState(0);
  const [ageHigh, setAgeHigh] = useState(12);
  const [ageTouched, setAgeTouched] = useState(false);
  const [services, setServices] = useState<Set<string>>(new Set());
  const [equipment, setEquipment] = useState<Set<string>>(new Set());
  const [description, setDescription] = useState("");
  const [photos, setPhotos] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);

  const { data: featureCatalogue = [] } = useQuery({ queryKey: ["features"], queryFn: () => listFeatures() });
  const playFeatures = useMemo(
    () => featureCatalogue.filter((f) => f.category === "play").sort((a, b) => a.sort_order - b.sort_order),
    [featureCatalogue],
  );

  function toggle(set: Set<string>, setSet: (s: Set<string>) => void, key: string) {
    const next = new Set(set);
    next.has(key) ? next.delete(key) : next.add(key);
    setSet(next);
  }

  // Real GPS fix (not just re-reading whatever useGeo already held) — updates
  // the shared geo store (same convention as MapExplore/Permissions) so a
  // fix obtained here is also available if the parent later revisits the
  // map, plus this wizard's own `coords` so the Localisation step starts
  // from it immediately.
  async function handleUseMyLocation() {
    setLocating(true);
    try {
      const pos = await requestBrowserLocation();
      useGeo.getState().setLocation(pos.lat, pos.lng, "Autour de vous");
      useGeo.getState().setPermission("granted");
      setCoords({ lat: pos.lat, lng: pos.lng });
    } catch {
      useGeo.getState().setPermission("denied");
    } finally {
      setLocating(false);
    }
  }

  async function onPickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !userId) return;
    setUploading(true);
    try {
      const url = await uploadPhoto("parkPhotos", file, userId);
      setPhotos((p) => [...p, url].slice(0, 4));
    } catch (err) {
      showToast(err instanceof ImageValidationError ? err.message : "Échec de l'envoi de la photo");
    } finally {
      setUploading(false);
    }
  }

  function removePhoto(i: number) {
    setPhotos((p) => p.filter((_, idx) => idx !== i));
  }

  function publish() {
    const uid = useSession.getState().userId;
    if (uid) {
      setSaving(true);
      void doPublish(uid, true);
      return;
    }
    // Guest: just-in-time login, then resume. This screen unmounts during the
    // login detour, so the resumed run reports via toast + navigation.
    requireAccount(navigate, () => {
      const newUid = useSession.getState().userId;
      if (newUid) void doPublish(newUid, false);
    });
  }

  async function doPublish(uid: string, inline: boolean) {
    const toast = inline ? showToast : useToastStore.getState().show;
    try {
      // Only ever send what the parent actually stated. A chip left
      // unselected, an untouched age slider, or an empty address must never
      // be written as a confirmed "false" / a fake value — they simply stay
      // absent from the payload (`createPark`/`splitParkInput` already skips
      // any field that isn't provided).
      const input: Partial<Park> = {
        name,
        lat: coords.lat,
        lng: coords.lng,
        play_equipment: Array.from(equipment),
        description: description || null,
        status: "pending",
        created_by: uid,
      };
      if (address.trim()) input.formatted_address = address.trim();
      if (ageTouched) {
        input.age_min = ageLow;
        input.age_max = ageHigh;
      }
      if (services.has("wc")) input.wc = true;
      if (services.has("shade")) input.shade = true;
      if (services.has("fenced")) input.fenced = true;
      if (services.has("pmr")) input.pmr = true;
      if (services.has("benches")) input.benches = true;
      if (services.has("water")) input.water = true;
      if (services.has("parking")) input.parking = true;

      const park: Park = await createPark(input);
      if (photos.length) {
        await addParkPhotos(park.id, photos, { source: "user", userId: uid });
      }
      await logActivity(park.commune_id, "Vous", `Parc ajouté : ${park.name}`, "primary");
      if (inline) {
        setCreatedId(park.id);
        setStep(TOTAL_STEPS);
      } else {
        toast("Parc envoyé — en cours de vérification.");
        navigate(`/park/${park.id}`);
      }
    } catch (err: any) {
      toast(err.message ?? "Une erreur est survenue");
    } finally {
      if (inline) setSaving(false);
    }
  }

  if (step === TOTAL_STEPS) {
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
        <h1 style={{ fontSize: 22, marginTop: 12 }}>Merci !</h1>
        <p style={{ color: "var(--color-text-muted)", marginTop: 8, maxWidth: 280 }}>
          Votre parc a bien été proposé. Nous allons vérifier les informations avant de le publier sur Toboggo.
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
      <WizardHeader
        step={step}
        total={TOTAL_STEPS}
        steps={STEPS}
        onBack={() => (step === 0 ? navigate(-1) : setStep(step - 1))}
      />

      {step === 0 && (
        <AddParkSearch
          query={parkQuery}
          onQueryChange={setParkQuery}
          onPickExisting={(p) => navigate(`/park/${p.id}`)}
          onNone={() => setStep(1)}
          onUseMyLocation={handleUseMyLocation}
          locating={locating}
        />
      )}

      {step === 1 && (
        <div style={{ padding: "0 20px" }}>
          <h2 style={{ fontSize: 18, marginBottom: 4 }}>Où se trouve le parc ?</h2>
          <p style={{ fontSize: 12.5, color: "var(--color-text-muted)", marginBottom: 16 }}>
            Recherchez un lieu, utilisez votre position ou placez le repère sur la carte.
          </p>
          <PinField
            lat={coords.lat}
            lng={coords.lng}
            onChange={(lat, lng) => setCoords({ lat, lng })}
            onAddressResolved={setAddress}
          />
          <p style={{ fontSize: 11.5, color: "var(--color-text-faint)", margin: "6px 0 0" }}>
            Déplacez le repère pour préciser l'emplacement.
          </p>
          <Input
            label="Adresse (si vous la connaissez)"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="12 rue des Tilleuls, 69000 Lyon"
            style={{ marginTop: 16 }}
          />
          <Button block style={{ marginTop: 24 }} onClick={() => setStep(2)}>
            Continuer
          </Button>
        </div>
      )}

      {step === 2 && (
        <div style={{ padding: "0 20px" }}>
          <h2 style={{ fontSize: 18, marginBottom: 4 }}>Informations sur le parc</h2>
          <p style={{ fontSize: 12.5, color: "var(--color-text-muted)", marginBottom: 16 }}>
            Renseignez uniquement ce que vous savez.
          </p>

          <Input label="Nom du parc" value={name} onChange={(e) => setName(e.target.value)} placeholder="Square Voltaire" />

          <div style={{ marginTop: 20, marginBottom: 20 }}>
            <div style={{ fontFamily: "var(--font-heading)", fontWeight: 600, fontSize: 13, marginBottom: 6 }}>Tranche d'âge</div>
            <DualRangeSlider
              min={0}
              max={12}
              low={ageLow}
              high={ageHigh}
              formatLabel={ageTouched ? undefined : () => "Âge non renseigné"}
              onChange={(l, h) => {
                setAgeLow(l);
                setAgeHigh(h);
                setAgeTouched(true);
              }}
            />
          </div>

          {SERVICE_GROUPS.map((group) => (
            <div key={group.title} style={{ marginBottom: 20 }}>
              <div style={{ fontFamily: "var(--font-heading)", fontWeight: 600, fontSize: 13, marginBottom: 8 }}>{group.title}</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {group.keys.map((key) => {
                  const ic = serviceIcon(key);
                  return (
                    <Chip key={key} active={services.has(key)} onClick={() => toggle(services, setServices, key)}>
                      {ic && <Icon name={ic} size={15} style={{ marginRight: 4, display: "inline-block", verticalAlign: "-2px" }} />}
                      {featureLabel(SERVICE_TO_FEATURE_CODE[key])}
                    </Chip>
                  );
                })}
              </div>
            </div>
          ))}

          <div style={{ marginBottom: 20 }}>
            <div style={{ fontFamily: "var(--font-heading)", fontWeight: 600, fontSize: 13, marginBottom: 8 }}>Jeux & équipements</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {playFeatures.map((f) => {
                const ic = equipmentIcon(f.code);
                return (
                  <Chip key={f.code} active={equipment.has(f.code)} onClick={() => toggle(equipment, setEquipment, f.code)}>
                    {ic && <Icon name={ic} size={15} style={{ marginRight: 4, display: "inline-block", verticalAlign: "-2px" }} />}
                    {featureLabel(f.code)}
                  </Chip>
                );
              })}
            </div>
          </div>

          <Textarea label="Description (facultatif)" value={description} onChange={(e) => setDescription(e.target.value)} rows={3} />
          <Button block style={{ marginTop: 20 }} disabled={!name} onClick={() => setStep(3)}>
            Continuer
          </Button>
        </div>
      )}

      {step === 3 && (
        <div style={{ padding: "0 20px" }}>
          <h2 style={{ fontSize: 18, marginBottom: 4 }}>Photos</h2>
          <p style={{ fontSize: 12.5, color: "var(--color-text-muted)", marginBottom: 16 }}>
            Ajoutez une photo pour aider les autres parents à reconnaître le parc.
          </p>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            {photos.map((p, i) => (
              <div key={i} style={{ position: "relative", width: 80, height: 80 }}>
                <div style={{ width: 80, height: 80, borderRadius: 14, backgroundImage: `url(${p})`, backgroundSize: "cover" }} />
                <button
                  type="button"
                  aria-label="Retirer cette photo"
                  onClick={() => removePhoto(i)}
                  style={{ position: "absolute", top: -6, right: -6, width: 24, height: 24, borderRadius: "50%", border: "none", background: "rgba(0,0,0,0.6)", color: "#fff", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
                >
                  <Icon name="ic-close" size={12} />
                </button>
              </div>
            ))}
            {photos.length < 4 && (
              <label
                style={{
                  width: 80,
                  height: 80,
                  borderRadius: 14,
                  border: "2px dashed var(--color-border-strong)",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 4,
                  cursor: "pointer",
                  color: "var(--color-text-faint)",
                }}
              >
                {uploading ? (
                  <span style={{ fontSize: 11 }}>…</span>
                ) : (
                  <>
                    <Icon name="ic-plus" size={20} />
                    <span style={{ fontSize: 9.5, fontWeight: 600, textAlign: "center", padding: "0 4px", lineHeight: 1.15 }}>
                      Ajouter une photo
                    </span>
                  </>
                )}
                <input type="file" accept="image/*" hidden onChange={onPickFile} disabled={uploading} />
              </label>
            )}
          </div>
          <PhotoTip />
          <Button block style={{ marginTop: 24 }} onClick={() => setStep(4)}>
            {photos.length > 0 ? "Continuer" : "Passer cette étape"}
          </Button>
        </div>
      )}

      {step === 4 && (
        <div style={{ padding: "0 20px" }}>
          <h2 style={{ fontSize: 18, marginBottom: 4 }}>Vérifiez avant d'envoyer</h2>
          <p style={{ fontSize: 12.5, color: "var(--color-text-muted)", marginBottom: 16 }}>
            Vous pourrez encore modifier chaque section avant l'envoi.
          </p>

          <VerifySection title="Parc" onEdit={() => setStep(2)}>
            <div style={{ fontFamily: "var(--font-heading)", fontWeight: 700, fontSize: 16 }}>{name || "—"}</div>
          </VerifySection>

          <VerifySection title="Localisation" onEdit={() => setStep(1)}>
            <div style={{ fontSize: 13, color: "var(--color-text-muted)" }}>
              {address.trim() || "Emplacement sélectionné sur la carte"}
            </div>
          </VerifySection>

          {ageTouched && (
            <VerifySection title="Tranche d'âge" onEdit={() => setStep(2)}>
              <Tag>{formatAgeRange(ageLow, ageHigh)}</Tag>
            </VerifySection>
          )}

          {equipment.size > 0 && (
            <VerifySection title="Jeux & équipements" onEdit={() => setStep(2)}>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {Array.from(equipment).map((code) => (
                  <Tag key={code} tone="primary">
                    {featureLabel(code)}
                  </Tag>
                ))}
              </div>
            </VerifySection>
          )}

          {services.size > 0 && (
            <VerifySection title="Services & caractéristiques" onEdit={() => setStep(2)}>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {Array.from(services).map((key) => (
                  <Tag key={key} tone="primary">
                    {featureLabel(SERVICE_TO_FEATURE_CODE[key])}
                  </Tag>
                ))}
              </div>
            </VerifySection>
          )}

          {description.trim() && (
            <VerifySection title="Description" onEdit={() => setStep(2)}>
              <p style={{ fontSize: 13, color: "var(--color-text-muted)", margin: 0 }}>{description}</p>
            </VerifySection>
          )}

          {photos.length > 0 && (
            <VerifySection title="Photos" onEdit={() => setStep(3)}>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {photos.map((p, i) => (
                  <div key={i} style={{ width: 56, height: 56, borderRadius: 10, backgroundImage: `url(${p})`, backgroundSize: "cover" }} />
                ))}
              </div>
            </VerifySection>
          )}

          <Button block loading={saving} style={{ marginTop: 24 }} onClick={publish}>
            Envoyer le parc
          </Button>
        </div>
      )}
    </div>
  );
}
