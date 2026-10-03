import type { ReactNode } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Icon } from "@toboggo/design-system";
import styles from "./BottomTabs.module.css";

// "Mes ajouts" : pictogramme History (horloge + flèche circulaire), tracé
// stroke 24×24 identique aux autres pictos de la navbar. Absent du sprite Toboggo.
const ContribIcon = (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
    <path d="M3 3v5h5" />
    <path d="M12 7v5l4 2" />
  </svg>
);

const TABS: { path: string; icon: ReactNode; labelKey: string }[] = [
  { path: "/map", icon: <Icon name="ic-explore" size={20} />, labelKey: "nav.explore" },
  { path: "/favorites", icon: <Icon name="ic-heart" size={20} />, labelKey: "nav.favorites" },
  { path: "/contributions", icon: ContribIcon, labelKey: "nav.contributions" },
  { path: "/profile", icon: <Icon name="ic-user" size={20} />, labelKey: "nav.profile" },
];

/**
 * Bottom navigation — the 4 root destinations only. Contribution actions
 * ("+") are never part of it; the map's own floating FAB is the sole
 * "+" entry point (see MapExplore's `fabAdd`). Same floating dock on every
 * screen, Explorer included — the map's bottom sheet is docked (painted
 * behind it, see BottomSheet's non-floating mode) precisely so this one
 * nav never has to change shape to sit above it.
 */
export function BottomTabs() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { t } = useTranslation();

  const renderTab = (tab: (typeof TABS)[number]) => {
    const active = pathname === tab.path;
    return (
      <button
        key={tab.path}
        type="button"
        className={styles.tab}
        data-active={active ? "1" : undefined}
        onClick={() => navigate(tab.path)}
      >
        <span className={styles.tabIcon}>{tab.icon}</span>
        <span>{t(tab.labelKey)}</span>
      </button>
    );
  };

  return (
    <nav className={styles.wrap}>
      {TABS.map(renderTab)}
    </nav>
  );
}
