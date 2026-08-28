import { useState } from "react";
import { Button, Dialog, Input, Segmented } from "@toboggo/design-system";
import { inviteTeamMember, logActivity, type TeamRole } from "@toboggo/shared";
import { useOrgSession } from "../lib/orgSession";
import { queryClient } from "../lib/queryClient";

export function InviteModal({ communeId, onClose }: { communeId: string | null; onClose: () => void }) {
  const userId = useOrgSession((s) => s.userId)!;
  const userName = useOrgSession((s) => s.userName);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<TeamRole>(communeId ? "contributeur" : "support");
  const [saving, setSaving] = useState(false);

  const roleOptions = communeId
    ? [
        { value: "gestionnaire", label: "Gestionnaire" },
        { value: "contributeur", label: "Contributeur" },
      ]
    : [
        { value: "super_admin", label: "Super admin" },
        { value: "moderation", label: "Modération" },
        { value: "support", label: "Support" },
      ];

  async function send() {
    setSaving(true);
    try {
      await inviteTeamMember({ communeId, name, email, role, invitedBy: userId });
      await logActivity(communeId, userName, `Invitation envoyée à ${name}`);
      void queryClient.invalidateQueries({ queryKey: ["bo-team"] });
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onClose={onClose} title="Inviter un membre">
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <Input label="Nom" value={name} onChange={(e) => setName(e.target.value)} placeholder="Prénom Nom" />
        <Input label="E-mail" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="prenom.nom@mairie.fr" />
        <div>
          <div style={{ fontFamily: "var(--font-heading)", fontWeight: 600, fontSize: 13, marginBottom: 6 }}>Rôle</div>
          <Segmented options={roleOptions as any} value={role} onChange={(v) => setRole(v as TeamRole)} />
        </div>
        <Button block disabled={!name || !email} loading={saving} onClick={send}>
          Envoyer l'invitation
        </Button>
      </div>
    </Dialog>
  );
}
