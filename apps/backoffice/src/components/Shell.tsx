import type { ReactNode } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import clsx from "clsx";
import { Avatar, Icon, Logo, type IconName } from "@toboggo/design-system";
import { listParks, listPendingMedia, listReports } from "@toboggo/shared";
import { useOrgSession } from "../lib/orgSession";
import { useOrgScope } from "../lib/orgScope";
import styles from "./Shell.module.css";

interface NavItem {
  to: string;
  label: string;
  /** Sprite icon (préféré). */
  icon?: IconName;
  /** Emoji de repli — pour les entrées sans icône validée dans le sprite. */
  emoji?: string;
  badge?: number;
}

export function Shell({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { userName, memberships, communes, activeOrg, setActiveOrg, currentRole, signOut } = useOrgSession();
  const { isAdmin, communeId } = useOrgScope();

  const { data: pendingParks = 0 } = useQuery({
    queryKey: ["shell-pending-parks", communeId, isAdmin],
    queryFn: async () => (await listParks({ communeId, status: ["pending"] })).length,
  });
  const { data: openReports = 0 } = useQuery({
    queryKey: ["shell-open-reports", communeId, isAdmin],
    queryFn: async () => (await listReports({ communeId, status: ["open"] })).length,
  });
  const { data: pendingMedia = 0 } = useQuery({
    queryKey: ["shell-pending-media", communeId, isAdmin],
    queryFn: async () => (await listPendingMedia({ communeId })).length,
  });

  const adminItems: NavItem[] = [
    { to: "/", label: "Tableau de bord", icon: "ic-dashboard" },
    { to: "/parks", label: "Parcs", icon: "ic-list", badge: pendingParks },
    { to: "/reports", label: "Signalements", icon: "ic-flag", badge: openReports },
    { to: "/photos", label: "Photos", emoji: "📷", badge: pendingMedia },
    { to: "/users", label: "Utilisateurs", icon: "ic-users" },
    { to: "/reviews", label: "Avis", icon: "ic-review" },
    { to: "/settings", label: "Paramètres", icon: "ic-settings" },
  ];

  // "Carte", "Entretien", "Journal" n'ont pas d'icône dédiée dans le sprite
  // (docs/DESIGN-SYSTEM.md §7) — emoji conservé en attendant.
  const communeItems: NavItem[] = [
    { to: "/", label: "Tableau de bord", icon: "ic-dashboard" },
    { to: "/parks", label: "Mes parcs", icon: "ic-list", badge: pendingParks },
    { to: "/map", label: "Carte", emoji: "🗺️" },
    { to: "/maintenance", label: "Entretien", emoji: "🔧" },
    { to: "/journal", label: "Journal", emoji: "📓" },
    { to: "/statistiques", label: "Statistiques", icon: "ic-chart" },
    { to: "/reports", label: "Signalements", icon: "ic-flag", badge: openReports },
    { to: "/photos", label: "Photos", emoji: "📷", badge: pendingMedia },
    { to: "/reviews", label: "Avis", icon: "ic-review" },
    { to: "/settings", label: "Paramètres", icon: "ic-settings" },
  ];

  const items = isAdmin ? adminItems : communeItems;
  const hasAdmin = memberships.some((m) => m.commune_id === null);
  const communeMemberships = memberships.filter((m) => m.commune_id !== null);

  const orgLabel = isAdmin ? "Toboggo Admin" : communes.find((c) => c.id === communeId)?.name ?? "Collectivité";

  return (
    <div className="bo-shell">
      <aside className={styles.sidebar}>
        <div className={styles.brand}>
          <Logo size={26} tone="light" />
        </div>
        <div className={styles.orgLabel}>{orgLabel}</div>

        {(hasAdmin ? 1 : 0) + communeMemberships.length > 1 && (
          <select
            className={styles.orgSwitch}
            value={isAdmin ? "admin" : communeId}
            onChange={(e) =>
              setActiveOrg(e.target.value === "admin" ? { type: "admin" } : { type: "commune", communeId: e.target.value })
            }
          >
            {hasAdmin && <option value="admin">Toboggo Admin</option>}
            {communeMemberships.map((m) => (
              <option key={m.commune_id} value={m.commune_id!}>
                {communes.find((c) => c.id === m.commune_id)?.name ?? m.commune_id}
              </option>
            ))}
          </select>
        )}

        <nav className={styles.nav}>
          {items.map((item) => (
            <button
              key={item.to}
              className={clsx(styles.navItem, pathname === item.to && styles.active)}
              onClick={() => navigate(item.to)}
            >
              <span className={styles.navLabel}>
                {item.icon ? (
                  <Icon name={item.icon} size={18} />
                ) : (
                  <span className={styles.navEmoji}>{item.emoji}</span>
                )}
                {item.label}
              </span>
              {!!item.badge && <span className={styles.badge}>{item.badge}</span>}
            </button>
          ))}
        </nav>

        <div className={styles.footer}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
            <Avatar name={userName} size={30} />
            <div>
              <div className={styles.footerName}>{userName}</div>
              <div style={{ opacity: 0.6 }}>{currentRole()}</div>
            </div>
          </div>
          <button className={styles.logoutBtn} onClick={() => signOut()}>
            Se déconnecter
          </button>
        </div>
      </aside>
      <main className="bo-content">{children}</main>
    </div>
  );
}
