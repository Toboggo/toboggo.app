# Toboggo — instructions pour Claude Code

Localisateur de parcs de jeux enfants. 3 surfaces : app parents (PWA), back-office
(admin Toboggo + collectivités, une seule app), site vitrine statique.
Monorepo npm workspaces. Base Supabase en **coexistence V1/V2** (voir §4). Pour
l'état d'avancement courant (phase, cutover front, déploiements) : ne pas s'y
fier de mémoire — lire `docs/architecture/database-migration.md` §11 CHECKPOINT.

Ce fichier est un **index opérationnel et un garde-fou**, pas la doc complète.
Les sources de vérité détaillées sont listées en §12.

---

## 1. Règles absolues — lire avant toute action

1. **Ne jamais supposer l'état du projet quand il est vérifiable.** Inspecter
   d'abord (repo, `git status`, `git log`, fichiers, Supabase en lecture seule),
   modifier ensuite. Ne pas se fier de mémoire à un chiffre, un chemin, un état.
2. **Supabase / base de données** : ne jamais toucher la production. Voir §4 —
   les interdictions y sont reprises fidèlement de
   `docs/architecture/database-migration.md` et ne doivent pas être reformulées
   d'une manière qui en change le sens.
3. **Git** : ne jamais créer/changer de branche, `git add`/stage, commit ou push
   sans demande explicite de l'utilisateur. Voir §7.
4. **Modifications préexistantes du working tree** : elles appartiennent à
   l'utilisateur jusqu'à preuve du contraire. Ne jamais les écraser ni les
   annuler sans autorisation explicite. Voir §7 et §8.
5. **Design** : ne pas réinventer logo, couleurs, icônes. Voir §9.
6. **Secrets** : aucune clé, URL privée, ref de projet sensible, mot de passe ou
   token dans un fichier suivi (ce fichier inclus).

---

## 2. Architecture du monorepo

| Chemin | Rôle |
|---|---|
| `apps/mobile` | App parents — React 18 + Vite + TS, PWA. Dev sur `:5173`. Mode invité par défaut, login juste-à-temps. |
| `apps/backoffice` | **Une seule** app back-office, role-routée (admin Toboggo *ou* collectivité) via `src/lib/orgSession.ts`. Dev sur `:5174`. |
| `apps/landing` | Site vitrine HTML/CSS/JS **statique, sans build** (pas de `package.json`, donc pas un vrai workspace npm). Formulaire contact = `apps/landing/config.js`. |
| `packages/design-system` | Tokens CSS (`src/tokens.css`) + primitives React + `Logo` + sprite d'icônes. Implémentation exécutable du design. |
| `packages/shared` | Types, client Supabase (`src/supabaseClient.ts`), **couche d'accès données `src/api/*`**, types générés (`src/types/database.types.ts`), utils. |
| `supabase/` | Migrations SQL, RLS, `seed.sql`. Voir §4. |
| `docs/` | Sources de vérité (§12). |
| `design-bundle/` | Dumps JS/HTML du prototype Claude Design d'origine. **Pas le vrai projet** — panorama réel = `IMPLEMENTATION.md`. |
| `backups/` | Dumps de prod, `gitignored`. Ne jamais committer, ne pas servir à un build. |

---

## 3. Commandes

- `npm run dev:mobile` / `npm run dev:backoffice` — dev (lit `.env.local` en priorité sur `.env`).
- `npm run build` — build mobile + backoffice (landing exclue, statique).
- `npm run typecheck` — **obligatoire après toute modification de code TypeScript** ; c'est le gate `tsc -b` des builds.
- `npm run build:mobile` / `npm run build:backoffice` — **à relancer après une modification applicative pertinente**.
- `npm run lint` — **cassé** : ESLint n'est ni installé ni configuré. Ne pas le présenter comme fonctionnel ni s'appuyer dessus tant qu'il n'est pas réparé.
- Preview : `.claude/launch.json` définit `mobile` (:5173) et `backoffice` (:5174).

