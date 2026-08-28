import { useState, type ReactNode } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { QuickMenu } from "./QuickMenu";
import styles from "./BottomTabs.module.css";

const PinIcon = (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
    <path d="M12 21s7-6.5 7-12a7 7 0 1 0-14 0c0 5.5 7 12 7 12z" />
    <circle cx="12" cy="9" r="2.5" />
  </svg>
);
const HeartIcon = (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
    <path d="M12 21s-7.5-4.6-10-9.3C.5 7.8 2.7 4 6.5 4c2 0 3.5 1.2 5.5 3.3C14 5.2 15.5 4 17.5 4c3.8 0 6 3.8 4.5 7.7C19.5 16.4 12 21 12 21z" />
  </svg>
);
const ContribIcon = (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M21 15a2 2 0 0 1-2 2H8l-4 4V5a2 2 0 0 1 2-2h13a2 2 0 0 1 2 2z" />
  </svg>
);
const ProfileIcon = (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
    <circle cx="12" cy="8" r="4" />
    <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" />
  </svg>
);

const TABS: { path: string; icon: ReactNode; label: string }[] = [
  { path: "/map", icon: PinIcon, label: "Explorer" },
  { path: "/favorites", icon: HeartIcon, label: "Favoris" },
  { path: "/contributions", icon: ContribIcon, label: "Contributions" },
  { path: "/profile", icon: ProfileIcon, label: "Profil" },
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
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden>
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
            </button>
          </div>
        )}
        {right.map(renderTab)}
      </nav>
      {showAdd && <QuickMenu open={menuOpen} onClose={() => setMenuOpen(false)} />}
    </>
  );
}
