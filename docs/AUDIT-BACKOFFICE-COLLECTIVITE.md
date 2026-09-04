# Audit — Back Office Collectivité Toboggo

> **Nature du document** : audit d'écart réalisé **avant toute implémentation**, sur la
> branche `feature/backoffice-collectivite` (worktree `toboggo-wt-backoffice`).
> Aucune ligne de code applicatif, aucune migration, aucun composant n'a été modifié
> pour produire ce document. C'est un **constat daté (2026-09-04)**, non contractuel.
>
> **Périmètre** : `apps/backoffice` (l'application back-office unique, role-routée
> admin Toboggo / collectivité), sa couche d'accès `packages/shared/src/api/*`, le
> design system `packages/design-system`, et le schéma Supabase (`supabase/migrations`,
> lecture seule). L'accent est mis sur la **surface Collectivité** ; la surface Admin
> est traitée là où elle partage le même code.
>
> **Limite majeure de cet audit** : les **maquettes de référence UX/UI du BO
> Collectivité ne sont pas dans le dépôt et ne sont pas connectées à Claude Code**
> (ce sont les « artifacts / références vivantes » mentionnés dans `CLAUDE.md` §9 et
> `docs/DESIGN-SYSTEM.md` §1, non synchronisés). Le dossier `design-bundle/` contient
> **le prototype de l'app parents**, pas le BO. Par conséquent, la section
> « Écart avec les maquettes » ne peut établir la conformité écran par écran : elle
> décrit la structure attendue (déduite de la liste de domaines fournie + patterns
> SaaS) et **ce qui devra être confronté aux maquettes dès qu'elles seront fournies**.

---

## 1. Résumé exécutif

Le back-office existant est une **application fonctionnelle mais volontairement
minimale**, à peu près à l'état « MVP interne » : ~2 300 lignes, 11 routes, 13 écrans,
6 composants, **aucune page de détail** (tout passe par des modales). Il est
réellement branché sur Supabase (prod V2, coexistence V1/V2 active) et effectue de
vraies écritures.

Points forts à conserver :

- L'ossature technique est saine : React 18 + Vite 5 + TS strict, `react-router` 6,
  `@tanstack/react-query`, `zustand` pour la session, **toute la persistance passe
  par `packages/shared/src/api/*`** (règle `CLAUDE.md` §6 respectée, à une exception
  près documentée : `orgSession.ts`).
- Le **role-routing admin / collectivité** via `orgSession` + `orgScope` est propre
  et extensible (sélecteur multi-organisation, `accessDenied` par invite-gating).
- Le **design system existe** (tokens, primitives, sprite d'icônes, `Logo`) et est
  la bonne fondation.
- Les flux réellement câblés — validation de parc, triage de signalement, modération
  photo, réponse aux avis, invitation d'équipe, export CSV, rapport PDF — sont
  cohérents et scopés par RLS côté serveur.

Écarts structurants :

1. **~35–45 écrans/sous-écrans attendus n'existent pas** (interventions, contrôles &
   inspections + checklists, inventaire d'équipements, cycle de vie équipement,
   infos à vérifier, planning global, messages, centre de notifications + préférences,
   rapports & conformité, abonnement/quotas, intégrations, exports automatiques,
   centre d'aide, page profil, gestion fine des rôles…). La base de données V2 est
   **beaucoup plus riche que ce que le BO expose** (`park_zones`, `park_equipment`,
   `park_entrances`, `park_opening_hours`, `park_edits`, `park_scores`,
   `park_attribute_sources`, catalogue `features`… : tables présentes, **0 écran**).
2. **Le design system n'est quasiment pas adopté dans le BO** : `<Icon>` n'est utilisé
   que dans la nav ; partout ailleurs = **emojis + `style={{}}` inline + hex en dur**.
   C'est la phase DESIGN-8 (`docs/DESIGN-SYSTEM.md` §11), non démarrée. Contradiction
   directe avec les décisions fondateur #5 (BO = même système d'icônes, plus sobre) et
   #6 (aucun emoji comme pictogramme d'interface).
3. **Bugs d'intégrité de données dans le chemin d'écriture des parcs** (voir §13/§14) :
   coordonnées factices `45.75 / 4.85` injectées à la création, `commune_id` non
   renseigné pour un parc créé par une collectivité → **le parc peut disparaître de
   « Mes parcs »**.
4. **Pas de garde par rôle côté client** : un `contributeur` voit tous les écrans et
   tous les boutons ; la protection repose entièrement sur la RLS. Acceptable si la
   RLS est exhaustive, mais l'UX est trompeuse (boutons qui échoueront).
5. **États `loading` / `error` / `empty` très pauvres** : pas d'`ErrorBoundary`, une
   requête en échec ressemble à un écran vide, pas de `Skeleton`, feedback après
   action inexistant (aucun toast), `window.confirm` / `alert()` natifs partout.
6. **Pas de header applicatif** (barre supérieure avec fil d'Ariane, recherche
   globale, notifications, menu utilisateur) — la nav et l'identité vivent uniquement
   dans la sidebar.

Le parcours réel d'une collectivité (§ « Parcours ») est **partiellement utilisable
aujourd'hui pour de la consultation et du triage léger**, mais **pas pour de
l'exploitation opérationnelle** (gestion d'équipements, contrôles réglementaires,
interventions, conformité).

---

## 2. État global estimé

| Axe | Estimation | Base de l'estimation |
|---|---|---|
| **Couverture fonctionnelle** vs cible « BO collectivité opérationnel » | **~15–20 %** | ~8 domaines sur ~45 adressés, la plupart en version partielle |
| **Profondeur des écrans existants** (détail, sous-onglets, actions) | **~30–40 %** | listes OK, détails en modale minimale, pas de sous-onglets métier |
| **Conformité design system** (tokens, primitives, icônes) | **~20 %** | DS consommé dans la nav + quelques primitives ; inline styles + emojis ailleurs |
| **Conformité aux maquettes de référence** | **non mesurable** | maquettes absentes du dépôt (cf. avertissement en tête) |
| **Fiabilité des données affichées** (réelles vs proxy/vides) | **~55 %** | vraies lectures Supabase, mais plusieurs métriques sont des proxys ou vides en prod |
| **Solidité du chemin d'écriture** | **~60 %** | écritures réelles fonctionnelles, mais 2–3 bugs d'intégrité sur les parcs |
| **Accessibilité** | **~25 %** | primitives partiellement ARIA, mais modales sans focus-trap, emojis non labellisés, etc. |
| **Responsive** | **~40 %** | sidebar→bottom-bar < 860px, mais grilles fixes, bottom-bar surchargée |

> **Lecture d'ensemble** : le socle est bon, mais le produit est à ~1/5 de la cible
> décrite par la liste de domaines. L'essentiel du travail restant est de la
> **création d'écrans métier** + une **passe design system** + le **durcissement du
> chemin d'écriture**.

---

## 3. Architecture actuelle

### 3.1 Stack

| Élément | Détail |
|---|---|
| Framework | React 18.3 + Vite 5.4 + TypeScript 5.6 (`tsc -b` = gate de build) |
| Routing | `react-router-dom` 6.27, `BrowserRouter`, routes plates dans `App.tsx` |
| Données serveur | `@tanstack/react-query` 5.59 (`staleTime` 30 s, `retry` 1) |
| État client | `zustand` 5 — un seul store : `src/lib/orgSession.ts` |
| Carte | `maplibre-gl` 5 (fond via `VITE_MAP_STYLE_URL`, OpenFreeMap ; vide ⇒ écran « Carte indisponible ») |
| Divers | `jspdf` 2.5 (rapport mensuel), `papaparse` 5.4 (import CSV), `clsx` |
| Design | `@toboggo/design-system` (tokens CSS + primitives) — alias Vite vers `packages/*/src` |
| Backend | `@toboggo/shared` → `@supabase/supabase-js` 2.45, clé `anon` uniquement |

### 3.2 Arborescence `apps/backoffice/src`

```
App.tsx                 Routes + gate (loading / login / accessDenied) + useIconSprite
main.tsx                Providers (QueryClient, BrowserRouter, StrictMode)
index.css               .bo-shell (flex), .bo-content (padding), 1 breakpoint 860px
lib/
  orgSession.ts         zustand — session, memberships, communes, activeOrg, rôles  (⚠ seul accès supabase direct autorisé)
  orgScope.ts           dérive {isAdmin, communeId} depuis activeOrg
  queryClient.ts        config react-query
  equipmentLabels.ts    SERVICE_LABEL (7 entrées) — DOUBLON partiel de @toboggo/shared
components/
  Shell.tsx             Sidebar (brand, orgLabel, org switch <select>, nav, footer user)
  PageHeader.tsx        titre + sous-titre + actions (pas de fil d'Ariane, pas de retour)
  StatusTag.tsx         ParkStatusTag / ReportStatusTag (mapping label + tone)
  ParkModal.tsx         272 l — « fiche parc » : infos, chips services/jeux, description, photos, historique, actions statut
  ReportModal.tsx       156 l — détail + résolution/rejet/réouverture + photo après + « contrôle de suivi »
  MaintenanceModal.tsx  édition/suppression d'une inspection
  InviteModal.tsx       nom + email + rôle → signInWithOtp + INSERT team_members
screens/  (13)
  Login · AccessDenied · Dashboard · Parks · MapScreen · Maintenance ·
  Reports · Reviews · Photos · Users · Journal · Statistiques · Settings
```

### 3.3 Session & périmètre

- `orgSession.init()` : `getSession()` → charge `team_members` (par `user_id`) →
  charge `organizations` liées → calcule `activeOrg` (`admin` si une ligne a
  `commune_id === null`, sinon 1ʳᵉ commune) → `accessDenied` si 0 ligne
  `team_members`.
- `currentRole()` / `isGestionnaireOrAbove()` (= `gestionnaire | super_admin |
  moderation`) exposés par le store et recalculés dans chaque écran.
- **Aucune garde de route** : `CLAUDE.md` §5 le rappelle (« la séparation des rôles
  est côté serveur »). Conséquence UX : tout est visible/cliquable pour tous.

### 3.4 Cohérence multi-tenant (⚠ hétérogène)

| Donnée | Filtre commune utilisé | Source |
|---|---|---|
| Parcs | `park_public.commune_id` (colonne **V1**) | `listParks({communeId})` |
| Signalements | jointure via `organization_parks` (**V2**) | `listReports` |
| Avis | jointure via `organization_parks` (**V2**) | `listReviews` |
| Entretien | `maintenance.organization_id` (**V2**) | `listMaintenance` |
| Journal / activité | `activity_log.organization_id` (**V2**) | `listActivity` |

Trois mécanismes de rattachement coexistent (`parks.commune_id` V1,
`organization_parks` V2, `*.organization_id` V2). C'est tenu tant que les 17 parcs
historiques ont **à la fois** leur `commune_id` V1 et leur ligne `organization_parks`
(backfill migration 0008/0016). **Un parc créé depuis le BO ne renseigne que
`organization_parks`** → cf. bug P0-1 (§13).

---

## 4. Cartographie des routes / écrans

| Route | Écran | Fichier | Rendu détail | Nav admin | Nav commune |
|---|---|---|---|---|---|
| `/` | Tableau de bord | `screens/Dashboard.tsx` | — | ✅ | ✅ |
| `/parks` | Parcs / Mes parcs | `screens/Parks.tsx` + `ParkModal` | **modale** | ✅ (badge) | ✅ (badge) |
| `/map` | Carte | `screens/MapScreen.tsx` + `ParkModal`/`ReportModal` | modale | ❌ | ✅ |
| `/maintenance` | Entretien | `screens/Maintenance.tsx` + `MaintenanceModal` | modale | ❌ | ✅ |
| `/reports` | Signalements | `screens/Reports.tsx` + `ReportModal` | **modale** | ✅ (badge) | ✅ (badge) |
| `/reviews` | Avis | `screens/Reviews.tsx` | inline (pas de détail) | ✅ | ✅ |
| `/photos` | Photos à valider | `screens/Photos.tsx` | inline (grille) | ✅ (badge) | ✅ (badge) |
| `/users` | Utilisateurs | `screens/Users.tsx` | inline | ✅ | ❌ |
| `/journal` | Journal | `screens/Journal.tsx` | — | ❌ | ✅ |
| `/statistiques` | Statistiques | `screens/Statistiques.tsx` | — | ❌ | ✅ |
| `/settings` | Paramètres | `screens/Settings.tsx` + `InviteModal` | — | ✅ | ✅ |
| `*` | — | redirection `/` | — | — | — |

