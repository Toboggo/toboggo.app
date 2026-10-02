import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { deleteOwnAccount, signOut, purgeDraftsForPrincipal } from "@toboggo/shared";
import { Button, Dialog, Icon } from "@toboggo/design-system";
import { TopBar } from "../../components/TopBar";
import { useSession } from "../../lib/session";
import styles from "./Profile.module.css";

/**
 * Écran "Gestion du compte" — informations personnelles, confidentialité, puis
 * deux actions volontairement distinctes : la déconnexion (neutre, réversible)
 * et la suppression de compte (rouge, isolée dans la zone sensible, derrière
 * une confirmation).
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

  async function handleSignOut() {
    const uid = useSession.getState().userId;
    await signOut();
    if (uid) purgeDraftsForPrincipal({ userId: uid });
    navigate("/");
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

        <h6 className={styles.kicker}>{t("accountScreen.sessionKicker")}</h6>
        <div className={styles.group}>
          <button type="button" className={styles.groupRow} onClick={handleSignOut}>
            <span className={styles.actionText}>
              <span>{t("signOut")}</span>
              <span className={styles.actionHint}>{t("accountScreen.signOutHint")}</span>
            </span>
          </button>
        </div>

        <div className={styles.dangerZone}>
          <h6 className={styles.dangerKicker}>{t("accountScreen.dangerKicker")}</h6>
          <div className={styles.group}>
            <button type="button" className={`${styles.groupRow} ${styles.dangerRow}`} onClick={openDeleteConfirm}>
              <span className={styles.groupRowMain}>
                <Icon name="ic-trash" size={18} />
                <span className={styles.actionText}>
                  <span className={styles.dangerTitle}>{t("privacyScreen.deleteAccount")}</span>
                  <span className={styles.actionHint}>{t("accountScreen.deleteHint")}</span>
                </span>
              </span>
            </button>
          </div>
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
          {t("accountScreen.deleteConfirmDetail")}
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
