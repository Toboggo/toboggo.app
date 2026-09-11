# Audit — Back Office Collectivité Toboggo

> **Nature du document** : audit d'écart réalisé **avant toute implémentation**, sur la
> branche `feature/backoffice-collectivite` (worktree `toboggo-wt-backoffice`).
> Aucune ligne de code applicatif, aucune migration, aucun composant n'a été modifié
> pour produire ce document.
>
> **Révisions :**
> - **2026-09-04 (v1)** — audit initial (constat code / shared / design system / Supabase).
> - **2026-09-04 (v2)** — ajout de la **§6 bis « Référence UX/UI officielle et
>   arbitrages »** (direction design communiquée par le fondateur), révision de la
>   **§14 (priorités)** et remplacement de la **§20 (roadmap)** par une roadmap en
>   **8 lots max**. La §21 devient un simple renvoi (les commits sont désormais
>   listés lot par lot dans la §20). Le reste (constat §1–§13, §15–§19, annexes)
>   est inchangé.
>
> **Périmètre** : `apps/backoffice` (l'application back-office unique, role-routée
> admin Toboggo / collectivité), sa couche d'accès `packages/shared/src/api/*`, le
> design system `packages/design-system`, et le schéma Supabase (`supabase/migrations`,
> lecture seule). L'accent est mis sur la **surface Collectivité** ; la surface Admin
> est traitée là où elle partage le même code.
>
> **Sur les maquettes** : la **direction UX/UI officielle** du BO Collectivité est
> désormais fixée par la **§6 bis** (fait référence, prime sur les hypothèses de la
> §6). Les **maquettes pixel** correspondantes ne sont toujours pas dans le dépôt ni
> connectées à Claude Code ; la conformité écran par écran devra être confrontée à
> ces maquettes au fil des lots. Le dossier `design-bundle/` reste le prototype de
> **l'app parents**, pas le BO.

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
| **Conformité à la direction UX/UI officielle** (§6 bis) | **~25 %** | ossature sidebar OK ; dashboard non orienté action, pas de header, détails en modale, densité « cartes » |
| **Conformité aux maquettes pixel** | **non mesurable** | maquettes pixel absentes du dépôt ; direction écrite fixée en §6 bis |
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

> **La plupart de ces questions sont tranchées par la §6 bis ci-dessous.** Ce qui
> reste ouvert : libellés exacts / ordre des items de sidebar, gabarit du rapport
> PDF, mode « checklist terrain », typologie précise des documents réglementaires.

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

## 6 bis. Référence UX/UI officielle et arbitrages

> **Ajout v2 (2026-09-04).** Direction UX/UI **officielle** du BO Collectivité,
> communiquée par le fondateur. **Fait référence** : prime sur les hypothèses de la
> §6 et cadre la roadmap de la §20. Les maquettes pixel restent à confronter au fil
> des lots, mais la direction ci-dessous est arrêtée.

### 6 bis.1 Positionnement produit

Le BO Collectivité est un **outil métier d'exploitation** pour une mairie /
collectivité. Il doit être **professionnel, sobre, lumineux, moderne, opérationnel**,
adapté à un agent de collectivité, **clairement Toboggo sans devenir enfantin**.
Ce n'est ni l'app parents (ludique, colorée), ni un back-office austère : c'est un
SaaS métier à l'identité Toboggo **discrète mais présente**.

### 6 bis.2 Direction visuelle (arrêtée)

