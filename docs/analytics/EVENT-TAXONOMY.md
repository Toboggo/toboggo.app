# Event Taxonomy — Toboggo Product Analytics

Taxonomie volontairement limitée, confrontée au code réel (`ANALYTICS-AUDIT.md`). snake_case
partout. Aucun de ces événements n'existe encore dans le code — ce document sert de spécification
pour l'implémentation à venir (hors périmètre de cette phase).

## Décisions de consolidation vs la liste candidate

Par rapport à la liste candidate fournie, les changements suivants ont été faits et sont justifiés
ci-dessous (traçables au code) :

- **`search_results_viewed` réintégré en P0** (ajustement demandé après relecture de l'audit) :
  initialement fondu dans `search_performed` (le nombre de résultats devenait une simple
  propriété `results_count`). Réintégré comme événement séparé pour permettre un funnel explicite
  `search_performed` → `search_results_viewed` → `park_viewed` → (`route_requested` |
  `park_favorited` | `park_shared`), plus lisible dans PostHog qu'une propriété numérique sur
  `search_performed` seul. Voir sa fiche dédiée en section SEARCH.
- **Supprimé `marker_clicked`** : un clic sur un marker n'ouvre qu'une preview bottom-sheet
  (`ParkPreview`), pas la fiche complète (`ANALYTICS-AUDIT.md` §9) — c'est un clic UI intermédiaire,
  pas un événement métier. L'origine du clic est capturée par la propriété `discovery_source` de
  `park_viewed` (déclenché seulement à l'ouverture réelle de la fiche `/park/:id`).
- **Supprimé `review_submitted`, `photo_submitted`, `park_added`, `park_edit_submitted`,
  `problem_reported`** : ce sont tous des doublons de `contribution_completed` avec une valeur
  différente de la propriété `contribution_type` — les garder séparés violerait la consigne
  "évite les doublons".
- **Ajouté `account_deleted`** : absent de la liste candidate, mais la suppression de compte est
  une fonctionnalité réelle et câblée (`Account.tsx`, `ANALYTICS-AUDIT.md` §3) qui impacte
  directement les compteurs DAU/MAU et la rétention — nécessaire pour ne pas fausser ces KPI.
- **Ajouté `directions_viewed`** distinct de `route_requested` : l'ouverture de l'écran Itinéraire
  (navigation vers `/park/:id/directions`) et le clic sur "Démarrer" (`startNav`, intention forte,
  cf. North Star) sont deux signaux d'intensité différente — les fondre aurait affaibli le signal
  de la North Star candidate.
- **`filter_opened` et `cluster_clicked`, `photo_viewed`, `review_viewed`, `favorite_revisited`,
  `notification_opened` conservés en P2** : utiles mais non structurants, pour respecter "un
  tracking minimal plutôt qu'exhaustif" tout en gardant la possibilité de les activer plus tard
  sans redesign de la taxonomie.

---

## APP / ACCOUNT

### `app_opened`
- **Description** : l'application démarre pour un utilisateur (session produit).
- **Trigger exact** : montage de `App.tsx`, après résolution de `init()` (`App.tsx:85-87`), une
  fois par lancement d'app (pas par navigation interne).
- **Écran/source** : global (`App.tsx`).
- **Propriétés** : `is_authenticated` (bool), `app_version`, `locale`.
- **KPI/funnel** : DAU/WAU/MAU, nouveaux vs returning, rétention D1/D7/D30.
- **Priorité** : P0.

### `signup_started`
- **Description** : l'utilisateur arrive sur le formulaire d'inscription.
- **Trigger exact** : montage de `AuthForm.tsx` avec `mode === "signup"` (`AuthForm.tsx:15`, query
  `?mode=signup`, atteint depuis `Splash.tsx:63` ou le lien de bascule).
- **Écran/source** : `AuthForm.tsx` (mode signup).
- **Propriétés** : `entry_point` (`splash`, `contribution_resume` — si arrivée via redirection
  juste-à-temps depuis un wizard, cf. audit §17).
- **KPI/funnel** : funnel signup (started → completed).
- **Priorité** : P1.

### `signup_completed`
- **Description** : création de compte réussie.
- **Trigger exact** : retour succès de `signUp()` (`AuthForm.tsx:49`, `packages/shared/src/api/auth.ts:3-18`).
- **Écran/source** : `AuthForm.tsx`.
- **Propriétés** : `provider` (`email` — Google suit un chemin distinct, voir ci-dessous),
  `entry_point` (idem `signup_started`).
- **KPI/funnel** : funnel signup, DAU nouveaux utilisateurs.
- **Priorité** : P0.

### `login_completed`
- **Description** : connexion réussie (compte existant).
- **Trigger exact** : retour succès de `signIn()` (`AuthForm.tsx:66`) OU retour réussi du flow
  Google OAuth (`signInWithGoogle`, `auth.ts:34-45`, déclenché depuis `Splash.tsx`,
  `LoginMethod.tsx`, `AuthForm.tsx`).
- **Écran/source** : `AuthForm.tsx` / redirection OAuth.
- **Propriétés** : `provider` (`email` | `google`).
- **KPI/funnel** : returning users, taux d'usage réel par provider (utile pour arbitrer la
  priorité Apple/téléphone malgré leur état mock actuel).
- **Priorité** : P0.

### `account_deleted`
- **Description** : suppression de compte confirmée.
- **Trigger exact** : retour succès de `deleteOwnAccount()` (`Account.tsx:22-30`,
  `auth.ts:47-52`) — **avant** le `navigate("/")`, pour capter l'événement même si la navigation
  suivante échoue.
- **Écran/source** : `Account.tsx`.
- **Propriétés** : aucune propriété sensible (voir `PRIVACY-RULES.md`).
- **KPI/funnel** : churn réel, à soustraire des compteurs MAU/rétention.
- **Priorité** : P1.

---

## DISCOVERY

### `map_viewed`
- **Description** : l'écran carte/exploration est affiché.
- **Trigger exact** : montage de `MapExplore.tsx`.
- **Écran/source** : `MapExplore.tsx`.
- **Propriétés** : **`map_kind`: `real` | `fake` (obligatoire)** — distingue MapLibre réel de
  `FakeMap` (`ANALYTICS-AUDIT.md` §4, `MapCanvas.tsx:258-260`) ; sans cette propriété, toute
  métrique d'engagement carte serait faussée entre environnements. `has_location_permission`
  (bool).
- **KPI/funnel** : usage carte vs autres modes de découverte, taux de FakeMap par
  session/environnement (dette produit à surveiller autant qu'un signal analytics).
- **Priorité** : P0.

### `cluster_clicked`
- **Description** : clic sur un cluster de markers (zoom, pas de sélection de parc).
- **Trigger exact** : `MapCanvas.tsx:181-184` (callback de clic cluster, avant l'`easeTo`).
- **Écran/source** : `MapCanvas.tsx`.
- **Propriétés** : `cluster_size` (nombre de parcs regroupés — faible cardinalité, entier borné).
- **KPI/funnel** : densité perçue de l'offre par zone, taux d'exploration par zoom.
- **Priorité** : P2.

---

## SEARCH

### `search_performed`
- **Description** : une recherche (parc ou lieu) a été exécutée et a retourné un résultat.
- **Trigger exact** : côté implémentation, débouncer l'émission de l'événement (~400 ms après la
  dernière frappe) même si la requête `searchParks` sous-jacente n'a elle-même pas de débounce
  (`ANALYTICS-AUDIT.md` §6) — pour éviter un événement par caractère tapé. Émis une fois la
  réponse reçue (parc ou lieu).
- **Écran/source** : `SearchOverlay.tsx`.
- **Propriétés** : `query_type` (`park` | `place`), `results_count` (entier), pas le texte de
  recherche en clair par défaut (voir `PRIVACY-RULES.md` sur le risque de PII dans une recherche
  libre — ex. un utilisateur qui tape son adresse personnelle).
- **KPI/funnel** : zero-result rate, découverte carte/recherche/autour de vous.
- **Priorité** : P0.

### `search_results_viewed`
- **Description** : les résultats d'une recherche sont effectivement affichés à l'utilisateur
  (résultat non vide) — étape intermédiaire explicite entre l'exécution de la requête
  (`search_performed`) et l'ouverture d'une fiche, pour construire un funnel lisible dans
  PostHog plutôt que de dépendre uniquement de la propriété `results_count` de
  `search_performed`.
- **Trigger exact** : rendu de la liste de résultats dans `SearchOverlay.tsx` immédiatement après
  la résolution de `search_performed`, uniquement si `results_count > 0` (si 0, c'est
  `zero_results` qui s'applique à la place, pas cet événement — les deux sont mutuellement
  exclusifs pour une même recherche).
- **Écran/source** : `SearchOverlay.tsx`.
- **Propriétés** : `query_type` (`park` | `place`), `results_count` (entier).
- **KPI/funnel** : funnel explicite `search_performed` → `search_results_viewed` → `park_viewed`
  → (`route_requested` | `park_favorited` | `park_shared`) — répond directement à "comment
  découvrent-ils les parcs" et "quelle proportion de recherches mène à une intention forte".
- **Priorité** : P0.

### `zero_results`
- **Description** : un des 4 états "0 résultat" de l'écran carte, ou de la recherche, ou de la
  liste filtrée par âge, est atteint.
- **Trigger exact** : entrée dans une des branches de `MapExplore.tsx:207-264` (géoloc refusée /
  filtres actifs / lieu sans résultat / cas par défaut), ou `SearchOverlay.tsx:181-183`, ou
  `ParkList.tsx:85` (`ANALYTICS-AUDIT.md` §8 pour le détail exact des branches).
- **Écran/source** : `MapExplore.tsx` / `SearchOverlay.tsx` / `ParkList.tsx`.
- **Propriétés** : `reason` (`location_denied` | `filters_active` | `place_not_found` |
  `default_area` | `search_no_match` | `children_age_no_match`).
- **KPI/funnel** : zero-result rate global et par cause, détection de demande catalogue non
  couverte (question produit explicite).
- **Priorité** : P0.

---

## FILTER

### `filter_opened`
- **Description** : ouverture du panneau de filtres.
- **Trigger exact** : ouverture de `FiltersSheet.tsx` (`MapExplore.tsx:377`).
- **Écran/source** : `MapExplore.tsx` / `FiltersSheet.tsx`.
- **Propriétés** : aucune.
- **KPI/funnel** : taux d'ouverture → application (abandon du panneau de filtres).
- **Priorité** : P2.

### `filter_applied`
- **Description** : un filtre a changé de valeur (âge, équipement) — **hors `openNow`**, qui n'a
  aucun effet réel sur les résultats (`ANALYTICS-AUDIT.md` §7) et ne doit pas être instrumenté
  comme s'il en avait un.
- **Trigger exact** : changement de valeur dans `FiltersSheet.tsx` (âge : `:28-35` ; équipement :
  `:50-56`) ou du toggle "Pour mes enfants" / tri dans `ParkList.tsx:55-67`.
- **Écran/source** : `FiltersSheet.tsx` / `ParkList.tsx`.
- **Propriétés** : `filter_type` (`age` | `amenity` | `for_children` | `sort`), `filter_value`
  (ex. code d'équipement `wc`/`shade`/…, ou valeur de tri — faible cardinalité, valeurs
  énumérées).
- **KPI/funnel** : filtres les plus utilisés, funnel filtre → fiche → intention forte (questions
  produit explicites).
- **Priorité** : P0.

### `filter_cleared`
- **Description** : réinitialisation explicite des filtres via le bouton dédié.
- **Trigger exact** : `filters.ts:49` (fonction `reset`), déclenchée depuis le bouton
  "Réinitialiser" de `FiltersSheet.tsx` ou le CTA "Effacer les filtres" du zero-result
  (`MapExplore.tsx:222-234`).
- **Écran/source** : `FiltersSheet.tsx` / `MapExplore.tsx`.
- **Propriétés** : `trigger_source` (`filters_sheet` | `zero_results_cta`).
- **KPI/funnel** : mesure indirecte de filtres mal calibrés (reset après un zero-result).
- **Priorité** : P1.

---

## PARK

### `park_viewed`
- **Description** : la fiche complète d'un parc est affichée.
- **Trigger exact** : montage de `ParkDetail.tsx` (même point d'ancrage que le RPC réel
  `incrementParkViews`, `ParkDetail.tsx:53-55` — les deux compteurs coexistent, l'un en base pour
  le produit/back-office, l'autre en événement pour les funnels comportementaux).
- **Écran/source** : `ParkDetail.tsx`.
- **Propriétés** : `park_id`, `discovery_source` (`map_marker` | `cluster` | `list` | `carousel` |
  `search_park` | `search_place` | `favorites` | `share_link` | `notification` |
  `contribution_success` | `other` | `unknown`), `has_photos` (bool), `has_reviews` (bool),
  `distance_bucket` (`<1km` | `1-3km` | `3-10km` | `10-20km` | `>20km` — jamais de coordonnées
  précises, voir `PRIVACY-RULES.md`).
- **`other` vs `unknown`** (ajouté lors du hardening post-instrumentation) : `other` désigne une
  source réelle mais non catégorisée dans la liste ; `unknown` signifie que la provenance n'a pas
  pu être déterminée par le code appelant — ce n'est **pas** un synonyme. L'implémentation actuelle
  de `ParkDetail.tsx` envoie systématiquement `unknown` : déterminer la vraie source demanderait de
  faire transiter un paramètre à travers de nombreux points de navigation (marker, liste, carrousel,
  recherche, favoris, partage, notification) — hors périmètre de l'instrumentation P0 actuelle.
  Une valeur inconnue explicite est préférable à une valeur affirmée sans fondement.
- **KPI/funnel** : parks viewed, parks viewed/user, taux de conversion vers favori/partage/
  itinéraire, corrélation photos × engagement (question produit explicite).
- **Priorité** : P0.

### `photo_viewed`
- **Description** : ouverture de la galerie complète de photos d'un parc.
- **Trigger exact** : navigation vers `/park/:id/photos` (`ParkDetail.tsx:248-250`) ou montage de
  `DetailPhotos.tsx`.
- **Écran/source** : `DetailPhotos.tsx`.
- **Propriétés** : `park_id`, `photo_count`.
- **KPI/funnel** : engagement photo spécifique (complémentaire à `has_photos` sur `park_viewed`).
- **Priorité** : P2.

### `review_viewed`
- **Description** : ouverture de la liste complète des avis d'un parc.
- **Trigger exact** : navigation vers `/park/:id/reviews` ou montage de `DetailReviews.tsx`.
- **Écran/source** : `DetailReviews.tsx`.
- **Propriétés** : `park_id`, `review_count`.
- **KPI/funnel** : engagement avis spécifique.
- **Priorité** : P2.

### `directions_viewed`
- **Description** : ouverture de l'écran Itinéraire — signal d'intention plus faible que
  `route_requested` (l'utilisateur n'a pas encore cliqué "Démarrer").
- **Trigger exact** : montage de `Directions.tsx`.
- **Écran/source** : `Directions.tsx`.
- **Propriétés** : `park_id`.
- **KPI/funnel** : entonnoir intention (`park_viewed` → `directions_viewed` → `route_requested`).
- **Priorité** : P2.

---

## INTENT

### `park_favorited`
- **Description** : ajout d'un parc aux favoris.
- **Trigger exact** : après confirmation du write optimiste (pas seulement le clic) —
  `toggleFavorite` (`session.ts:107-121`) résolu sans erreur, sens "ajout" uniquement
  (`ParkDetail.tsx:109-113`). Redirige vers `/login` si invité — donc toujours un utilisateur
  identifié.
- **Écran/source** : `ParkDetail.tsx` (ou `Favorites.tsx` si un toggle y existe aussi).
- **Propriétés** : `park_id`, `discovery_source` (reprend la valeur de `park_viewed` de la même
  session si disponible).
- **KPI/funnel** : sous-signal principal de la North Star "Weekly Park Intentions" (le plus
  fiable des trois, cf. `TRACKING-PLAN.md`), taux favori/vue.
- **Priorité** : P0.

### `park_unfavorited`
- **Description** : retrait d'un parc des favoris.
- **Trigger exact** : même mécanisme que ci-dessus, sens "retrait".
- **Écran/source** : `ParkDetail.tsx` / `Favorites.tsx`.
- **Propriétés** : `park_id`.
- **KPI/funnel** : churn de favoris, qualité du signal favori (un fort taux de retrait rapide
  affaiblirait la fiabilité de `park_favorited` comme signal d'intention durable).
- **Priorité** : P1.

### `park_shared`
- **Description** : clic sur un canal de partage — mesure une **intention de partage confirmée
  par le clic**, pas un envoi confirmé (limite documentée en `TRACKING-PLAN.md` §2).
- **Trigger exact** : clic sur un des liens de `ShareSheet.tsx:41-65` (WhatsApp/SMS/Instagram/
  email), ou succès de l'écriture presse-papiers pour le fallback "copier le lien"
  (`ShareSheet.tsx:68-72` — seul cas réellement confirmable techniquement).
- **Écran/source** : `ShareSheet.tsx`.
- **Propriétés** : `park_id`, `channel` (`whatsapp` | `sms` | `email` | `instagram` |
  `copy_link`).
- **KPI/funnel** : sous-signal de la North Star, taux partage/vue, canal de partage préféré.
- **Priorité** : P0.

### `route_requested`
- **⚠️ NE DOIT PAS être considéré comme correctement instrumentable dans l'état actuel du code.**
  `Directions.tsx` est un mock complet (`ANALYTICS-AUDIT.md` §9ter) : aucune ouverture réelle
  d'un provider de navigation externe n'existe aujourd'hui. L'événement reste défini ici en P0
  car il est structurant pour la North Star, mais **son instrumentation définitive doit
  intervenir seulement avec la mise en place d'une vraie ouverture externe** — pas de développement
  de l'itinéraire dans ce worktree à cette étape (hors périmètre de cet audit).
- **Description cible (une fois l'ouverture externe réelle implémentée)** : l'utilisateur déclenche
  l'ouverture effective d'un provider de navigation externe (Apple Plans, Google Maps ou Waze)
  vers le parc — l'événement doit représenter **la demande d'ouverture réelle d'un provider
  externe**, pas simplement l'ouverture de l'écran Directions (cf. `directions_viewed`, qui capte
  déjà ce signal plus faible) ni un clic sur le bouton "Démarrer" actuel de l'écran mock.
- **Trigger exact — état actuel (mock, à ne pas considérer comme fiable)** : `startNav()`
  (`Directions.tsx:45-49`) ne fait qu'activer un state local et un toast, sans sortie de l'app.
- **Trigger exact — état cible (à instrumenter au moment de la reconstruction de la fonctionnalité,
  pas maintenant)** : ouverture confirmée d'un lien externe vers le provider choisi (ex. lien
  `maps://`, `comgooglemaps://`, `waze://` ou équivalent web), au moment du clic qui déclenche
  effectivement cette ouverture.
- **Écran/source** : `Directions.tsx` (ou son successeur fonctionnel).
- **Propriétés** : `park_id`, `transport_mode` (`walk` | `bike` | `car`), et **`provider`
  (`apple_maps` | `google_maps` | `waze`) — propriété à activer uniquement quand un vrai choix de
  provider externe existe** ; tant que ce n'est pas le cas, ne pas envoyer cette propriété avec une
  valeur inventée.
- **KPI/funnel** : sous-signal de la North Star — voir `TRACKING-PLAN.md` §2 pour la limite
  explicite sur la fiabilité actuelle de ce signal (mesure une demande, pas un usage réel
  d'itinéraire, jusqu'à l'implémentation de l'ouverture externe).
- **Priorité** : P0 (prévu dès le lancement de l'instrumentation), **mais implémentation
  définitive conditionnée à l'existence d'une vraie ouverture externe** — voir note ci-dessus.

---

## CONTRIBUTION

### `contribution_started`
- **Description** : entrée dans un wizard de contribution.
- **Trigger exact** : montage de l'écran wizard (`AddPark.tsx`, `AddPhotos.tsx`, `EditInfo.tsx`,
  `ReportProblem.tsx`, `RatePark.tsx`) — un seul point d'ancrage cohérent entre les 5 types plutôt
  que de tenter de détecter une "vraie" première saisie, ce qui varierait par wizard.
- **Écran/source** : les 5 écrans ci-dessus.
- **Propriétés** : `contribution_type` (`add_park` | `add_photo` | `edit_info` | `report` |
  `review`), `park_id` (nullable — absent si le wizard démarre sans parc préselectionné, ex.
  `AddPark` ou `AddPhotos`/`ReportProblem`/`RatePark` sans `?park=`), `entry_point`
  (`park_detail_contribute_sheet` | `more_actions` | `direct_link` | `contribution_resume` |
  `visit_prompt` | `unknown`).
- **`entry_point: "visit_prompt"`** : `RatePark` ouvert depuis le rappel de visite post-itinéraire
  (`GlobalOverlays.tsx` → `VisitRatingPrompt`, cf. `useVisitPrompt`), qui navigue vers
  `/rate?park=<id>&stars=<N>&source=visit_prompt`. L'origine est portée **explicitement** par
  `source=visit_prompt` ; `stars` ne sert qu'à présélectionner la note et n'est jamais utilisé pour
  déduire l'origine. `contribution_resume` (`?resume=1`) reste prioritaire.
- **`entry_point: "unknown"`** (ajouté lors du hardening post-instrumentation) : pour `RatePark`
  spécifiquement, `/rate?park=` (hors reprise, sans `source=visit_prompt`) n'implique PAS de façon
  fiable "depuis la fiche parc" (lien direct, etc.), et le wizard ne peut pas distinguer ces
  origines. `RatePark.tsx` envoie donc `unknown` dans ce cas plutôt que d'affirmer
  `park_detail_contribute_sheet` à tort. Les 4 autres wizards (parcours `?park=` à origine unique vérifiée) gardent
  `park_detail_contribute_sheet` de façon fiable.
- **KPI/funnel** : volume de contribution par type, base du funnel started → completed →
  abandoned.
- **Priorité** : P0.

### `contribution_completed`
- **Description** : soumission réussie d'une contribution — remplace les 5 événements candidats
  spécifiques (`review_submitted`, `photo_submitted`, `park_added`, `park_edit_submitted`,
  `problem_reported`), voir la note de consolidation en tête de document.
- **Trigger exact** : retour succès de la fonction de soumission correspondante — `createPark`
  (`AddPark.tsx:293`), `addParkPhotos` (`AddPhotos.tsx:125`), `submitParkEdit`
  (`EditInfo.tsx:280`), `createReport` (`ReportProblem.tsx:134`), `createReview`
  (`RatePark.tsx:124`) — juste avant l'affichage de `ContributionSuccessSheet` (composant
  générique partagé par les 5 wizards).
- **Écran/source** : les 5 écrans wizard.
- **Propriétés** : `contribution_type`, `park_id`, `had_just_in_time_auth?` (bool, **optionnelle**
  — la soumission a-t-elle nécessité une interruption pour connexion, cf. audit §17), `has_photo`
  (bool, pertinent pour `add_park`/`review`).
- **`had_just_in_time_auth` rendue optionnelle** (hardening post-instrumentation) : `AddPhotos.tsx`
  n'a pas de marqueur `?resume=1` (son auth passe par `requireAccount`, pas `resumeRoute` — voir
  audit §17) et ne peut donc pas distinguer de façon fiable "déjà connecté à l'entrée" de "vient de
  se connecter" — il omet la propriété plutôt que d'envoyer `false` à tort. Les 4 autres wizards
  continuent d'envoyer une valeur fiable (`wantsResume`, marqueur explicite).
- **KPI/funnel** : taux de complétion, contributeurs actifs, contributions par type.
- **Priorité** : P0.

### `contribution_abandoned`
- **Description** : le wizard est démonté sans qu'un `contribution_completed` correspondant n'ait
  été émis. Signal **inféré côté client** (aucun draft n'existe en base — `ANALYTICS-AUDIT.md`
  §17 — c'est la seule méthode de mesure possible), donc approximatif : ne capte pas un kill
  d'app ou une mise en arrière-plan prolongée sans retour.
- **Trigger exact** : effet de nettoyage (`useEffect` cleanup) au démontage de l'écran wizard, si
  l'état local `done`/`submitted` n'a jamais été passé à `true` pendant le montage.
- **Écran/source** : les 5 écrans wizard.
- **Propriétés** : `contribution_type`, `last_step` (le nom d'étape du Stepper atteint au moment
  de l'abandon), `had_just_in_time_auth_interrupt` (bool — abandon au moment précis de la
  redirection vers `/login`, à distinguer d'un abandon "naturel" en cours de saisie).
- **KPI/funnel** : où les utilisateurs abandonnent les flows de contribution (question produit
  explicite), par étape et par type.
- **Priorité** : P1.

---

## RETENTION

### `favorite_revisited`
- **Description** : l'utilisateur consulte sa liste de favoris.
- **Trigger exact** : montage de `Favorites.tsx`.
- **Écran/source** : `Favorites.tsx`.
- **Propriétés** : `favorites_count`.
- **KPI/funnel** : comportement associé au retour des utilisateurs (question produit explicite) —
  hypothèse à tester : les revisiteurs de favoris reviennent-ils plus souvent sur l'app ensuite ?
- **Priorité** : P2.

### `notification_opened`
- **Description** : clic sur une notification dans le centre in-app (il n'existe pas de push réel
  — `ANALYTICS-AUDIT.md` §16 — cet événement ne mesure que l'engagement avec le centre
  in-app).
- **Trigger exact** : `onOpen` dans `NotifCenter.tsx:30-39`.
- **Écran/source** : `NotifCenter.tsx`.
- **Propriétés** : `notification_type` (`resolved` | `new_park` | `thanks` | `recommend`).
- **KPI/funnel** : engagement avec le centre de notifications in-app, à comparer si un vrai push
  est construit plus tard.
- **Priorité** : P2.

---

## Récapitulatif par priorité

- **P0 (14)** : `app_opened`, `signup_completed`, `login_completed`, `map_viewed`,
  `search_performed`, `search_results_viewed`, `zero_results`, `filter_applied`, `park_viewed`,
  `park_favorited`, `park_shared`, `route_requested` (⚠️ instrumentation définitive différée,
  voir sa fiche), `contribution_started`, `contribution_completed`.
- **P1 (5)** : `signup_started`, `account_deleted`, `filter_cleared`, `park_unfavorited`,
  `contribution_abandoned`.
- **P2 (7)** : `cluster_clicked`, `filter_opened`, `photo_viewed`, `review_viewed`,
  `directions_viewed`, `favorite_revisited`, `notification_opened`.

Total : 26 événements (14 + 5 + 7).

---

## Propriétés communes (sur tout événement)

| Propriété | Type | Notes |
|---|---|---|
| `is_authenticated` | bool | true dès qu'un `userId` Supabase existe |
| `app_version` | string | `__APP_VERSION__` (build), déjà utilisé dans `About.tsx` |
| `locale` | string | langue active (`useLocale`), indépendante du compte |
| `environment` | `"staging"` \| `"production"` | Lue depuis `VITE_APP_ENV` (`lib/analytics/environment.ts`), jamais déduite du mode de build Vite. **Un seul projet PostHog** (Staging + Production) : cette propriété est le seul mécanisme de séparation — tout dashboard Founder/Product doit filtrer `environment = production` (voir `DASHBOARDS.md`). Absente/invalide ⇒ analytics intégralement no-op, jamais un repli implicite vers `"production"`. |
| distinct_id / anonymous_id | géré par PostHog | réconciliation anonyme→identifié requise (cf. `TRACKING-PLAN.md` §2) dès l'implémentation |

## Propriétés spécifiques (déjà listées par événement ci-dessus, récapitulatif)

`park_id`, `discovery_source`, `has_photos`, `has_reviews`, `distance_bucket`, `filter_type`,
`filter_value`, `results_count`, `query_type`, `reason`, `contribution_type`, `step`/`last_step`,
`channel`, `provider` (`apple_maps`/`google_maps`/`waze` — **conditionnelle**, à n'envoyer que
lorsqu'un vrai choix de provider de navigation externe existe, cf. `route_requested`),
`transport_mode`, `notification_type`.

**Explicitement écarté** : une propriété composite `data_completeness` (mentionnée dans les
exemples candidats) n'est pas définie ici — son calcul nécessiterait une formule inventée non
vérifiable dans le code actuel. Si un indicateur de complétude de fiche est utile, il doit être
calculé côté Supabase (domaine Data Quality, voir `DASHBOARDS.md`), pas fabriqué côté client pour
un événement analytics.

**Explicitement écarté** : latitude/longitude précises de l'utilisateur ou du parc en propriété
d'événement — `distance_bucket` (catégoriel) suffit aux besoins produit identifiés, voir
`PRIVACY-RULES.md`.
