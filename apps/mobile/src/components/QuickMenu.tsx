import { useNavigate } from "react-router-dom";
import { BottomSheet } from "@toboggo/design-system";
import { requireAccount } from "../lib/session";
import { useToastStore } from "../lib/toast";
import styles from "./QuickMenu.module.css";

const ITEMS = [
  { icon: "➕", label: "Ajouter un parc", to: "/action-intro/add" },
  { icon: "⭐", label: "Donner mon avis", to: "/action-intro/rate" },
  { icon: "⚠️", label: "Signaler un problème", to: "/action-intro/report" },
  { icon: "📷", label: "Ajouter une photo", to: "/photo-add" },
  { icon: "➡️", label: "Plus d'actions", to: "/more-actions" },
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
            <span className={styles.icon}>{item.icon}</span>
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
          <span className={styles.icon}>💬</span>
          Poser une question
        </button>
      </div>
    </BottomSheet>
  );
}