Stack : React 18, Vite 5, TS 5.6, `@tanstack/react-query`, `zustand`,
`react-router-dom` 6, `maplibre-gl` 5 (fond via `VITE_MAP_STYLE_URL`, OpenFreeMap ;
vide ⇒ carte factice), `@supabase/supabase-js` 2. Back-office : `jspdf`, `papaparse`.

---

## 4. Supabase — production / staging / local

- **Production** : projet Supabase de production **lié** (ref dans
  `supabase/.temp/project-ref` et `docs/architecture/database-migration.md`).
  Schéma migré V1→V2, coexistence V1/V2 active. État exact des migrations
  appliquées : `supabase migration list --linked` (read-only) + `database-migration.md` §11.
- **Staging** : projet « Toboggo Staging » **séparé** (ref ≠ prod), conservé
  actif. Appliqué uniquement via `--db-url`, **jamais `--linked`**. Ref, URL et
  clés restent hors du repo.
- **Local** : `supabase start` + `.env.local` à la racine (gitignored, prioritaire
  sur `.env` en dev). Modèle d'env : `.env.example` (`VITE_SUPABASE_URL`,
  `VITE_SUPABASE_ANON_KEY`, `VITE_MAP_STYLE_URL`).
- **Coexistence V1/V2** : colonnes et tables V1 conservées, triggers
  `*_v1_compat`. `park_public` = vue qui aplatit le modèle V2 et reprojette la
  forme plate V1. Active tant que le fondateur n'a pas confirmé la clôture
  (voir `database-migration.md` §11).
- `supabase/migrations/` : migrations V1 puis V2 incrémental (non destructif) —
  contenu réel = le dossier lui-même. `supabase/migrations-v2-draft/` = cible
  from-scratch de **référence uniquement, NE PAS appliquer**.
  `supabase/_archive_migrations_pre_pdf/` = archive V1.
- ⚠️ **`supabase/README.md` est trompeur** : il décrit la cible draft et
  recommande `supabase db reset --linked` + l'application de `migrations-v2-draft/`
  — ces actions sont **interdites**. `docs/architecture/database-migration.md`
  fait autorité (lire son §11 CHECKPOINT, puis §10).

### INTERDIT (repris de `database-migration.md` §10 — ne pas reformuler)

- ❌ créer la migration `0022+` de legacy cleanup destructif (`DROP` colonnes/tables/policies V1, `DROP` triggers `*_v1_compat`, retour `park_public` à `p.*`) — tant que la coexistence n'est pas explicitement close par le fondateur
- ❌ `supabase migration repair` sur la production
- ❌ `supabase db reset --linked`
- ❌ `supabase db push --linked` vers la production ; toute application de `0007→0021` sur la prod ; toute écriture sur le schéma distant de production
- ❌ modifier rétroactivement `0001 → 0021` (figées ; `local == remote`)
- ❌ supprimer / altérer les colonnes ou tables V1 (`parks.lat/lng/commune_id`, `communes`, `park_edit_history`, `reviews.stars/flagged`, `reports.reason`, `*.commune_id`…) hors `0022+`
- ❌ supprimer / délier le projet STAGING (`Toboggo Staging`, ref ≠ prod) — conservé actif jusqu'à validation post-cutover
- ❌ modifier arbitrairement les 17 parcs réels / les données réelles de prod
- ❌ committer un secret / token / mot de passe DB / ref+URL+clés staging

### AUTORISÉ

- ✅ lecture seule prod : `supabase migration list --linked`, `supabase gen types typescript --linked`, `supabase db query --linked "SELECT …"`, `supabase db dump --linked` (read-only)
- ✅ régénérer `packages/shared/src/types/database.types.ts` via `gen types --linked`
- ✅ smoke tests prod avec comptes/données de test clairement préfixés, supprimés après
- ✅ édition locale de `migrations-v2-draft/` et d'un futur `0022+` (à écrire seulement quand explicitement autorisé)
- ✅ `supabase db reset` / migrations sur base LOCALE isolée ou projet STAGING séparé
- ✅ déploiement du front V2 — période de coexistence

---

## 5. RLS, authentification, rôles

