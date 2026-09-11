import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { BottomSheet, Icon, type IconName } from "@toboggo/design-system";
import { useToastStore } from "../lib/toast";
import styles from "./QuickMenu.module.css";

type QuickItem = { iconName?: IconName; emoji?: string; labelKey: string; to: string };

// "Ajouter une photo" et "Plus d'actions" n'ont pas encore de pictogramme validé
// dans le sprite (docs/DESIGN-SYSTEM.md §7) — emoji conservé en attendant.
const ITEMS: QuickItem[] = [
  { iconName: "ic-plus", labelKey: "menu.addPark", to: "/action-intro/add" },
  { iconName: "ic-review", labelKey: "menu.rate", to: "/rate" },
  { iconName: "ic-flag", labelKey: "menu.report", to: "/report" },
  { emoji: "📷", labelKey: "menu.addPhoto", to: "/photo-add" },
  { emoji: "➡️", labelKey: "menu.more", to: "/more-actions" },
];

export function QuickMenu({ open, onClose }: { open: boolean; onClose: () => void }) {
  const navigate = useNavigate();
  const { t } = useTranslation("contribute");
  const showToast = useToastStore((s) => s.show);

  return (
    <BottomSheet open={open} onClose={onClose} snapPoints={["fit"]} initialSnap={0} showBackdrop>
      <div className={styles.menu}>
        {ITEMS.map((item) => (
          <button
            key={item.labelKey}
            className={styles.item}
            onClick={() => {
              onClose();
              // No auth gate here: a contribution can be started signed out and
              // asks for an account only at send time.
              navigate(item.to);
            }}
          >
            <span className={styles.icon}>
              {item.iconName ? <Icon name={item.iconName} size={18} /> : item.emoji}
            </span>
            {t(item.labelKey)}
          </button>
        ))}
        <button
          className={styles.item}
          onClick={() => {
            onClose();
            showToast(t("comingSoon", { ns: "common" }));
          }}
        >
          <span className={styles.icon}>
            <Icon name="ic-question" size={18} />
          </span>
          {t("menu.ask")}
        </button>
      </div>
    </BottomSheet>
  );
}
