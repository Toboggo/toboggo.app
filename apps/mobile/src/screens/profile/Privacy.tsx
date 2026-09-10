import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Button, Dialog, Toggle } from "@toboggo/design-system";
import { deleteOwnAccount } from "@toboggo/shared";
import { TopBar } from "../../components/TopBar";
import { useSession } from "../../lib/session";
import { useToastStore } from "../../lib/toast";
import styles from "./Profile.module.css";

export default function Privacy() {
  const navigate = useNavigate();
  const { t } = useTranslation("profile");
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
      <TopBar title={t("privacyScreen.title")} />
      <div style={{ padding: "0 20px" }}>
        <div style={{ padding: "14px 0", borderBottom: "1px solid var(--color-border)" }}>
          <Toggle
            label={t("privacyScreen.shareLocation")}
            checked={profile.privacy_prefs.shareLocation}
            onChange={(v) => void patchProfile({ privacy_prefs: { ...profile.privacy_prefs, shareLocation: v } })}
          />
        </div>
        <div style={{ padding: "14px 0", borderBottom: "1px solid var(--color-border)" }}>
          <Toggle
            label={t("privacyScreen.publicProfile")}
            checked={profile.privacy_prefs.publicProfile}
            onChange={(v) => void patchProfile({ privacy_prefs: { ...profile.privacy_prefs, publicProfile: v } })}
          />
        </div>

        <button className={styles.link} onClick={() => navigate("/legal/privacy")}>
          {t("privacyScreen.privacyPolicy")} <span>›</span>
        </button>
        <button className={styles.link} onClick={() => navigate("/legal/terms")}>
          {t("privacyScreen.terms")} <span>›</span>
        </button>
        <button className={styles.link} onClick={() => navigate("/legal/mentions")}>
          {t("privacyScreen.legalNotice")} <span>›</span>
        </button>
        <button className={styles.link} onClick={() => showToast(t("privacyScreen.exportSent"))}>
          {t("privacyScreen.downloadData")} <span>›</span>
        </button>

        <Button variant="danger" block style={{ marginTop: 24 }} onClick={() => setConfirmOpen(true)}>
          {t("privacyScreen.deleteAccount")}
        </Button>
      </div>

      <Dialog
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title={t("privacyScreen.deleteConfirmTitle")}
        actions={
          <>
            <Button variant="secondary" block onClick={() => setConfirmOpen(false)}>
              {t("action.cancel", { ns: "common" })}
            </Button>
            <Button variant="danger" block loading={deleting} onClick={onDelete}>
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