- RLS active sur toutes les tables du schéma `public`. La séparation des rôles est
  **côté serveur** (RLS) ; il n'y a pas de garde par route côté React.
- Enum `team_role` = **5 rôles** : `super_admin`, `moderation`, `support`,
  `gestionnaire`, `contributeur`.
- `team_members.organization_id IS NULL` ⇒ **staff Toboggo** (`is_toboggo_staff` /
  `is_toboggo_admin`, tous droits). Sinon = membre d'une collectivité.
- Helpers RLS : `org_role`, `is_org_member`, `is_org_gestionnaire`,
  `manages_park`, `can_edit_park`.
- **Invite-gating** : un utilisateur auth sans ligne `team_members` voit « Accès
  non autorisé ». La création d'un compte staff/collectivité se fait par INSERT
  SQL manuel (aucune UI — voir `supabase/README.md` §« premier admin »).
- Auth : e-mail/mot de passe + reset + suppression de compte (RPC
  `delete_own_account`). Google OAuth : code présent (activation côté dashboard
  Supabase à vérifier). Apple et téléphone : non branchés. État réel des
  fournisseurs → `IMPLEMENTATION.md` / `docs/RECONCILIATION-2026-08-30.md` (daté).
- `service_role` : jamais côté client ; `.env` ne contient que la clé `anon`.

### Admin Toboggo vs Collectivité

- Une seule app `apps/backoffice`. `src/lib/orgSession.ts` charge `team_members` +
  `organizations`, calcule `activeOrg` de type `admin` | `commune`, gère le
  sélecteur multi-org et `accessDenied`.
- `activeOrg.type === "admin"` → nav `adminItems` (vues filtrées des mêmes
  écrans) ; sinon `communeItems`.
- Périmètre fonctionnel réel des écrans (présents / partiels / absents,
  admin comme collectivité) : `IMPLEMENTATION.md` et
  `docs/RECONCILIATION-2026-08-30.md` (daté) — ne pas le supposer.

---

## 6. Conventions TypeScript

- **Toute la persistance passe par `packages/shared/src/api/*`.** La seule
  exception connue est `apps/backoffice/src/lib/orgSession.ts`. Ne pas appeler
  `supabase` directement depuis un écran.
- `packages/shared/src/types/database.types.ts` est **généré** (`supabase gen
  types`) — ne jamais l'éditer à la main ; le régénérer via `gen types --linked`.
- Interdit d'ajouter `any`, `as any`, `@ts-ignore`, `@ts-expect-error`, ou un
  `DEFAULT` sur une colonne legacy pour faire passer le typecheck.
- Consommer les primitives de `packages/design-system` plutôt que re-styler
  localement.

---

## 7. Git — règles permanentes

- Ne **jamais créer ou changer de branche** sans demande explicite.
- Ne **jamais `git add` / stage** sans demande explicite.
- Ne **jamais commit** sans demande explicite.
- Ne **jamais push** sans demande explicite.
- Ne **jamais `git restore`, `git checkout --`, `git reset`, `git clean` ni
  `git stash`** sur des modifications préexistantes sans autorisation explicite.
- **Toujours exécuter `git status` avant de modifier le repo.**
- Considérer toute modification préexistante du working tree comme appartenant à
  l'utilisateur jusqu'à preuve du contraire.
- Si un commit est demandé : message conventionnel (`feat(...)`, `fix(...)`,
  `docs(...)`), footer `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>`.

---

## 8. État temporaire du workspace (au 31/08/2026 — non permanent)

Instantané indicatif, **à revérifier systématiquement avec `git status`** — il
évolue. **Les règles de protection Git du §7 sont permanentes ; cette liste ne
l'est pas.**

- Modifiés non commités : `CLAUDE.md` et les 3 copies de `icons-sprite.svg`
  (`packages/design-system/src/icons/`, `apps/mobile/public/`,
  `apps/backoffice/public/`).
- Non trackés : `docs/RECONCILIATION-2026-08-30.md`,
  `docs/Toboggo-Brand-Guidelines.pdf`.
