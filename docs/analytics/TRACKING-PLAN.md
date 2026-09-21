# Tracking Plan — Toboggo Product Analytics

Référence code : voir `ANALYTICS-AUDIT.md`. Référence événements détaillés : `EVENT-TAXONOMY.md`.
Ce document répond à "quelles questions produit doit permettre de répondre le tracking" et
"quelle North Star / quels KPI en découlent" — il ne répond pas lui-même aux questions (pas de
données collectées à ce stade), il prépare la collecte.

---

## 1. Questions produit à instrumenter (non répondues ici — objectif de collecte)

Reprises telles que fournies, chacune rattachée aux événements qui permettront d'y répondre une
fois les données collectées (voir `EVENT-TAXONOMY.md` pour le détail de chaque événement) :

| Question | Événements/KPI qui y répondront |
|---|---|
| Combien de personnes utilisent réellement Toboggo ? | `app_opened` (DAU/WAU/MAU) |
| Les utilisateurs reviennent-ils ? | `app_opened` par utilisateur unique → rétention D1/D7/D30 |
| Comment découvrent-ils les parcs ? | `map_viewed`, `search_performed` → `search_results_viewed`, `cluster_clicked`, avec propriété `discovery_source` sur `park_viewed` |
| Autour de vous / carte / recherche : quels parcours ? | Répartition des `park_viewed` par `discovery_source` (funnel complet `search_performed` → `search_results_viewed` → `park_viewed` pour la voie recherche) |
| Quels filtres sont utilisés ? | `filter_applied` (propriété `filter_type`/`filter_value`) |
| Quels filtres mènent à l'ouverture d'une fiche ? | Funnel `filter_applied` → `park_viewed` (fenêtre de session) |
| Quels filtres mènent à une intention forte ? | Funnel `filter_applied` → `park_favorited`/`park_shared`/`route_requested` |
| Où apparaissent les recherches sans résultat ? | `zero_results` (propriété `reason`, cf. audit §8) |
| Quels parcs sont consultés ? | `park_viewed` (propriété `park_id`) — à croiser avec `increment_park_views` déjà en base (`ANALYTICS-AUDIT.md` §9) |
| Quelle proportion de fiches génère un favori ? | `park_viewed` → `park_favorited` (taux de conversion) |
| Quelle proportion génère un partage ? | `park_viewed` → `park_shared` |
| Quelle proportion génère une demande d'itinéraire ? | `park_viewed` → `route_requested` — **⚠️ non fiable tant que `Directions.tsx` reste un mock : mesure aujourd'hui un clic sur un écran fermé, pas une ouverture réelle de provider externe, voir §2 et `EVENT-TAXONOMY.md`** |
| Les photos sont-elles associées à plus d'engagement ? | `park_viewed` avec propriété `has_photos`, comparé au taux de conversion vers favori/partage/itinéraire |
| Les utilisateurs contribuent-ils ? Quels types ? | `contribution_started`/`contribution_completed` par `contribution_type` |
| Où abandonnent-ils les flows de contribution ? | `contribution_started` sans `contribution_completed` correspondant, par `step` atteint (cf. audit §17 — pas de draft en base, mesure uniquement possible via ces deux événements) |
| Quels comportements sont associés au retour des utilisateurs ? | Corrélation rétention D7 × événements de la première session (favori, contribution, etc.) |
| Quelles données manquantes du catalogue correspondent à une demande utilisateur ? | `zero_results` géographique + `filter_applied` sans résultat, croisés avec la couverture catalogue (`DASHBOARDS.md` — Data Quality) |

---

## 2. North Star candidate : "Weekly Park Intentions"

> **Weekly Park Intentions** = utilisateurs uniques par semaine ayant réalisé au moins une des
> actions suivantes :
> - `park_favorited`
> - `park_shared`
> - `route_requested`

