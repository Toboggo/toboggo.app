import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useQueryClient } from "@tanstack/react-query";
import { Button, Dialog } from "@toboggo/design-system";
import { createChild, deleteChild, updateChild } from "@toboggo/shared";
import { TopBar } from "../../components/TopBar";
import { ChildBirthFields } from "../../components/ChildBirthFields";
import { useSession } from "../../lib/session";
import { useChildren } from "../../lib/children";
import styles from "./Children.module.css";

export default function ChildForm() {
  const { childId } = useParams();
  const isEdit = !!childId;
  const navigate = useNavigate();
  const { t } = useTranslation("profile");
  const userId = useSession((s) => s.userId);
  const queryClient = useQueryClient();
  const { data: children = [] } = useChildren();
  const existing = isEdit ? children.find((c) => c.id === childId) : undefined;
  const existingIndex = existing ? children.findIndex((c) => c.id === existing.id) : -1;

  const [birthMonth, setBirthMonth] = useState<number | null>(null);
  const [birthYear, setBirthYear] = useState<number | null>(null);
  const [loaded, setLoaded] = useState(!isEdit);
  const [saving, setSaving] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (existing && !loaded) {
      setBirthMonth(existing.birth_month);
      setBirthYear(existing.birth_year);
      setLoaded(true);
    }
  }, [existing, loaded]);

  const canSave = birthMonth != null && birthYear != null;

  async function save() {
    if (!userId || !canSave || saving) return;
    setSaving(true);
    try {
      if (existing) {
        await updateChild(existing.id, { birth_month: birthMonth, birth_year: birthYear });
      } else {
        await createChild(userId, { birth_month: birthMonth, birth_year: birthYear });
      }
      await queryClient.invalidateQueries({ queryKey: ["children", userId] });
      navigate(-1);
    } finally {
      setSaving(false);
    }
  }

  async function onDelete() {
    if (!existing || deleting) return;
    setDeleting(true);
    try {
      await deleteChild(existing.id);
      await queryClient.invalidateQueries({ queryKey: ["children", userId] });
      navigate(-1);
    } finally {
      setDeleting(false);
    }
  }

  const title = existing
    ? t("children.editTitle", { index: existingIndex + 1 })
    : t("children.addTitle");

  return (
    <div className="screen">
      <TopBar title={title} />
      <div style={{ padding: "0 20px", display: "flex", flexDirection: "column", gap: 16 }}>
        <p className={styles.empty}>{t("children.formIntro")}</p>

        <ChildBirthFields
          birthMonth={birthMonth}
          birthYear={birthYear}
          onChangeMonth={setBirthMonth}
          onChangeYear={setBirthYear}
          monthLabel={t("children.birthMonth")}
          yearLabel={t("children.birthYear")}
          monthPlaceholder={t("children.selectMonth")}
          yearPlaceholder={t("children.selectYear")}
        />
        <p className={styles.hint}>{t("children.privacyHint")}</p>

        <Button block loading={saving} disabled={!canSave} onClick={save}>
          {t("children.save")}
        </Button>

        {existing && (
          <button type="button" className={styles.deleteLink} onClick={() => setConfirmOpen(true)}>
            {t("children.delete")}
          </button>
        )}
      </div>

      <Dialog
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title={t("children.deleteConfirmTitle")}
        actions={
          <>
            <Button variant="secondary" block onClick={() => setConfirmOpen(false)}>
              {t("action.cancel", { ns: "common" })}
            </Button>
            <Button variant="danger" block loading={deleting} onClick={onDelete}>
              {t("children.delete")}
            </Button>
          </>
        }
      >
        <p style={{ fontSize: 14, color: "var(--color-text-muted)" }}>{t("children.deleteConfirmBody")}</p>
      </Dialog>
    </div>
  );
}
