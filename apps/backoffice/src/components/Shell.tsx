import type { ReactNode } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import clsx from "clsx";
import { Avatar, Logo } from "@toboggo/design-system";
import { listParks, listReports } from "@toboggo/shared";
import { useOrgSession } from "../lib/orgSession";
import { useOrgScope } from "../lib/orgScope";
import styles from "./Shell.module.css";

interface NavItem {
  to: string;
  label: string;
  icon: string;
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

  const adminItems: NavItem[] = [
    { to: "/", label: "Tableau de bord", icon: "📊" },
    { to: "/parks", label: "Parcs", icon: "🛝", badge: pendingParks },
    { to: "/reports", label: "Signalements", icon: "⚠️", badge: openReports },
    { to: "/users", label: "Utilisateurs", icon: "👥" },
    { to: "/reviews", label: "Avis", icon: "⭐" },
    { to: "/settings", label: "Paramètres", icon: "⚙️" },
  ];

  const communeItems: NavItem[] = [
    { to: "/", label: "Tableau de bord", icon: "📊" },
    { to: "/parks", label: "Mes parcs", icon: "🛝", badge: pendingParks },
    { to: "/map", label: "Carte", icon: "🗺️" },
    { to: "/maintenance", label: "Entretien", icon: "🔧" },
    { to: "/journal", label: "Journal", icon: "📓" },
    { to: "/statistiques", label: "Statistiques", icon: "📈" },
    { to: "/reports", label: "Signalements", icon: "⚠️", badge: openReports },
    { to: "/reviews", label: "Avis", icon: "⭐" },
    { to: "/settings", label: "Paramètres", icon: "⚙️" },
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
              <span>
                {item.icon} {item.label}
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
