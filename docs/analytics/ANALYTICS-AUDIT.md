# Audit produit — Toboggo (avant instrumentation Product Analytics)

**Statut : audit read-only. Aucun code applicatif, aucune migration, aucune dépendance modifiés.**
Date : 2026-09-16. Worktree : `toboggo-wt-product-analytics`, branche `feature/product-analytics`.

## Méthode

Inspection directe du code réel (pas de suppositions) : `apps/mobile/src`, `apps/backoffice/src`,
`packages/shared/src`, `supabase/migrations/*.sql`. Chaque affirmation ci-dessous est sourcée
`fichier:ligne`. Les points non vérifiables depuis le seul code front (config d'environnement,
volumétrie réelle en base) sont signalés comme tels.

**Constat préalable, structurant pour tout le reste du document : aucune infrastructure
analytics n'existe aujourd'hui dans le repo.** Recherche exhaustive sur `apps/` et `packages/` de
`posthog|amplitude|segment|analytics.track|trackEvent|logEvent|track(|map_viewed|search_performed
|filters_applied|zero_results` → **zéro résultat**. Tout ce document part donc d'une page blanche
côté instrumentation.

---

## 1. Périmètre produit réel

Toboggo est un localisateur de parcs de jeux enfants, 3 surfaces (voir `CLAUDE.md` §2) :
- **`apps/mobile`** — app parents, PWA, mode invité par défaut. C'est la surface consommateur
  visée par le Product Analytics ; ce document s'y concentre.
- **`apps/backoffice`** — outil interne staff Toboggo / collectivités. Hors périmètre consommateur,
  mais son écran `Statistiques.tsx` a déjà de vrais KPI business (§8) à ne pas dupliquer.
- **`apps/landing`** — site vitrine statique, non exploré ici (hors app produit).

Router mobile : `apps/mobile/src/App.tsx:104-165` — aucune route n'est protégée par une garde
d'authentification globale ; la navigation est libre en mode invité (`session.ts:27-32`,
`userId: null` par défaut).

---

## 2. Parcours "arrivée dans l'app / onboarding"

**Écrans** : `Splash.tsx`, `LoginMethod.tsx`, `AuthForm.tsx`, `Permissions.tsx`
(`apps/mobile/src/screens/onboarding/`).

- Un utilisateur déjà connecté est redirigé automatiquement vers `/map`
  (`Splash.tsx:23-25`).
