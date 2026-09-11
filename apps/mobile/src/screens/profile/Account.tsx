import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { signOut, deleteOwnAccount, purgeDraftsForPrincipal } from "@toboggo/shared";
import { Button, Dialog } from "@toboggo/design-system";
import { TopBar } from "../../components/TopBar";
import { useSession } from "../../lib/session";
import styles from "./Profile.module.css";

/**
 * Écran Compte — regroupe la gestion de session et la suppression de
 * compte, retirées du premier niveau du Profil pour ne plus exposer
 * l'action destructive directement (cf. refonte compte/paramètres).
 * Dialogue, handler et RPC de suppression inchangés, déplacés tels quels
 * depuis Profile.tsx.
 */
export default function Account() {
  const navigate = useNavigate();
  const { t } = useTranslation("profile");
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function logout() {
    // Captured before the session is cleared: only this account's local
    // drafts are purged on a shared device.
    const uid = useSession.getState().userId;
    await signOut();
    if (uid) purgeDraftsForPrincipal({ userId: uid });
    navigate("/");
  }

  async function onDeleteAccount() {
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
      <TopBar title={t("accountTitle")} />
      <div style={{ padding: "0 20px" }}>
        <h6 className={styles.kicker}>{t("accountScreen.sessionKicker")}</h6>
        <div className={styles.group}>
          <button type="button" className={styles.groupRow} onClick={logout}>
            <span>{t("signOut")}</span>
          </button>
        </div>

        <h6 className={styles.kicker}>{t("accountScreen.managementKicker")}</h6>
        <div className={styles.group}>
          <button
            type="button"
            className={styles.groupRow}
            onClick={() => setConfirmDeleteOpen(true)}
          >
            <span className={styles.groupRowDanger}>{t("privacyScreen.deleteAccount")}</span>
          </button>
        </div>
      </div>

      <Dialog
        open={confirmDeleteOpen}
        onClose={() => setConfirmDeleteOpen(false)}
        title={t("privacyScreen.deleteConfirmTitle")}
        actions={
          <>
            <Button variant="secondary" block onClick={() => setConfirmDeleteOpen(false)}>
              {t("action.cancel", { ns: "common" })}
            </Button>
            <Button variant="danger" block loading={deleting} onClick={onDeleteAccount}>
              {t("privacyScreen.delete")}
            </Button>
          </>
        }
      >
        <p style={{ fontSize: 14, color: "var(--color-text-muted)" }}>
          {t("privacyScreen.deleteConfirmBody")}
        </p>
      </Dialog>
    </div>
  );
}
