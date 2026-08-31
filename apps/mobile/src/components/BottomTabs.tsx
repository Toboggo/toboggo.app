import { useState, type ReactNode } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Icon } from "@toboggo/design-system";
import { QuickMenu } from "./QuickMenu";
import styles from "./BottomTabs.module.css";

// "Contributions" n'a pas encore de pictogramme validé dans le sprite Toboggo
// (docs/DESIGN-SYSTEM.md §7) — SVG conservé en attendant une icône validée.
const ContribIcon = (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M21 15a2 2 0 0 1-2 2H8l-4 4V5a2 2 0 0 1 2-2h13a2 2 0 0 1 2 2z" />
  </svg>
);

const TABS: { path: string; icon: ReactNode; label: string }[] = [
  { path: "/map", icon: <Icon name="ic-explore" size={20} />, label: "Explorer" },
  { path: "/favorites", icon: <Icon name="ic-heart" size={20} />, label: "Favoris" },
  { path: "/contributions", icon: ContribIcon, label: "Contributions" },
  { path: "/profile", icon: <Icon name="ic-user" size={20} />, label: "Profil" },
];

/**
 * Bottom navigation. On every screen except the map (which has its own floating
 * "+" FAB), a raised central "+" opens the QuickMenu — matching the Claude
 * Design prototype's Favoris / Profil tab bars.
 */
export function BottomTabs({ centerAdd = true }: { centerAdd?: boolean }) {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);

  const showAdd = centerAdd && pathname !== "/map";
  const left = TABS.slice(0, 2);
  const right = TABS.slice(2);

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
        {tab.icon}
        <span>{tab.label}</span>
      </button>
    );
  };

  return (
    <>
      <nav className={styles.wrap}>
        {left.map(renderTab)}
        {showAdd && (
          <div className={styles.centerSlot}>
            <button type="button" className={styles.centerFab} onClick={() => setMenuOpen(true)} aria-label="Ajouter">
              <Icon name="ic-plus" size={24} />
            </button>
          </div>
        )}
        {right.map(renderTab)}
      </nav>
      {showAdd && <QuickMenu open={menuOpen} onClose={() => setMenuOpen(false)} />}
    </>
  );
}