- Depuis Splash : Google OAuth (réel), e-mail (réel, vers `/login?mode=signup`), Apple et
  téléphone (**mock** — `showToast(comingSoon)`, aucune fonction d'auth associée), liens CGU/vie
  privée (réels, statiques), lien "Se connecter" (réel, vers `/login-method`).
- **Actions utiles** : ouverture de l'app (session démarrée), choix d'un provider d'auth
  (distinguer réel/mock), passage par Permissions.
- **Intérêt produit** : mesurer l'attrition entre "app ouverte" et "compte créé/connecté" ;
  savoir quel provider est réellement choisi (utile pour prioriser Apple/téléphone si la demande
  existe malgré le mock actuel).

## 3. Parcours "authentification / création de compte"

**Écrans** : `AuthForm.tsx` (unique pour login ET signup, différencié par `mode` en query param,
`AuthForm.tsx:15`), `Permissions.tsx` (suite onboarding signup).

- Providers réellement câblés (`packages/shared/src/api/auth.ts`) : e-mail/mot de passe
  (`signUp`, `signIn`), Google OAuth (`signInWithGoogle`), reset mot de passe
  (`sendPasswordReset`).
- Apple et téléphone : **aucune fonction d'auth n'existe** dans `auth.ts` — chaque bouton
  déclenche un toast "bientôt disponible" (`Splash.tsx:55-58,76-81`, `LoginMethod.tsx:36-52`,
  `AuthForm.tsx:178-181`). Ne pas instrumenter d'événement de succès sur ces boutons — au mieux
  un événement "clic sur provider indisponible" pour mesurer la demande latente.
- Signup : nom dérivé automatiquement de l'email (`AuthForm.tsx:49`), pas de champ nom dédié.
- Suppression de compte : RPC réelle `delete_own_account` (`auth.ts:47-52`, appelée depuis
  `Account.tsx:22-30`) — mais **sans `catch`** : un échec RPC ne montre aucune erreur à
  l'utilisateur (`Account.tsx:22-29`). L'existence côté base de la RPC n'est pas vérifiable
  depuis le front seul.
- **Intérêt produit** : funnel signup (démarré → soumis → succès), taux d'usage réel Google vs
  e-mail, détection du besoin Apple/téléphone via le volume de clics sur les CTA mock.

## 4. Parcours "carte / discovery / Autour de vous"

**Écran** : `MapExplore.tsx` (route unique `/map`, `App.tsx:109`), rendu carte via `MapCanvas.tsx`
ou son mock `FakeMap.tsx`.

- **Il n'existe pas d'onglet "Autour de vous" distinct.** C'est uniquement le titre de la section
  par défaut du bottom-sheet (`MapExplore.tsx:269,288`, clé i18n `sheet.aroundYou`). Les 4 onglets
  réels de navigation sont `/map`, `/favorites`, `/contributions`, `/profile`
  (`BottomTabs.tsx:18-23`).
- **Carte réelle vs mock** : `MapCanvas.tsx:86-88,258-260` bascule intégralement vers `FakeMap`
  (grille + blobs SVG + pins positionnés par hash) si `VITE_MAP_STYLE_URL` est vide. La config
  réelle par environnement n'est pas vérifiable depuis ce worktree (`.env*` gitignorés).
  **Implication analytics directe** : un futur `map_viewed` doit porter une propriété distinguant
  carte réelle/FakeMap, sous peine de fausser tout indicateur d'engagement carte.
- Récupération des parcs : rayon fixe de 20 km autour de la position/lieu courant via la RPC
  PostGIS `nearby_parks` (`packages/shared/src/api/parks.ts:82-99`), **pas** un refetch sur le
  viewport (pan/zoom) — le bbox carte ne sert qu'à l'affichage/clustering client
  (`clustering.ts:5-7`).
- Géolocalisation demandée automatiquement au premier montage si position inconnue
  (`MapExplore.tsx:140-146`).
- **Intérêt produit** : taux d'usage carte vs liste/recherche, taux de FakeMap (dette produit,
  pas juste un signal analytics), volume de recentrages.

## 5. Parcours "clusters / markers"

**Fichiers** : `clustering.ts`, `MapCanvas.tsx`.

- Basé sur `supercluster` (réel, pas un algo maison) : `CLUSTER_RADIUS=56px`,
  `CLUSTER_MAX_ZOOM=16`, `CLUSTER_MIN_POINTS=3`, `RATING_VISIBLE_MIN_ZOOM=15`
  (`clustering.ts:20-26`).
- Clic cluster → zoom vers le niveau d'éclatement (`MapCanvas.tsx:181-184`), pas de sélection de
  parc. Clic marker individuel → sélection (`MapCanvas.tsx:145`) → preview bottom-sheet.
- **Intérêt produit** : taux de clic cluster vs marker direct, densité perçue de l'offre.

## 6. Parcours "recherche"

**Écran** : `SearchOverlay.tsx`. Deux recherches serveur parallèles, aucune n'est un filtrage
local sur une liste déjà chargée :
- **Parcs Toboggo** (`searchParks`, `packages/shared/src/api/parks.ts:101-111`) : Supabase
  `ilike` sur nom/ville/adresse, dès 2 caractères, **sans débounce**
  (`SearchOverlay.tsx:42,52-56`).
- **Lieux** (`searchPlaces`, `geocode.ts:69-89`) : API MapTiler Geocoding, débounce réel 300 ms,
  annulable (`SearchOverlay.tsx:47-65`). Sans `VITE_MAPTILER_KEY`, renvoie `[]` silencieusement.
- Historique local des recherches en `localStorage` (`SearchOverlay.tsx:10,15-26`).
- **Intérêt produit** : taux de recherche sans résultat, requêtes fréquentes (détection de
  demande non couverte par le catalogue).

## 7. Parcours "filtres"

**Écran** : `FiltersSheet.tsx` + `lib/filters.ts`. Liste exacte et complète :
- Tranche d'âge (slider 0–12, 12 = "12+").
- **"Ouvert maintenant" (`openNow`) : filtre mort.** Compté dans le badge actif mais jamais
  transmis à `useNearbyParks` ni appliqué côté client (`FiltersSheet.tsx:40-45`,
  `MapExplore.tsx:76`, `filters.ts:53`). Ne pas instrumenter `filter_applied` pour ce filtre
  comme s'il changeait les résultats — ou le signaler explicitement en propriété.