- `docs/architecture/database-migration.md` note explicitement que les
  `icons-sprite.svg` et la PDF sont **hors chantier DB : ne pas toucher, ne pas
  stager**.

---

## 9. Design — règles critiques uniquement

Détail et implémentation → **`docs/DESIGN-SYSTEM.md`** (source de vérité
design/UI). Formats et export d'assets (icône d'app,
favicon, splash, Open Graph) → **`docs/identite-visuelle-formats.md`** (source de
vérité **uniquement** pour ce périmètre). Ne pas dupliquer leur contenu ici.

- Ne pas réinventer logo, teintes de marque ou pictogrammes : réutiliser
  l'existant.
- **Toujours passer par les tokens CSS** (`var(--color-*)`, `--space-*`,
  `--radius-*`, …), jamais de hex en dur. Tout nouveau token de
  `packages/design-system/src/tokens.css` doit être répercuté dans
  `apps/landing/styles.css`.
- Logo : composant `packages/design-system/src/components/Logo.tsx`
  (`<Logo />` / `<LogoMark />`) — seule implémentation autorisée en React.
  `apps/landing` duplique le SVG en dur (nav + footer d'`index.html`) : mettre à
  jour les deux. Tracé du « T-toboggan » : montant qui descend puis courbe vers
  la **droite**, boule amber à l'arrivée — ne pas inverser.
- Icônes : sprite `packages/design-system/src/icons/icons-sprite.svg` (+ copies
  `apps/mobile/public/` et `apps/backoffice/public/`). Nouvelle icône = l'ajouter
  comme `<symbol>` dans les **3 copies** + à `IconName` ; ne pas redessiner à la
  main (partir du SVG fourni par le fondateur).
- Décisions fondateur (catégories de signalement, dark mode différé, badge léger
  Admin/Collectivité, etc.) : `docs/DESIGN-SYSTEM.md` §2.
- Les 2 artifacts « références vivantes » ne sont **pas connectés** à Claude
  Code : demander au fondateur le lien ou le SVG plutôt que deviner.

---

## 10. Après modification

- `npm run typecheck` — obligatoire dès qu'un fichier TypeScript est modifié.
- `npm run build:mobile` et/ou `npm run build:backoffice` — après une
  modification applicative pertinente.
- Vérifier en preview (`.claude/launch.json`) quand le changement est observable
  dans le navigateur.
- Ne pas invoquer `npm run lint` (cassé).

---

## 11. Procédure avant toute modification

1. `git status` + `git log --oneline -5` — repérer les modifs préexistantes (§8).
2. Modification design ? → lire `docs/DESIGN-SYSTEM.md`.
3. Modification DB / migration / RLS / types Supabase ? → lire
   `docs/architecture/database-migration.md` §11 puis §10.
4. Vérifier l'état réel (fichiers, Supabase en lecture seule) plutôt que le
   supposer.
5. Décision produit incertaine ? → voir §12.

---

## 12. Sources de vérité

| Sujet | Référence |
|---|---|
| Décisions **produit / fonctionnelles** | **Notion** |
| État **réellement implémenté** | le **repo + Supabase** |
| Chantier DB V2, interdictions, checkpoint | `docs/architecture/database-migration.md` |
| Design / UI et son implémentation | `docs/DESIGN-SYSTEM.md` |
| Formats & export d'assets uniquement | `docs/identite-visuelle-formats.md` |
| Photographie technique **datée du 30/08/2026** (constat, non contractuel — pas une spécification permanente) | `docs/RECONCILIATION-2026-08-30.md` *(non tracké)* |
| Présentation éditoriale de marque (à montrer, pas à coder depuis) | `docs/Toboggo-Brand-Guidelines.pdf` *(non tracké)* |
| Panorama général du produit | `IMPLEMENTATION.md` |
| `README.md` | **Legacy** — décrit l'ancien handoff Claude Design (`chats/`, `project/` absents du repo). N'est plus le point d'entrée. |

**Divergence Notion ↔ repo/Supabase** : si les deux se contredisent, ne pas
modifier silencieusement l'un pour le faire correspondre à l'autre — **signaler
la divergence** à l'utilisateur.
