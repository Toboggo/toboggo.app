import { useCallback, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import styles from "./Dialog.module.css";

export interface BottomSheetProps {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  /** Snap heights in px, smallest first. Drag settles to the nearest one. */
  snapPoints?: number[];
  initialSnap?: number;
  showBackdrop?: boolean;
  /** Distance in px to lift the sheet off the bottom edge (e.g. above a tab bar). */
  bottomInset?: number;
}

/**
 * A single, real draggable bottom sheet. The prototype's "two floating windows"
 * bug (a separate preview card stacked on top of this sheet) is intentionally
 * not reproduced — callers render one BottomSheet whose contents switch
 * (preview vs list) rather than mounting a second overlay.
 */
export function BottomSheet({
  open,
  onClose,
  children,
  snapPoints = [200, 340, 560],
  initialSnap = 1,
  showBackdrop = false,
  bottomInset = 0,
}: BottomSheetProps) {
  const [height, setHeight] = useState(snapPoints[initialSnap]);
  const dragState = useRef<{ startY: number; startHeight: number } | null>(null);

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      dragState.current = { startY: e.clientY, startHeight: height };
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
    },
    [height],
  );

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragState.current) return;
    const delta = dragState.current.startY - e.clientY;
    const next = Math.max(120, Math.min(window.innerHeight * 0.9, dragState.current.startHeight + delta));
    setHeight(next);
  }, []);

  const onPointerUp = useCallback(() => {
    dragState.current = null;
    const nearest = snapPoints.reduce((best, p) => (Math.abs(p - height) < Math.abs(best - height) ? p : best));
    if (nearest === snapPoints[0] && height < snapPoints[0] * 0.6) {
      onClose();
      return;
    }
    setHeight(nearest);
  }, [height, snapPoints, onClose]);

  if (!open) return null;

  return createPortal(
    <>
      {showBackdrop && <div className={styles.sheetBackdrop} onClick={onClose} />}
      <div
        className={styles.sheet}
        style={{ height, bottom: bottomInset || undefined, borderRadius: bottomInset ? "26px 26px 0 0" : undefined }}
      >
        <div
          className={styles.grabber}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
        />
        <div className={styles.sheetBody}>{children}</div>
      </div>
    </>,
    document.body,
  );
}