- 7 équipements/accès, réellement appliqués côté client après la RPC
  (`packages/shared/src/api/parks.ts:93-97`) : `wc`, `shade`, `fenced`, `pmr`, `benches`,
  `water`, `parking`.
- Tri (`sort`: distance/note/récent) — **pas dans FiltersSheet**, vit dans `ParkList.tsx:11,55-67`
  avec un toggle séparé "Pour mes enfants" (filtre client sur l'âge réel des enfants du profil,
  `ParkList.tsx:34-41` — fonctionnel, alimenté par `packages/shared/src/api/children.ts`).
- **Intérêt produit** : quels filtres sont réellement utilisés, lesquels mènent à une ouverture de
  fiche puis à une intention forte (favori/partage/itinéraire) — répond directement aux
  questions produit Phase 2.

## 8. Parcours "résultats / zero-results"

État "0 résultat" géré à 4 niveaux distincts sur l'écran carte (`MapExplore.tsx:207-264`), par
ordre de priorité : géoloc refusée, filtres actifs, lieu recherché sans résultat, cas par défaut
(position réelle sans filtre) — plus deux états séparés dans `SearchOverlay.tsx:181-183` (recherche
sans résultat) et `ParkList.tsx:85` (liste vide après "Pour mes enfants"). C'est un point fort à
exploiter : chaque branche doit porter sa propre valeur de propriété `reason` pour distinguer les
causes du zero-result (cf. Phase 2 : "où apparaissent les recherches sans résultat ?").

## 9. Parcours "fiche parc"

**Écran** : `ParkDetail.tsx`. CTA exacts et leur effet réel :

| CTA | Effet réel |
|---|---|
| Favori (header + pied de page) | Écriture DB réelle, optimiste + rollback (§11) |
| Partage | Ouvre `ShareSheet` (§12) |
| Note → avis | Navigation réelle vers `/park/:id/reviews` |
| "Toboggo Score" | Navigation vers `/park/:id/score` — **calcul côté client, voir §9bis** |
| Équipements "voir tout" / "compléter" | Navigation réelle (`/park/:id/amenities` ou édition) |
| Photos "ajouter" / "voir tout" | Navigation réelle |
| "Contribuer / signaler" | Ouvre `ContributeSheet` (éditer infos / ajouter photos / signaler) |
| "Donner un avis" | Navigation réelle vers `/rate?park=` |
| Itinéraire | Navigation vers `/park/:id/directions` — **écran non fonctionnel, voir §9ter** |

Une vue est comptabilisée côté serveur dès le montage : `incrementParkViews(id)`
(`ParkDetail.tsx:53-55`) → RPC réelle `increment_park_views`. C'est un signal de vue déjà présent
côté base, indépendant d'un futur `park_viewed` analytics (les deux devraient coexister : le
compteur DB pour le produit/back-office, l'événement PostHog pour les funnels comportementaux).

### 9bis. "Toboggo Score" — écart entre feature marketée et implémentation

`ScoreDetail.tsx:20-31` calcule un score sur 10 (`rating * 2`) et une répartition par facteur
(propreté, sécurité, équipement, accessibilité) **entièrement dérivés en local** des champs déjà
chargés (`rating`, `has_open_report`, `play_equipment`, `pmr`). Le code partagé expose pourtant un
vrai moteur de scoring (`getLatestScore`, `recalculateScore` → table `park_scores`,
`packages/shared/src/api/parkDetails.ts:273-290`) que `ScoreDetail.tsx` **n'appelle jamais**. À
signaler au fondateur (§ divergences) — un `score_viewed` analytics ne doit pas laisser croire que
la donnée vient d'un vrai moteur de scoring.

### 9ter. État réel de la fonctionnalité "Itinéraire" — vérifié explicitement, ne pas supposer

`Directions.tsx` (route `/park/:id/directions`) est un **mock complet**, confirmé par deux lectures
indépendantes du code :
- L'ETA est calculée par distance à vol d'oiseau (`haversineMeters`) × vitesse fixe par mode
  (marche 4,8 km/h, vélo 15 km/h, voiture 30 km/h — `Directions.tsx:13-17,41-43`).