Conservée comme North Star candidate après relecture de l'audit (point validé). Trois précisions
à documenter clairement partout où cette métrique est affichée — pas des notes de bas de page,
des règles de lecture de la métrique :

1. **Intention ≠ visite réelle.** Aucune des trois actions ne confirme que l'utilisateur s'est
   effectivement rendu au parc. La métrique mesure une intention exprimée dans l'app, pas un
   comportement physique observé.
2. **`park_shared` mesure une action de partage, pas la réception ou la lecture par le
   destinataire.** Cliquer sur un canal de partage (ou copier le lien) est comptabilisé même si le
   destinataire n'ouvre jamais le lien, ou même si aucun message n'est réellement envoyé (canaux
   externes `wa.me`/`sms:`/`mailto:` sans callback de confirmation, cf. `ANALYTICS-AUDIT.md` §13).
3. **`route_requested` deviendra un signal plus fort lorsque l'ouverture externe sera
   fonctionnelle.** Dans l'état actuel (`Directions.tsx` mock, cf. `EVENT-TAXONOMY.md`), cette
   composante de la North Star doit être lue comme une mesure de demande déclarative, pas
   d'usage réel d'itinéraire — sa fiabilité augmentera mécaniquement une fois l'ouverture vers un
   provider externe (Apple Plans, Google Maps, Waze) implémentée.

### Verdict : adoptable, avec deux limites significatives à documenter dès le lancement — ne pas l'adopter sans les lire

**Ce qui fonctionne bien avec le code actuel :**
- Le nom "Intentions" est en réalité bien choisi *techniquement* : aucune des 3 actions
  candidates ne peut être mesurée comme une action confirmée à 100 % côté serveur (voir
  ci-dessous) — mesurer de l'intention plutôt que de la complétion est donc cohérent avec ce que
  le produit permet réellement de capter, pas une approximation forcée.
- `park_favorited` est le signal de la plus haute qualité des trois : écriture DB réelle,
  optimiste + rollback en cas d'échec (`ANALYTICS-AUDIT.md` §11), donc fiable et peu bruité si
  déclenché après confirmation du write (pas sur le clic seul).

**Limites à documenter, pas des bloqueurs :**

1. **`route_requested` mesure un clic sur un écran mock, pas une navigation réelle.**
   `Directions.tsx` ne déclenche aucune navigation externe (voir `ANALYTICS-AUDIT.md` §9ter) — pas
   de lien Google/Apple Maps, ETA calculée localement. L'événement capte une vraie intention
   ("je veux qu'on me guide vers ce parc"), mais si/quand la fonctionnalité est reconstruite avec
   un vrai lien externe, la sémantique de l'événement changera (aujourd'hui : clic sur bouton
   dans un flow fermé ; demain : sortie effective de l'app vers un service de navigation). Il faut
   traiter les données actuelles comme une **mesure de demande**, pas une mesure d'usage réel
   d'itinéraire, et être prêt à casser la comparabilité historique le jour où Directions devient
   fonctionnel.