| Élément | Règle officielle | Implication vs état actuel |
|---|---|---|
| **Sidebar** | Sidebar Toboggo **structurante** (repère de navigation principal, sections claires) | garder le principe ; **regrouper en sections**, remplacer les emojis par `<Icon>` |
| **Surfaces** | Surfaces principales **claires / blanches** (`--color-surface`, `--color-bg`) ; la couleur porte la structure, pas le fond | OK sur le fond ; retirer les aplats/inline hex |
| **Vert Toboggo** | Pour la **structure et la marque** (sidebar, éléments actifs, sélection, entêtes, liens, primaires) | conforme au design system ; à généraliser via tokens |
| **Orange (accent)** | **Avec parcimonie** : accent / attention / action pertinente uniquement (badge d'alerte, compteur « à traiter », CTA ponctuel, étoile d'avis) | aujourd'hui l'orange sert de couleur de badge générique — le **réserver à l'attention réelle** |
| **Hiérarchie** | Titre / contexte / actions **clairement hiérarchisés** sur chaque écran (un `ScreenHeader` homogène) | `PageHeader` à faire évoluer, ajouter fil d'Ariane + zone d'actions |
| **Composants** | Cartes, tableaux, formulaires, **statuts homogènes** partout | créer `DataTable`, `StatusBadge` générique, unifier les cartes |
| **Densité** | **Densité outil métier** : listes → **tableaux denses**, pas des cartes empilées ; cartes réservées au dashboard et aux médias | refonte des listes Parcs / Signalements / Équipements / Membres |
| **Cibles** | **Desktop-first**, utilisable **laptop et tablette** ; mobile = consultation dépannage | breakpoints à ajouter ; tablette = 2 colonnes max, tableaux scrollables |
| **Thème** | Light only (dark différé, décision #8) ; branding subtil ; **jamais enfantin** (pas d'emoji picto, illustrations sobres) | supprimer emojis d'interface (décision #6) |

### 6 bis.3 Dashboard — orienté ACTION (arrêté)

Le dashboard n'est **pas** une page de chiffres : l'utilisateur doit **immédiatement
comprendre ce qui nécessite son attention**. Contenu officiel :

| Bloc | Source de données réelle | Règle |
|---|---|---|
| **Signalements ouverts** | `reports` (status `open` / `in_progress`), scopés commune, triés par sévérité | nombre + accès direct à la file ; 0 ⇒ état « rien à traiter », pas un « 0 » sec |
| **Infos à vérifier** | `park_attribute_sources` (`is_current`, `confidence`) + `park_edits` `pending` + `verification_status` | liste des champs douteux / propositions en attente |
| **Contrôles à venir** | `park_equipment.next_inspection_at` + (futur) `controls` | échéances J+30, en retard en tête |
| **Interventions en cours** | (futur) `interventions` (status `in_progress` / `planned`) | + interventions en retard |
| **État général des parcs** | `parks` par `moderation_status` + `operational_status` + parcs sans photo / sans équipement | synthèse + parcs « incomplets » |

- Une **file unique « À traiter »** agrège tout, triée par urgence, chaque ligne →
  **action directe** (pas juste un lien vers une liste).
- Aucune métrique proxy (supprimer « Utilisateurs actifs » = `distinct(reports.user_id)`).
- Sélecteur de **période** pour les tendances, mais l'attention passe avant la stat.

### 6 bis.4 Fiche parc — sous-sections officielles (arrêté)

`/parks/:id` = **page** (URL, pas modale), structurée en sous-sections cohérentes,
dans cet ordre :

1. **Informations générales** — nom, adresse (géocodée), coordonnées, commune,
   `operational_status`, `verification_status`, âges, description, horaires,
   entrées / accès.
2. **Équipements** — équipements **réellement installés** (`park_equipment`) :
   type (depuis le catalogue), fabricant, modèle, quantité, condition, dates
   d'installation / dernier contrôle / prochain contrôle, statut cycle de vie.
3. **Services** — `park_features` catégorie `service` (WC, bancs, parking, eau…),
   en tri-état `available / unavailable / unknown / temporarily_unavailable`.
4. **Accessibilité** — `park_features` catégorie `accessibility` + `park_entrances`
   (accès PMR).
5. **Sécurité** — `park_features` catégorie `safety` (clôture, sol amortissant,
   éclairage…) + synthèse des anomalies équipement ouvertes.
6. **Environnement / features** — `park_features` catégorie `environment` /
   `play` (ombrage, végétation, type de sol…).
7. **Photos** — `park_media` approuvées, couverture, provenance.
8. **Historique** — `audit_log` de l'entité parc + événements liés
   (signalements, interventions, contrôles) sur une **timeline**.

### 6 bis.5 Équipements — catalogue vs installé (arrêté)

Distinction **structurante** à respecter partout :

| Notion | Table | Écran | Rôle |
|---|---|---|---|
| **Catalogue / type d'équipement** | `features` (catégorie `play`) + réf. constructeur si besoin | `/catalogue-equipements` (surtout admin / staff) | définit les **types** disponibles (toboggan, balançoire, structure multi-jeux…) |
| **Équipement installé** | `park_equipment` | `/equipements` (inventaire), `/equipements/:id` | une **instance physique** dans un parc précis : fabricant, modèle, n° série, condition, dates de contrôle, cycle de vie |

L'inventaire global `/equipements` liste les **instances**, filtrable par parc, type,
condition, échéance de contrôle. Chaque instance a un **cycle de vie** :
`planned → installed → (out_of_service) → removed`, avec condition
(`new/good/fair/poor/out_of_service/unknown`).

### 6 bis.6 Workflows métier (arrêtés)

**Workflow signalement :**

```
signalement (parent / agent)
  → analyse (agent : lecture, qualification, sévérité, rattachement équipement/zone)
  → intervention éventuelle (créée depuis le signalement, assignée)
  → réalisation (travaux)
  → preuve / commentaire (photo « après », note obligatoire)
  → résolution (statut resolved, notification au signalant)
  → historique (timeline parc + équipement)
```

- Statuts signalement : `open → in_progress → resolved` (+ `dismissed`).
- Le lien **signalement ↔ intervention** est explicite (une intervention peut naître
  d'un signalement, d'un contrôle, ou d'une décision directe).

**Workflow équipement :**

```
équipement installé
  → maintenance (préventive, planifiée, récurrente)
  → contrôle (inspection périodique / réglementaire, avec checklist)
  → anomalie éventuelle (constatée au contrôle ou signalée)
  → intervention (corrective, assignée, avec preuve)
  → historique (timeline équipement : chaque maintenance / contrôle / anomalie / intervention)
```

- **Maintenance ≠ contrôle ≠ intervention** : trois objets distincts (l'écran
  « Entretien » actuel les conflate — à séparer).
  - *Maintenance* = tâche récurrente planifiée (nettoyage, graissage…).
  - *Contrôle / inspection* = vérification périodique avec **checklist** et résultat
    (conforme / non conforme / réserves), potentiellement réglementaire.
  - *Intervention* = action corrective ponctuelle, souvent déclenchée par un
    signalement ou une anomalie de contrôle, avec assignation et preuve.

### 6 bis.7 Infos à vérifier — structure officielle (arrêté)

Chaque ligne « info à vérifier » présente :

| Champ | Contenu | Source données |
|---|---|---|
| **Contexte** | quel parc, quel attribut, pourquoi c'est douteux | `park_attribute_sources.attribute_key`, `confidence` |
| **Valeur actuelle** | ce qui est affiché aujourd'hui | `park_public` / `parks` |
| **Proposition** | nouvelle valeur suggérée | `park_edits.changes` ou source externe |
| **Source** | d'où vient la proposition (parent, OSM, open data, import, agent) | `park_edits.user_id` / `park_sources` / `source_type` |
| **Décision** | valider / refuser / modifier (avec motif) | action → `reviewParkEdit` + `park_attribute_sources` |
| **Conséquence de l'action** | ce qui change si on valide (champ mis à jour, `verified_at`, `verification_status`) | affiché **avant** confirmation |

### 6 bis.8 Permissions = reflet du backend/RLS (arrêté)

- **L'UI ne montre jamais comme disponible une action interdite** à l'utilisateur
  courant (bouton absent ou désactivé avec explication, pas « présent puis erreur »).
- Une couche `lib/permissions.ts` (matrice **rôle → capacité**) est dérivée du modèle
  RLS et pilote le rendu ; la RLS reste la source de vérité (défense en profondeur).
- Rôles : `contributeur` / `gestionnaire` (collectivité) + `super_admin` /
  `moderation` / `support` (staff). Libellés **traduits** dans l'UI.
- **Préalable P0** : audit RLS ciblé (§13 B7) pour établir la matrice réelle.

### 6 bis.9 Aucune donnée fictive (arrêté)

Ne **jamais** reproduire, même comme placeholder de démo : faux chiffres, faux
utilisateurs, faux parcs, fausses statistiques, faux abonnements, faux quotas,
fausses intégrations. Si une donnée n'existe pas encore :

- métrique vide → « Non encore disponible » / « Aucun contrôle planifié » + CTA ;
- score non calculé → bouton « Calculer » (`recalculateScore`), pas un « 0 » ;
- écran d'abonnement / quotas / intégrations non branché → **placeholder honnête**
  (« Bientôt disponible ») ou écran non exposé, jamais une fausse UI fonctionnelle.

### 6 bis.10 Patterns SaaS autorisés (au service de la direction, pas à sa place)

Autorisés et attendus : skeleton loading, empty states illustrés (sobres),
error states + « réessayer », toasts, confirmations non natives, validation inline,
**dirty state** + prévention de perte de modifications, filtres, recherche,
pagination, accessibilité (focus-trap, clavier, ARIA), responsive.

**Interdit** : s'en servir pour **remplacer arbitrairement** la direction visuelle
Toboggo (couleurs, sidebar, densité, ton). Les patterns habillent, ils ne redéfinissent
pas l'identité.

### 6 bis.11 Adoption progressive du design system (arrêté)

- **Pas de refonte Big Bang** juste pour supprimer les `style={{}}`.
- On tokenise **au fil des lots** : chaque écran retouché pour une raison métier
  sort de l'inline style à cette occasion (DESIGN-8 amorcé lot par lot).
- Les **primitives manquantes** (`Skeleton`, `Toast`, `DataTable`, `StatusBadge`,
  `ConfirmDialog`, `Tabs`, `Checkbox`, `Radio`, `Spinner`, `Banner`, `ScreenHeader`,
  `AppHeader`, `SidebarNav`) sont livrées **d'abord** (lot 1) puis consommées.

### 6 bis.12 Priorités officielles (remplacent la hiérarchie de la §14 v1)

| Niveau | Contenu |
|---|---|
| **P0** | intégrité des données · scoping collectivité · permissions (UI = RLS) · shell / navigation (sidebar sections + header) · feedback système essentiel (erreurs, loading, toasts) · **parcs réellement fonctionnels** (création fiable, fiche à onglets) |
| **P1** | signalements · interventions · contrôles · infos à vérifier · équipements (catalogue + installés) |
| **P2** | maintenance · planning · équipe · notifications · avis / messages |
| **P3** | statistiques avancées · rapports avancés · intégrations · exports automatiques · quotas · fonctions secondaires (centre d'aide, onboarding, SSO) |

### 6 bis.13 Arbitrages UX importants

| # | Sujet | Arbitrage retenu | Raison |
|---|---|---|---|
| AR-1 | **Détail = page ou modale ?** | **Page** (`/entity/:id`) pour toute entité riche (parc, équipement, signalement, intervention, contrôle, avis, info à vérifier). Modale réservée aux **actions courtes** (résoudre, inviter, confirmer, éditer 1–2 champs). | deep-link, historique, onglets, a11y, travail en parallèle |
| AR-2 | **Listes = cartes ou tableau ?** | **Tableau dense** (`DataTable`) pour Parcs, Équipements, Signalements, Interventions, Contrôles, Membres, Infos à vérifier. **Cartes** pour Dashboard et Photos uniquement. | densité outil métier |
| AR-3 | **Header applicatif** | **Oui** : fil d'Ariane (gauche) · recherche globale (centre, `/` pour focus) · cloche notifications + menu utilisateur (droite). Le switch d'organisation reste en **sidebar** (haut). | orientation, cohérent avec la sidebar structurante |
| AR-4 | **Sidebar** | Regroupée en **sections nommées** (proposition §18 : Pilotage / Patrimoine / Exploitation / Qualité des données / Communication / Administration). Emojis → `<Icon>` (sprite, symboles fournis par le fondateur). | lisibilité, décision #5/#6 |
| AR-5 | **« Entretien » actuel** | **Éclaté** en Maintenance (préventif récurrent) · Contrôles & inspections (checklist + résultat) · Interventions (correctif assigné). L'écran `/maintenance` devient « Maintenance » au sens strict. | workflows §6 bis.6, vocabulaire métier |
| AR-6 | **Équipements** | Deux surfaces distinctes : **catalogue** (types) et **inventaire** (instances `park_equipment`). Jamais mélangées. | §6 bis.5 |
| AR-7 | **Orange** | **Réservé à l'attention/alerte/action pertinente.** Les badges de comptage neutres passent en gris/vert ; l'orange = « il faut agir ». | direction §6 bis.2 |
| AR-8 | **Permissions** | Action interdite = **bouton masqué** (si l'utilisateur ne fait jamais cette action pour son rôle) ou **désactivé + tooltip** (si contextuel). Jamais « visible puis 403 ». | §6 bis.8 |
| AR-9 | **Dirty state** | Tout formulaire d'édition : suivi des modifications + **blocage de navigation / fermeture** avec confirmation si non enregistré. `Dialog` : clic-fond ne ferme plus un formulaire modifié sans confirmation. | prévention de perte |
| AR-10 | **Statuts** | Un seul composant `StatusBadge` + un **glossaire** dans `/aide`. Vocabulaire unifié (parc, équipement, contrôle, intervention, info, membre). | homogénéité §6 bis.2 |
| AR-11 | **Données vides** | Empty state **contextuel** (illustration sobre + explication + CTA) ≠ état d'erreur ≠ « aucun résultat de filtre ». Jamais de fausse donnée de remplissage. | §6 bis.9 |
| AR-12 | **Rapports / conformité** | Gabarit **à la marque** (couverture, période, chiffres réels + graphes tokenisés) ; historisé dans `/rapports` ; PDF **et** lien partageable. Pas de chiffre non producible. | attendu « pour les élus » |
| AR-13 | **Migrations** | Aucune dans les lots 0–1. À partir du lot 2, toute nouvelle table = **note de modélisation `.md` validée par le fondateur d'abord**, puis migration **additive** locale/staging (jamais prod, jamais `0022+` destructif — `CLAUDE.md` §4). | contrainte coexistence V1/V2 |
| AR-14 | **Tablette** | Layout **desktop-first** ; à ≤ 1024 px : sidebar rétractable en rail d'icônes, tableaux en scroll horizontal contrôlé, 2 colonnes max. Mobile = consultation. | cible officielle |

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

> **Révisée en v2** pour s'aligner sur les **priorités officielles** (§6 bis.12).
> Les buckets ci-dessous sont la référence ; la §20 les traduit en 8 lots.

### P0 — socle (intégrité, périmètre, sécurité, navigation, feedback, parcs)
- **Intégrité des données** : coordonnées de parc réelles (B1/P0-2), pas d'écriture
  inventée.
- **Scoping collectivité** : un parc/photo créé par une collectivité doit rester
  visible pour elle (B2/P0-1) — décision `commune_id` vs `organization_parks`.
- **Permissions = RLS** : audit RLS ciblé (B7) → matrice `lib/permissions.ts` → l'UI
  ne propose que ce qui est réellement permis (AR-8).
- **Shell / navigation** : sidebar en sections + `AppHeader` (fil d'Ariane, recherche,
  notifications, menu) ; bottom-bar mobile qui conserve switch org + déconnexion.
- **Feedback système essentiel** : `ErrorBoundary` + écran d'erreur (B6), écran de
  chargement / `Skeleton`, `Toast` de succès, `ConfirmDialog` non natif.
- **Parcs réellement fonctionnels** : création fiable (géocodage, statut selon rôle,
  anti-doublon), **fiche parc en page à onglets** (§6 bis.4), features tri-état,
  `MapScreen` robuste (B8).

### P1 — cœur métier exploitation
- **Signalements** : page de détail, `in_progress`, assignation, sévérité, preuve,
  notification au signalant, correctif upload photo (B3).
- **Interventions** : nouvelle entité + écrans (liste / détail / création), reliées
  aux signalements et aux anomalies d'équipement (workflow §6 bis.6).
- **Contrôles & inspections** : entité + modèles / checklists + résultats.
- **Infos à vérifier** : contexte / valeur / proposition / source / décision /
  conséquence (§6 bis.7) ; file `park_edits` (API déjà câblée).
- **Équipements** : catalogue (types) **et** inventaire des instances installées
  (`park_equipment`) + cycle de vie + échéances de contrôle (§6 bis.5).

### P2 — exploitation étendue & collaboration
- **Maintenance** (préventif récurrent, séparé des contrôles / interventions).
- **Planning global** (maintenance + contrôles + interventions par échéance).
- **Équipe** : pages Membres / Invitations / Rôles ; changement de rôle ; libellés
  traduits ; vrai flux d'invitation (B5). **Profil** BO.
- **Notifications** BO + préférences.
- **Avis** (détail + sous-notes + flag collectivité) & **Messages** (`contact_messages`).
- **Journal** unifié sur `audit_log` (filtres, export, pagination).

### P3 — fonctions secondaires
- Statistiques avancées (dataviz tokenisée, périodes) — quand il y a des données.
- Rapports avancés / conformité / documents (au-delà du PDF actuel).
- Intégrations (imports OSM / open data exposés), exports automatiques, abonnement /
  quotas (Stripe — non branché).
- Carte globale admin, gestion des collectivités, centre d'aide, onboarding guidé,
  raccourcis clavier, SSO Google, wordmark `variant="brand"` sur l'auth.

### Transverse (tous lots) — adoption progressive du design system
Tokenisation **au fil des écrans retouchés** (pas de Big Bang, §6 bis.11) ;
accessibilité (focus-trap modales, clavier, ARIA) ; responsive desktop→tablette ;
pagination généralisée ; suppression des emojis d'interface.

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

## 20. Roadmap (8 lots)

> **Remplace la roadmap v1 (12 lots).** Chaque lot est **livrable, testable
> (`typecheck` + `build:backoffice`), sans régression**, et applique la direction
> §6 bis. **Aucun lot ne touche la prod DB ni ne crée de migration sans note de
> modélisation `.md` validée par le fondateur au préalable** (AR-13, §19). La
> tokenisation du design system se fait **au fil des écrans retouchés** dans chaque
> lot (pas de lot « refonte inline styles » dédié — §6 bis.11).
>
> Estimations en jours = ordre de grandeur pour 1 dev front + appui DB ponctuel.

| Lot | Titre | Priorité | Migration DB | ~Jours |
|---|---|---|---|---|
| 1 | Socle : fiabilité, permissions, périmètre | P0 | non | 6–9 |
| 2 | Coquille : sidebar sections + header + dashboard action (v1) | P0 | non | 6–9 |
| 3 | Parcs réellement fonctionnels (liste dense + fiche à onglets) | P0 | non (option) | 10–14 |
| 4 | Équipements : catalogue + inventaire installé + cycle de vie | P1 | non (option) | 8–12 |
| 5 | Signalements + Interventions (workflow bout en bout) | P1 | **oui** | 12–16 |
| 6 | Contrôles & inspections + Infos à vérifier | P1 | **oui** | 12–16 |
| 7 | Exploitation étendue : maintenance, planning, équipe, notifs, avis/messages, journal | P2 | **oui** (invitations, notifs BO) | 12–18 |
| 8 | Pilotage & réglages : dashboard complet, stats, rapports/conformité, réglages, finitions | P2/P3 | non (option) | 10–14 |

---

### Lot 1 — Socle : fiabilité, permissions, périmètre  · **P0**

- **Objectif utilisateur** : l'outil ne « ment » plus — les pannes sont visibles, les
  actions donnent un retour, un parc/photo créé par ma collectivité reste visible, et
  je ne vois que les actions que j'ai le droit de faire.
- **Écrans concernés** : `App` (gate), tous les écrans (feedback), `Parks` +
  `ParkModal`, `ReportModal`, `Photos`, `MapScreen`.
- **Changements frontend** :
  - `ErrorBoundary` global + par section + écran d'erreur « Réessayer » (code technique replié).
  - Écran de chargement au boot ; `Skeleton` de liste/carte à la place des blancs.
  - Primitives design system livrées ici : `Skeleton`, `Spinner`, `Banner/Alert`,
    `ToastProvider` + `useToast`, `ConfirmDialog` (remplace `confirm()`/`alert()`).
  - Toast de succès après chaque écriture ; confirmations non natives pour les destructions.
  - `lib/permissions.ts` : matrice **rôle → capacité** (dérivée de l'audit RLS) ;
    boutons masqués/désactivés+tooltip selon le rôle réel (AR-8).
  - `MapScreen` : empty-state explicite, init indépendante du nombre de parcs, `fitBounds`.
  - Corriger le sous-titre trompeur de `MapScreen` (rattachement « géographique »).
- **Données / API** :
  - **Audit RLS ciblé** (lecture seule prod / local) : `parks`, `maintenance`,
    `team_members`, `park_media`, `reports`, `reviews` — INSERT/UPDATE/DELETE par rôle.
    Livrable = tableau écrit dans ce doc (annexe) + `permissions.ts`.
  - `api/reports.ts` : `uploadPhoto(..., userId)` au lieu de `communeId` (**B3**).
  - `api/parks.ts` : refuser `createPark` sans `latitude/longitude` réels
    (supprimer le fallback `45.75/4.85`) (**B1**).
  - Décision **B2/P0-1** avec le fondateur : (a) `listParks` scopé via
    `organization_parks` comme reports/reviews, **ou** (b) renseigner `commune_id`
    à la création + backfill. Vérifier d'abord sur prod comment `park_public.commune_id`
    est projeté (annexe B, point 3).
  - `ParkModal "new"` : `moderation_status` selon rôle (`pending` pour contributeur),
    aligné avec l'import CSV (**B4**).
- **Migration nécessaire** : **non** (l'option B2(b) « renseigner `commune_id` » se
  fait côté API en coexistence ; si un trigger est jugé préférable → note `.md` + go).
- **Dépendances** : aucune (lot d'entrée). L'audit RLS conditionne `permissions.ts`.
- **Tests** :
  - `typecheck` + `build:backoffice` verts.
  - Manuel : couper le réseau → écran d'erreur (pas écran vide) ; créer un parc sans
    adresse géocodable → refus ; créer un parc en tant que collectivité → il apparaît
    dans « Mes parcs » ; résoudre un signalement avec photo (collectivité) → la photo
    est bien stockée.
  - RLS : sous un JWT `contributeur`, `UPDATE parks` / `INSERT maintenance` /
    `INSERT team_members` → refusés (documenté).
  - a11y : `ConfirmDialog` piège le focus, ferme sur `Escape`, restaure le focus.
- **Critères d'acceptation** :
  - Aucune requête en échec ne produit un écran indiscernable d'un empty-state.
  - Aucune action visible et cliquable ne renvoie un 403.
  - Aucun parc ne peut être créé avec des coordonnées inventées.
  - Un parc/une photo créé par une collectivité est visible par cette collectivité.
  - Chaque écriture produit un toast ; chaque destruction une confirmation non native.
- **Risques** :
  - B2 : selon la projection de `park_public.commune_id`, l'option (a) peut changer
    le périmètre de parcs vus par l'admin → tester les deux profils.
  - `permissions.ts` peut diverger de la RLS si l'audit est incomplet → la RLS reste
    la source de vérité (défense en profondeur), `permissions.ts` = confort UX.
- **Petits commits** :
  1. `feat(ds): Skeleton + Spinner primitives`
  2. `feat(ds): Banner/Alert primitive`
  3. `feat(ds): ToastProvider + useToast`
  4. `feat(ds): ConfirmDialog`
  5. `feat(bo): global + section ErrorBoundary and error screen`
  6. `feat(bo): boot loading screen; skeleton lists`
  7. `docs(bo): RLS write-path audit (annexe C)`
  8. `feat(bo): lib/permissions matrix from RLS audit`
  9. `refactor(bo): gate action buttons on permissions`
  10. `fix(bo): report resolution photo uses auth uid (B3)`
  11. `fix(bo): forbid placeholder coordinates on park create (B1)`
  12. `fix(bo): new park moderation_status follows role (B4)`
  13. `fix(shared): scope park listing to the collectivité (B2)` *(après décision)*
  14. `fix(bo): MapScreen empty-state + fitBounds + honest subtitle (B8)`
  15. `feat(bo): success toasts + non-native confirms across screens`

---

### Lot 2 — Coquille : sidebar sections + header + dashboard action (v1)  · **P0**

- **Objectif utilisateur** : je m'oriente immédiatement (où suis-je, que puis-je
  chercher, qu'est-ce qui m'attend) et, dès l'arrivée, je vois ce qui demande mon
  attention.
- **Écrans concernés** : `Shell`, nouveau `AppHeader`, `Dashboard`, tous les écrans
  (via `ScreenHeader`).
- **Changements frontend** :
  - `SidebarNav` : items regroupés en **sections nommées** (Pilotage / Patrimoine /
    Exploitation / Qualité des données / Communication / Administration — §18, à
    ajuster aux maquettes) ; `<Icon>` partout, **zéro emoji** ; `aria-current` ;
    `<nav aria-label>` ; rail d'icônes rétractable ≤ 1024 px (AR-14).
  - `AppHeader` : fil d'Ariane (gauche) · recherche globale (centre, `/` focus,
    typeahead parcs/signalements/équipements/membres) · cloche notifications +
    menu utilisateur (droite). Switch d'organisation **reste en sidebar** (AR-3).
  - `ScreenHeader` design system (remplace `PageHeader`) : titre + contexte + actions
    hiérarchisés.
  - Bottom-bar mobile : 4–5 items clés + « Plus » ; **conserve** switch org + déconnexion.
  - Skip-link ; focus déplacé au `<h1>` au changement de route.
  - Primitives design system livrées ici : `Menu/Dropdown`, `Tabs`.
  - **Dashboard v1 orienté action** avec les seules données réelles disponibles
    aujourd'hui : signalements ouverts (triés sévérité), photos à valider, parcs
    « incomplets » (sans photo / sans équipement / `operational_status` inconnu),
    infos à vérifier basiques (`park_edits` pending, `verification_status`). File
    unique « À traiter », chaque ligne → action. **Suppression** des métriques proxy
    (« Utilisateurs actifs »). Sélecteur de période sur les tendances.
- **Données / API** : `api/search.ts` (recherche multi-entités), `api/dashboard.ts`
  (agrégats « à traiter »). Lecture seule, tables existantes.
- **Migration nécessaire** : **non**.
- **Dépendances** : Lot 1 (permissions pour n'afficher que les items/actions permis ;
  toasts). Sprite : symboles d'icônes manquants fournis par le fondateur (SVG collés,
  copiés ×3 — **ne pas dessiner à la main**).
- **Tests** :
  - `typecheck` + `build:backoffice` ; Lighthouse a11y sur 3 écrans clés.
  - Manuel : nav clavier complète (Tab / Shift-Tab / Enter) ; `/` ouvre la recherche ;
    fil d'Ariane correct sur une route profonde ; mobile : switch org + déconnexion
    atteignables ; tablette : rail d'icônes.
  - Dashboard : une collectivité sans données voit des empty-states honnêtes, pas des zéros.
- **Critères d'acceptation** :
  - Plus aucun emoji dans la navigation ni les en-têtes.
  - Recherche globale fonctionnelle sur ≥ 3 types d'entité.
  - Le dashboard répond en < 1 écran à « qu'est-ce qui demande mon attention ? ».
  - `aria-current` sur l'item actif ; focus géré au changement de route.
- **Risques** :
  - Les libellés/ordre exacts de la sidebar dépendent des maquettes → livrer une
    structure paramétrable, ajuster ensuite.
  - Recherche globale : perf si `ilike` multi-tables → limiter, debouncer, paginer.
- **Petits commits** :
  1. `feat(ds): Menu/Dropdown primitive`
  2. `feat(ds): Tabs primitive`
  3. `feat(ds): add missing BO sprite icons (×3 copies)` *(SVG fournis)*
  4. `refactor(bo): SidebarNav with named sections, Icon-only`
  5. `feat(bo): collapsible icon rail ≤1024px`
  6. `feat(bo): AppHeader (breadcrumb + user menu + notifications bell)`
  7. `feat(bo): global search (typeahead, multi-entity)`
  8. `refactor(bo): PageHeader → ScreenHeader`
  9. `fix(bo): mobile bottom-bar keeps org switch + sign-out`
  10. `fix(bo): route focus management + skip-link`
  11. `feat(bo): dashboard v1 — “à traiter” action queue`
  12. `refactor(bo): drop proxy dashboard metrics`

---

### Lot 3 — Parcs réellement fonctionnels  · **P0**

- **Objectif utilisateur** : je gère mes parcs comme un vrai patrimoine — une liste
  dense filtrable, une fiche complète structurée en sous-sections, une création qui
  ne crée pas de doublon ni de fausse position.
- **Écrans concernés** : `/parks` (liste), **nouvelle page** `/parks/:id` (8 onglets),
  création de parc, `MapScreen` (lien liste↔carte).
- **Changements frontend** :
  - `DataTable` (primitive) : tri colonne, pagination, sélection multiple, densité,
    état d'URL (filtres/tri partageables).
  - `/parks` : colonnes métier (statut, `operational_status`, `verification_status`,
    signalements ouverts, dernier/prochain contrôle, nb équipements, nb photos) ;
    filtres (âge, équipements, statut, vérification, score) ; actions groupées.
  - `/parks/:id` **page** (AR-1), onglets (§6 bis.4) : Informations générales ·
    Équipements (installés) · Services · Accessibilité · Sécurité ·
    Environnement / features · Photos · Historique (timeline `audit_log` + événements liés).
  - Création : formulaire avec **géocodage** de l'adresse (confirmation sur mini-carte),
    appel `findDuplicateParks` → écran « parcs similaires < 200 m » avant insertion.
  - `park_features` en **tri-état** (`available/unavailable/unknown/temporarily_unavailable`),
    non coché ⇒ `unknown` (corrige la dette D4).
  - `operational_status` / `verification_status` éditables.
  - Libellés via `@toboggo/shared` (`FEATURE_LABEL`, `PLAY_EQUIPMENT_LABEL`) →
    **suppression de `lib/equipmentLabels.ts`**.
  - `dirty state` + garde anti-perte (AR-9).
  - Retrait de `ParkModal` (remplacé par la page ; garder une petite modale pour les
    actions rapides de statut depuis la liste).
- **Données / API** :
  - `api/geocode.ts` (fournisseur à choisir : BAN adresse.data.gouv.fr — gratuit, FR).
  - Compléter `api/parkDetails.ts` (écriture zones / entrées / horaires) + `api/features.ts`
    (déjà présent) ; `api/parks.ts` (statuts V2).
  - Lecture `park_equipment` pour l'onglet Équipements (écriture au Lot 4).
- **Migration nécessaire** : **non** (tables existantes). *Option* : index trigram sur
  `parks.name` si la recherche l'exige (additif, note `.md`).
- **Dépendances** : Lot 1 (permissions, B1/B2 réglés — sans quoi la fiche affiche des
  parcs mal scopés), Lot 2 (`Tabs`, `ScreenHeader`, `DataTable` sur-couche header).
- **Tests** :
  - `typecheck` + `build` ; tests unitaires sur le mapping features tri-état et le
    split `createPark`.
  - Manuel : créer un parc avec une adresse réelle → position correcte sur la carte ;
    tenter un doublon → averti ; éditer puis quitter sans enregistrer → confirmation ;
    chaque onglet lit/écrit la bonne table ; filtres persistés dans l'URL.
- **Critères d'acceptation** :
  - Un parc créé a une position géocodée réelle et aucune collision non signalée.
  - La fiche parc couvre les 8 sous-sections et écrit dans les tables V2 canoniques.
  - `lib/equipmentLabels.ts` supprimé ; aucun code brut affiché comme libellé.
  - La liste tient > 100 parcs sans dégradation (pagination serveur).
- **Risques** :
  - Géocodage : qualité variable → toujours permettre l'ajustement manuel du point.
  - Volume d'onglets = gros lot → livrer onglet par onglet (commits fins), Infos +
    Photos + Historique d'abord (données déjà là), Équipements/Services ensuite.
  - Coexistence : bien écrire en V2 (features, `organization_parks`) et laisser les
    triggers `*_v1_compat` faire le reste.
- **Petits commits** :
  1. `feat(ds): DataTable v1 (sort, pagination, selection, URL state)`
  2. `feat(bo): /parks as DataTable with métier columns + filters`
  3. `feat(bo): park detail route shell + tabs`
  4. `feat(bo): park detail — Informations générales`
  5. `feat(bo): park detail — Photos`
  6. `feat(bo): park detail — Historique (timeline)`
  7. `feat(bo): park detail — Services / Accessibilité / Sécurité / Environnement (tri-state)`
  8. `feat(bo): park detail — Équipements (read)`
  9. `feat(shared): api/geocode (BAN) `
  10. `feat(bo): geocoding + map confirmation on park create`
  11. `feat(bo): duplicate check before park creation`
  12. `refactor(shared): park feature writes are tri-state (fix D4)`
  13. `refactor(bo): drop lib/equipmentLabels, use shared labels`
  14. `feat(bo): dirty-state guard on park forms`
  15. `refactor(bo): retire ParkModal in favour of the page`

---

### Lot 4 — Équipements : catalogue + inventaire installé + cycle de vie  · **P1**

- **Objectif utilisateur** : je tiens l'inventaire physique de mes aires de jeux —
  quel équipement, où, dans quel état, contrôlé quand, et son historique.
- **Écrans concernés** : `/equipements` (inventaire global), `/equipements/:id`
  (fiche + cycle de vie + timeline), création/édition, `/catalogue-equipements`
  (types — surtout staff/admin), onglet « Équipements » de la fiche parc (écriture).
- **Changements frontend** :
  - Distinction stricte **catalogue (`features` play) ↔ instance (`park_equipment`)**
    (§6 bis.5) : jamais mélangés dans l'UI.
  - `/equipements` : `DataTable` filtrable par parc, type, condition, échéance de
    contrôle (`next_inspection_at`), statut de cycle de vie.
  - Fiche instance : type, fabricant, modèle, quantité, condition, dates
    (installation / dernier contrôle / prochain contrôle), zone, position ;
    **cycle de vie** `planned → installed → out_of_service → removed` ;
    timeline (maintenances / contrôles / anomalies / interventions liées).
  - Création d'instance depuis la fiche parc ou depuis `/equipements`.
- **Données / API** : `api/equipment.ts` (CRUD `park_equipment`, lecture `features`
  catégorie play). Lien `reports.equipment_id` (déjà en DB) exploité en lecture.
- **Migration nécessaire** : **non** (`park_equipment`, `features` existent, vides).
  *Option* (note `.md` + go) : colonne `serial_number` sur `park_equipment` si le
  métier le demande (additif).
- **Dépendances** : Lot 3 (fiche parc + `DataTable` + onglet Équipements).
- **Tests** :
  - `typecheck` + `build` ; unitaire sur les transitions de cycle de vie autorisées.
  - Manuel : créer une instance dans un parc → visible dans l'inventaire global et
    l'onglet parc ; changer la condition en `out_of_service` → reflété partout ;
    échéance de contrôle dépassée → mise en avant.
- **Critères d'acceptation** :
  - Catalogue et inventaire sont deux surfaces distinctes et cohérentes.
  - Une instance porte un type du catalogue, un parc, un état et des dates de contrôle.
  - La timeline d'un équipement agrège maintenance + contrôle + anomalie + intervention.
- **Risques** :
  - Sans données initiales, l'écran paraît vide → prévoir un import CSV d'inventaire
    (réutiliser `papaparse`) + empty-state avec CTA.
  - Transitions de cycle de vie à valider avec le métier (ex. peut-on repasser
    `removed → installed` ?).
- **Petits commits** :
  1. `feat(shared): api/equipment (park_equipment CRUD)`
  2. `feat(bo): /equipements inventory DataTable`
  3. `feat(bo): equipment detail + lifecycle`
  4. `feat(bo): equipment timeline (linked events)`
  5. `feat(bo): create/edit equipment (from park + from inventory)`
  6. `feat(bo): /catalogue-equipements (feature types)`
  7. `feat(bo): equipment CSV import`
  8. `feat(bo): park detail — Équipements (write)`

---

### Lot 5 — Signalements + Interventions (workflow bout en bout)  · **P1**

- **Objectif utilisateur** : je traite un signalement de A à Z — je l'analyse, je
  déclenche une intervention si besoin, je la suis, je prouve la réalisation, je
  clôture, et tout reste dans l'historique.
- **Écrans concernés** : `/reports` (file priorisée), **nouvelle page**
  `/signalements/:id`, **nouveaux** `/interventions`, `/interventions/nouvelle`,
  `/interventions/:id` ; onglet Historique des fiches parc & équipement ; dashboard
  (bloc « interventions en cours »).
- **Changements frontend** :
  - `/reports` : `DataTable`, tri par **sévérité** (`report_severity`), filtres
    (statut, parc, équipement, sévérité, assigné à), file « à traiter ».
  - `/signalements/:id` **page** : contexte, rattachement zone/équipement,
    qualification (sévérité), **assignation** à un membre, statut
    `open → in_progress → resolved` (+ `dismissed`), note obligatoire, photo
    « avant/après », **bouton « Créer une intervention »**, notification au signalant
    à la résolution.
  - Interventions : liste (statut, parc/équipement, assigné, échéance, retard),
    création (depuis un signalement, une anomalie de contrôle — Lot 6 — ou directe),
    détail (assignation, dates planifiée/réalisée, coût, pièces jointes, **preuve**
    photo + commentaire), clôture → retour au signalement/anomalie d'origine.
  - Renommer l'écran `/maintenance` → périmètre « Maintenance » strict (AR-5) ;
    déplacer la logique « contrôle de suivi » de `ReportModal` vers « créer une
    intervention ».
- **Données / API** : `api/interventions.ts` ; `api/reports.ts` (assignation,
  `in_progress`, sévérité, notif) ; `api/notifications.ts` (notif au signalant +
  notif BO « intervention assignée »).
- **Migration nécessaire** : **OUI** (note de modélisation `.md` d'abord, migration
  **additive** locale/staging) :
  - table `interventions` (`park_id`, `equipment_id?`, `report_id?`, `control_id?`
    [Lot 6], `organization_id`, `status`, `assigned_to`, `planned_at`, `done_at`,
    `cost`, `proof_photo`, `note`, timestamps) + RLS par rôle.
  - `reports` : colonnes `assigned_to` / `assigned_at` (additif) **ou** table
    `report_assignments`.
  - `notification_type` : `ALTER TYPE ADD VALUE` pour les types BO (additif, non
    transactionnel — précautions) **ou** table `bo_notifications` dédiée.
- **Dépendances** : Lot 1 (permissions, fix photo B3), Lot 3 (fiche parc/onglet
  historique), Lot 4 (rattachement équipement). Migration validée par le fondateur.
- **Tests** :
  - `typecheck` + `build` ; `gen types --linked` régénéré après migration (staging).
  - Unitaire : transitions de statut signalement/intervention ; calcul du retard.
  - Manuel : signalement → assignation → intervention → preuve → résolution →
    l'historique parc **et** équipement montrent la chaîne complète ; le signalant
    reçoit une notification ; RLS : un `contributeur` ne peut pas assigner.
- **Critères d'acceptation** :
  - Le workflow §6 bis.6 (signalement) est réalisable intégralement dans l'UI.
  - Une intervention est toujours reliée à son origine (signalement / anomalie /
    directe) et porte une preuve avant clôture.
  - Aucune donnée d'intervention fictive ; empty-states honnêtes.
- **Risques** :
  - **Migration** = premier lot avec DB → appliquer d'abord sur **local + staging**,
    jamais prod ; respecter la coexistence (`organization_id`, pas `commune_id`).
  - `ALTER TYPE ADD VALUE` non transactionnel → préférer une table `bo_notifications`
    si le risque n'est pas acceptable.
  - Périmètre large → livrer d'abord `/signalements/:id` + assignation (sans DB),
    puis interventions (avec DB).
- **Petits commits** :
  1. `feat(bo): /reports as prioritised DataTable (severity, filters)`
  2. `feat(bo): report detail page /signalements/:id`
  3. `feat(bo): report status open→in_progress→resolved + mandatory note`
  4. `docs(db): interventions + report assignment model (.md)`
  5. `feat(db): additive migration — interventions + report assignment (local/staging)`
  6. `feat(shared): api/interventions`
  7. `feat(shared): report assignment + severity in api/reports`
  8. `feat(bo): assign a report to a member`
  9. `feat(bo): /interventions list + detail`
  10. `feat(bo): create intervention from a report`
  11. `feat(bo): intervention proof (photo + comment) before closing`
  12. `feat(shared): notify reporter on resolution + BO notifications`
  13. `refactor(bo): /maintenance scoped to preventive maintenance only`

---

### Lot 6 — Contrôles & inspections + Infos à vérifier  · **P1**

- **Objectif utilisateur** : je planifie et je réalise les contrôles périodiques
  (avec checklist), je trace les anomalies, et je tranche les informations douteuses
  sur mes parcs en connaissance de cause.
- **Écrans concernés** : **nouveaux** `/controles`, `/controles/planifier`,
  `/controles/:id`, `/controles/modeles` (checklists) ; **nouveaux**
  `/infos-a-verifier`, `/infos-a-verifier/:id` (dont file `park_edits`) ; onglet
  Historique équipement/parc ; dashboard (blocs « contrôles à venir », « infos à
  vérifier »).
- **Changements frontend** :
  - Contrôles : liste (parc/équipement, modèle, échéance, statut, résultat),
    planification (unique ou récurrente), **exécution guidée par checklist**
    (items conforme / non conforme / non applicable + commentaire + photo),
    résultat global (conforme / réserves / non conforme) → **génère des anomalies**
    → bouton « créer une intervention » (Lot 5).
  - Modèles / checklists : CRUD d'un modèle réutilisable (nom, items ordonnés,
    périodicité conseillée) — surtout gestionnaire/staff.
  - Infos à vérifier (§6 bis.7) : chaque ligne = contexte · valeur actuelle ·
    proposition · source · **conséquence affichée avant** décision · décision
    (valider / refuser / corriger + motif). Trois origines fusionnées :
    `park_edits` pending, `park_attribute_sources` à faible `confidence`,
    `verification_status = unverified`.
  - Décision « valider » → écrit la valeur, pose `verified_at` / `verification_status`,
    trace dans `audit_log`.
- **Données / API** : `api/controls.ts`, `api/verification.ts` ; brancher
  `submitParkEdit` / `listParkEdits` / `reviewParkEdit` (déjà en shared, 0 call site).
- **Migration nécessaire** : **OUI** (note `.md` d'abord, additive local/staging) :
  `controls`, `control_templates`, `control_checklist_items`, `control_results`
  (ou `control_item_results`) + RLS. Lien `interventions.control_id` (ajout de colonne
  additif si le Lot 5 ne l'a pas déjà posé). Éventuel `anomalies` distinct, ou
  réutilisation de `reports` avec une `category` interne.
- **Dépendances** : Lot 4 (équipements), Lot 5 (interventions + workflow + migration
  déjà rodée). Décision produit sur « anomalie = report ou table dédiée ».
- **Tests** :
  - `typecheck` + `build` ; `gen types` régénéré (staging).
  - Unitaire : agrégation des 3 sources d'« infos à vérifier » ; calcul du résultat
    de contrôle à partir des items.
  - Manuel : créer un modèle → planifier un contrôle → l'exécuter (checklist) →
    résultat « non conforme » génère une anomalie → intervention → historique
    équipement complet. Valider une info à vérifier → la valeur du parc change et
    `verification_status` évolue ; la « conséquence » affichée correspond au réel.
- **Critères d'acceptation** :
  - Le workflow §6 bis.6 (équipement) est réalisable intégralement.
  - Une info à vérifier montre toujours contexte / valeur / proposition / source /
    conséquence avant que l'utilisateur tranche.
  - `park_edits` est enfin exploité côté produit.
- **Risques** :
  - 4 tables liées → modélisation à cadrer sérieusement (référentiel EN 1176 ?) ;
    commencer par un MVP « modèle + items + résultat », enrichir ensuite.
  - Risque de recouvrement conceptuel contrôle/inspection/anomalie → figer le
    vocabulaire dans `/aide` (AR-10) avant de coder les écrans.
- **Petits commits** :
  1. `docs(db): controls + checklists + verification model (.md)`
  2. `feat(db): additive migration — controls/templates/checklist/results (local/staging)`
  3. `feat(shared): api/controls`
  4. `feat(bo): /controles/modeles (checklist templates CRUD)`
  5. `feat(bo): /controles list + planification`
  6. `feat(bo): guided control execution (checklist)`
  7. `feat(bo): control result → anomalies → create intervention`
  8. `feat(shared): api/verification (wire park_edits + attribute sources)`
  9. `feat(bo): /infos-a-verifier list (3 sources merged)`
  10. `feat(bo): /infos-a-verifier/:id — decision with consequence preview`

---

### Lot 7 — Exploitation étendue & collaboration  · **P2**

- **Objectif utilisateur** : je pilote le calendrier de mon patrimoine, je gère mon
  équipe proprement, je règle mes notifications, et je réponds aux parents.
- **Écrans concernés** : `/maintenance` (préventif consolidé), **nouveau**
  `/planning`, `/equipe` + `/equipe/membres` + `/equipe/invitations` +
  `/equipe/roles`, **nouveau** `/profil`, **nouveaux** `/notifications` +
  `/notifications/preferences`, `/avis` + **nouveau** `/avis/:id`, **nouveau**
  `/messages`, `/journal` (refonte).
- **Changements frontend** :
  - Maintenance : `assignee` = **membre FK** (plus une chaîne), types, statuts
    intermédiaires, lien `equipment_id`.
  - `/planning` : vue calendrier/agenda agrégeant maintenance + contrôles +
    interventions par échéance (filtres par parc / type / assigné).
  - Équipe éclatée : Membres (liste + changement de rôle + libellés traduits),
    Invitations (état en attente, renvoi, révocation, expiration), Rôles &
    permissions (matrice lisible dérivée de `permissions.ts`).
  - `/profil` : infos, changement de mot de passe (`sendPasswordReset` / flux auth),
    déconnexion, suppression de compte (`deleteOwnAccount`).
  - Notifications BO : centre + préférences (par type d'événement, canal in-app/email).
  - Avis : détail + sous-notes (`cleanliness/safety/equipment/comfort`), réponse en
    `Textarea`, flag par la collectivité (`flagReview`), tri.
  - `/messages` : `contact_messages` (liste, lecture, statut traité, réponse par email).
  - `/journal` : source **`audit_log`** (générique), filtres entité/type/acteur/date,
    export, pagination. `activity_log` conservé en compat ou migré.
- **Données / API** : `api/team.ts` (rôle, invitations), `api/notifications.ts`
  (BO + préférences), `api/messages.ts`, `api/reviews.ts` (flag, sous-notes),
  `api/audit.ts` ; brancher `listAuditLog`.
- **Migration nécessaire** : **OUI** (note `.md` d'abord, additive local/staging) :
  table `invitations` (email, role, org, token, `expires_at`, `accepted_at`,
  `invited_by`) + fonction edge d'envoi (remplace `signInWithOtp` client, **B5**) ;
  préférences de notifications BO (colonnes sur `team_members` ou table dédiée) ;
  `maintenance.assignee` → `assignee_id uuid` (additif, garder l'ancienne colonne en
  coexistence). Éventuel `messages.status` / `messages.handled_by`.
- **Dépendances** : Lot 1 (`permissions.ts` pour la page Rôles), Lot 5/6
  (interventions + contrôles pour alimenter le planning).
- **Tests** :
  - `typecheck` + `build` ; `gen types` régénéré (staging).
  - Manuel : inviter un membre → e-mail reçu, état « en attente », acceptation crée
    le lien ; changer un rôle → l'UI de la personne reflète ses nouvelles capacités ;
    planning affiche les 3 types d'échéance ; répondre à un avis / un message ;
    journal filtré par entité montre les événements DB (pas seulement `activity_log`).
  - RLS : un `contributeur` ne peut pas inviter / changer un rôle.
- **Critères d'acceptation** :
  - Le flux d'invitation est fiable (état, expiration, renvoi, révocation) et ne
    déclenche plus d'e-mail d'auth depuis le client.
  - Le planning est une vue unique et fiable des échéances.
  - Le journal reflète `audit_log` (complet), pas un journal best-effort.
  - Préférences de notifications réellement respectées.
- **Risques** :
  - Fonction edge d'invitation = nouvelle brique d'infra (déploiement, secrets).
  - Migration `assignee` : bien gérer la coexistence ancienne/nouvelle colonne le
    temps de la bascule.
- **Petits commits** (extrait) :
  1. `docs(db): invitations + BO notification prefs + maintenance.assignee_id (.md)`
  2. `feat(db): additive migration (local/staging)`
  3. `feat(shared): api/team invitations + role change`
  4. `feat(bo): /equipe/membres + role change (translated labels)`
  5. `feat(bo): /equipe/invitations (pending, resend, revoke)`
  6. `feat(bo): /equipe/roles (readable permission matrix)`
  7. `feat(bo): /profil (password, sign-out, delete account)`
  8. `feat(shared): api/notifications BO + preferences`
  9. `feat(bo): /notifications + /notifications/preferences`
  10. `refactor(bo): maintenance assignee = member FK + types + statuses`
  11. `feat(bo): /planning aggregated agenda`
  12. `feat(bo): /avis/:id + sub-ratings + flag + reply Textarea`
  13. `feat(bo): /messages (contact_messages)`
  14. `refactor(bo): /journal on audit_log (filters, export, pagination)`

---

### Lot 8 — Pilotage & réglages : dashboard complet, stats, rapports, finitions  · **P2/P3**

- **Objectif utilisateur** : j'ai une vue de pilotage complète, des rapports
  présentables « pour les élus », et des réglages clairs — sans jamais voir de chiffre
  ou d'intégration factice.
- **Écrans concernés** : `Dashboard` (complété), `Statistiques`, **nouveaux**
  `/rapports` + `/rapports/nouveau` + `/rapports/:id` + `/documents`, `/reglages`
  (+ sous-pages), `/aide`, (admin) carte globale + `/collectivites`.
- **Changements frontend** :
  - Dashboard complété : blocs « contrôles à venir » et « interventions en cours »
    (disponibles après Lots 5–6), tendances par période.
  - Statistiques : dataviz **tokenisée** (pas de barres hex maison), périodes
    comparables, **masquage des cartes sans données** (pas de « 0 » ni de faux graphe),
    export par graphe.
  - `/rapports` : gabarit à la marque (couverture, période, chiffres **réels** +
    graphes), historisé, export PDF **et** lien partageable ; `/documents` (conformité :
    types, échéances, fichiers) — modélisation si retenu.
  - `/reglages` éclaté : Général (complet), Alertes & automatisations, Intégrations
    (imports OSM / open data exposés en lecture), Exports automatiques, Sécurité
    (sessions, journal d'accès), Abonnement / quotas — **placeholders honnêtes**
    (« Bientôt disponible ») là où le backend n'existe pas (Stripe non branché).
  - `/aide` : glossaire des statuts + guides courts.
  - Admin : carte globale des parcs, `/collectivites` (liste + fiche ; création reste
    hors UI si non priorisée).
  - Passe design system résiduelle (DESIGN-8/10) sur les écrans non encore tokenisés ;
    QA visuelle light + a11y (axe, lecteurs d'écran) ; `<Logo variant="brand">` sur
    l'auth ; raccourcis clavier ; SSO Google (si retenu).
- **Données / API** : `api/reports-export.ts` (agrégats + génération), `api/settings.ts`.
  Pas d'invention : si `park_scores` vide → « Score non calculé » + bouton
  `recalculateScore`.
- **Migration nécessaire** : **non** pour le cœur. *Option* (note `.md` + go) :
  table `documents` si la conformité documentaire est retenue ; `report_snapshots`
  pour historiser les rapports.
- **Dépendances** : Lots 5–6 (données interventions/contrôles pour le dashboard et le
  planning) ; Lot 7 (journal/notifs).
- **Tests** :
  - `typecheck` + `build` ; audit a11y (axe) sur l'ensemble ; Lighthouse.
  - Manuel : une collectivité sans historique voit des états honnêtes partout
    (aucun faux chiffre / faux quota / fausse intégration) ; un rapport se génère
    avec des chiffres réels et se partage par lien ; les sous-pages Réglages non
    branchées affichent un placeholder clair.
- **Critères d'acceptation** :
  - Zéro donnée fictive dans toute l'application (checklist §6 bis.9 passée).
  - Statistiques n'affichent que ce qui est réellement mesurable.
  - Rapport « pour les élus » présentable et partageable.
  - Réglages : périmètre réel clairement distingué du « à venir ».
  - Plus aucun `style={{}}` porteur de couleur/typo hors tokens sur les écrans livrés.
- **Risques** :
  - Tentation de « remplir » les écrans stats/quotas avec des exemples → interdiction
    stricte (AR-11).
  - Abonnement/quotas dépend de Stripe (hors périmètre) → rester en placeholder.
- **Petits commits** (extrait) :
  1. `feat(bo): dashboard — contrôles à venir + interventions en cours`
  2. `refactor(bo): Statistiques — tokenised dataviz + periods + hide empty`
  3. `feat(bo): /rapports (branded template, history, shareable link)`
  4. `feat(bo): /documents (conformité)` *(si retenu, + migration .md)*
  5. `refactor(bo): /reglages split into sub-pages (honest placeholders)`
  6. `feat(bo): /aide (status glossary + guides)`
  7. `feat(bo): admin global map + /collectivites`
  8. `refactor(bo): residual design-system pass (DESIGN-8/10)`
  9. `feat(bo): auth screen uses Logo variant="brand"`
  10. `feat(bo): keyboard shortcuts`

---

## 21. Proposition de petits commits sûrs

> **Superseded en v2** : les propositions de commits ne sont plus listées ici de
> façon globale — elles sont **intégrées à chaque lot** de la §20 (un paragraphe
> « Petits commits » par lot, ~10–15 commits fins par lot). C'est la référence à
> jour ; les listes numérotées globales de la v1 (référençant l'ancien découpage en
> 12 lots) ont été retirées pour éviter toute divergence.
>
> Convention inchangée (`CLAUDE.md` §7) : `feat(bo:…)` / `fix(bo:…)` /
> `refactor(bo:…)` / `docs(…)` / `feat(ds:…)` / `feat(shared:…)` / `feat(db:…)` pour
> une migration additive, footer `Co-Authored-By: Claude Sonnet 5
> <noreply@anthropic.com>`. Aucun commit sans demande explicite du fondateur ;
> toujours sur `feature/backoffice-collectivite`, jamais de migration prod.

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

*Fin de l'audit — 2026-09-04 (v2). Aucune modification de code, de migration ou de
configuration n'a été effectuée. La direction UX/UI officielle est désormais fixée
en §6 bis ; prochaine étape suggérée : confronter les maquettes pixel à la §6 bis au
fil des lots, puis démarrer le **Lot 1** (§20).*
