import type { ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Icon } from "@toboggo/design-system";
import styles from "./TopBar.module.css";

/**
 * Sub-screen header — 38px circular back button + Fredoka title,
 * matching the Claude Design prototype. Kept as `TopBar` so the many
 * screens already importing it pick up the new look automatically.
 */
export function TopBar({
  title,
  onBack,
  right,
}: {
  title?: string;
  onBack?: () => void;
  right?: ReactNode;
}) {
  const navigate = useNavigate();
  const { t } = useTranslation("common");
  return (
    <header className={styles.wrap}>
      <button
        type="button"
        className={styles.back}
        onClick={onBack ?? (() => navigate(-1))}
        aria-label={t("action.back")}
      >
        <Icon name="ic-back" size={16} />
      </button>
      {title && <h1 className={styles.title}>{title}</h1>}
      {right && <div className={styles.right}>{right}</div>}
    </header>
  );
}
