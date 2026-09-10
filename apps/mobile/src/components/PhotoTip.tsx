import { useTranslation } from "react-i18next";

export function PhotoTip() {
  const { t } = useTranslation("contribute");
  return (
    <div
      style={{
        background: "var(--color-warning-bg)",
        color: "var(--color-warning-text)",
        borderRadius: "var(--radius-sm)",
        padding: "12px 14px",
        fontSize: 13,
        marginTop: 12,
      }}
    >
      <strong>{t("photoTip.label")}</strong> — {t("photoTip.text")}
    </div>
  );
}
