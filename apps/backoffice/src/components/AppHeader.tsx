import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Avatar, Button, Input, Menu, MenuItem, MenuLabel } from "@toboggo/design-system";
import { useOrgSession } from "../lib/orgSession";
import styles from "./AppHeader.module.css";

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
          <Button variant="ghost" className={styles.userTrigger} aria-label={`Menu utilisateur — ${userName}`}>
            <Avatar name={userName} size={24} />
            <span className={styles.userName}>{userName}</span>
          </Button>
        }
      >
        <MenuLabel>
          {userEmail} · {currentRole()}
        </MenuLabel>
        <MenuItem onSelect={() => void signOut()}>Se déconnecter</MenuItem>
      </Menu>
    </header>
  );
}