**Constat clé** : 0 route de détail (`/parks/:id`, `/reports/:id`…). Tout le détail
est en `Dialog` (modale centrée, sans URL, sans deep-link, sans historique
navigateur, sans partage de lien). Les listes n'ont ni pagination, ni tri
colonne, ni sélection multiple, ni actions groupées.

---

## 5. Tableau complet écran par écran / fonctionnalité par fonctionnalité

Légende priorité : **P0** = bloquant lancement / intégrité · **P1** = attendu pour un
usage réel · **P2** = confort / complétude · **P3** = amélioration.

### 5.1 Écrans EXISTANTS

#### Tableau de bord — `/` · `screens/Dashboard.tsx`
- **Existe** : oui. **Finition** : moyenne. **Conformité maquette** : à confronter.
- **Données** : `listParks`, `listReports`, `listReviews`, `listActivity` (scopées).
  Toutes **réelles** (Supabase).
- **Actions fonctionnelles** : `StatCard` cliquables → navigation ; liste « À traiter »
  → navigation. Pas d'action directe (valider/traiter) depuis le dashboard.
- **Permissions** : lecture pour tout membre ; pas de variation d'action par rôle.
- **Problèmes UX** : « Activité récente » et « À traiter » redondants ; pas de notion
  de période ; pas de tri de priorité ; « À traiter » n'agrège que parcs en attente +
  signalements ouverts + avis ≤2★ (rien sur photos en attente, infos à vérifier,
  contrôles à échéance, interventions). Pas d'empty-state illustré.
- **Problèmes UI** : grille `2fr 1fr` sans breakpoint mobile ; `<h2>` inline ;
  puce d'activité = `<span>` rond en `background: var(--color-primary)` en dur.
- **Données douteuses** : admin « Utilisateurs actifs » = `new Set(reports.map(r =>
  r.user_id)).size` → **proxy faux** (0 signalement en prod ⇒ 0). « Note moyenne » =
  moyenne des `park.rating` (0 avis en prod ⇒ « — »).
- **Manque** : widgets « ce qui demande une action » réellement exhaustifs, raccourcis
  vers contrôles/interventions/infos à vérifier, sélecteur de période, graphe de
  tendance, météo/alertes (dispo côté shared `utils/weather.ts`, non utilisée ici).
- **Priorité** : refonte contenu **P1** ; tokenisation **P2**.

#### Parcs / Mes parcs — `/parks` · `screens/Parks.tsx` (+ `ParkModal`)
- **Existe** : oui. **Finition** : moyenne. **Conformité** : à confronter (liste
  simple type « cartes empilées », pas un tableau dense).
- **Données** : `listParks({communeId})` **réelles**. Onglets par statut, recherche
  nom/adresse **client**. Pas de pagination.
- **Actions** :
  - `+ Ajouter un parc` (collectivité, `canManage`) → `ParkModal "new"` → `createPark`
    **réel**.
  - `Importer CSV` (collectivité, `canManage`) → `parseCsv` + boucle `createPark`
    **réelle**.
  - `Exporter CSV` (tous) → `downloadCsv` **réel**.
  - Ligne « en attente » + `canManage` → `Valider` / `Refuser` → `setParkStatus`
    **réel** (`moderation_status`).
- **Permissions** : lecture = membre ; écriture = `isAdmin || isGestionnaireOrAbove()`.
  ⚠ `ParkModal` en création force `status: "published"` **quel que soit le rôle** →
  un `contributeur` (si RLS le permet) publierait sans validation. Incohérent avec
  l'import CSV qui met `pending` pour un contributeur.
- **Problèmes UX** : la « fiche » est une modale (pas d'URL, pas d'onglets), donc pas
  d'espace pour équipements physiques / zones / horaires / entrées / sources /
  accessibilité / sécurité / environnement. `+ Ajouter un parc` **ne demande ni
  n'affiche de coordonnées** → géocodage absent. Import CSV : pas d'aperçu, pas de
  rapport d'erreurs, dédup naïve (`name === name && address === address`), `await`
  séquentiel sans barre de progression.
- **Problèmes UI** : `<button>` de ligne contenant d'autres `<button>` (interactif
  imbriqué, invalide) contourné par un `<div onClick={stopPropagation}>` ; « Importer
  CSV » stylé à la main (`<span>` avec padding/border/hex de token en dur) au lieu
  d'un `Button` + input caché.
- **Bugs** :
  - **P0-1** : parc créé par une collectivité → `parks.commune_id` reste `NULL`
    (seul `organization_parks` est écrit) → **absent de `listParks({communeId})`**,
    des compteurs dashboard, des stats, de la carte de cette collectivité.
  - **P0-2** : `createPark` (modale ET import) injecte `lat: 45.75, lng: 4.85`
    (centre de Lyon) — viole l'interdiction d'inventer des coordonnées
    (`packages/shared/src/api/parks.ts` en-tête, `docs/architecture/database-migration.md`
    §5). Tous les parcs BO se superposent à un point faux.
  - **P2** : `findDuplicateParks` (RPC + wrapper shared) **jamais appelé** avant
    création.
- **Manque** : tableau dense triable, filtres (âge, équipements, statut de
  vérification, score, dernière visite), sélection multiple + actions groupées,
  colonnes « dernier contrôle / prochain contrôle / signalements ouverts », page de
  détail avec onglets, géocodage à la saisie, garde-fou anti-doublon.
- **Priorité** : P0-1 / P0-2 **P0** ; page de détail **P1** ; tableau/filtres **P1**.

