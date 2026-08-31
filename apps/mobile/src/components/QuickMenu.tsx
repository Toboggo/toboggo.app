import { useNavigate } from "react-router-dom";
import { BottomSheet, Icon, type IconName } from "@toboggo/design-system";
import { requireAccount } from "../lib/session";
import { useToastStore } from "../lib/toast";
import styles from "./QuickMenu.module.css";

type QuickItem = { iconName?: IconName; emoji?: string; label: string; to: string };

// "Ajouter une photo" et "Plus d'actions" n'ont pas encore de pictogramme validé
// dans le sprite (docs/DESIGN-SYSTEM.md §7) — emoji conservé en attendant.
const ITEMS: QuickItem[] = [
  { iconName: "ic-plus", label: "Ajouter un parc", to: "/action-intro/add" },
  { iconName: "ic-review", label: "Donner mon avis", to: "/action-intro/rate" },
  { iconName: "ic-flag", label: "Signaler un problème", to: "/action-intro/report" },
  { emoji: "📷", label: "Ajouter une photo", to: "/photo-add" },
  { emoji: "➡️", label: "Plus d'actions", to: "/more-actions" },
];

export function QuickMenu({ open, onClose }: { open: boolean; onClose: () => void }) {
  const navigate = useNavigate();
  const showToast = useToastStore((s) => s.show);

  return (
    <BottomSheet open={open} onClose={onClose} snapPoints={[360]} initialSnap={0} showBackdrop>
      <div className={styles.menu}>
        {ITEMS.map((item) => (
          <button
            key={item.label}
            className={styles.item}
            onClick={() => {
              onClose();
              requireAccount(navigate, () => navigate(item.to));
            }}
          >
            <span className={styles.icon}>
              {item.iconName ? <Icon name={item.iconName} size={18} /> : item.emoji}
            </span>
            {item.label}
          </button>
        ))}
        <button
          className={styles.item}
          onClick={() => {
            onClose();
            showToast("Bientôt disponible");
          }}
        >
          <span className={styles.icon}>
            <Icon name="ic-question" size={18} />
          </span>
          Poser une question
        </button>
      </div>
    </BottomSheet>
  );
}
