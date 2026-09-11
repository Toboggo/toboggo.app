import { useEffect, useRef, type ReactNode } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import clsx from "clsx";
import { Icon, Logo, type IconName } from "@toboggo/design-system";
import { listParks, listPendingMedia, listReports } from "@toboggo/shared";
import { useOrgSession } from "../lib/orgSession";
import { useOrgScope } from "../lib/orgScope";
import { AppHeader } from "./AppHeader";
import styles from "./Shell.module.css";

export interface NavItem {
  to: string;
  label: string;
  /** Sprite icon. Absent (not an emoji fallback) when no symbol in
   * `icons-sprite.svg` reasonably fits — see NAV_ICON_GAPS below. The row
   * keeps a blank, aligned icon slot rather than a mismatched pictogram. */
  icon?: IconName;
  badge?: number;
}

export interface NavGroup {
  title: string;
  items: NavItem[];
}

/**
 * Entrées de navigation sans icône de sprite adaptée (Lot 2 — audit §6 bis /
 * §20). Recherchées dans les 47 symboles existants avant d'écarter l'idée :
 * aucun ne représente raisonnablement une carte, l'entretien ou un journal
 * d'activité sans dénaturer un symbole déjà utilisé ailleurs dans le sprite
 * pour un autre sens. Pas de nouveau SVG dessiné, pas de bibliothèque externe
 * (CLAUDE.md §9) — à fournir par le fondateur (artifact « Brand kit ») pour
 * une passe ultérieure. Documenté ici plutôt que masqué.
 */
export const NAV_ICON_GAPS: Record<string, string> = {
  "/maintenance": "entretien (outil / clé) — aucun symbole du sprite ne convient",
  "/photos": "photo / appareil — aucun symbole du sprite ne convient",
  "/journal": "journal d'activité — aucun symbole du sprite ne convient sans réutiliser ic-list (déjà « Parcs »)",
};

export function buildNavGroups(opts: {
  isAdmin: boolean;
  pendingParks: number;
  openReports: number;
  pendingMedia: number;
}): NavGroup[] {
  const { isAdmin, pendingParks, openReports, pendingMedia } = opts;

  if (isAdmin) {
    return [
      { title: "Pilotage", items: [{ to: "/", label: "Tableau de bord", icon: "ic-dashboard" }] },
      { title: "Parcs", items: [{ to: "/parks", label: "Parcs", icon: "ic-list", badge: pendingParks }] },
      { title: "Exploitation", items: [{ to: "/reports", label: "Signalements", icon: "ic-flag", badge: openReports }] },
      {
        title: "Échanges / Qualité",
        items: [
          { to: "/reviews", label: "Avis", icon: "ic-review" },
          { to: "/photos", label: "Photos", badge: pendingMedia },
        ],
      },
      { title: "Organisation", items: [{ to: "/settings", label: "Équipe & Réglages", icon: "ic-settings" }] },
      { title: "Admin", items: [{ to: "/users", label: "Utilisateurs", icon: "ic-users" }] },
    ];
  }

  return [
    { title: "Pilotage", items: [{ to: "/", label: "Tableau de bord", icon: "ic-dashboard" }] },
    {
      title: "Parcs",
      items: [
        { to: "/parks", label: "Mes parcs", icon: "ic-list", badge: pendingParks },
        { to: "/map", label: "Carte", icon: "ic-explore" },
      ],
    },
    {
      title: "Exploitation",
      items: [
        { to: "/reports", label: "Signalements", icon: "ic-flag", badge: openReports },
        { to: "/maintenance", label: "Entretien" },
      ],
    },
    {
      title: "Échanges / Qualité",
      items: [
        { to: "/reviews", label: "Avis", icon: "ic-review" },
        { to: "/photos", label: "Photos", badge: pendingMedia },
      ],
    },
    {
      title: "Organisation",
      items: [
        { to: "/journal", label: "Journal" },
        { to: "/statistiques", label: "Statistiques", icon: "ic-chart" },
        { to: "/settings", label: "Équipe & Réglages", icon: "ic-settings" },
      ],
    },
  ];
}

export function Shell({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { memberships, communes, activeOrg, setActiveOrg } = useOrgSession();
  const { isAdmin, communeId } = useOrgScope();
  const mainRef = useRef<HTMLElement>(null);
  const isFirstRender = useRef(true);

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

  const groups = buildNavGroups({ isAdmin, pendingParks, openReports, pendingMedia });
  const allItems = groups.flatMap((g) => g.items);
  const currentLabel = allItems.find((item) => item.to === location.pathname)?.label;

  const hasAdmin = memberships.some((m) => m.commune_id === null);
  const communeMemberships = memberships.filter((m) => m.commune_id !== null);

  const orgLabel = isAdmin ? "Toboggo Admin" : (communes.find((c) => c.id === communeId)?.name ?? "Collectivité");

  // Focus (without scrolling the page around) moves to the content region on
  // every route change, so keyboard/screen-reader users land somewhere
  // predictable instead of staying on a now-stale sidebar link. Skipped on
  // first mount — nothing to "return to" yet, and it would steal focus from
  // whatever the browser/user already focused on load.
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    mainRef.current?.focus({ preventScroll: true });
  }, [location.pathname]);

  return (
    <div className="bo-shell">
      <a href="#main-content" className={styles.skipLink}>
        Aller au contenu principal
      </a>
      <aside className={styles.sidebar}>
        <div className={styles.brand}>
          <Logo size={26} tone="light" />
        </div>
        <div className={styles.orgLabel}>{orgLabel}</div>

        {(hasAdmin ? 1 : 0) + communeMemberships.length > 1 && (
          <select
            className={styles.orgSwitch}
            aria-label="Changer d'organisation"
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

        <nav className={styles.nav} aria-label="Navigation principale">
          {groups.map((group) => (
            <div key={group.title} className={styles.group}>
              <div className={styles.groupTitle}>{group.title}</div>
              {group.items.map((item) => {
                const active = location.pathname === item.to;
                return (
                  <button
                    key={item.to}
                    className={clsx(styles.navItem, active && styles.active)}
                    aria-current={active ? "page" : undefined}
                    onClick={() => navigate(item.to)}
                  >
                    <span className={styles.navLabel}>
                      {item.icon ? (
                        <Icon name={item.icon} size={18} />
                      ) : (
                        <span className={styles.navIconSlot} aria-hidden="true" />
                      )}
                      <span className={styles.navLabelText}>{item.label}</span>
                    </span>
                    {!!item.badge && <span className={styles.badge}>{item.badge}</span>}
                  </button>
                );
              })}
            </div>
          ))}
        </nav>
      </aside>
      <div className={styles.column}>
        <AppHeader orgLabel={orgLabel} screenLabel={currentLabel} />
        <main id="main-content" className="bo-content" ref={mainRef} tabIndex={-1}>
          {children}
        </main>
      </div>
    </div>
  );
}
