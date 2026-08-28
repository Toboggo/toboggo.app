import { useState } from "react";
import { Button, Dialog, Input, Select } from "@toboggo/design-system";
import { updateMaintenance, deleteMaintenance, type Maintenance, type MaintenanceRecurrence, type Park, type TeamMember } from "@toboggo/shared";
import { queryClient } from "../lib/queryClient";

export function MaintenanceModal({
  item,
  parks,
  team,
  onClose,
}: {
  item: Maintenance;
  parks: Park[];
  team: TeamMember[];
  onClose: () => void;
}) {
  const [parkId, setParkId] = useState(item.park_id);
  const [date, setDate] = useState(item.date);
  const [note, setNote] = useState(item.note ?? "");
  const [assignee, setAssignee] = useState(item.assignee ?? "");
  const [recur, setRecur] = useState<MaintenanceRecurrence>(item.recur);
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    try {
      await updateMaintenance(item.id, { park_id: parkId, date, note, assignee: assignee || null, recur });
      void queryClient.invalidateQueries({ queryKey: ["bo-maintenance"] });
      onClose();
    } finally {
      setSaving(false);
    }
  }

  async function onDelete() {
    const park = parks.find((p) => p.id === item.park_id);
    if (!confirm(`Supprimer cette inspection pour "${park?.name ?? ""}" ?`)) return;
    await deleteMaintenance(item.id);
    void queryClient.invalidateQueries({ queryKey: ["bo-maintenance"] });
    onClose();
  }

  return (
    <Dialog open onClose={onClose} title="Modifier l'inspection">
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <Select label="Parc" value={parkId} onChange={(e) => setParkId(e.target.value)}>
          {parks.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </Select>
        <Input label="Date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        <Input label="Note" value={note} onChange={(e) => setNote(e.target.value)} />
        <Select label="Responsable" value={assignee} onChange={(e) => setAssignee(e.target.value)}>
          <option value="">Non assigné</option>
          {team.map((t) => (
            <option key={t.id} value={t.name}>
              {t.name}
            </option>
          ))}
        </Select>
        <Select label="Récurrence" value={recur} onChange={(e) => setRecur(e.target.value as MaintenanceRecurrence)}>
          <option value="none">Ponctuel</option>
          <option value="monthly">Mensuel</option>
          <option value="yearly">Annuel</option>
        </Select>
        <div style={{ display: "flex", gap: 8 }}>
          <Button variant="danger" onClick={onDelete}>
            Supprimer
          </Button>
          <Button block loading={saving} onClick={save}>
            Enregistrer
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
