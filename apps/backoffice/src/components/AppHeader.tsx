import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Avatar, Button, Input, Menu, MenuItem, MenuLabel } from "@toboggo/design-system";
import type { TeamRole } from "@toboggo/shared";
import { useOrgSession } from "../lib/orgSession";
import styles from "./AppHeader.module.css";

/** Libellés lisibles des 5 rôles `team_role` — l'enum brut (`gestionnaire`,
 * `contributeur`…) n'a encore de traduction nulle part côté BO (cf.
 * `InviteModal`, qui ne traduit que 2 des 5). Affiché ici pour la première
 * fois hors dropdown : doit rester lisible pour une mairie en démo. */
const ROLE_LABEL: Record<TeamRole, string> = {
  super_admin: "Administrateur",
  moderation: "Modération",
  support: "Support",
  gestionnaire: "Gestionnaire",
  contributeur: "Contributeur",
};

/**
 * Header applicatif (Lot 2 — audit §6 bis / §20). Fil d'Ariane discret à
 * gauche, recherche parcs (utilitaire secondaire) et menu utilisateur calés à
 * droite. Pas de cloche de notifications : aucune donnée de notification
 * back-office n'existe encore (table `notifications` = app parents) — une
 * icône inerte serait un lien mort déguisé, reporté au lot qui la rend réelle.
 */
export function AppHeader({ orgLabel, screenLabel }: { orgLabel: string; screenLabel?: string }) {
  const navigate = useNavigate();
  const { userName, userEmail, currentRole, signOut } = useOrgSession();
  const [query, setQuery] = useState("");
  const role = currentRole();
  const roleLabel = role ? ROLE_LABEL[role] : null;

  function submitSearch(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = query.trim();
    navigate(trimmed ? `/parks?q=${encodeURIComponent(trimmed)}` : "/parks");
  }

  return (
    <header className={styles.header}>
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
        <Input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Rechercher un parc…"
          aria-label="Rechercher un parc"
        />
      </form>

      <Menu
        label="Menu utilisateur"
        trigger={
          <Button variant="ghost" className={styles.userTrigger} aria-label={`Menu utilisateur — ${userName}${roleLabel ? `, ${roleLabel}` : ""}`}>
            <Avatar name={userName} size={30} />
            <span className={styles.userMeta}>
              <span className={styles.userName}>{userName}</span>
              {roleLabel && <span className={styles.userRole}>{roleLabel}</span>}
            </span>
          </Button>
        }
      >
        <MenuLabel>{userEmail}</MenuLabel>
        <MenuItem onSelect={() => void signOut()}>Se déconnecter</MenuItem>
      </Menu>
    </header>
  );
}