- Le bouton "Démarrer" (`startNav`, `Directions.tsx:45-49`) ne fait que : passer un state local
  `navigating` à `true`, afficher un toast, et programmer un rappel de visite local
  (`useVisitPrompt`). **Aucun lien vers Google Maps / Apple Maps / toute navigation externe.**
  Aucune requête d'itinéraire réel (pas de routing engine, pas d'API directions).

**Conséquence directe pour le tracking plan** : un événement `route_requested` aujourd'hui mesure
« l'utilisateur a cliqué sur un CTA qui simule un départ de navigation », pas une navigation
réelle vers le parc. C'est un signal d'intention valide (voir évaluation de la North Star,
`TRACKING-PLAN.md`), mais il ne faut pas le présenter comme une mesure d'usage d'itinéraire réel
tant que la fonctionnalité n'est pas reconstruite avec un vrai lien externe.

## 10. Parcours "photos"

Photos de fiche parc = uniquement `park_media` (upload utilisateur/collectivité/Toboggo/open
data) ; confirmé explicitement en commentaire de code que l'import OSM ne crée jamais de photo
(`apps/mobile/src/lib/photos.ts:4-13`, `packages/shared/src/api/parks.ts:201-202`) et qu'aucune
image stock/générique n'est jamais utilisée en fallback (placeholder de marque uniquement,
`ParkPhoto.tsx:8-13`).

Modération réelle depuis la migration `0027_park_media_moderation.sql` : une photo `source: "user"`
est créée en `status: "pending"` (`defaultMediaStatus`, `parkDetails.ts:18-20`) et reste invisible
côté `park_public.photos` tant qu'elle n'est pas approuvée en back-office (`Photos.tsx`, workflow
réel : approuver / approuver+couverture / refuser / supprimer). Les dépôts collectivité/Toboggo
sont auto-approuvés (décision produit assumée, pas un bug).

Ajout de photo(s) : deux points d'entrée — dans le wizard "Ajouter un parc" (`AddPark.tsx`,
étape 4/5, 0 à 4 photos, "passer" possible) et l'écran dédié `AddPhotos.tsx` (3 étapes).

## 11. Parcours "favoris"

`ParkDetail.tsx:109-113` (redirige vers `/login` si invité). Écriture réelle en base — pas un
simple état local : `session.ts:107-121` (`toggleFavorite`, update optimiste + `apiToggleFavorite`
+ rollback si échec) → `packages/shared/src/api/profile.ts:47-51` → `profiles.favorites` (array
d'IDs). Écran `Favorites.tsx` (liste), mode "comparer" jusqu'à 3 parcs
(`Favorites.tsx:17-32,79`) → `Compare.tsx` (tableau réel : note, âge, surface, distance, 7
équipements — données réelles, pas de mock).

## 12. Parcours "avis"

**Écran** : `RatePark.tsx` (soumission), `DetailReviews.tsx` (lecture/consultation).
Structure d'un avis : note globale + 4 sous-notes optionnelles (propreté/sécurité/
équipement/confort), tranche d'âge recommandée, commentaire libre (nullable), auteur.

