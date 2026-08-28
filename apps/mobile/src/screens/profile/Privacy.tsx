import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button, Dialog, Toggle } from "@toboggo/design-system";
import { deleteOwnAccount } from "@toboggo/shared";
import { TopBar } from "../../components/TopBar";
import { useSession } from "../../lib/session";
import { useToastStore } from "../../lib/toast";
import styles from "./Profile.module.css";

export default function Privacy() {
  const navigate = useNavigate();
  const profile = useSession((s) => s.profile);
  const patchProfile = useSession((s) => s.patchProfile);
  const showToast = useToastStore((s) => s.show);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  if (!profile) return null;

  async function onDelete() {
    setDeleting(true);
    try {
      await deleteOwnAccount();
      navigate("/");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="screen">
      <TopBar title="Confidentialité" />
      <div style={{ padding: "0 20px" }}>
        <div style={{ padding: "14px 0", borderBottom: "1px solid var(--color-border)" }}>
          <Toggle
            label="Partager ma position"
            checked={profile.privacy_prefs.shareLocation}
            onChange={(v) => void patchProfile({ privacy_prefs: { ...profile.privacy_prefs, shareLocation: v } })}
          />
        </div>
        <div style={{ padding: "14px 0", borderBottom: "1px solid var(--color-border)" }}>
          <Toggle
            label="Profil public"
            checked={profile.privacy_prefs.publicProfile}
            onChange={(v) => void patchProfile({ privacy_prefs: { ...profile.privacy_prefs, publicProfile: v } })}
          />
        </div>

        <button className={styles.link} onClick={() => navigate("/legal/privacy")}>
          Politique de confidentialité <span>›</span>
        </button>
        <button className={styles.link} onClick={() => navigate("/legal/terms")}>
          CGU <span>›</span>
        </button>
        <button className={styles.link} onClick={() => navigate("/legal/mentions")}>
          Mentions légales <span>›</span>
        </button>
        <button className={styles.link} onClick={() => showToast("Export envoyé par e-mail sous 48h")}>
          Télécharger mes données <span>›</span>
        </button>

        <Button variant="danger" block style={{ marginTop: 24 }} onClick={() => setConfirmOpen(true)}>
          Supprimer mon compte
        </Button>
      </div>

      <Dialog
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title="Supprimer votre compte ?"
        actions={
          <>
            <Button variant="secondary" block onClick={() => setConfirmOpen(false)}>
              Annuler
            </Button>
            <Button variant="danger" block loading={deleting} onClick={onDelete}>
              Supprimer
            </Button>
          </>
        }
      >
        <p style={{ fontSize: 14, color: "var(--color-text-muted)" }}>
          Cette action est définitive. Votre profil, vos avis et vos parcs ajoutés seront supprimés, conformément à
          notre politique de confidentialité.
        </p>
      </Dialog>
    </div>
  );
}