2. **`park_shared` ne confirme jamais un partage effectivement envoyé** (liens `wa.me`/`sms:`/
   `mailto:` ouverts dans une app externe, sans callback — voir `ANALYTICS-AUDIT.md` §13). Seul le
   fallback "copier le lien" est vérifiable côté client (succès d'écriture presse-papiers).
   L'événement mesurera donc un clic sur un canal de partage, pas un partage confirmé.
3. **Mélange d'événements avec et sans authentification requise.** `park_favorited` exige un
   compte (`ParkDetail.tsx` redirige vers `/login` si invité) ; `route_requested` et `park_shared`
   sont accessibles en mode invité. Compter des "utilisateurs uniques" par semaine sur ce mélange
   nécessite une identification stable des invités (ID anonyme PostHog) réconciliée avec l'ID
   utilisateur à la connexion (fonctionnalité standard "identify/merge" de PostHog, à activer dès
   l'implémentation — hors périmètre de cette phase).

**Recommandation** : adopter la North Star candidate telle quelle, mais (a) libeller clairement en
interne que `route_requested` mesure une intention de navigation et non une navigation réalisée
tant que Directions reste un mock, (b) surveiller `park_favorited` isolément comme le sous-signal
le plus fiable des trois si la métrique composite semble bruitée, (c) mettre en place la
réconciliation anonyme→identifié dès le début de l'implémentation PostHog.

---

## 3. KPI nécessaires (hors North Star)

Évite les vanity metrics : chaque KPI ci-dessous est relié à une décision produit possible, pas
un chiffre pour le chiffre.

| KPI | Définition | Source |
|---|---|---|
| DAU / WAU / MAU | Utilisateurs uniques (identifiés + anonymes réconciliés) ayant émis `app_opened` sur la fenêtre | `app_opened` |
| Nouveaux vs returning | Premier `app_opened` de l'utilisateur vs suivants | `app_opened` + `signup_completed` |
| Park views | Nombre total de `park_viewed` | `park_viewed` |
| Parks viewed / user | `park_viewed` uniques / utilisateur actif sur la période | `park_viewed` |
| Taux de favoris | `park_favorited` / `park_viewed` | funnel |
| Taux de partage | `park_shared` / `park_viewed` | funnel |
| Taux de demande d'itinéraire | `route_requested` / `park_viewed` | funnel — ⚠️ non fiable tant que l'ouverture externe n'est pas implémentée, cf. §2 |
| Contributeurs actifs | Utilisateurs uniques avec ≥1 `contribution_completed` sur la période | `contribution_completed` |
| Contributions par type | Volume `contribution_completed` par `contribution_type` | `contribution_completed` |
| Taux de complétion de contribution | `contribution_completed` / `contribution_started`, par type et par étape d'abandon | `contribution_started`/`completed` |
| Zero-result rate | `zero_results` / (`search_performed` + `filter_applied`) | funnel |
| Rétention D1 / D7 / D30 | % d'utilisateurs avec un `app_opened` à J+1/7/30 après leur premier `app_opened` | `app_opened` |
| Conversion filtre → fiche | `park_viewed` dans la même session qu'un `filter_applied` précédent | funnel |
| Conversion filtre → intention forte | `park_favorited`/`shared`/`route_requested` après un `filter_applied` dans la même session | funnel |

Volontairement exclus comme vanity metrics : nombre total de clics UI sans rattachement à une
décision (ex. "nombre de scrolls"), nombre de sessions sans distinction nouveau/retour.

---

## 4. Séparation des responsabilités analytiques

Ce tracking plan couvre exclusivement le **Product Analytics** (comportement utilisateur, futur
PostHog). Il ne couvre pas :
- La **Business / Data Quality** (état du catalogue, calculable depuis Supabase existant sans
  aucune instrumentation) — voir `DASHBOARDS.md`.
- L'**Error Monitoring** (futur Sentry, erreurs et performance) — hors périmètre de ce document,
  aucun événement métier ne doit servir de substitut à du monitoring d'erreur.

**Confirmation explicite** : les KPI métier déjà calculables aujourd'hui côté back-office/Supabase
(vues cumulées, taux de résolution des signalements, note moyenne, couverture d'équipements —
déjà affichés dans `Statistiques.tsx`, cf. `ANALYTICS-AUDIT.md` §18, et détaillés dans
`DASHBOARDS.md` §2) **ne doivent pas être recréés sous forme d'événements PostHog**. PostHog
mesure le comportement utilisateur (funnels, intentions, rétention) ; Supabase reste et demeure
la source de vérité des données métier et de l'état du catalogue. Un événement PostHog ne doit
jamais dupliquer un chiffre déjà disponible par une requête Supabase.

---

## 5. État réel de l'instrumentation (mis à jour après la passe de câblage + hardening)

Ce tracking plan a été écrit avant l'implémentation ; cette section reflète ce qui est
**effectivement câblé dans le code** à ce jour, pour éviter toute ambiguïté de comptage.

**12 des 13 événements P0 instrumentés, aucun câblage partiel autre que `login_completed` :**
`app_opened`, `signup_completed`, `login_completed` (**email uniquement**, voir ci-dessous),
`map_viewed`, `search_performed`, `search_results_viewed`, `zero_results`, `filter_applied`,
`park_viewed`, `park_favorited`, `park_shared`, `contribution_started`, `contribution_completed`.

### `login_completed` — email instrumenté, Google OAuth non instrumenté

- **Email/mot de passe** : instrumenté, déclenché juste après le succès de `signIn()` dans
  `AuthForm.tsx` — signal fiable, un seul point de code, pas de risque de double comptage.
- **Google OAuth** : **non instrumenté**, délibérément. Raison : `signInWithGoogle()` déclenche une
  redirection pleine page vers Google — la fonction ne "voit" jamais le succès (l'exécution JS
  s'arrête à la redirection). Le succès n'est observable qu'au retour, dans le gestionnaire
  `onAuthStateChange` de `session.ts` — mais ce même gestionnaire traite AUSSI la restauration
  d'une session déjà existante au démarrage normal de l'app, sans marqueur permettant de
  distinguer les deux cas de façon fiable. Instrumenter ce chemin sans un vrai correctif
  risquerait un double comptage (ou un comptage de faux positifs sur chaque reload d'un
  utilisateur déjà connecté) — pire que ne pas mesurer du tout.
- **Correctif futur envisageable** (non implémenté ici) : introduire un marqueur explicite avant
  le redirect (ex. un flag `localStorage` posé juste avant `signInWithGoogle()`, consommé une
  seule fois par le gestionnaire au retour) ou un callback OAuth dédié qui court-circuite le
  chemin de restauration normale. Aucune donnée personnelle supplémentaire requise pour cela — un
  simple marqueur technique, pas une info utilisateur.
- **Conséquence sur les KPI** : "taux d'usage réel Google vs e-mail" (question produit explicite,
  §1) reste **partiellement répondue** — seul le volume `email` est fiable tant que ce correctif
  n'est pas fait. Ne pas présenter un taux Google/email calculé sur les seules données actuelles
  comme complet.

### `route_requested` — différé, non un échec d'instrumentation

Prévu P0 dans la taxonomie mais **volontairement non câblé** dans aucun écran : `Directions.tsx`
reste un mock (`ANALYTICS-AUDIT.md` §9ter). Vérifié explicitement absent de tout site d'appel
(`grep trackEvent` sur `apps/mobile/src`). Sera instrumenté avec le chantier fonctionnel de
l'itinéraire réel, pas avant.

### Propriétés approximatives corrigées (hardening)

Deux propriétés pouvaient produire une valeur **affirmée à tort** plutôt qu'une valeur manquante —
corrigées pour préférer l'inconnu explicite :
- `park_viewed.discovery_source` envoie `"unknown"` (pas `"other"`, qui a un sens documentaire
  différent — voir la fiche de l'événement) : la vraie provenance n'est pas propagée à travers les
  écrans de découverte dans cette passe.
- `contribution_started.entry_point` envoie `"unknown"` pour `RatePark.tsx` spécifiquement quand
  `?park=` est présent sans reprise — `GlobalOverlays.tsx` (rappel de visite) mène à la même URL
  que la fiche parc, sans marqueur distinctif. Les 4 autres wizards gardent une valeur fiable.
- `contribution_completed.had_just_in_time_auth` est désormais **optionnelle** dans la taxonomie et
  omise par `AddPhotos.tsx` (pas de marqueur `?resume=1` sur ce wizard, contrairement aux 4
  autres) — plutôt que d'envoyer `false` sans pouvoir le garantir.