#### Détail d'un parc — `components/ParkModal.tsx` (modale, pas de route)
- **Existe** : partiellement, en modale. **Finition** : faible pour la cible.
- **Champs éditables** : nom, adresse (texte libre), âge min/max, chips « services »
  (7 : WC, ombragé, clôturé, PMR, bancs, point d'eau, parking), chips « jeux »
  (10 codes **bruts affichés tels quels** : `toboggan`, `swing`… alors que
  `@toboggo/shared` expose `PLAY_EQUIPMENT_LABEL`), description, photos (upload +
  suppression + définir couverture), historique (lecture `audit_log`).
- **Données** : lecture `park_public` (forme plate V1), écriture via `updatePark`
  (split vers `parks` + `park_features` + `organization_parks`). **Réelles**.
- **Actions statut** : Valider / Refuser / Bloquer / Débloquer / Retirer — **réelles**
  (`setParkStatus`, `deletePark`), journalisées (`logActivity`).
- **Problèmes** :
  - Sous-modèle V2 **non exposé** : `park_zones`, `park_equipment` (inventaire
    physique : fabricant, modèle, condition, dates d'inspection), `park_entrances`,
    `park_opening_hours`, `park_sources` / `external_ids` (provenance), `park_names`,
    `park_scores` (Toboggo Score), `verification_status`, `operational_status`,
    `park_attribute_sources` (provenance au champ). Tout ça a une API dans
    `packages/shared/src/api/parkDetails.ts` et `features.ts` — **0 call site BO**.
  - Toggle « chips » à 2 états seulement (présent / absent) alors que
    `park_features` gère `available | unavailable | unknown |
    temporarily_unavailable` (dette D4 déjà signalée côté mobile : non coché ⇒
    `unavailable` au lieu de `unknown`).
  - `EQUIPMENT` (liste des jeux) codée en dur dans le composant, pas issue du
    catalogue `features`.
  - Fermeture par clic sur le fond (`Dialog`) sans confirmation → perte de saisie.
- **Priorité** : transformer en page à onglets **P1** ; brancher zones/équipements
  **P1** ; horaires/entrées/provenance **P2** ; statut opérationnel/vérification **P1**.

#### Carte — `/map` · `screens/MapScreen.tsx`
- **Existe** : oui (collectivité uniquement). **Finition** : moyenne.
- **Données** : `listParks({communeId})`, `listReports({status:["open"]})` **réelles**.
- **Actions** : clic marqueur → `ReportModal` s'il y a un signalement ouvert, sinon
  `ParkModal`. Contrôle de zoom MapLibre.
- **Problèmes** :
  - Si `parks.length === 0` la carte **ne s'initialise jamais** (garde `!parks.length`
    dans l'effet) → cadre gris sans message ni empty-state.
  - Si `VITE_MAP_STYLE_URL` absent → texte brut « Carte indisponible : renseignez
    VITE_MAP_STYLE_URL » (message technique orienté dev).
  - Couleurs de pin **hex en dur** (`#7c1405`, `#ef4444`, `#f08a2e`, `#16a34a`) —
    interdit (`CLAUDE.md` §9). Légende en couleur seule (accessibilité).
  - `modalReport` typé `any`.
  - Recentrage sur `parks[0]` uniquement, pas de `fitBounds` sur l'ensemble.
  - Sous-titre affirme un rattachement « par géolocalisation (adresse dans le
    périmètre communal) » alors que le rattachement est **manuel** (cf.
    `IMPLEMENTATION.md` : « périmètre communal polygonal » non implémenté).
- **Manque** : clustering, filtres, panneau latéral liste↔carte synchronisé,
  couches (signalements / contrôles à échéance / équipements hors service),
  `fitBounds`, message « aucun parc géolocalisé ».
- **Priorité** : empty-state + `fitBounds` + tokens **P2** ; couches métier **P2**.

#### Entretien — `/maintenance` · `screens/Maintenance.tsx` (+ `MaintenanceModal`)
- **Existe** : oui (collectivité). **Finition** : moyenne. **Statut cible** :
  cet écran **conflate trois concepts distincts** de la liste de domaines
  (« Maintenance préventive », « Contrôles et inspections », « Interventions »).
- **Données** : `listMaintenance(communeId)` (`maintenance.organization_id`),
  `listParks`, `listTeam` **réelles**.
- **Actions** : planifier (parc, date, note, responsable **texte libre**, récurrence
  none/mensuel/annuel) ; cocher = terminer (`completeMaintenance`, régénère
  l'occurrence suivante) ; éditer/supprimer via modale. **Réelles**.
- **Permissions** : `communeId` requis ; **aucune garde de rôle** → dette M2 déjà
  connue (un `contributeur` peut créer/éditer/supprimer si la RLS ne bloque pas).
- **Problèmes UX** : « responsable » = chaîne (pas un `team_member` FK) ; pas de
  vue calendrier (abandonnée au portage, `IMPLEMENTATION.md`) ; pas de type
  (préventif / réglementaire / correctif) ; pas de lien vers un équipement précis
  (`maintenance.equipment_id` **existe** en DB, non exploité) ; pas de checklist ;
  pas de pièce jointe ; pas de coût ; pas de statut intermédiaire (planifié / en
  cours / fait / annulé) — juste `done` booléen.
- **Manque** vs cible : cf. « Contrôles et inspections », « Interventions »,
  « Maintenance préventive », « Planning global », « Modèles / checklists » en §5.2.
- **Priorité** : clarifier le périmètre de cet écran vs les 3 concepts **P1**.

#### Signalements — `/reports` · `screens/Reports.tsx` (+ `ReportModal`)
- **Existe** : oui. **Finition** : correcte pour du triage simple. **0 donnée en prod**.
- **Données** : `listReports({communeId})` (jointure `organization_parks` + `parks!inner(name)`)
  **réelles**. Onglets open/resolved/dismissed/all. Export CSV.
- **Actions** (`ReportModal`, `canManage`) : `resolveReport` (note **obligatoire** +
  photo « après » pour collectivité), `dismissReport`, `reopenReport`,
  « Programmer un contrôle de suivi » → crée une ligne `maintenance` à J+7.
  **Réelles**, journalisées.
- **Problèmes** :
  - **P1 bug** : upload photo « après réparation » → `uploadPhoto("reportPhotos",
    file, communeId ?? "admin")` : le 3ᵉ argument doit être `auth.uid()` (RLS Storage
    0027 impose le préfixe `<uid>/…`). Avec un `communeId` ⇒ chemin `<communeId>/…`
    ⇒ **échec RLS**. La résolution elle-même passe (photo optionnelle) mais la photo
    est perdue silencieusement.
  - Détail en modale, pas de route `/reports/:id`.
  - Pas de statut `in_progress` exploité (l'enum existe) → pas d'assignation, pas de
    SLA, pas de fil de discussion avec le parent, pas de notification au parent à la
    résolution (la table `notifications` existe mais aucune insertion BO).
  - `reason` typé large ; `report.equipment` (label libre) affiché brut.
  - `selected` typé `(Report & { parks?: { name: string } })` — jointure fragile.
- **Manque** : file priorisée par sévérité (`report_severity` existe), assignation,
  historique de traitement, réponse au signalant, rattachement à une intervention,
  vue « par équipement ».
- **Priorité** : bug photo **P1** ; assignation + `in_progress` + notif signalant **P1** ;
  page de détail **P1**.

#### Avis — `/reviews` · `screens/Reviews.tsx`
- **Existe** : oui. **Finition** : basique. **0 donnée en prod**.
- **Données** : `listReviews({communeId})` **réelles**. Filtres note (toutes/5/4/≤2)
  + recherche client. Export CSV.
- **Actions** :
  - Collectivité : `replyToReview` (une **seule** réponse, pas d'édition/suppression
    de la réponse). **Réelle**.
  - Admin : `deleteReview` (avec `confirm()`). `flagReview` **existe en shared, non
    exposé dans l'UI**.
- **Problèmes UX** : pas de page « détail d'un avis » (demandée : « Détail d'un avis
  parent ») ; pas de sous-notes affichées (`cleanliness/safety/equipment/comfort`
  existent) ; pas de tri par date/utilité ; pas de signalement d'avis abusif par la
  collectivité (seulement suppression admin) ; réponse en `<Input>` une ligne.
- **Priorité** : détail + sous-notes + modération douce (flag) **P2**.

#### Photos à valider — `/photos` · `screens/Photos.tsx`
- **Existe** : oui (ajout récent, post-`RECONCILIATION`). **Finition** : correcte.
- **Données** : `listPendingMedia({communeId})` (`park_media.status = 'pending'`,
  filtré client sur `park.commune_id`) **réelles**.
- **Actions** : Approuver / Approuver + couverture / Refuser / Supprimer. **Réelles**
  (`setMediaStatus` purge le fichier storage si refus ; `deleteMedia`).
- **Problèmes** :
  - Filtrage commune **côté client** sur `park.commune_id` (V1) → même angle mort que
    P0-1 pour les parcs créés en BO.
  - Erreurs via `alert()` ; confirmation via `confirm()`.
  - Pas de provenance détaillée ni de raison de refus ; pas de prévisualisation
    grand format in-app (lien `target="_blank"`).
  - Pas d'action groupée.
- **Priorité** : scoping serveur **P1** ; feedback design system **P2**.

#### Utilisateurs — `/users` · `screens/Users.tsx` (admin uniquement)
- **Existe** : oui. **Finition** : basique. Hors périmètre « collectivité » strict
  (n'apparaît pas dans `communeItems`).
- **Données** : `listAllUsers` (tous les `profiles`, **non paginé**), `listParks({})`,
  `listReviews({})` **réelles**.
- **Actions** : `setUserSuspended` (→ `profiles.suspended`), export CSV. **Réelles**.
- **Problèmes** : décompte parcs/avis par `filter` client sur tout le jeu ; pas de
  pagination ; pas de détail utilisateur ; pas de RGPD (export/suppression d'un
  utilisateur) ; « suspendre » sans motif ni journal.
- **Priorité** : **P2** (surface admin).

#### Journal — `/journal` · `screens/Journal.tsx`
- **Existe** : oui (collectivité). **Finition** : basique.
- **Données** : `listActivity(communeId)` (`activity_log`), `listTeam` **réelles**.
  Filtre auteur (par **nom**) + recherche texte, **client**.
- **Problèmes** :
  - **Deux journaux parallèles** : `activity_log` (alimenté best-effort par
    `logActivity`, `actor` = **chaîne**, insertion sans `throwOnError`) **et**
    `audit_log` (générique, alimenté par triggers DB, lu par `getParkHistory`).
    Le « Journal » n'affiche que le premier ⇒ incomplet et non fiable (une écriture
    peut échouer sans trace).
  - Pas d'export, pas de filtre par entité/type/date, pas de pagination (limite 200).
- **Priorité** : unifier sur `audit_log` **P1** (décision produit à trancher).

#### Statistiques — `/statistiques` · `screens/Statistiques.tsx`
- **Existe** : oui (collectivité). **Finition** : moyenne.
- **Données** : agrégats client de `parks/reports/reviews/activity` **réels** mais
  **souvent vides ou proxy** en prod :
  - « Fréquentation » = `sum(park.views)` — `views` incrémenté seulement par l'app
    parents (`incrementParkViews`), quasi nul.
  - « Traitement des signalements » — 0 signalement.
  - « Note moyenne » — 0 avis.
  - « Équipements présents » — % de parcs ayant chaque `service` (données réelles).
  - « Activité de l'équipe » — comptage par `actor` (chaîne) de `activity_log`.
- **Problèmes** : barres CSS maison (pas de lib de dataviz, pas d'axe, pas de
  tooltip) ; hex `var(--color-warning-text)` détourné en couleur de barre ; grille
  `1fr 1fr` sans breakpoint ; pas de période, pas d'export par graphe, pas de
  comparaison temporelle.
- **Priorité** : refonte contenu quand il y aura des données **P2** ; tokens/dataviz **P2**.

#### Paramètres — `/settings` · `screens/Settings.tsx` (+ `InviteModal`)
- **Existe** : oui. **Finition** : basique. **Fourre-tout** : compte + fiche
  collectivité + rapport PDF + équipe, sur une seule page.
- **Données** : `listTeam`, `listCommunes` (`organizations`), `updateCommune`,
  `removeTeamMember` **réelles**.
- **Actions** :
  - Fiche collectivité : nom, contact référent, toggle `email_notif`. **Réelles**
    (`gestionnaire`+).
  - Rapport mensuel : `jsPDF`, **1 page**, chiffres bruts. Pas de mise en forme
    marque, pas d'historique, pas de stockage.
  - Équipe : liste + `+ Inviter` (`InviteModal`) + `Retirer`.
- **`InviteModal`** :
  - **P1** : « inviter » = `supabase.auth.signInWithOtp({ email })` **déclenché
    depuis le client** (envoi d'un magic-link à une adresse arbitraire) + INSERT
    `team_members` avec `user_id: null`. Pas de table d'invitation, pas d'expiration,
    pas d'état « en attente » affiché, pas de renvoi, pas d'acceptation explicite,
    pas de garde anti-abus (tout `gestionnaire` peut spammer des e-mails d'auth).
  - Choix du rôle via `Segmented` (sémantique onglets, pas radiogroup).
  - Rôles proposés admin : `super_admin / moderation / support` ; commune :
    `gestionnaire / contributeur`.
- **Manque** vs cible : `/profil` dédié (mot de passe, suppression de compte —
  `deleteOwnAccount` existe en shared, non exposé), sous-pages Réglages (Général /
  Alertes & automatisations / Intégrations / Exports automatiques / Sécurité /
  Abonnement & quotas), page « Rôles et permissions » lisible, page « Membres » +
  « Invitations » séparées.
- **Priorité** : éclater la page + vrai flux d'invitation **P1** ; page profil **P1**.

#### Connexion — `screens/Login.tsx`
- **Existe** : oui. **Finition** : correcte.
- **Données** : `signIn(email, password)` **réel**. Pas de « mot de passe oublié »
  (`sendPasswordReset` **existe en shared, non exposé ici**), pas de SSO (Google
  `signInWithGoogle` existe, non branché ici), erreur générique.
- **Problèmes** : `<Logo suffix="Back office">` en `variant="mono"` alors que
  `docs/DESIGN-SYSTEM.md` §6 prescrit `variant="brand"` (wordmark bicolore) sur
  l'écran d'auth ; pas de lien reset ; pas de gestion « compte non invité » avant
  login (on découvre `accessDenied` après).
- **Priorité** : lien reset **P1** ; wordmark brand **P3**.

#### Accès non autorisé — `screens/AccessDenied.tsx`
- **Existe** : oui, correct. Emoji 🔒 en `fontSize: 48` (décision #6 : éditorial,
  à trancher). Pas de CTA « demander un accès ».
- **Priorité** : **P3**.

### 5.2 Écrans / fonctionnalités ABSENTS

| Domaine attendu | Existe ? | Route | Données DB disponibles | Effort | Priorité |
|---|---|---|---|---|---|
| **Inventaire global des équipements** | ❌ | — | `park_equipment` (fabricant, modèle, condition, `installation_date`, `last/next_inspection_at`, `status`), `features` | Élevé | **P1** |
| Détail d'un équipement | ❌ | — | idem + `park_zones`, `maintenance.equipment_id`, `reports.equipment_id` | Élevé | **P1** |
| Création / modification d'un équipement | ❌ | — | `park_equipment` (0 ligne) | Moyen | **P1** |
| Cycle de vie d'un équipement | ❌ | — | `equipment_status` (installed/removed/planned/unknown) + `equipment_condition` + audit_log | Moyen | **P1** |
| Catalogue équipements Toboggo | ❌ | — | `features` (catalogue universel, `is_active`, `sort_order`, `category`) | Moyen | **P2** |
| **Interventions** (liste / création / détail) | ❌ | — | aucune table dédiée — à modéliser (voir §19) | Élevé | **P1** |
| **Contrôles et inspections** (planification / détail) | ❌ | — | `park_equipment.last/next_inspection_at` ; sinon `maintenance` détourné | Élevé | **P1** |
| Modèles / checklists de contrôle | ❌ | — | aucune table — à modéliser | Élevé | **P1** |
| **Infos à vérifier** (liste / détail) | ❌ | — | `verification_status`, `park_attribute_sources` (provenance + `confidence`), `park_edits` (change-requests) | Moyen-élevé | **P1** |
| File de validation des contributions (EXISTANT→PROPOSITION→SOURCE) | ❌ | — | `park_edits` + RLS + API `submitParkEdit/listParkEdits/reviewParkEdit` **câblées, 0 call site** | Moyen | **P1** |
| **Planning global** | ❌ | — | `maintenance.date` + (futures interventions/contrôles) | Moyen | **P1** |
| **Messages** | ❌ | — | `contact_messages` (alimentée par la landing) | Moyen | **P2** |
| **Notifications** (centre) | ❌ | — | `notifications` (per-user, orientée app parents) — à étendre au staff | Moyen | **P1** |
| Préférences de notifications | ❌ | — | `profiles.notif_prefs/notif_channels` (orientées parents) + `organizations.email_notif` | Faible-moyen | **P1** |
| **Rapports** (liste / création / détail) | 🟡 (1 bouton PDF dans Settings) | — | agrégats parcs/signalements/avis | Moyen | **P1** |
| Documents & conformité | ❌ | — | `park_media` + aucune table « document » — à modéliser | Élevé | **P1** |
| **Équipe → Membres / Invitation / Rôles** (pages séparées) | 🟡 (tout dans Settings) | — | `team_members`, enum `team_role` (5) | Moyen | **P1** |
| **Profil** (utilisateur BO connecté) | 🟡 (carte read-only) | — | `auth.users` + `profiles` ; `deleteOwnAccount`, `sendPasswordReset` en shared | Faible-moyen | **P1** |
| Réglages → Général | 🟡 (partiel) | `/settings` | `organizations` | Faible | **P1** |
| Réglages → Alertes et automatisations | ❌ | — | aucune — à modéliser | Moyen | **P2** |
| Réglages → Intégrations | ❌ | — | `park_sources` / `external_ids` / imports OSM (`docs/operations/OSM.md`) | Moyen | **P2** |
| Réglages → Exports automatiques | ❌ | — | aucune — à modéliser | Moyen | **P3** |
| Réglages → Sécurité | ❌ | — | `auth` (sessions, MFA), `audit_log` | Moyen | **P2** |
| Réglages → Abonnement / quotas | ❌ | — | aucune (Stripe non intégré, `IMPLEMENTATION.md`) | Élevé | **P2** |
| **Journal d'activité / audit log** (complet) | 🟡 (`activity_log` seulement) | `/journal` | `audit_log` (générique, triggers DB) | Faible-moyen | **P1** |
| **Centre d'aide** | ❌ | — | contenu statique / lien | Faible | **P3** |
| Carte globale des parcs (admin) | ❌ (commune seulement) | — | `park_public` | Faible | **P2** |
| Détail parc → onglets (Infos / Équipements / Services / Accessibilité / Sécurité / Environnement / Photos / Historique) | 🟡 (modale plate) | — | `park_features` par `category` (play/service/environment/accessibility/safety), `park_media`, `audit_log` | Moyen-élevé | **P1** |
| Gestion des collectivités (admin) | ❌ | — | `organizations` (création = SQL manuel) | Moyen | **P2** |
| Onboarding collectivité (pilote 5 étapes) | ❌ | — | process documenté hors logiciel | Moyen | **P3** |

---

## 6. Écart avec les maquettes

> **Rappel** : les maquettes de référence du BO Collectivité **ne sont pas dans le
> dépôt**. Cette section ne peut donc pas statuer « conforme / non conforme » écran par
> écran. Elle liste (a) ce qui est **structurellement présent**, (b) ce qui **manque
> par rapport à la liste de domaines fournie**, (c) les **points à confronter
> impérativement aux maquettes** dès qu'elles seront communiquées.

### 6.1 Présent structurellement
- Layout « sidebar sombre à gauche + contenu à droite » (pattern SaaS classique).
- Sélecteur d'organisation (multi-tenant) + bloc utilisateur en pied de sidebar.
- Nav à sections implicites, badges de compteur sur Parcs / Signalements / Photos.
- Écrans liste + filtres + recherche + export CSV.
- Détail via modale.

### 6.2 Manque par rapport à la cible
- **Header applicatif** (fil d'Ariane, recherche globale / typeahead, cloche de
  notifications, menu utilisateur) — totalement absent.
- **Pages de détail** avec URL propre et onglets métier.
- **Groupement de la sidebar** en sections nommées (Exploitation / Qualité des
  données / Communication / Administration…) — la liste de domaines suggère 6+
  sections, la nav actuelle en a ~10 items à plat.
- **Tableaux denses** (tri colonne, densité paramétrable, colonnes métier,
  sélection multiple) au lieu de listes de cartes.
- **Composants d'état** : Skeleton, Banner/Alert, Toast, EmptyState illustré,
  Spinner (ces 4 sont notés « à créer » dans `docs/DESIGN-SYSTEM.md` §8).
- **Système de statuts unifié** (badges) au-delà de parc/signalement :
  équipement, contrôle, intervention, info à vérifier, membre (invité/actif/suspendu).
- **Planning / calendrier**.
- **Écrans de configuration** structurés.

### 6.3 À confronter aux maquettes (questions ouvertes)
1. Structure et libellés exacts de la **sidebar** (sections, ordre, icônes).
2. Y a-t-il un **header** ? Que contient-il (recherche, notifs, aide, switch org) ?
3. Les détails sont-ils des **pages** (attendu) ou des **panneaux latéraux / modales** ?
4. Densité des **tableaux** (compact / confortable), colonnes par écran.
5. Traitement visuel **Admin vs Collectivité** (décision #7 : badge léger, pas de
   seconde palette — le code respecte déjà « pas de seconde palette »).
6. **Nombre de statuts** et vocabulaire métier (préventif / réglementaire /
   correctif ; contrôle vs inspection vs intervention).
7. Écrans de **création** : wizard multi-étapes ou formulaire unique ?
8. Gabarit du **rapport PDF / conformité**.
9. Existence d'un **mode « checklist » de contrôle terrain** (mobile-friendly ?).
10. Gestion des **documents** (types, obligations réglementaires, échéances).

---

## 7. Analyse UX/UI

### 7.1 Navigation
- Sidebar sticky, 7 (admin) / 10 (commune) items **à plat**, sans regroupement.
- **Pas de fil d'Ariane, pas de bouton retour** : sur une modale « détail », la seule
  sortie est la croix ou le clic-fond.
- **Pas de recherche globale** (typeahead parc / signalement / membre) — retirée au
  portage (`IMPLEMENTATION.md`).
- `PageHeader` réimplémenté à la main (titre + actions), non issu d'un `ScreenHeader`
  du design system (qui n'existe pas encore — DESIGN-6).
- Navigation clavier : les items de nav sont des `<button>` (focusables), OK ; mais
  pas d'ordre de tabulation maîtrisé, pas de `skip link`, pas de landmark `<nav
  aria-label>`, `aria-current` absent sur l'item actif.

### 7.2 Hiérarchie & densité
- Densité « cartes empilées » partout → beaucoup de scroll, faible densité
  d'information pour un outil d'exploitation. Un BO collectivité gère potentiellement
  des dizaines de parcs et des centaines d'équipements → **il faut des tableaux**.
- Typo : tailles en px en dur (`fontSize: 22 / 15 / 13.5 / 12.5 …`) au lieu de
  l'échelle `--text-*` (existe, non appliquée — DESIGN-7/8).
- Titres : `<h1>` par écran (bon), `<h2>` de carte inline, modales en `<h3>` non
  reliées par `aria-labelledby`.

### 7.3 Formulaires
- Primitives `Input / Textarea / Select` du design system utilisées (bien).
- **Manque** : `Checkbox`, `Radio`, `DatePicker` (dates = `<input type="date">` nu),
  validation inline (le champ `error` existe sur `Input` mais n'est jamais alimenté),
  autosave / brouillon, confirmation avant fermeture d'un formulaire modifié.
- Adresse de parc = texte libre, **pas de géocodage** → coordonnées jamais saisies.
- « Responsable » d'une inspection = texte libre au lieu d'un `Select` de membres
  (le `Select` de membres existe dans `MaintenanceModal` mais renvoie le **nom**,
  pas l'`id`).

### 7.4 Tableaux
- Aucune primitive `Table` utilisée dans les écrans (le composant `Table` du design
  system existe mais n'est appelé nulle part).
- Listes = `flex column` de `<button>`/`<div>`. Pas de tri, pas de pagination, pas de
  colonnes, pas de sélection, pas d'actions groupées, pas de state d'URL (filtre/tri
  non persistés, non partageables).

### 7.5 Modales
- `Dialog` : `role="dialog"` + `aria-modal` OK. **Manquent** : `aria-labelledby`
  (titre non relié), **focus-trap**, focus initial, **restauration du focus** à la
  fermeture, fermeture par `Escape`, garde anti-perte de saisie (clic-fond ferme).
- Toutes les « fiches » sont des modales → pas de deep-link, pas d'historique, pas de
  travail en parallèle sur deux entités.

### 7.6 États
| État | Existant | Manque |
|---|---|---|
| **Loading** | `App` : `return null` (écran blanc au boot) ; `Parks` : « Chargement… » texte ; autres : rien puis vide | `Skeleton`, spinner design system, skeleton de liste/carte |
| **Empty** | phrases grises (`"Aucun parc dans cette catégorie."`) ; `Photos` : « Aucune photo en attente. 🎉 » | `EmptyState` illustré + CTA contextuel ; distinction « vide » vs « aucun résultat de filtre » |
| **Error** | **aucun `ErrorBoundary`** ; requête en échec ⇒ `data = []` ⇒ ressemble à un empty-state ; `Photos` : `alert()` | boundary global + par section, écran d'erreur avec « réessayer », bannière hors-ligne, remontée Sentry/log |
| **Feedback action** | `invalidateQueries` (rafraîchit) mais **aucun toast de succès** ; `confirm()` natif pour les destructions | `Toast` (existe, non branché), confirmations design system, undo pour les actions réversibles |

### 7.7 Branding (décisions `docs/DESIGN-SYSTEM.md` §2)
| Décision | Respect | Détail |
|---|---|---|
| #5 BO = même système d'icônes, exécution plus sobre | ⚠ partiel | `<Icon>` seulement dans la nav ; ailleurs emojis (`✏️ 📷 🔧 📓 🗺️ 📓`) et SVG inline |
| #6 Aucun emoji comme pictogramme d'interface | ❌ | emojis dans la nav commune, boutons d'action (`✏️`), légendes |
| #7 Admin/Collectivité = distinction légère, pas de 2ᵉ palette | ✅ | pas de palette dédiée ; distinction par `orgLabel` + items de nav |
| #8 Dark mode différé, pas de `prefers-color-scheme` | ✅ | non activé |
| §3 Toujours passer par les tokens, jamais de hex | ❌ | `MapScreen` (pins), `Statistiques` (barres), Shell (puces) en hex/valeurs en dur ; `style={{}}` massif |
| §6 Écran d'auth = `<Logo variant="brand">` | ❌ | `Login` utilise `variant` mono par défaut |

### 7.8 Ce qui est déjà bon (à ne PAS refaire)
- L'architecture `orgSession` / `orgScope` / role-routing.
- Le passage systématique par `@toboggo/shared` pour les données.
- Les primitives `Button / Input / Select / Segmented / Dialog / Tag / Card / StatCard / Avatar`.
- Le flux **modération photo** (`/photos`) : logique de provenance + purge storage au refus, correcte.
- Le flux **résolution de signalement** (note obligatoire, réouverture, contrôle de
  suivi) : bonne logique métier, à conserver en le durcissant.
- L'**export CSV** (`toCsv/downloadCsv/parseCsv`) et le principe du **rapport PDF**.
- Le `StatusTag` (mapping label + tone) — à généraliser aux autres entités.
- Le responsive sidebar→bottom-bar (principe correct, exécution à revoir).

---

## 8. Analyse des données réelles vs mocks

**Le BO n'affiche aucune donnée « mockée » codée en dur.** Toutes les listes viennent
de Supabase. Le problème n'est pas des mocks mais :

### 8.1 Données réelles mais vides en production
D'après `docs/architecture/database-migration.md` §11 (état prod) :
`parks` 17 · `organizations` 2 · `profiles` 4 · `team_members` 3 ·
**`reviews` 0 · `reports` 0 · `maintenance` 0** · `park_features` ~182 ·
`park_scores` 0 · `park_edits` 0 · `park_equipment` 0 · `park_zones` 0 ·
`activity_log` 0/quasi-0 · `notifications` ~0.

⇒ **Signalements, Avis, Entretien, Statistiques (fréquentation, traitement, note),
Journal, badges de nav** sont vides ou à zéro pour une vraie collectivité tant
qu'elle n'a pas produit de données. Les écrans « s'ouvrent mais sont vides » (déjà
constaté par le fondateur en smoke test, §11 checkpoint).

### 8.2 Métriques = proxys peu fiables
| Écran | Métrique | Problème |
|---|---|---|
| Dashboard (admin) | « Utilisateurs actifs » | = `distinct(reports.user_id)` — proxy arbitraire |
| Dashboard | « Note moyenne » | moyenne de `park.rating` (0 si pas d'avis) |
| Statistiques | « Fréquentation » | `sum(park.views)`, `views` alimenté seulement par l'app parents |
| Statistiques | « Activité de l'équipe » | comptage par `actor` (chaîne libre de `activity_log`) |
| Statistiques | « Traité en Nj » | `reports.resolution_days` calculé à la résolution, 0 donnée |

### 8.3 Contenus potentiellement « fictifs » à ne pas reproduire depuis les maquettes
Conformément à la consigne : ne pas recopier les faux chiffres/parcs/utilisateurs des
maquettes. Points de vigilance connus (décision #10, `docs/DESIGN-SYSTEM.md` §2 / §10) :
- Stats marketing « 2 400+ parcs », « 18 000+ avis », « 4.8/5 » (landing) — **jamais**
  dans le BO.
- Toute « donnée exemple » de parc/équipement/contrôle des maquettes → à remplacer
  par de vrais enregistrements ou de vrais empty-states.
- `MapScreen` sous-titre affirme un rattachement géographique automatique **qui
  n'existe pas** — à corriger (ne pas « faire semblant »).

---

## 9. Analyse Supabase

### 9.1 Ce que le BO consomme réellement
`park_public` (vue plate V1/V2), `parks`, `park_features`, `features`,
`organization_parks`, `organizations`, `team_members`, `profiles`, `reviews`,
`reports`, `maintenance`, `activity_log`, `audit_log` (via `getParkHistory`),
`park_media`, Storage buckets `park-photos` / `report-photos`.
RPC : `nearby_parks` (indirect), `increment_park_views` (app parents),
`delete_own_account` (shared, non exposé BO).

### 9.2 Ce que la DB offre et que le BO n'exploite pas
| Table / capacité | Usage BO attendu | État |
|---|---|---|
| `park_equipment` | inventaire, cycle de vie, inspections | 0 ligne, 0 UI |
| `park_zones` | zones internes du parc | 0 ligne, 0 UI |
| `park_entrances` | entrées, accès PMR | 0 ligne, 0 UI |
| `park_opening_hours` | horaires / saisons | 0 ligne, 0 UI |
| `park_sources` / `external_ids` | provenance, intégrations, imports | 0 UI (imports OSM via script CLI seulement) |
| `park_names` | noms multilingues | 0 UI |
| `park_attribute_sources` | provenance au champ + `confidence` → « infos à vérifier » | 0 UI |
| `park_edits` (+ RLS + API) | file de validation des contributions | **câblé, 0 call site** |
| `park_scores` (+ RPC `recalculate_park_score`) | Toboggo Score par parc | 0 ligne, 0 UI, RPC jamais appelée |
| `park_duplicate_candidates` / RPC `find_duplicate_parks` | anti-doublon à la création | 0 appel |
| `verification_status` / `operational_status` (colonnes `parks`) | statut de fiabilité / d'exploitation | non éditables en BO |
| `report_severity`, `reports.status = in_progress`, `reports.equipment_id`, `reports.zone_id` | file priorisée, assignation | non exploités |
| `audit_log` | journal complet | lu seulement pour l'historique parc |
| `contact_messages` | messagerie | 0 UI BO |
| `notifications` | centre de notifications staff | orientée parents, 0 UI BO |

### 9.3 Cohérence V1/V2 et coexistence
- Coexistence **active** (décision fondateur non close) — `CLAUDE.md` §4 :
  **interdit** de créer la migration `0022+` de nettoyage destructif, de `push`
  vers la prod, de modifier `0001→0021`.
- Le BO écrit en **forme plate V1** ; `packages/shared/src/api/*` fait le split vers
  les colonnes V2 + `park_features` + `organization_parks`, en s'appuyant sur les
  triggers `*_v1_compat`.
- **Angle mort identifié** : `parks_v1_compat` (migration 0009) ne dérive **pas**
  `parks.commune_id` depuis `organization_parks`. Or le BO filtre les parcs sur
  `park_public.commune_id`. ⇒ P0-1.

### 9.4 RLS (non ré-auditée en profondeur ici)
- 5 rôles `team_role` ; helpers `org_role`, `is_org_member`, `is_org_gestionnaire`,
  `manages_park`, `can_edit_park`, `is_toboggo_staff`.
- Le checkpoint §11 note des correctifs runtime prod (D1/D2/D3, P5C-2, P5C-3) déjà
  appliqués (`reports_read` via `manages_park`, `reports_update` via
  `organization_parks`, `reviews_update`…).
- **À vérifier avant d'ouvrir des écrans d'écriture** : la RLS bloque-t-elle bien un
  `contributeur` sur `parks UPDATE` / `maintenance INSERT` / `team_members INSERT` /
  `park_media UPDATE` ? (le client, lui, ne bloque rien.)

---

## 10. Analyse rôles / permissions

### 10.1 Modèle
- Enum `team_role` : `super_admin`, `moderation`, `support` (staff Toboggo) +
  `gestionnaire`, `contributeur` (collectivité).
- `team_members.organization_id IS NULL` ⇒ staff Toboggo (tous droits).
- Côté BO : `isAdmin` (activeOrg admin) et `isGestionnaireOrAbove()` =
  `role ∈ {gestionnaire, super_admin, moderation}`.

### 10.2 Problèmes
1. **Aucune garde de route ni de rendu par rôle** : un `contributeur` voit tous les
   écrans et tous les boutons. `canManage` masque **certains** boutons d'écriture,
   pas tous (ex. `Maintenance` : aucune vérif de rôle ; `ParkModal "new"` force
   `published`).
2. `isGestionnaireOrAbove()` mélange un rôle **staff** (`moderation`) dans une
   logique **collectivité** — un modérateur Toboggo agissant dans le scope d'une
   commune serait traité comme gestionnaire. À clarifier.
3. **Pas de page « Rôles et permissions »** lisible (qui peut quoi). Les rôles
   apparaissent en texte brut dans la liste d'équipe (`m.role` = `gestionnaire`,
   non traduit).
4. **Pas de changement de rôle** d'un membre existant (seulement inviter / retirer).
5. Le libellé des rôles n'est pas traduit (`super_admin`, `contributeur`…).
6. `InviteModal` : le rôle par défaut admin est `support` ; commune `contributeur`
   (raisonnable) mais choix via `Segmented`.

### 10.3 Matrice actuelle (constatée dans le code, hors RLS)
| Action | contributeur | gestionnaire | staff (admin) |
|---|---|---|---|
| Voir tous les écrans | ✅ (non bridé) | ✅ | ✅ |
| Créer / éditer un parc | ⚠ bouton masqué, mais modale force `published` si ouverte | ✅ | ✅ (onglets pending) |
| Valider / refuser un parc | ⚠ bouton masqué | ✅ | ✅ |
| Créer / éditer / supprimer une inspection | ⚠ **non bridé** (dette M2) | ✅ | n/a (pas d'écran) |
| Traiter un signalement | ⚠ bouton masqué | ✅ | ✅ |
| Répondre à un avis | ⚠ bouton masqué | ✅ | ❌ (admin supprime) |
| Modérer une photo | non bridé (`canManage` non passé sur `/photos`) | ✅ | ✅ |
| Inviter / retirer un membre | ⚠ bouton masqué | ✅ | ✅ |
| Éditer la fiche collectivité | champs `disabled` | ✅ | n/a |

---

## 11. Analyse responsive / accessibilité

### 11.1 Responsive
- 1 seul breakpoint (`860px`) : sidebar → bottom-bar fixe.
- **Bottom-bar surchargée** : 10 items (commune) compressés à `fontSize: 10px`,
  `overflow-x: auto` → scroll horizontal de nav, cible tactile trop petite,
  `brand/orgLabel/orgSwitch/footer` **masqués** → **plus de sélecteur d'organisation
  ni de déconnexion en mobile**.
- Grilles `Dashboard` (`2fr 1fr`) et `Statistiques` (`1fr 1fr`) **sans média-query**
  → colonnes écrasées sur téléphone.
- Beaucoup de `maxWidth` / `minWidth` en px sur les filtres et cartes.
- Modales `Dialog` : largeur fixe probable (à vérifier dans `Dialog.module.css`),
  pas de plein écran mobile (le design system a un `BottomSheet` non utilisé ici).
- Pas de test tablette (768–1024) documenté ; DESIGN-10 (responsive + a11y) non
  démarré.

### 11.2 Accessibilité — problèmes recensés
| # | Problème | Où | Sévérité |
|---|---|---|---|
| A1 | Modales sans focus-trap / focus initial / restauration / `Escape` / `aria-labelledby` | `Dialog` (toutes les modales) | Élevée |
| A2 | Interactif imbriqué (`<button>` dans `<button>`) | `Parks` lignes + actions | Élevée |
| A3 | Emojis pictos sans `aria-label` / `role=img` | nav commune, boutons `✏️`, `📷`, légendes | Moyenne |
| A4 | Boutons icône seule sans nom accessible (`✕`, `★`, `↻`) | `ParkModal` photos | Moyenne |
| A5 | Information par la couleur seule | pins carte + légende, barres stats | Moyenne |
| A6 | `role="tablist"/"tab"` détourné pour des filtres / un choix de rôle ; pas de nav flèches ; panneaux non liés | `Segmented` (Parks, Reports, Reviews, Users, Maintenance, InviteModal) | Moyenne |
| A7 | `aria-current` absent sur l'item de nav actif ; `<nav>` sans `aria-label` ; pas de skip-link | `Shell` | Moyenne |
| A8 | Écran blanc pendant le chargement (`return null`) — pas d'annonce | `App` | Moyenne |
| A9 | `confirm()` / `alert()` natifs (sortent du contexte, style navigateur) | Parks, Reviews, Photos, Maintenance, ParkModal | Faible-moyenne |
| A10 | Champs `date` natifs sans libellé associé homogène ; pas de format annoncé | Maintenance | Faible |
| A11 | Contraste à vérifier : `--color-text-faint` `#A8A190` sur crème, `opacity: 0.6` sur le rôle en sidebar | Shell footer, méta | Faible-moyenne |
| A12 | Pas de gestion du focus au changement de route (SPA) — le focus reste sur l'item de nav | `App`/`Shell` | Moyenne |
| A13 | Images photo : `alt` correct sur `/photos` ✅ ; miniatures `ParkModal` = `background-image` (pas d'`alt`) | `ParkModal` | Faible |

### 11.3 Navigation clavier (pertinence : élevée pour un outil pro)
- Les éléments cliquables sont majoritairement de vrais `<button>` → focusables.
- **Manquent** : ordre logique maîtrisé, retour visuel de focus homogène
  (`:focus-visible` global existe dans `tokens.css` ✅), raccourcis (`/` pour
  rechercher, `g p` pour aller aux parcs…), gestion du focus dans/hors modale,
  fermeture `Escape`.

---

## 12. Dette technique

| # | Dette | Fichier(s) | Impact |
|---|---|---|---|
| DT-1 | **Styles inline massifs** (`style={{}}`) au lieu de tokens/modules | tous les `screens/*` et `components/*` sauf `Shell` | maintenabilité, dark mode, cohérence — bloque DESIGN-8 |
| DT-2 | **Hex en dur** | `MapScreen` (pins), `Statistiques` (barres), `Shell` (puces), `Parks` (bouton CSV) | viole `CLAUDE.md` §9 |
| DT-3 | **Emojis pictos** | nav commune, boutons | viole décision #6 |
| DT-4 | Code dupliqué : bloc export CSV (×5), bloc « puce d'activité » (×2 Dashboard/Journal), calcul `canManage`/rôle (×7), logique de scoping commune (×5, hétérogène) | multi | bugs divergents (cf. P0-1), volume |
| DT-5 | `lib/equipmentLabels.ts` (`SERVICE_LABEL`) **doublon** de concepts de `@toboggo/shared` (`FEATURE_LABEL`, `PLAY_EQUIPMENT_LABEL`) | backoffice | divergence de libellés |
| DT-6 | `EQUIPMENT` (10 codes jeux) codé en dur dans `ParkModal`, libellés = codes bruts | `ParkModal` | UX + i18n |
| DT-7 | `any` : `modalReport` (`MapScreen`), `report as any` (`Reports`), `r as any` (`Reviews`) | 3 écrans | typage (`CLAUDE.md` §6 interdit `any` — présents malgré tout) |
| DT-8 | **Deux journaux** (`activity_log` best-effort vs `audit_log` triggers) | `notifications.ts`, `parks.ts`, tous les `logActivity` | fiabilité du journal |
| DT-9 | `logActivity` sans `throwOnError` → écritures de journal silencieusement perdues | `api/notifications.ts` | traçabilité |
| DT-10 | Pas de pagination nulle part (`listParks`, `listReports`, `listReviews`, `listAllUsers`, `listActivity` limit 200) | shared + écrans | scalabilité |
| DT-11 | `lint` cassé (ESLint ni installé ni configuré — `CLAUDE.md` §3) | racine | pas de garde qualité auto |
| DT-12 | Filtrage `/photos` et scoping parcs **côté client** | `Photos`, `listPendingMedia` | perf + fuite potentielle de périmètre |
| DT-13 | `MaintenanceModal` `assignee` = nom (chaîne), pas d'`id` membre | `Maintenance*` | intégrité |
| DT-14 | `Reports.tsx` : `const canManage = isAdmin || useOrgSession(s => s.isGestionnaireOrAbove())` — hook appelé dans une expression `||` (fonctionne, mais style fragile / non idiomatique) | `Reports.tsx` | lisibilité |
| DT-15 | `App` gate `if (loading) return null` — pas d'écran de chargement | `App.tsx` | perçu |
| DT-16 | `queryKey` incohérentes (`bo-parks` vs `dash-parks` vs `shell-pending-parks` vs `bo-parks-all`) → sur-fetch, invalidations partielles | tous | perf, fraîcheur |

---

## 13. Problèmes bloquants avant lancement

> « Bloquant » = met en jeu l'intégrité des données, la sécurité, ou rend le
> parcours principal non fiable.

| ID | Problème | Détail | Correctif visé |
|---|---|---|---|
| **B1 (P0-2)** | **Coordonnées factices à la création de parc** | `createPark` (modale + import CSV) écrit `lat: 45.75, lng: 4.85`. Interdit par l'archi. Casse la carte, le scoping géo, la dédup. | Géocodage à la saisie (adresse → lat/lng) OU champ coordonnées obligatoire ; refuser la création sans coordonnées réelles. |
| **B2 (P0-1)** | **Parc créé en BO invisible dans « Mes parcs »** | `parks.commune_id` non renseigné (seul `organization_parks` l'est) ; `listParks({communeId})` filtre sur `park_public.commune_id`. | Aligner `listParks` sur `organization_parks` (comme reports/reviews) **ou** renseigner `commune_id`/laisser un trigger le faire (décision DB — coexistence). À vérifier sur prod d'abord. |
| **B3 (P1)** | **Upload photo « après réparation » cassé** | `uploadPhoto("reportPhotos", file, communeId)` — 3ᵉ arg doit être `auth.uid()` (RLS Storage 0027). Échec silencieux. | Passer `userId` ; adapter la policy si le partage d'un dossier commune est voulu. |
| **B4 (P1)** | **Publication de parc sans contrôle de rôle** | `ParkModal "new"` force `status: "published"` quel que soit le rôle ; incohérent avec l'import CSV. | Statut selon rôle + RLS ; unifier les deux chemins. |
| **B5 (P1)** | **Flux d'invitation fragile** | `signInWithOtp` déclenché côté client vers une adresse arbitraire, `team_members.user_id = null`, pas d'état/expiration/renvoi/acceptation. | Vrai flux (fonction edge / table `invitations` + RLS + acceptation), ou a minima : état « invité » visible, renvoi, révocation, garde anti-abus. |
| **B6 (P1)** | **Aucune gestion d'erreur visible** | Requête en échec ⇒ écran « vide » indiscernable d'un empty-state ; pas d'`ErrorBoundary`. | `ErrorBoundary` global + par section, écran d'erreur « réessayer », statut réseau. |
| **B7 (P1)** | **RLS non confirmée pour les écritures ouvertes aux contributeurs** | Le client ne bride pas ; il faut la garantie serveur avant d'exposer plus d'écriture. | Audit RLS ciblé (parks/maintenance/team_members/park_media UPDATE/INSERT par rôle). |
| **B8 (P1)** | **`MapScreen` : carte morte si 0 parc** | init sautée, cadre gris muet. | Empty-state explicite + init indépendante du nombre de parcs. |

> Les **absences d'écrans** (interventions, contrôles, inventaire, conformité…) ne
> sont pas « bloquantes » au sens intégrité, mais **bloquantes pour une mise en
> service auprès d'une vraie collectivité** qui attend ces fonctions.

---

## 14. Priorisation P0 / P1 / P2 / P3

### P0 — intégrité / sécurité (à traiter avant tout ajout de fonctionnalité)
- P0-1 : parc BO invisible dans « Mes parcs » (scoping commune incohérent). *(B2)*
- P0-2 : coordonnées factices `45.75/4.85` à la création de parc. *(B1)*
- P0-3 : confirmer la RLS pour toutes les écritures que le client laisse passer. *(B7)*
- P0-4 : `ErrorBoundary` + écran d'erreur (sinon les pannes sont invisibles). *(B6)*

### P1 — attendu pour un usage réel par une collectivité
- Chemin d'écriture parc : géocodage, statut selon rôle, anti-doublon
  (`findDuplicateParks`), features tri-état (`unknown` par défaut). *(B4)*
- **Page de détail de parc** (route + onglets : Infos / Équipements / Services /
  Accessibilité / Sécurité / Environnement / Photos / Historique).
- **Inventaire d'équipements** (`park_equipment`) : liste, détail, création/édition,
  cycle de vie, dates d'inspection.
- **Contrôles & inspections** + **modèles/checklists** + **interventions** : clarifier
  le périmètre de l'écran « Entretien » et créer les écrans manquants (modélisation
  DB requise — §19).
- **Infos à vérifier** : `verification_status` + `park_attribute_sources` +
  **file de validation `park_edits`** (API déjà câblée).
- **Signalements** : `in_progress`, assignation, sévérité, notification au signalant,
  page de détail, correctif upload photo. *(B3)*
- **Planning global** (échéances contrôles + interventions + maintenance).
- **Équipe** : pages Membres / Invitations / Rôles séparées ; changement de rôle ;
  libellés traduits ; vrai flux d'invitation. *(B5)*
- **Profil** BO (mot de passe, déconnexion mobile, suppression de compte).
- **Réglages → Général** complété + éclatement de la page Settings.
- **Notifications** BO + préférences.
- **Rapports** : écran dédié, gabarit marque, historique.
- **Journal** : unifier sur `audit_log`, filtres, export, pagination.
- **États** : `Skeleton`, `Toast` branché, `EmptyState` illustré, confirmations
  design system (remplacer `confirm()`/`alert()`).
- Accessibilité modales (focus-trap, `Escape`, `aria-labelledby`, restauration focus).
- Responsive : bottom-bar mobile repensée (org switch + déconnexion accessibles),
  breakpoints sur les grilles.
- `MapScreen` : empty-state + `fitBounds` + tokens. *(B8)*
- Header applicatif (fil d'Ariane + recherche + notifications + menu utilisateur).

### P2 — complétude / confort
- Catalogue équipements Toboggo (`features`).
- Messages (`contact_messages`).
- Carte globale admin ; gestion des collectivités (admin).
- Statistiques : refonte quand données présentes, dataviz tokenisée, périodes.
- Réglages → Intégrations / Sécurité / Abonnement & quotas.
- Avis : détail + sous-notes + flag par la collectivité.
- Tableaux denses (tri, colonnes, sélection multiple, actions groupées) + état d'URL.
- Toboggo Score par parc (`park_scores` + RPC).
- Pagination généralisée.

### P3 — amélioration
- Centre d'aide.
- Réglages → Exports automatiques.
- Onboarding collectivité guidé.
- Wordmark `variant="brand"` sur l'auth ; `AccessDenied` CTA « demander l'accès ».
- Raccourcis clavier.
- SSO Google dans le BO.

---

## 15. Éléments déjà suffisamment bons — NE PAS refaire

1. **`orgSession` / `orgScope` / role-routing** — étendre, pas réécrire.
2. **Couche `@toboggo/shared/api/*`** — la façade est la bonne ; l'enrichir
   (equipment, controls, verification…) sans court-circuiter.
3. **Primitives design system** `Button / Input / Textarea / Select / Segmented /
   Dialog / Tag / Card / StatCard / Avatar / StarRating` — les consommer davantage.
4. **Flux modération photo** (`/photos` + `api/parkDetails.ts`) — logique de
   provenance + purge storage correcte.
5. **Flux résolution de signalement** (note obligatoire, réouverture, contrôle de
   suivi) — bonne base métier.
6. **Export CSV** (`utils/csv.ts`) et **principe** du rapport PDF.
7. **`StatusTag`** — patron à généraliser (equipment/control/intervention/member).
8. **`index.html`** (lang, theme-color, fonts, favicons) — OK.
9. **`queryClient`** config — OK.
10. Le **principe** sidebar sombre + contenu (à re-designer, pas à jeter).

---

## 16. Éléments à ajuster (existants à retoucher, pas à recréer)

| Élément | Ajustement |
|---|---|
| `Shell` (sidebar) | grouper en sections nommées ; `<Icon>` partout (retirer emojis) ; `aria-current` ; `<nav aria-label>` ; bottom-bar mobile : garder org switch + déconnexion ; overflow géré (menu « Plus ») |
| `PageHeader` | devenir un `ScreenHeader` design system : + fil d'Ariane, + retour, + zone méta ; sortir les `style={{}}` |
| `Dashboard` | contenu « à traiter » exhaustif ; période ; retirer métriques proxy ; tokeniser |
| `Parks` | tableau dense + filtres + sélection ; page de détail ; géocodage ; anti-doublon ; unifier statut création ; bouton CSV = `Button` |
| `ParkModal` | devenir page `/parks/:id` à onglets ; brancher zones/équipements/horaires/entrées/provenance/statut opérationnel/vérification ; libellés via shared ; features tri-état ; garde anti-fermeture |
| `MapScreen` | tokens ; empty-state ; `fitBounds` ; init robuste ; couches métier ; corriger le sous-titre trompeur |
| `Maintenance` | clarifier « préventif / contrôle / intervention » ; `assignee` = membre FK ; lier `equipment_id` ; statuts intermédiaires ; vue planning |
| `Reports` | `in_progress` + assignation + sévérité + notif signalant ; page détail ; corriger upload photo |
| `Reviews` | détail + sous-notes ; flag collectivité ; réponse en `Textarea` ; tri |
| `Photos` | scoping serveur ; feedback design system ; actions groupées ; raison de refus |
| `Journal` | source = `audit_log` ; filtres entité/type/date ; export ; pagination |
| `Statistiques` | dataviz tokenisée ; périodes ; masquer les cartes sans données ; export par graphe |
| `Settings` | éclater en Général / Équipe / Membres / Invitations / Rôles / Notifications / Sécurité / Abonnement ; retirer le rapport PDF vers `/rapports` |
| `InviteModal` | vrai flux d'invitation ; rôle en `radiogroup` ; libellés traduits |
| `Login` | lien « mot de passe oublié » ; `<Logo variant="brand">` |
| `tokens`/thème | appliquer l'échelle `--text-*` et les `--space-*` (DESIGN-7/8) |

---

## 17. Éléments à créer

### Composants design system (préalables — `docs/DESIGN-SYSTEM.md` §8 les note « à créer »)
`Checkbox`, `Radio` / `RadioGroup`, `Spinner`, `Skeleton`, `Banner`/`Alert`,
`Toast` (existe, à **brancher** globalement via un provider), `ScreenHeader`,
`SidebarNav` (sections), `AppHeader` (fil d'Ariane + recherche + notifs + menu),
`DataTable` (tri, sélection, pagination, colonnes), `DatePicker` / `DateRangePicker`,
`Menu` / `Dropdown`, `Tabs` (vrai, distinct de `Segmented`), `FilterBar`,
`ConfirmDialog`, `Stepper`/wizard, `StatusBadge` générique, `Timeline` (historique),
`FileDropzone`, `EmptyState` illustré (migrer `icon` string → `IconName`).

### Écrans / routes BO
- `/parks/:id` (onglets Infos / Équipements / Services / Accessibilité / Sécurité /
  Environnement / Photos / Historique)
- `/equipements` (inventaire global) · `/equipements/:id` · `/equipements/nouveau`
- `/catalogue-equipements` (features Toboggo)
- `/signalements/:id`
- `/interventions` · `/interventions/nouvelle` · `/interventions/:id`
- `/controles` · `/controles/planifier` · `/controles/:id` · `/controles/modeles`
- `/infos-a-verifier` · `/infos-a-verifier/:id` (dont file `park_edits`)
- `/planning`
- `/avis/:id`
- `/messages`
- `/notifications` · `/notifications/preferences`
- `/rapports` · `/rapports/nouveau` · `/rapports/:id` · `/documents`
- `/equipe` · `/equipe/membres` · `/equipe/invitations` · `/equipe/roles`
- `/profil`
- `/reglages` (+ sous-pages général / alertes / intégrations / exports / sécurité / abonnement)
- `/journal` (refonte `audit_log`)
- `/aide`
- (admin) `/collectivites` · `/collectivites/:id` · carte globale

### Modélisation DB à prévoir (voir §19)
Tables `interventions`, `controls` (+ `control_templates` / `control_checklist_items` /
`control_results`), `documents` (conformité), `invitations`, `bo_notifications` (ou
extension de `notifications`), éventuellement `report_assignments`.

---

## 18. Recommandations UX argumentées

> Principe directeur (repris de la consigne) : **conserver la direction Toboggo
> définie** (sobre, pro, rassurant pour une mairie, branding subtil, pas enfantin) ;
> s'inspirer des bons SaaS **uniquement** pour la compréhension, la hiérarchie,
> l'efficacité, le feedback, la prévention d'erreur, la navigation, l'a11y, le
> responsive.

1. **Passer des « listes de cartes » à des tableaux denses** pour Parcs, Équipements,
   Signalements, Interventions, Contrôles, Membres.
   *Pourquoi* : une collectivité gère des dizaines de parcs / centaines d'équipements ;
   la densité conditionne l'efficacité. Cartes = OK pour Dashboard / Photos.
   *Garde-fou* : garder la ligne cliquable → **page** de détail (pas modale).

2. **Détails = pages avec URL, pas modales.**
   *Pourquoi* : deep-link (partage à un collègue, lien dans un e-mail de notif),
   historique navigateur, onglets métier, travail en parallèle, meilleure a11y.
   *Exception* : garder la modale pour les **actions courtes** (résoudre, inviter,
   confirmer) — pas pour consulter/éditer une entité riche.

3. **Introduire un header applicatif** : fil d'Ariane à gauche, recherche globale au
   centre (`/` pour la focus), cloche de notifications + menu utilisateur à droite.
   *Pourquoi* : c'est le repère d'orientation manquant ; la sidebar seule ne suffit
   pas dès qu'il y a des sous-pages.

4. **Regrouper la sidebar en sections** (proposition, à valider avec les maquettes) :
   - *Pilotage* : Tableau de bord, Planning, Statistiques, Rapports
   - *Patrimoine* : Parcs, Équipements, Carte, Catalogue
   - *Exploitation* : Signalements, Interventions, Contrôles & inspections, Entretien
   - *Qualité des données* : Infos à vérifier, Contributions à valider, Journal
   - *Communication* : Avis, Messages, Notifications
   - *Administration* : Équipe, Réglages, (Collectivités — admin)
   - Pied : Profil, Aide

5. **Unifier le vocabulaire des statuts** et créer un `StatusBadge` unique
   (parc, équipement, contrôle, intervention, info à vérifier, membre). Un glossaire
   dans `/aide`.

6. **Feedback systématique** : `Toast` de succès après chaque écriture, `ConfirmDialog`
   design system pour les destructions (avec nom de l'entité), **undo** pour les
   actions réversibles (retirer un membre, refuser une photo).
   *Pourquoi* : prévention d'erreur + confiance (« rassurant pour une mairie »).

7. **Prévention d'erreur à la création de parc** : géocodage obligatoire avec
   confirmation visuelle sur mini-carte + appel `findDuplicateParks` → écran
   « 2 parcs similaires à moins de 200 m » avant d'insérer.

8. **États explicites** : Skeleton pendant le chargement (pas d'écran blanc),
   `EmptyState` avec illustration Toboggo + CTA (« Aucun équipement enregistré —
   Importer / Ajouter »), écran d'erreur avec « Réessayer » + code technique replié.

9. **File de travail priorisée** sur le Dashboard : une seule liste « À traiter »
   triée par urgence, agrégeant *tout* (parcs en attente, signalements par sévérité,
   photos, infos à vérifier, contrôles à échéance, interventions en retard), chaque
   ligne → action directe.

10. **Accessibilité d'abord au clavier** (outil pro, usage répété) : focus-trap dans
    les modales, `Escape` pour fermer, focus déplacé au `<h1>` au changement de route,
    raccourcis (`/` recherche, `g` + lettre pour naviguer), `aria-current` sur la nav.

11. **Responsive : cible = desktop d'abord**, mais garantir un mobile *consultable*
    (agent en tournée) : bottom-bar réduite aux 4–5 items clés + menu « Plus », org
    switch et déconnexion accessibles, tableaux → cartes en dessous de 640 px.

12. **Rapports « pour les élus »** : gabarit à la marque (couverture, sommaire,
    période, chiffres + graphes tokenisés, actions réalisées), généré serveur si
    possible, historisé dans `/rapports`, exportable PDF **et** partageable par lien.

13. **Ne jamais afficher un chiffre non producible** : si `park_scores` est vide,
    afficher « Score non encore calculé » + bouton « Calculer » (RPC existe), pas un
    « 0 » ou un faux score.

14. **Distinction Admin/Collectivité** : conserver l'approche actuelle (badge/libellé,
    pas de palette) ; ajouter un bandeau discret « Vous agissez en tant que
    *Toboggo — Admin* » quand `isAdmin`, pour éviter les erreurs de périmètre.

---

## 19. Risques DB / migrations éventuelles

> **Contexte contraignant** (`CLAUDE.md` §4, `docs/architecture/database-migration.md`
> §10–11) : coexistence V1/V2 **active et non close** ; **interdit** de créer un
> `0022+` destructif, de `push` en prod, de modifier `0001→0021`. Les migrations
> **additives non destructives** sur une base **locale/staging** restent autorisées,
> mais **aucune migration ne doit être créée dans cette phase** (consigne).

### 19.1 Ce qui NE nécessite pas de migration (DB déjà prête)
- Détail parc à onglets, features par catégorie, inventaire `park_equipment`, zones,
  entrées, horaires, provenance, `park_names`, `park_scores` (+ RPC),
  `verification_status` / `operational_status`, file `park_edits`, `audit_log`,
  anti-doublon (`find_duplicate_parks`), `report_severity` / `in_progress` /
  `reports.equipment_id`. **Tout ça existe** — il « suffit » d'écrire l'UI + les
  fonctions shared.

### 19.2 Ce qui nécessitera une modélisation DB (migration **additive**, plus tard, sur autorisation)
| Besoin | Piste | Risque |
|---|---|---|
| **Interventions** (travaux correctifs suite à signalement/contrôle) | nouvelle table `interventions` (park_id, equipment_id?, report_id?, status, assignee, dates, coût, pièces jointes) | faible (table neuve, vide) ; attention RLS multi-tenant + coexistence (colonne `organization_id`, pas `commune_id`) |
| **Contrôles & inspections réglementaires** | `controls` + `control_templates` + `control_checklist_items` + `control_results` | moyen (4 tables liées) ; bien cadrer avec le métier (EN 1176 ?) |
| **Modèles / checklists** | cf. ci-dessus | faible techniquement |
| **Documents & conformité** | `documents` (org/park/equipment scope, type, échéance, fichier, statut) + bucket storage | moyen (storage RLS) |
| **Invitations** | `invitations` (email, role, org, token, expires_at, accepted_at, invited_by) + fonction edge d'envoi + RLS | moyen ; remplace le `signInWithOtp` client |
| **Notifications BO / staff** | étendre `notifications` (ajouter `organization_id`, types BO) **ou** table `bo_notifications` | faible-moyen ; l'`enum notification_type` V1 est restreint → ajout de valeurs = migration additive |
| **Assignation de signalement** | colonnes `assigned_to` / `assigned_at` sur `reports` (additif) ou table `report_assignments` | faible |
| **Planning** | vue SQL agrégeant `maintenance` + `interventions` + `controls` par date | faible (vue) |
| **Automatisations / alertes** | table `automation_rules` | moyen (exécution : cron / edge functions) |
| **Abonnement / quotas** | intégration Stripe (hors DB pure) + table `subscriptions` | élevé (paiement) |

### 19.3 Risques transverses
- **Coexistence V1/V2** : toute nouvelle table doit se rattacher via
  `organization_id` (V2), **pas** `commune_id` (V1). Les triggers `*_v1_compat` ne
  couvriront pas les nouvelles tables → cohérence à assurer côté API shared.
- **`park.commune_id` vs `organization_parks`** : à trancher **avant** d'ouvrir plus
  d'écrans scopés commune (P0-1). Décision produit + éventuel trigger additif.
- **RLS** : chaque nouvelle table = nouvelles policies par rôle (5 rôles + staff) —
  effort récurrent, à industrialiser (helpers `is_org_*` réutilisables).
- **`gen types --linked`** : régénérer `packages/shared/src/types/database.types.ts`
  après toute évolution de schéma (jamais à la main).
- **Enums restreints** (`notification_type`, `report_status`) : les étendre = `ALTER
  TYPE ADD VALUE` (additif, mais non transactionnel — précautions).

---

## 20. Plan d'implémentation par lots

> Chaque lot est pensé pour être **livrable, testable (`typecheck` + `build:backoffice`),
> et sans régression**. Aucun lot ne touche la prod DB ni ne crée de migration sans
> autorisation explicite du fondateur.

### Lot 0 — Filet de sécurité (P0, ~2–3 j)
- `ErrorBoundary` global + par section + écran d'erreur « Réessayer ».
- Écran de chargement (`App` gate) + `Skeleton` minimal.
- Corriger P0-2 (coordonnées) : bloquer la création de parc sans lat/lng réelles
  (géocodage en Lot 3 ; d'ici là, champ obligatoire + mini-carte de confirmation).
- Investiguer + corriger P0-1 (scoping commune) — décision avec le fondateur.
- Corriger B3 (upload photo signalement : `userId`).
- Corriger B4 (statut de parc à la création selon rôle).
- Audit RLS ciblé (rapport écrit, pas de code prod).

### Lot 1 — Design system : combler les manques (P1, ~4–5 j)
`Checkbox`, `Radio/RadioGroup`, `Spinner`, `Skeleton`, `Banner/Alert`,
provider `Toast`, `ConfirmDialog`, `Menu/Dropdown`, `Tabs`, `DataTable` v1
(tri + pagination), `DateField`, `EmptyState` illustré (icon → `IconName`).
Aucune consommation encore → zéro régression visuelle.

### Lot 2 — Coquille : Shell + Header + navigation (P1, ~3–4 j)
- `SidebarNav` avec sections (validé maquettes).
- `AppHeader` (fil d'Ariane + recherche globale + notifs + menu utilisateur).
- `ScreenHeader` unifié (remplace `PageHeader`).
- a11y nav (`aria-current`, landmarks, skip-link, focus au changement de route).
- Responsive bottom-bar repensée.
- Remplacer les emojis de nav par `<Icon>` (ajouter les symboles manquants au sprite
  ×3 à partir des SVG fournis par le fondateur — **ne pas dessiner à la main**).

### Lot 3 — Parcs : liste dense + page de détail (P1, ~5–7 j)
- `/parks` en `DataTable` (filtres, colonnes métier, sélection multiple, état d'URL).
- `/parks/:id` page à onglets : Infos · Équipements · Services · Accessibilité ·
  Sécurité · Environnement · Photos · Historique (`audit_log`).
- Géocodage à la saisie + `findDuplicateParks` avant création.
- `park_features` tri-état ; libellés via `@toboggo/shared`.
- Statut opérationnel / vérification éditables.
- API shared : `api/equipment.ts`, compléter `api/parkDetails.ts` côté écriture.

### Lot 4 — Équipements (P1, ~5–7 j)
- `/equipements` (inventaire global, `park_equipment`), `/equipements/:id`
  (cycle de vie + timeline), création/édition, `/catalogue-equipements` (features).
- Lien équipement ↔ signalement ↔ contrôle ↔ intervention.

### Lot 5 — Exploitation : Signalements + Interventions + Contrôles (P1, ~8–12 j)
- `/signalements/:id` + `in_progress` + assignation + sévérité + notif signalant.
- **Modélisation DB** (proposition écrite → validation fondateur → migration
  additive locale/staging) : `interventions`, `controls` + templates + checklists.
- Écrans : `/interventions*`, `/controles*` (+ modèles/checklists).
- `/planning` (vue agrégée).
- Clarifier / renommer « Entretien » (fusion ou spécialisation).

### Lot 6 — Qualité des données (P1, ~5–7 j)
- `/infos-a-verifier` : `verification_status` + `park_attribute_sources` (confiance).
- File de validation `park_edits` (EXISTANT → PROPOSITION → SOURCE → décision) —
  API déjà câblée, 0 UI.
- `/journal` refondu sur `audit_log` (filtres, export, pagination).

### Lot 7 — Communication (P1/P2, ~4–6 j)
- `/avis/:id` + sous-notes + flag collectivité.
- `/messages` (`contact_messages`).
- `/notifications` + `/notifications/preferences` (+ modélisation notif BO).

### Lot 8 — Administration : Équipe, Profil, Réglages (P1, ~5–7 j)
- Éclater `/settings` → `/equipe` (membres / invitations / rôles), `/profil`,
  `/reglages` (général / alertes / intégrations / exports / sécurité / abonnement — au
  moins « général » complet, les autres en placeholders honnêtes).
- Vrai flux d'invitation (modélisation `invitations` + edge function).
- Changement de rôle ; libellés traduits ; page « Rôles et permissions » lisible.

### Lot 9 — Pilotage : Dashboard, Statistiques, Rapports (P1/P2, ~5–7 j)
- Dashboard : file « à traiter » exhaustive + période.
- Statistiques : dataviz tokenisée, périodes, masquage des cartes sans données.
- `/rapports` : gabarit marque, historique, export + lien ; `/documents`.

### Lot 10 — Passe design system sur l'existant (DESIGN-8) (P1/P2, ~6–8 j)
- Sortir les `style={{}}` inline, appliquer `--text-*` / `--space-*` / tokens couleur.
- Supprimer les hex en dur (MapScreen, Statistiques, Shell).
- QA visuelle light (DESIGN-10) + a11y (axe, clavier, lecteurs d'écran).

### Lot 11 — Finitions (P2/P3)
Carte globale admin, gestion des collectivités, centre d'aide, exports auto,
raccourcis clavier, SSO, onboarding guidé, wordmark brand sur l'auth.

---

## 21. Proposition de petits commits sûrs

> Style `CLAUDE.md` §7 : `feat(bo:…)` / `fix(bo:…)` / `refactor(bo:…)` / `docs(…)`,
> footer `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>`.
> Aucun commit sans demande explicite ; branche `feature/backoffice-collectivite`.

**Phase filet de sécurité (Lot 0) :**
1. `docs(bo): add back-office audit (this file)` — *ce document seul*.
2. `feat(bo): add global ErrorBoundary + error screen`
3. `feat(bo): boot loading screen instead of blank render`
4. `feat(ds): add Skeleton primitive` *(design system, non consommé)*
5. `fix(bo): report resolution photo uses auth uid for storage path` *(B3)*
6. `fix(bo): park creation forbids placeholder coordinates` *(B1 — étape 1 : blocage)*
7. `fix(bo): new park status follows member role` *(B4)*
8. `refactor(shared): scope listParks by organization_parks like reports/reviews` *(B2 — après décision fondateur)*
9. `docs(bo): RLS write-path audit notes` *(constat, pas de code prod)*

**Phase design system (Lot 1) — un commit par primitive :**
10. `feat(ds): Checkbox`
11. `feat(ds): RadioGroup`
12. `feat(ds): Spinner`
13. `feat(ds): Banner / Alert`
14. `feat(ds): ToastProvider + useToast`
15. `feat(ds): ConfirmDialog`
16. `feat(ds): Menu / Dropdown`
17. `feat(ds): Tabs`
18. `feat(ds): DataTable v1 (sort + pagination)`
19. `feat(ds): DateField`
20. `refactor(ds): EmptyState icon prop accepts IconName`

**Phase coquille (Lot 2) :**
21. `refactor(bo): extract SidebarNav with sections`
22. `feat(bo): AppHeader (breadcrumb + user menu)`
23. `feat(bo): global search in AppHeader`
24. `refactor(bo): PageHeader -> ScreenHeader (design system)`
25. `fix(bo): nav a11y (aria-current, landmark, skip-link, route focus)`
26. `feat(bo): mobile bottom-bar keeps org switch + sign-out`
27. `feat(ds): add missing sprite icons for BO nav (×3 copies)` *(SVG fournis)*
28. `refactor(bo): replace nav emojis with <Icon>`

**Phase Parcs (Lot 3) — commits fins :**
29. `refactor(bo): Parks list -> DataTable`
30. `feat(bo): Parks filters + URL state`
31. `feat(bo): park detail route /parks/:id (shell + Infos tab)`
32. `feat(bo): park detail — Équipements tab`
33. `feat(bo): park detail — Services / Accessibilité / Sécurité / Environnement tabs`
34. `feat(bo): park detail — Photos tab`
35. `feat(bo): park detail — Historique tab (audit_log)`
36. `feat(bo): geocoding on park address`
37. `feat(bo): duplicate check before park creation`
38. `refactor(bo): park feature toggles are tri-state`
39. `refactor(bo): drop lib/equipmentLabels, use @toboggo/shared labels`

*(les lots suivants se découpent sur le même principe : 1 écran ou 1 sous-onglet =
1 commit ; toute modélisation DB = 1 commit de proposition `.md` d'abord, puis
migration additive locale/staging seulement après « go » explicite.)*

---

## 22. Fichiers probablement concernés

### Modifiés
```
apps/backoffice/src/App.tsx                       routes détail, ErrorBoundary, loading gate
apps/backoffice/src/main.tsx                      ToastProvider
apps/backoffice/src/index.css                     layout header + breakpoints
apps/backoffice/src/components/Shell.tsx          -> SidebarNav + sections + AppHeader + a11y
apps/backoffice/src/components/Shell.module.css   sections, bottom-bar
apps/backoffice/src/components/PageHeader.tsx     -> ScreenHeader (ou suppression)
apps/backoffice/src/components/StatusTag.tsx      -> StatusBadge générique
apps/backoffice/src/components/ParkModal.tsx      -> éclaté en page /parks/:id (onglets)
apps/backoffice/src/components/ReportModal.tsx    fix upload, in_progress, assignation
apps/backoffice/src/components/MaintenanceModal.tsx  assignee = membre, equipment_id
apps/backoffice/src/components/InviteModal.tsx    vrai flux d'invitation
apps/backoffice/src/screens/*.tsx                 tous : DS, tokens, états, tableaux
apps/backoffice/src/lib/orgScope.ts / orgSession.ts  rôles, garde de rendu
apps/backoffice/src/lib/equipmentLabels.ts        suppression (doublon)
apps/backoffice/src/lib/queryClient.ts            clés normalisées
apps/backoffice/index.html                        (rien de bloquant)
packages/design-system/src/index.ts              exports nouvelles primitives
packages/design-system/src/components/*           Checkbox, Radio, Spinner, Skeleton, Banner, Toast, ConfirmDialog, Menu, Tabs, DataTable, DateField, ScreenHeader, AppHeader
packages/design-system/src/icons/icons-sprite.svg (+ 2 copies public/)  nouveaux symboles
packages/design-system/src/icons/Icon.tsx / iconMap.ts   IconName étendu
packages/shared/src/index.ts                     nouveaux exports
packages/shared/src/api/parks.ts                 scoping, géocodage, dédup
packages/shared/src/api/parkDetails.ts           écriture zones/entrées/horaires
packages/shared/src/api/reports.ts               assignation, severity, in_progress
packages/shared/src/api/maintenance.ts           statuts, equipment_id
packages/shared/src/api/team.ts                  invitations, changement de rôle
packages/shared/src/api/notifications.ts         source audit_log, notif BO
packages/shared/src/api/contributions.ts         brancher park_edits dans le BO
packages/shared/src/types.ts                     labels de rôles, statuts BO
```

### Créés (côté app)
```
apps/backoffice/src/components/ErrorBoundary.tsx
apps/backoffice/src/components/AppHeader.tsx
apps/backoffice/src/components/SidebarNav.tsx
apps/backoffice/src/lib/permissions.ts            (matrice rôle → capacités, côté rendu)
apps/backoffice/src/screens/ParkDetail.tsx (+ onglets)
apps/backoffice/src/screens/Equipment*.tsx
apps/backoffice/src/screens/CatalogEquipment.tsx
apps/backoffice/src/screens/ReportDetail.tsx
apps/backoffice/src/screens/Interventions*.tsx
apps/backoffice/src/screens/Controls*.tsx  (+ ControlTemplates)
apps/backoffice/src/screens/InfoToVerify*.tsx
apps/backoffice/src/screens/ContributionQueue.tsx
apps/backoffice/src/screens/Planning.tsx
apps/backoffice/src/screens/ReviewDetail.tsx
apps/backoffice/src/screens/Messages.tsx
apps/backoffice/src/screens/Notifications.tsx + NotificationPrefs.tsx
apps/backoffice/src/screens/Reports*  (rapports) + Documents.tsx
apps/backoffice/src/screens/Team*.tsx (Members, Invitations, Roles)
apps/backoffice/src/screens/Profile.tsx
apps/backoffice/src/screens/settings/*.tsx  (Général, Alertes, Intégrations, Exports, Sécurité, Abonnement)
apps/backoffice/src/screens/Help.tsx
apps/backoffice/src/screens/admin/Organizations*.tsx
```

### Créés (côté shared / DB — **sur autorisation uniquement**)
```
packages/shared/src/api/equipment.ts
packages/shared/src/api/interventions.ts
packages/shared/src/api/controls.ts
packages/shared/src/api/documents.ts
packages/shared/src/api/verification.ts
packages/shared/src/api/geocode.ts
docs/architecture/<proposition>-interventions-controls-model.md   (avant toute migration)
supabase/migrations-v2-draft/…  OU  local/staging additive migrations (jamais prod)
```

---

## Annexe A — Inventaire des `@toboggo/shared` déjà disponibles et non utilisés par le BO

| Fonction shared | Usage BO possible | Statut |
|---|---|---|
| `sendPasswordReset` | lien reset sur `/login` | non exposé |
| `signInWithGoogle` | SSO BO | non exposé |
| `deleteOwnAccount` | page `/profil` | non exposé |
| `flagReview` | modération douce des avis | non exposé |
| `submitParkEdit` / `listParkEdits` / `reviewParkEdit` | file de validation | **câblé, 0 call site** |
| `findDuplicateParks` | anti-doublon création | 0 appel |
| `listFeatures` / `listParkFeatures` / `setParkFeature` / `removeParkFeature` | onglets services/équipements du parc | 0 appel BO |
| `listZones` / `upsertZone` / `deleteZone` | zones internes | 0 appel BO |
| `listEntrances` / `listOpeningHours` / `listSources` / `listExternalIds` / `listNames` | onglets provenance / accès / horaires | 0 appel BO |
| `getLatestScore` / `recalculateScore` | Toboggo Score par parc | 0 appel BO |
| `listAuditLog` | journal complet | 0 appel BO (BO lit `activity_log`) |
| `incrementParkViews` | n/a (app parents) | — |
| `utils/weather.ts` | alertes météo Dashboard | 0 appel BO |

## Annexe B — Vérifications recommandées sur la prod (lecture seule) avant de coder

1. Un parc créé via le BO : `SELECT commune_id, moderation_status FROM parks WHERE …` —
   confirmer P0-1 (probable, non testé ici).
2. RLS : sous un JWT `contributeur`, tester `UPDATE parks` / `INSERT maintenance` /
   `INSERT team_members` / `UPDATE park_media` → doivent être **refusés**.
3. `park_public.commune_id` : est-il projeté depuis `parks.commune_id` (V1) ou depuis
   `organization_parks` ? (détermine le correctif P0-1).
4. Storage `report-photos` : la policy 0027 exige-t-elle `auth.uid()` en préfixe ?
   (confirme B3).
5. `activity_log` vs `audit_log` : volumétrie réelle et complétude en prod.

---

*Fin de l'audit — 2026-09-04. Aucune modification de code, de migration ou de
configuration n'a été effectuée. Prochaine étape suggérée : fournir les maquettes de
référence du BO Collectivité pour compléter la section 6, puis démarrer le Lot 0.*
