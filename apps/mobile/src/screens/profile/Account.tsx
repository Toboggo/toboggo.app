import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { deleteOwnAccount } from "@toboggo/shared";
import { Button, Dialog } from "@toboggo/design-system";
import { TopBar } from "../../components/TopBar";
import styles from "./Profile.module.css";

/**
 * Écran "Gestion du compte" — regroupe les informations personnelles, la
 * confidentialité et la suppression de compte. La déconnexion vit désormais
 * au bas de l'écran Profil (action secondaire, hors de cet écran) pour ne
 * jamais partager le même niveau visuel que la suppression, qui reste ici,
 * isolée en bas dans une zone clairement séparée.
 */
export default function Account() {
  const navigate = useNavigate();
  const { t } = useTranslation("profile");
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteFailed, setDeleteFailed] = useState(false);

  function openDeleteConfirm() {
    setDeleteFailed(false);
    setConfirmDeleteOpen(true);
  }

  async function onDeleteAccount() {
    setDeleting(true);
    setDeleteFailed(false);
    try {
      await deleteOwnAccount();
      navigate("/");
    } catch {
      // Account still exists (the RPC is all-or-nothing): keep the dialog
      // open with a generic message — never surface the raw SQL error.
      setDeleteFailed(true);
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="screen">
      <TopBar title={t("accountScreen.managementKicker")} />
      <div style={{ padding: "0 20px" }}>
        <h6 className={styles.kicker}>{t("accountScreen.infoKicker")}</h6>
        <div className={styles.group}>
          <button type="button" className={styles.groupRow} onClick={() => navigate("/profile/edit")}>
            <span>{t("editProfile.title")}</span>
          </button>
          <button type="button" className={styles.groupRow} onClick={() => navigate("/legal")}>
            <span>{t("privacyScreen.title")}</span>
          </button>
        </div>

        <div className={styles.dangerZone}>
          <h6 className={styles.dangerKicker}>{t("accountScreen.dangerKicker")}</h6>
          <p className={styles.dangerText}>{t("privacyScreen.deleteConfirmBody")}</p>
          <Button variant="danger" size="sm" onClick={openDeleteConfirm}>
            {t("privacyScreen.deleteAccount")}
          </Button>
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
        {deleteFailed && (
          <p role="alert" className={styles.dialogError}>
            {t("privacyScreen.deleteError")}
          </p>
        )}
      </Dialog>
    </div>
  );
}
