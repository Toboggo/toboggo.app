import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import clsx from "clsx";
import { Avatar, Button, Icon, Input, Menu, MenuItem, MenuLabel } from "@toboggo/design-system";
import type { TeamRole } from "@toboggo/shared";
import { useOrgSession } from "../lib/orgSession";
import { useOrgScope } from "../lib/orgScope";
import styles from "./AppHeader.module.css";

// Mêmes libellés que le sélecteur de rôle d'InviteModal — pas de 2e formulation.
const ROLE_LABEL: Record<TeamRole, string> = {
  super_admin: "Super admin",
  moderation: "Modération",
  support: "Support",
  gestionnaire: "Gestionnaire",
  contributeur: "Contributeur",
};

/**
 * Header applicatif (Lot 2 — audit §6 bis / §20 ; restylé Admin-UI-1 sur la
 * base des maquettes produit). Fil d'Ariane discret à gauche, recherche parcs
 * (utilitaire réel, pas décoratif) et profil calés à droite. Pas de cloche de
 * notifications : aucune donnée de notification back-office n'existe encore
 * (table `notifications` = app parents) — une icône inerte serait un lien
 * mort déguisé, reporté au lot qui la rend réelle.
 */
export function AppHeader({ orgLabel, screenLabel }: { orgLabel: string; screenLabel?: string }) {
  const navigate = useNavigate();
  const { isAdmin } = useOrgScope();
  const { userName, userEmail, currentRole, signOut } = useOrgSession();
  const [query, setQuery] = useState("");
  // `Input` (design-system) n'est pas un `forwardRef` — on cible son <input>
  // interne depuis le wrapper plutôt que de modifier ce composant partagé
  // pour ce seul besoin.
  const searchWrapRef = useRef<HTMLDivElement>(null);

  function submitSearch(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = query.trim();
    navigate(trimmed ? `/parks?q=${encodeURIComponent(trimmed)}` : "/parks");
  }

  // ⌘K / Ctrl+K focus la recherche — raccourci réel, pas un habillage inerte
  // au-dessus d'une recherche qui resterait purement décorative.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        searchWrapRef.current?.querySelector("input")?.focus();
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  const role = currentRole();
  const roleLabel = role ? ROLE_LABEL[role] : null;

  return (
    <header className={clsx(styles.header, isAdmin && styles.adminHeader)}>
      <nav aria-label="Fil d'Ariane" className={styles.breadcrumb}>
        <span>{orgLabel}</span>
        {screenLabel && (
          <>
            <span aria-hidden="true" className={styles.sep}>
              ›
            </span>
            <span className={styles.current}>{screenLabel}</span>
          </>
        )}
      </nav>

      <form role="search" className={styles.search} onSubmit={submitSearch}>
        <div className={styles.searchWrap} ref={searchWrapRef}>
          {isAdmin && (
            <span className={styles.searchIcon} aria-hidden="true">
              <Icon name="ic-search" size={14} />
            </span>
          )}
          <Input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Rechercher un parc…"
            aria-label="Rechercher un parc"
            className={clsx(styles.searchInput, isAdmin && styles.searchInputAdmin)}
          />
          <kbd className={styles.kbdHint} aria-hidden="true">
            ⌘K
          </kbd>
        </div>
      </form>

      <Menu
        label="Menu utilisateur"
        trigger={
          <Button variant="ghost" className={styles.userTrigger} aria-label={`Menu utilisateur — ${userName}`}>
            <Avatar name={userName} size={28} />
            <span className={styles.userMeta}>
              <span className={styles.userName}>{userName}</span>
              {roleLabel && <span className={styles.userRole}>{roleLabel}</span>}
            </span>
            <span className={styles.chevron} aria-hidden="true">
              ⌄
            </span>
          </Button>
        }
      >
        <MenuLabel>
          {userEmail} · {roleLabel ?? role}
        </MenuLabel>
        <MenuItem onSelect={() => void signOut()}>Se déconnecter</MenuItem>
      </Menu>
    </header>
  );
}