**Publication immédiate, aucune file de modération** : `createReview`
(`packages/shared/src/api/reviews.ts:97-123`) insère sans `status: pending` — confirmé côté
schéma, `reviews.status` a pour défaut `published`
(`supabase/migrations/0013_v2_reviews.sql:30`). Un bouton "signaler" existe côté mobile
(`flagReview` → `status: "flagged"`, `DetailReviews.tsx:36-41,83-94`) mais **cette fonction n'est
consommée par aucun écran back-office** (confirmé par le Volet A de l'audit backoffice) : signaler
un avis n'a aujourd'hui aucune conséquence visible en aval. Point à signaler comme boucle UX
incomplète, pas un bug technique caché.

Si une photo est jointe à un avis, elle suit le circuit `park_media` classique (donc `pending`,
contrairement au texte de l'avis publié immédiatement) — le message de succès du wizard le
distingue explicitement (`RatePark.tsx:97,141-143,181`).

## 13. Parcours "partage"

`ShareSheet.tsx` — **pas de Web Share API** (`navigator.share` absent du code). Liens statiques
`wa.me`, `sms:`, `mailto:` + fallback "copier le lien" (`navigator.clipboard`). Le lien partagé
est un vrai deep link `${origin}/park/${id}` (`ShareSheet.tsx:10`). Le bouton Instagram pointe
vers `https://instagram.com` sans paramètre (pas de pré-remplissage possible via web) — probable
placeholder assumé, à confirmer produit.

**Limite analytics** : aucun de ces canaux ne confirme que le partage a été *effectivement*
envoyé (l'utilisateur peut ouvrir WhatsApp et annuler) — sauf le fallback "copier le lien", dont le
succès d'écriture presse-papiers est vérifiable. Un `park_shared` mesurera donc un **clic sur un
canal de partage**, pas un partage confirmé — cohérent avec le cadrage "intention" du North Star
candidat (voir `TRACKING-PLAN.md`).

## 14. Parcours "sortie de groupe" (social)

`GroupOuting.tsx` + `packages/shared/src/api/groups.ts` — **réellement fonctionnel** (CRUD Supabase
complet : `createGroup`, `joinGroup`, `listGroupMembers`, `leaveGroup`), pas un mock UI. Limites
réelles : pas de temps réel (pas de `supabase.channel`), pas de mise à jour automatique du statut
membre (`updateMemberStatus` déclaré mort en commentaire, `groups.ts:9`), code de groupe généré
côté client sans vérification d'unicité visible, partage du code uniquement via WhatsApp (pas de
deep link auto-join).

## 15. Parcours "authentification / création de compte" — enfants / personnalisation

`children.ts` (lib) + `packages/shared/src/api/children.ts` — CRUD réel, RLS via `parent_id`.
Usage réel en aval confirmé : filtrage effectif des parcs par âge dans `ParkList.tsx:34-41` (toggle
"Pour mes enfants", pas juste un champ de profil décoratif).

## 16. Parcours "notifications"

Centre in-app uniquement (`NotifCenter.tsx`, `NotifResolved.tsx`) — lecture/écriture Supabase réelles
(`listNotifications`, `markNotificationRead`, `markAllNotificationsRead`). **Aucun vrai système de
push** : recherche exhaustive de `serviceWorker|Notification.requestPermission|pushManager` sur
`apps/mobile` et `packages/shared` → zéro résultat. Le toggle "push" dans `NotificationPrefs.tsx`
écrit bien en base (`profiles.notif_channels`) mais **aucun effecteur ne le consomme** dans le code
exploré — préférence stockée sans effet observable.

## 17. Parcours "contributions" (ajout de parc, ajout de photo, modification d'informations, signalement, avis)

5 wizards, tous auto-porteurs (pas d'écran d'intro séparé, `App.tsx:117-125`) :

| Contribution | Étapes (Stepper) | Fonction de soumission | Table / statut |
|---|---|---|---|
| Ajout de parc | parc → localisation → infos → photos → vérif (5) | `createPark` | `parks`, `status: pending` |
| Ajout de photo | parc → photos → confirmation (3) | `addParkPhotos` | `park_media`, `pending` (source user) |
| Modif. d'infos | type → correction → vérif (3) | `submitParkEdit` | `park_edits`, `status: pending` |
| Signalement | (parc, hors stepper) → motif → détails (3) | `createReport` | `reports`, `status: open` |
| Avis | parc → opinion → commentaire (3) | `createReview` | `reviews`, publié immédiatement |

`EditInfo.tsx` — 8 cibles de correction exactes : `general` (nom/description), `ages`,
`play`, `service`, `accessibility`, `characteristics` (environnement+sécurité), `location`
(repositionnement pin), `other` (texte libre) — chacune avec une note optionnelle pour le
modérateur (`EditInfo.tsx:50-66,560-583`).

**Auth juste-à-temps — déclenchée à la soumission finale, pas à l'entrée du wizard**, pour 4 des 5
wizards (AddPark, EditInfo, RatePark, ReportProblem) : `submit()` vérifie `userId`, sinon sauvegarde
le brouillon en `localStorage`, mémorise la route de reprise (`resumeRoute.ts`, TTL 30 min), puis
`navigate("/login")` — **et non `/login-method`**. Après connexion, reprise automatique et
republication (`App.tsx:92-96`, guard `autoSubmitted.current` par écran). `AddPhotos.tsx` fait
exception : le blocage a lieu **avant** l'ouverture du sélecteur de fichiers (un `File` ne survit
pas à une redirection OAuth plein écran), via `requireAccount()` — l'utilisateur doit ressélectionner
ses photos après connexion.

**Aucun draft n'est jamais persisté en base.** Les brouillons vivent uniquement en `localStorage`
(TTL par flow). Conséquence directe pour la taxonomie : **l'abandon d'un flow de contribution ne
sera mesurable QUE par l'absence d'un événement `*_completed` après un `*_started`** — il n'existe
et n'existera aucune ligne "draft" en base à requêter pour ça.

**Statut "en attente" visible côté utilisateur : uniquement pour les parcs**, dans
`Contributions.tsx:74` (badge "en attente" si `status !== published`). Aucun badge de statut pour
avis ou signalements après soumission.

`Contributions.tsx` (historique personnel, 3 onglets : parcs/avis/signalements créés par
l'utilisateur) est **différent** de `Activity.tsx` (fil d'activité communautaire global :
`park_added`/`review_added`/`report_resolved`, pas propre à l'utilisateur).

`MoreActions.tsx` : seulement 2 items — "ajouter une photo" (réel) et "poser une question"
(**mock**, `comingSoon`).

`ContributionSuccessSheet` est un composant générique partagé par les 5 wizards, purement
paramétré par le caller — un bon point d'ancrage unique pour un événement `*_completed` commun,
mais le nom exact de la contribution doit être passé en propriété par chaque wizard.

## 18. Écrans back-office pertinents pour le contexte (hors tracking consommateur)

`apps/backoffice/src/screens/Statistiques.tsx:26-147` affiche déjà, côté collectivité, des KPI
réels : vues cumulées par parc, taux et délai moyen de résolution des signalements, note moyenne,
couverture des 7 équipements (colonnes plates V1), activité de l'équipe. **Le Product Analytics ne
doit pas redupliquer ces KPI business** — il doit couvrir un angle complémentaire (comportement
utilisateur final, funnels, rétention), pas de la gestion de parc. Détail complet des écrans
back-office et modération : `DASHBOARDS.md` §Data Quality.

---

## 19. Récapitulatif — fonctionnalités non (ou partiellement) fonctionnelles

Point demandé explicitement par la consigne : ne pas instrumenter ces zones comme si elles étaient
des features complètes, ou documenter clairement la limite dans l'événement.

| Fonctionnalité | État réel | Source |
|---|---|---|
| **Itinéraire (Directions)** | Mock complet : ETA haversine, aucun lien navigation externe | `Directions.tsx:41-49` |
| Auth Apple | Mock (`comingSoon`), aucune fonction d'auth | `Splash.tsx:55-58`, `auth.ts` (absent) |
| Auth téléphone | Mock (`comingSoon`) | `LoginMethod.tsx:36-43` |
| Notifications push | Inexistantes (centre in-app seul) | grep exhaustif, 0 résultat |
| Toggle "push" dans réglages notif. | Écrit en base, sans effecteur consommateur | `NotificationPrefs.tsx` |
| Filtre "Ouvert maintenant" | Compté dans le badge, sans effet sur les résultats | `FiltersSheet.tsx:40-45` |
| `guestMode` (store session) | Flag déclaré, jamais lu ailleurs | `session.ts:16,20,89` |
| "Toboggo Score" | Heuristique client, n'utilise pas le vrai moteur `park_scores` | `ScoreDetail.tsx:20-31` |
| Signalement d'avis (`flagReview`) | Passe `status: flagged`, non consommé en back-office | `reviews.ts:125-129` |
| Partage Instagram | Lien générique, pas de pré-remplissage | `ShareSheet.tsx:16` |
| GroupOuting | Fonctionnel mais sans temps réel ni suivi de statut live | `groups.ts:9` |
| "Poser une question" (MoreActions) | Mock (`comingSoon`) | `MoreActions.tsx` |
| Suppression de compte | Fonctionnelle mais erreur RPC non affichée à l'utilisateur | `Account.tsx:22-29` |

---

## 20. Product findings outside analytics — classification bêta

Constats produit identifiés pendant cet audit, sans rapport direct avec l'instrumentation
analytics elle-même. **Aucun de ces sujets n'est corrigé ici** — classification uniquement, pour
aider à prioriser avant la bêta. Le détail technique complet de chaque point est en §19 ; cette
section n'ajoute qu'un jugement de sévérité produit.

| # | Constat | Classification | Justification (constat, pas correction) |
|---|---|---|---|
| 1 | **Itinéraire (Directions) mock** — ETA affichée comme réelle, "Démarrer" sans effet réel | 🔴 **Bloque potentiellement la bêta** | L'écran présente une ETA chiffrée et un bouton "Démarrer" qui donnent l'impression d'une vraie navigation ; un parent qui s'y fie pour se rendre à un parc avec ses enfants peut être induit en erreur. Risque de confiance, pas seulement de feature manquante. |
| 2 | **Avis sans file de modération** — publication immédiate, `flagReview` non consommé en back-office | 🔴 **Bloque potentiellement la bêta** | Produit destiné à des familles, contenu généré par les utilisateurs visible instantanément sans aucune revue possible avant publication — risque de contenu inapproprié ou diffamatoire immédiatement public, sans filet de sécurité opérationnel. |
| 3 | **FakeMap si `VITE_MAP_STYLE_URL` absente** | 🔴 **Bloque potentiellement la bêta — conditionnel, à vérifier** | La carte est la fonctionnalité cœur d'un localisateur de parcs. Si la variable n'est pas correctement configurée dans l'environnement de bêta (non vérifiable depuis ce worktree, cf. §20 points d'incertitude), des utilisateurs réels verraient un mock (grille + blobs) à la place d'une carte — à confirmer avant lancement, pas un correctif de code. |
| 4 | **Push notifications absentes malgré un toggle "push" dans les réglages** | 🟠 **À investiguer avant bêta** | Le réglage laisse croire à l'utilisateur qu'une préférence a un effet, alors qu'aucun système de push n'existe pour la consommer — pas trompeur au point de bloquer, mais mérite clarification (masquer le toggle, ou livrer le push) avant d'exposer ce réglage à des utilisateurs réels. |
| 5 | **Filtre "Ouvert maintenant" sans effet sur les résultats** | 🟠 **À investiguer avant bêta** | Filtre sélectionnable et visuellement actif qui ne change aucun résultat retourné — confusion utilisateur directe et immédiate, contrairement aux mocks d'auth qui s'annoncent explicitement comme "bientôt disponible". |
| 6 | **"Toboggo Score" client ≠ moteur backend `park_scores`** | 🟠 **À investiguer avant bêta** | Écart entre une fonctionnalité potentiellement mise en avant comme différenciante et son implémentation réelle (heuristique locale au lieu du vrai moteur de scoring) — décision produit/marketing à trancher par le fondateur avant toute communication publique sur cette feature. |
| 7 | **Auth Apple mock** (`comingSoon`) | 🟢 **Acceptable post-V1** | Le CTA annonce explicitement "bientôt disponible" — pas de tromperie, juste une fonctionnalité non livrée et présentée comme telle. |
| 8 | **Auth téléphone mock** (`comingSoon`) | 🟢 **Acceptable post-V1** | Même raisonnement que l'auth Apple. |
| 9 | **Partage sans Web Share API** (liens `mailto:`/`sms:`/`wa.me` + copier-lien) | 🟢 **Acceptable post-V1** | Fonctionnellement complet (le partage fonctionne réellement via ces canaux), seule l'intégration native manque — dégradation d'UX, pas une fonctionnalité cassée ou trompeuse. |
| 10 | **GroupOuting sans temps réel** | 🟢 **Acceptable post-V1** | Fonctionnalité secondaire, réellement fonctionnelle en CRUD (création/rejoindre un groupe), seule l'actualisation live du statut des membres manque — dégradation, pas un mock. |

---

## 21. Points d'incertitude reportés par les audits (à vérifier humainement)

- Configuration réelle de `VITE_MAP_STYLE_URL` / `VITE_MAPTILER_KEY` par environnement
  (dev/staging/prod) — non vérifiable depuis ce worktree (`.env*` gitignorés).
- Existence et comportement réel de la RPC Postgres `delete_own_account` (hors périmètre front).
- Volumétrie réelle de `park_sources` / `park_attribute_sources` / `park_edits` en base (les
  migrations suggèrent des tables vides à leur création) — un KPI de couverture "source" pourrait
  afficher 0 % par absence de backfill historique plutôt que par vrai problème qualité.
- Comportement de `resumeRoute` en cas d'échec de connexion (mauvais mot de passe, erreur réseau)
  pendant une reprise de contribution — non tracé jusqu'au bout.
- `QuickMenu.tsx` (point d'entrée "Contribuer" probable, non lu en détail) — à explorer si un futur
  audit approfondit l'arborescence des CTA de contribution.
