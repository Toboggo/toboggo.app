import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import jsPDF from "jspdf";
import { Avatar, Button, Card, Input, Toggle, useConfirm } from "@toboggo/design-system";
import { listTeam, listCommunes, updateCommune, removeTeamMember, listParks, listReports, listReviews, type Commune } from "@toboggo/shared";
import { PageHeader } from "../components/PageHeader";
import styles from "../components/Records.module.css";
import { InviteModal } from "../components/InviteModal";
import { useOrgSession } from "../lib/orgSession";
import { useOrgScope } from "../lib/orgScope";
import { usePermissions } from "../lib/permissions";
import { useAsyncAction } from "../lib/useAsyncAction";
import { queryClient } from "../lib/queryClient";

export default function Settings() {
  const { isAdmin, communeId } = useOrgScope();
  const { userName, userEmail, currentRole } = useOrgSession();
  const { canManageTeam, canEditCommuneSettings } = usePermissions();
  const confirm = useConfirm();
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

  const { run: onRemove, pending: removingMember } = useAsyncAction(
    async (id: string, name: string) => {
      const ok = await confirm({
        title: "Retirer ce membre",
        message: `Retirer "${name}" de l'équipe ? Cette personne perdra l'accès au back office.`,
        confirmLabel: "Retirer",
        danger: true,
      });
      if (!ok) return;
      await removeTeamMember(id);
      void queryClient.invalidateQueries({ queryKey: ["bo-team"] });
    },
    { successMessage: "Membre retiré." },
  );

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

      <div className={styles.settingsGrid}>
        <Card>
          <h2 className={styles.cardTitle}>Mon compte</h2>
          <div className={styles.row}>
            <Avatar name={userName} size={44} />
            <div>
              <div className={styles.name}>{userName}</div>
              <div className={styles.meta}>
                {userEmail} · {currentRole()}
              </div>
            </div>
          </div>
        </Card>

        {!isAdmin && commune && (
          <Card>
            <h2 className={styles.cardTitle}>Fiche collectivité</h2>
            <div className={styles.fieldStack}>
              <Input label="Nom de la collectivité" value={draft.name} onChange={(e) => setCommuneDraft((d) => ({ ...d, name: e.target.value }))} disabled={!canEditCommuneSettings} />
              <Input label="Contact référent" type="email" value={draft.contact_email} onChange={(e) => setCommuneDraft((d) => ({ ...d, contact_email: e.target.value }))} disabled={!canEditCommuneSettings} />
              {canEditCommuneSettings && (
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
            <h2 className={styles.cardTitle} style={{ marginBottom: 6 }}>Rapport mensuel</h2>
            <p className={styles.note} style={{ marginBottom: 12 }}>
              Signalements traités, avis, fréquentation — pour vos élus.
            </p>
            <Button variant="secondary" onClick={generateReport}>
              Générer le rapport PDF
            </Button>
          </Card>
        )}

        <Card>
          <div className={styles.cardHead}>
            <h2 className={styles.cardTitle}>{isAdmin ? "Équipe et rôles" : "Équipe municipale"}</h2>
            {canManageTeam && (
              <Button size="sm" onClick={() => setInviteOpen(true)}>
                + Inviter
              </Button>
            )}
          </div>
          {team.map((m) => (
            <div key={m.id} className={styles.memberRow}>
              <Avatar name={m.name} size={32} />
              <div className={styles.grow}>
                <div className={styles.name}>{m.name}</div>
                <div className={styles.meta}>{m.email}</div>
              </div>
              <span className={styles.role}>{m.role}</span>
              {canManageTeam && (
                <button type="button" disabled={removingMember} onClick={() => onRemove(m.id, m.name)} className={styles.linkDanger}>
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
