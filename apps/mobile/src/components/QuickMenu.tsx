import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Icon, type IconName } from "@toboggo/design-system";
import styles from "./QuickMenuPopover.module.css";

type QuickItem = { iconName: IconName; labelKey: string; to: string };

// « Plus d'actions » (/more-actions) ne contenait que « Ajouter une photo » et
// « Poser une question », déjà listées ici : l'entrée est retirée sans perte.
// « Poser une question » ouvre « Nous contacter » (/contact), accessible sans connexion.
const ITEMS: QuickItem[] = [
  { iconName: "ic-plus", labelKey: "menu.addPark", to: "/action-intro/add" },
  { iconName: "ic-camera", labelKey: "menu.addPhoto", to: "/photo-add" },
  { iconName: "ic-review", labelKey: "menu.rate", to: "/rate" },
  { iconName: "ic-flag", labelKey: "menu.report", to: "/report" },
  { iconName: "ic-question", labelKey: "menu.ask", to: "/contact" },
];

const MARGIN = 16;
const GAP = 10;
const MAX_WIDTH = 300;

type Placement = { width: number; right: number; bottom?: number; top?: number };

function computePlacement(anchor: HTMLElement): Placement {
  const rect = anchor.getBoundingClientRect();
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const width = Math.min(MAX_WIDTH, vw - MARGIN * 2);
  // Aligné sur le bord droit du bouton, sans sortir de l'écran.
  const right = Math.min(Math.max(vw - rect.right, MARGIN), vw - MARGIN - width);
  const spaceAbove = rect.top - GAP - MARGIN;
  // Au-dessus du bouton (cas normal) ; en dessous s'il manque de la place.
  return spaceAbove >= 260
    ? { width, right, bottom: vh - rect.top + GAP }
    : { width, right, top: rect.bottom + GAP };
}

export function QuickMenu({
  open,
  onClose,
  anchorRef,
  id,
  label,
}: {
  open: boolean;
  onClose: () => void;
  anchorRef: RefObject<HTMLElement>;
  id: string;
  label: string;
}) {
  const navigate = useNavigate();
  const { t } = useTranslation("contribute");
  const menuRef = useRef<HTMLDivElement>(null);
  const [placement, setPlacement] = useState<Placement | null>(null);

  const close = useCallback(
    (restoreFocus: boolean) => {
      onClose();
      if (restoreFocus) anchorRef.current?.focus();
    },
    [onClose, anchorRef],
  );

  useLayoutEffect(() => {
    if (!open) {
      setPlacement(null);
      return;
    }
    const update = () => {
      if (anchorRef.current) setPlacement(computePlacement(anchorRef.current));
    };
    update();
    window.addEventListener("resize", update);
    window.addEventListener("orientationchange", update);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("orientationchange", update);
    };
  }, [open, anchorRef]);

  useEffect(() => {
    if (open && placement) {
      const first = menuRef.current?.querySelector<HTMLElement>('[role="menuitem"]');
      if (document.activeElement === anchorRef.current || !menuRef.current?.contains(document.activeElement)) first?.focus();
    }
    // Focus uniquement à l'ouverture (placement passe de null à défini).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, placement === null]);

  if (!open || !placement) return null;

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.stopPropagation();
      close(true);
      return;
    }
    const items = Array.from(menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? []);
    const idx = items.indexOf(document.activeElement as HTMLElement);
    if (e.key === "ArrowDown") {
      e.preventDefault();
      items[(idx + 1) % items.length]?.focus();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      items[(idx - 1 + items.length) % items.length]?.focus();
    } else if (e.key === "Home") {
      e.preventDefault();
      items[0]?.focus();
    } else if (e.key === "End") {
      e.preventDefault();
      items[items.length - 1]?.focus();
    } else if (e.key === "Tab") {
      // Le menu est modal léger : Tab ferme et rend le focus au bouton.
      close(true);
    }
  };

  return createPortal(
    <div className={styles.layer} onKeyDown={onKeyDown}>
      <div
        className={styles.backdrop}
        aria-hidden
        onClick={(e) => {
          e.stopPropagation();
          close(true);
        }}
      />
      <div
        id={id}
        ref={menuRef}
        role="menu"
        aria-label={label}
        className={styles.menu}
        style={{ width: placement.width, right: placement.right, bottom: placement.bottom, top: placement.top }}
      >
        {ITEMS.map((item) => (
          <button
            key={item.labelKey}
            type="button"
            role="menuitem"
            className={styles.item}
            onClick={() => {
              close(false);
              // No auth gate here: a contribution can be started signed out and
              // asks for an account only at send time.
              navigate(item.to);
            }}
          >
            <Icon name={item.iconName} size={22} />
            <span>{t(item.labelKey)}</span>
          </button>
        ))}
      </div>
    </div>,
    document.body,
  );
}
