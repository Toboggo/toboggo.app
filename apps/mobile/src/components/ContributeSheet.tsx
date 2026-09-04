import { useNavigate } from "react-router-dom";
import { BottomSheet, Icon } from "@toboggo/design-system";
import styles from "./QuickMenu.module.css";

/**
 * Lightweight "Contribuer" action sheet, opened from a park detail screen.
 *
 * The current park is passed in, so none of the three sub-flows asks the user
 * to pick a park again (`?park=<id>` is forwarded). Auth is **not** requested
 * here — each sub-flow asks for an account only at send time (see
 * `lib/contributionDraft.ts`). Reviews are intentionally not offered here.
 */
export function ContributeSheet({
  open,
  onClose,
  parkId,
}: {
  open: boolean;
  onClose: () => void;
  parkId: string;
}) {
  const navigate = useNavigate();

  const go = (to: string) => {
    onClose();
    navigate(to);
  };

  return (
    <BottomSheet open={open} onClose={onClose} snapPoints={[280]} initialSnap={0} showBackdrop>
      <div className={styles.menu}>
        <button className={styles.item} onClick={() => go(`/contribute/edit?park=${parkId}`)}>
          <span className={styles.icon}>
            <Icon name="ic-report-info" size={18} />
          </span>
          Corriger une information
        </button>
        <button className={styles.item} onClick={() => go(`/photo-add?park=${parkId}`)}>
          {/* Pas de pictogramme "photo" validé dans le sprite (DESIGN-SYSTEM §7) — emoji conservé, comme QuickMenu. */}
          <span className={styles.icon}>📷</span>
          Ajouter des photos
        </button>
        <button className={styles.item} onClick={() => go(`/report?park=${parkId}`)}>
          <span className={styles.icon}>
            <Icon name="ic-flag" size={18} />
          </span>
          Signaler un problème
        </button>
      </div>
    </BottomSheet>
  );
}
