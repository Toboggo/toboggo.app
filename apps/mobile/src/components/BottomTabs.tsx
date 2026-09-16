import type { ReactNode } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Icon } from "@toboggo/design-system";
import styles from "./BottomTabs.module.css";

// "Contributions" n'a pas encore de pictogramme validé dans le sprite Toboggo
// (docs/DESIGN-SYSTEM.md §7) — SVG conservé en attendant une icône validée.
const ContribIcon = (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M21 15a2 2 0 0 1-2 2H8l-4 4V5a2 2 0 0 1 2-2h13a2 2 0 0 1 2 2z" />
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
 * "+" entry point (see MapExplore's `fabAdd`).
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
