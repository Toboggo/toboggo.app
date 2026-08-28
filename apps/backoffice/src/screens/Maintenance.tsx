import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button, Input, Segmented, Select, StatCard } from "@toboggo/design-system";
import { completeMaintenance, createMaintenance, listMaintenance, listParks, listTeam, logActivity, type Maintenance as MaintenanceType, type MaintenanceRecurrence } from "@toboggo/shared";
import { PageHeader } from "../components/PageHeader";
import { MaintenanceModal } from "../components/MaintenanceModal";
import { useOrgScope } from "../lib/orgScope";
import { useOrgSession } from "../lib/orgSession";
import { queryClient } from "../lib/queryClient";

type TabValue = "upcoming" | "late" | "done";

function tabOf(item: MaintenanceType): TabValue {
  if (item.done) return "done";
  return new Date(item.date) < new Date(new Date().toDateString()) ? "late" : "upcoming";
}

export default function Maintenance() {
  const { communeId } = useOrgScope();
  const userName = useOrgSession((s) => s.userName);
  const [tab, setTab] = useState<TabValue>("upcoming");
  const [editing, setEditing] = useState<MaintenanceType | null>(null);
  const [formParkId, setFormParkId] = useState("");
  const [formDate, setFormDate] = useState("");
  const [formNote, setFormNote] = useState("");
  const [formAssignee, setFormAssignee] = useState("");
  const [formRecur, setFormRecur] = useState<MaintenanceRecurrence>("none");

  const { data: items = [] } = useQuery({ queryKey: ["bo-maintenance", communeId], queryFn: () => listMaintenance(communeId!), enabled: !!communeId });
  const { data: parks = [] } = useQuery({ queryKey: ["bo-parks", communeId], queryFn: () => listParks({ communeId }) });
  const { data: team = [] } = useQuery({ queryKey: ["bo-team", communeId], queryFn: () => listTeam(communeId!), enabled: !!communeId });

  const filtered = items.filter((i) => tabOf(i) === tab);
  const counts = { upcoming: items.filter((i) => tabOf(i) === "upcoming").length, late: items.filter((i) => tabOf(i) === "late").length, done: items.filter((i) => tabOf(i) === "done").length };

  async function planify() {
    if (!communeId || !formParkId || !formDate) return;
    await createMaintenance({ park_id: formParkId, commune_id: communeId, date: formDate, note: formNote || null, assignee: formAssignee || null, recur: formRecur });
    await logActivity(communeId, userName, "Inspection planifiée");
    setFormParkId("");
    setFormDate("");
    setFormNote("");
    setFormAssignee("");
    setFormRecur("none");
    void queryClient.invalidateQueries({ queryKey: ["bo-maintenance"] });
  }

  async function onComplete(item: MaintenanceType) {
    await completeMaintenance(item);
    void queryClient.invalidateQueries({ queryKey: ["bo-maintenance"] });
  }

  return (
    <div>
      <PageHeader title="Entretien" />

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginBottom: 24, maxWidth: 480 }}>
        <StatCard value={counts.upcoming} label="À venir" />
        <StatCard value={counts.late} label="En retard" />
        <StatCard value={counts.done} label="Terminées" />
      </div>

      <div style={{ background: "var(--color-surface)", borderRadius: 14, padding: 16, marginBottom: 24, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
        <Select label="Parc" value={formParkId} onChange={(e) => setFormParkId(e.target.value)} style={{ minWidth: 160 }}>
          <option value="">Sélectionner…</option>
          {parks.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </Select>
        <Input label="Date" type="date" value={formDate} onChange={(e) => setFormDate(e.target.value)} />
        <Input label="Note" value={formNote} onChange={(e) => setFormNote(e.target.value)} />
        <Select label="Responsable" value={formAssignee} onChange={(e) => setFormAssignee(e.target.value)}>
          <option value="">Non assigné</option>
          {team.map((t) => (
            <option key={t.id} value={t.name}>
              {t.name}
            </option>
          ))}
        </Select>
        <Select label="Récurrence" value={formRecur} onChange={(e) => setFormRecur(e.target.value as MaintenanceRecurrence)}>
          <option value="none">Ponctuel</option>
          <option value="monthly">Mensuel</option>
          <option value="yearly">Annuel</option>
        </Select>
        <Button onClick={planify} disabled={!formParkId || !formDate}>
          Planifier
        </Button>
      </div>

      <Segmented
        options={[
          { value: "upcoming", label: `À venir (${counts.upcoming})` },
          { value: "late", label: `En retard (${counts.late})` },
          { value: "done", label: `Terminées (${counts.done})` },
        ]}
        value={tab}
        onChange={(v) => setTab(v as TabValue)}
      />

      <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 8 }}>
        {filtered.map((item) => {
          const park = parks.find((p) => p.id === item.park_id);
          return (
            <div key={item.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: 12, background: "var(--color-surface)", borderRadius: 12 }}>
              {!item.done && (
                <input type="checkbox" checked={false} onChange={() => onComplete(item)} style={{ width: 18, height: 18 }} />
              )}
              <div style={{ flex: 1 }}>
                <div style={{ fontFamily: "var(--font-heading)", fontWeight: 600, fontSize: 14 }}>
                  {park?.name} {item.recur !== "none" && <span style={{ fontSize: 11, color: "var(--color-text-muted)" }}>↻ {item.recur === "monthly" ? "Mensuel" : "Annuel"}</span>}
                </div>
                <div style={{ fontSize: 12.5, color: "var(--color-text-muted)" }}>
                  {new Date(item.date).toLocaleDateString("fr-FR")} · {item.note} · {item.assignee ?? "Non assigné"}
                </div>
                {item.done && item.done_date && <div style={{ fontSize: 11.5, color: "var(--color-primary)" }}>réalisé le {new Date(item.done_date).toLocaleDateString("fr-FR")}</div>}
              </div>
              <button onClick={() => setEditing(item)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 15 }}>
                ✏️
              </button>
            </div>
          );
        })}
        {filtered.length === 0 && <p style={{ color: "var(--color-text-muted)" }}>Aucune inspection dans cette catégorie.</p>}
      </div>

      {editing && <MaintenanceModal item={editing} parks={parks} team={team} onClose={() => setEditing(null)} />}
    </div>
  );
}
