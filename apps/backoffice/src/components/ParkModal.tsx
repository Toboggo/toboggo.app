import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button, Chip, Dialog, Input, Textarea } from "@toboggo/design-system";
import {
  createPark,
  deletePark,
  getParkHistory,
  logActivity,
  setParkStatus,
  updatePark,
  uploadPhoto,
  type Park,
} from "@toboggo/shared";
import { SERVICE_LABEL } from "../lib/equipmentLabels";
import { useOrgScope } from "../lib/orgScope";
import { useOrgSession } from "../lib/orgSession";
import { queryClient } from "../lib/queryClient";

const EQUIPMENT = ["toboggan", "swing", "climbing", "waterplay", "sandbox", "springs", "zipline", "carousel", "motorcourse", "multisport"];
const SERVICE_KEYS = Object.keys(SERVICE_LABEL) as (keyof typeof SERVICE_LABEL)[];

export function ParkModal({ park, onClose, canManage }: { park: Park | "new" | null; onClose: () => void; canManage: boolean }) {
  const { communeId } = useOrgScope();
  const userName = useOrgSession((s) => s.userName);
  const isNew = park === "new";
  const existing = isNew ? null : park;

  const [name, setName] = useState(existing?.name ?? "");
  const [address, setAddress] = useState(existing?.formatted_address ?? "");
  const [ageMin, setAgeMin] = useState(existing?.age_min ?? 0);
  const [ageMax, setAgeMax] = useState(existing?.age_max ?? 12);
  const [services, setServices] = useState<Set<string>>(new Set(SERVICE_KEYS.filter((k) => existing && (existing as any)[k])));
  const [equipment, setEquipment] = useState<Set<string>>(new Set(existing?.play_equipment ?? []));
  const [description, setDescription] = useState(existing?.description ?? "");
  const [photos, setPhotos] = useState<string[]>(existing?.photos ?? []);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setName(existing?.name ?? "");
    setAddress(existing?.formatted_address ?? "");
    setAgeMin(existing?.age_min ?? 0);
    setAgeMax(existing?.age_max ?? 12);
    setServices(new Set(SERVICE_KEYS.filter((k) => existing && (existing as any)[k])));
    setEquipment(new Set(existing?.play_equipment ?? []));
    setDescription(existing?.description ?? "");
    setPhotos(existing?.photos ?? []);
  }, [park]); // eslint-disable-line react-hooks/exhaustive-deps

  const { data: history = [] } = useQuery({
    queryKey: ["park-history", existing?.id],
    queryFn: () => getParkHistory(existing!.id),
    enabled: !!existing,
  });

  function toggle(set: Set<string>, setSet: (s: Set<string>) => void, key: string) {
    const next = new Set(set);
    next.has(key) ? next.delete(key) : next.add(key);
    setSet(next);
  }

  async function onPickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const url = await uploadPhoto("parkPhotos", file, communeId ?? "admin");
    setPhotos((p) => [...p, url]);
  }

  async function save() {
    setSaving(true);
    try {
      const payload = {
        name,
        formatted_address: address,
        age_min: ageMin,
        age_max: ageMax,
        wc: services.has("wc"),
        shade: services.has("shade"),
        fenced: services.has("fenced"),
        pmr: services.has("pmr"),
        benches: services.has("benches"),
        water: services.has("water"),
        parking: services.has("parking"),
        play_equipment: Array.from(equipment),
        description: description || null,
        photos,
      };
      if (isNew) {
        const created = await createPark({ ...payload, commune_id: communeId ?? null, lat: 45.75, lng: 4.85, status: "published", surface: "non_precise" } as Partial<Park>);
        await logActivity(communeId ?? null, userName, `Parc ajouté : ${created.name}`);
      } else if (existing) {
        await updatePark(existing.id, payload, "Modifié depuis le back office");
        await logActivity(communeId ?? null, userName, `Parc modifié : ${name}`);
      }
      void queryClient.invalidateQueries({ queryKey: ["bo-parks"] });
      onClose();
    } finally {
      setSaving(false);
    }
  }

  async function setStatus(status: Park["status"], label: string) {
    if (!existing) return;
    await setParkStatus(existing.id, status, label);
    await logActivity(communeId ?? null, userName, `${label} : ${existing.name}`);
    void queryClient.invalidateQueries({ queryKey: ["bo-parks"] });
    onClose();
  }

  async function onDelete() {
    if (!existing || !confirm(`Retirer définitivement "${existing.name}" ?`)) return;
    await deletePark(existing.id);
    await logActivity(communeId ?? null, userName, `Parc retiré : ${existing.name}`);
    void queryClient.invalidateQueries({ queryKey: ["bo-parks"] });
    onClose();
  }

  return (
    <Dialog open={!!park} onClose={onClose} title={isNew ? "Ajouter un parc" : "Fiche du parc"}>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <Input label="Nom" value={name} onChange={(e) => setName(e.target.value)} disabled={!canManage} />
        <Input label="Adresse" value={address} onChange={(e) => setAddress(e.target.value)} disabled={!canManage} />
        <div style={{ display: "flex", gap: 10 }}>
          <Input label="Âge min" type="number" min={0} max={18} value={ageMin} onChange={(e) => setAgeMin(Number(e.target.value))} disabled={!canManage} />
          <Input label="Âge max" type="number" min={0} max={18} value={ageMax} onChange={(e) => setAgeMax(Number(e.target.value))} disabled={!canManage} />
        </div>

        <div>
          <div style={{ fontFamily: "var(--font-heading)", fontWeight: 600, fontSize: 13, marginBottom: 6 }}>Équipements</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {SERVICE_KEYS.map((k) => (
              <Chip key={k} active={services.has(k)} onClick={() => canManage && toggle(services, setServices, k)}>
                {SERVICE_LABEL[k]}
              </Chip>
            ))}
          </div>
        </div>

        <div>
          <div style={{ fontFamily: "var(--font-heading)", fontWeight: 600, fontSize: 13, marginBottom: 6 }}>Jeux</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {EQUIPMENT.map((eq) => (
              <Chip key={eq} active={equipment.has(eq)} onClick={() => canManage && toggle(equipment, setEquipment, eq)}>
                {eq}
              </Chip>
            ))}
          </div>
        </div>

        <Textarea label="Description" value={description} onChange={(e) => setDescription(e.target.value)} disabled={!canManage} />

        <div>
          <div style={{ fontFamily: "var(--font-heading)", fontWeight: 600, fontSize: 13, marginBottom: 6 }}>Photos</div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {photos.map((p, i) => (
              <div key={i} style={{ width: 60, height: 60, borderRadius: 10, backgroundImage: `url(${p})`, backgroundSize: "cover", position: "relative" }}>
                {canManage && (
                  <button
                    onClick={() => setPhotos(photos.filter((_, idx) => idx !== i))}
                    style={{ position: "absolute", top: -6, right: -6, background: "var(--color-error)", color: "white", border: "none", borderRadius: "50%", width: 18, height: 18, fontSize: 11, cursor: "pointer" }}
                  >
                    ✕
                  </button>
                )}
              </div>
            ))}
            {canManage && (
              <label style={{ width: 60, height: 60, borderRadius: 10, border: "2px dashed var(--color-border-strong)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
                +<input type="file" accept="image/*" hidden onChange={onPickFile} />
              </label>
            )}
          </div>
        </div>

        {existing && history.length > 0 && (
          <div>
            <div style={{ fontFamily: "var(--font-heading)", fontWeight: 600, fontSize: 13, marginBottom: 6 }}>Historique</div>
            {history.map((h) => (
              <div key={h.id} style={{ fontSize: 12.5, color: "var(--color-text-muted)", padding: "4px 0" }}>
                {h.action}
                {h.note ? ` — ${h.note}` : ""} · {h.actor} · {new Date(h.created_at).toLocaleString("fr-FR")}
              </div>
            ))}
          </div>
        )}

        {existing && canManage && (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {existing.status === "pending" && (
              <>
                <Button size="sm" onClick={() => setStatus("published", "Validé")}>
                  Valider
                </Button>
                <Button size="sm" variant="secondary" onClick={() => setStatus("rejected", "Refusé")}>
                  Refuser
                </Button>
              </>
            )}
            {existing.status === "published" && (
              <Button size="sm" variant="secondary" onClick={() => setStatus("blocked", "Bloqué")}>
                Bloquer
              </Button>
            )}
            {existing.status === "blocked" && (
              <Button size="sm" onClick={() => setStatus("published", "Débloqué")}>
                Débloquer
              </Button>
            )}
            <Button size="sm" variant="danger" onClick={onDelete}>
              Retirer ce parc
            </Button>
          </div>
        )}

        {canManage && (
          <Button block loading={saving} onClick={save}>
            Enregistrer
          </Button>
        )}
      </div>
    </Dialog>
  );
}
