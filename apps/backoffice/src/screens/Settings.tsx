import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import jsPDF from "jspdf";
import { Avatar, Button, Card, Input, Toggle } from "@toboggo/design-system";
import { listTeam, listCommunes, updateCommune, removeTeamMember, listParks, listReports, listReviews, type Commune } from "@toboggo/shared";
import { PageHeader } from "../components/PageHeader";
import { InviteModal } from "../components/InviteModal";
import { useOrgSession } from "../lib/orgSession";
import { useOrgScope } from "../lib/orgScope";
import { queryClient } from "../lib/queryClient";

export default function Settings() {
  const { isAdmin, communeId } = useOrgScope();
  const { userName, userEmail, currentRole, isGestionnaireOrAbove } = useOrgSession();
  const canManageTeam = isAdmin || isGestionnaireOrAbove();
  const [inviteOpen, setInviteOpen] = useState(false);

  const { data: team = [] } = useQuery({ queryKey: ["bo-team", communeId, isAdmin], queryFn: () => listTeam(isAdmin ? null : communeId!) });
  const { data: communes = [] } = useQuery({ queryKey: ["bo-communes"], queryFn: listCommunes, enabled: !isAdmin });
  const commune = communes.find((c) => c.id === communeId);

  const [communeDraft, setCommuneDraft] = useState<Partial<Commune>>({});
  const draft = { name: communeDraft.name ?? commune?.name ?? "", contact_email: communeDraft.contact_email ?? commune?.contact_email ?? "" };

  async function saveCommune() {
    if (!communeId) return;
    await updateCommune(communeId, { name: draft.name, contact_email: draft.contact_email });
    void queryClient.invalidateQueries({ queryKey: ["bo-communes"] });
  }

  async function toggleEmailNotif(v: boolean) {
    if (!communeId) return;
    await updateCommune(communeId, { email_notif: v });
    void queryClient.invalidateQueries({ queryKey: ["bo-communes"] });
  }

  async function onRemove(id: string, name: string) {
    if (!confirm(`Retirer "${name}" de l'équipe ?`)) return;
    await removeTeamMember(id);
    void queryClient.invalidateQueries({ queryKey: ["bo-team"] });
  }

  async function generateReport() {
    if (!communeId || !commune) return;
    const [parks, reports, reviews] = await Promise.all([
      listParks({ communeId }),
      listReports({ communeId }),
      listReviews({ communeId }),
    ]);
    const doc = new jsPDF();
    doc.setFontSize(18);
    doc.text(`Rapport mensuel — ${commune.name}`, 14, 20);
    doc.setFontSize(11);
    doc.text(`Généré le ${new Date().toLocaleDateString("fr-FR")}`, 14, 28);
    doc.setFontSize(13);
    doc.text("Parcs", 14, 42);
    doc.setFontSize(11);
    doc.text(`Publiés : ${parks.filter((p) => p.status === "published").length}`, 14, 50);
    doc.text(`En attente : ${parks.filter((p) => p.status === "pending").length}`, 14, 57);
    doc.setFontSize(13);
    doc.text("Signalements", 14, 72);
    doc.setFontSize(11);
    doc.text(`Résolus : ${reports.filter((r) => r.status === "resolved").length}`, 14, 80);
    doc.text(`Ouverts : ${reports.filter((r) => r.status === "open").length}`, 14, 87);
    doc.setFontSize(13);
    doc.text("Avis", 14, 102);
    doc.setFontSize(11);
    doc.text(`Total : ${reviews.length}`, 14, 110);
    doc.text(`Note moyenne : ${(parks.reduce((s, p) => s + p.rating, 0) / (parks.length || 1)).toFixed(1)}/5`, 14, 117);
    doc.save(`toboggo-rapport-${commune.name.replace(/\s+/g, "-").toLowerCase()}.pdf`);
  }

  return (
    <div>
      <PageHeader title="Paramètres" />

      <div style={{ display: "grid", gap: 20, maxWidth: 560 }}>
        <Card>
          <h2 style={{ fontSize: 15, marginBottom: 12 }}>Mon compte</h2>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <Avatar name={userName} size={44} />
            <div>
              <div style={{ fontFamily: "var(--font-heading)", fontWeight: 600 }}>{userName}</div>
              <div style={{ fontSize: 12.5, color: "var(--color-text-muted)" }}>
                {userEmail} · {currentRole()}
              </div>
            </div>
          </div>
        </Card>

        {!isAdmin && commune && (
          <Card>
            <h2 style={{ fontSize: 15, marginBottom: 12 }}>Fiche collectivité</h2>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <Input label="Nom de la collectivité" value={draft.name} onChange={(e) => setCommuneDraft((d) => ({ ...d, name: e.target.value }))} disabled={!isGestionnaireOrAbove()} />
              <Input label="Contact référent" type="email" value={draft.contact_email} onChange={(e) => setCommuneDraft((d) => ({ ...d, contact_email: e.target.value }))} disabled={!isGestionnaireOrAbove()} />
              {isGestionnaireOrAbove() && (
                <Button onClick={saveCommune} style={{ alignSelf: "flex-start" }}>
                  Enregistrer
                </Button>
              )}
              <Toggle
                label="Recevoir un e-mail pour chaque nouveau signalement"
                description="Envoyé au contact référent."
                checked={commune.email_notif}
                onChange={toggleEmailNotif}
              />
            </div>
          </Card>
        )}

        {!isAdmin && (
          <Card>
            <h2 style={{ fontSize: 15, marginBottom: 6 }}>Rapport mensuel</h2>
            <p style={{ fontSize: 13, color: "var(--color-text-muted)", marginBottom: 12 }}>
              Signalements traités, avis, fréquentation — pour vos élus.
            </p>
            <Button variant="secondary" onClick={generateReport}>
              Générer le rapport PDF
            </Button>
          </Card>
        )}

        <Card>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <h2 style={{ fontSize: 15 }}>{isAdmin ? "Équipe et rôles" : "Équipe municipale"}</h2>
            {canManageTeam && (
              <Button size="sm" onClick={() => setInviteOpen(true)}>
                + Inviter
              </Button>
            )}
          </div>
          {team.map((m) => (
            <div key={m.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 0", borderBottom: "1px solid var(--color-border)" }}>
              <Avatar name={m.name} size={32} />
              <div style={{ flex: 1 }}>
                <div style={{ fontFamily: "var(--font-heading)", fontWeight: 600, fontSize: 13.5 }}>{m.name}</div>
                <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>{m.email}</div>
              </div>
              <span style={{ fontSize: 12, color: "var(--color-text-muted)" }}>{m.role}</span>
              {canManageTeam && (
                <button onClick={() => onRemove(m.id, m.name)} style={{ background: "none", border: "none", color: "var(--color-error)", fontSize: 12, cursor: "pointer" }}>
                  Retirer
                </button>
              )}
            </div>
          ))}
        </Card>
      </div>

      {inviteOpen && <InviteModal communeId={isAdmin ? null : communeId!} onClose={() => setInviteOpen(false)} />}
    </div>
  );
}
