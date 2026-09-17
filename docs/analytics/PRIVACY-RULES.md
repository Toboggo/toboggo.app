# Privacy Rules — Product Analytics Toboggo

Ce document ne constitue pas un avis juridique. Les points nécessitant une validation RGPD/CNIL
sont marqués explicitement — ils doivent être tranchés par le fondateur et/ou un conseil
juridique avant l'implémentation, pas déduits de ce document.

## 1. Règle par défaut

Le tracking Toboggo ne doit **jamais** envoyer, en propriété d'événement ou en identité
utilisateur :
- prénom/nom d'enfant, date de naissance d'enfant ;
- e-mail en propriété événementielle (l'e-mail peut légitimement servir d'identifiant compte
  côté PostHog `identify`, mais ne doit jamais apparaître comme *propriété* d'un événement métier) ;
- adresse personnelle ;
- position GPS précise ;
- texte libre d'avis ;
- texte libre de signalement ;
- photos (fichier ou URL) ;
- tokens/auth credentials ;
- toute donnée sensible au sens RGPD (santé, origine, etc. — non collectée par le produit
  aujourd'hui, mais la règle reste valable si cela changeait).

`EVENT-TAXONOMY.md` respecte déjà cette règle par construction (propriétés listées explicitement,
rien de plus). Ce document identifie les **endroits du code réel** où une future instrumentation
pourrait accidentellement violer cette règle si elle est ajoutée sans précaution — pas des
violations actuelles (aucun tracking n'existe encore, `ANALYTICS-AUDIT.md`).

## 2. Zones de risque identifiées dans le code réel

### 2.1 Données enfant
`apps/mobile/src/lib/children.ts`, `packages/shared/src/api/children.ts`,
`apps/mobile/src/components/ChildBirthFields.tsx`, `apps/mobile/src/screens/profile/ChildForm.tsx`,
`apps/mobile/src/screens/onboarding/Permissions.tsx`. Ces écrans manipulent des données sur les
enfants (mois/année de naissance, éventuellement un prénom affiché dans `Profile.tsx` — non
confirmé avec certitude par l'audit code, à vérifier au moment de l'implémentation). **Risque
concret** : le filtrage réel par âge (`ParkList.tsx:34-41`, `ANALYTICS-AUDIT.md` §15) pourrait
tenter de capturer l'âge exact de l'enfant dans un événement `filter_applied` par souci de
richesse analytique — c'est interdit. Seule la valeur du filtre côté parc (tranche d'âge choisie
pour le *parc*, pas l'âge de l'enfant) doit apparaître en propriété. Ne jamais faire remonter
`children.birth_month`/`birth_year`/prénom dans un événement, même agrégé grossièrement.

### 2.2 E-mail en clair
`apps/mobile/src/screens/onboarding/AuthForm.tsx` (champ email de connexion/inscription),
`apps/mobile/src/screens/profile/Contact.tsx` (formulaire contact, `sendContactMessage`,
`packages/shared/src/api/contact.ts:3-7`), `apps/mobile/src/screens/profile/EditProfile.tsx`
(édition email de profil). **Risque concret** : si l'autocapture PostHog (capture automatique de
tous les clics/saisies de formulaire) est activée sans configuration de masquage, ces champs
peuvent être capturés en clair dans le DOM snapshot ou dans les propriétés d'un événement
générique. Voir §4.

### 2.3 Position GPS précise
`apps/mobile/src/lib/geo.ts:34-46` (`requestBrowserLocation`, vraie API navigateur
`navigator.geolocation.getCurrentPosition`) — la position exacte de l'utilisateur transite déjà
dans l'app (calculs de distance, requête `nearby_parks`). **Règle stricte** : aucune propriété
d'événement ne doit jamais contenir `lat`/`lng` bruts de l'utilisateur — `EVENT-TAXONOMY.md`
utilise systématiquement `distance_bucket` (catégoriel, ex. `<1km`/`1-3km`/…) précisément pour
éviter ce risque, y compris pour `park_viewed`.

### 2.4 Texte libre d'avis et de signalement
`apps/mobile/src/screens/actions/RatePark.tsx` (champ commentaire, max 200 caractères,
`packages/shared/src/api/reviews.ts:97-123`), `apps/mobile/src/screens/actions/ReportProblem.tsx`
(champ description libre), `apps/mobile/src/screens/actions/EditInfo.tsx` (note libre pour le
modérateur, `EditInfo.tsx:560-583`, et cible `other` en texte libre 400 caractères,
`EditInfo.tsx:501-510`). **Risque concret** : un développeur pressé pourrait être tenté d'ajouter
`comment_preview` ou `note_text` comme propriété pour "voir ce que les gens écrivent" dans
PostHog — strictement interdit. Ces champs contiennent potentiellement des informations
personnelles non maîtrisées (un utilisateur peut écrire n'importe quoi, y compris des données sur
des tiers). Seuls des booléens/compteurs (`has_comment`, longueur en tranche) seraient
acceptables si un jour nécessaire — non retenus dans la taxonomie actuelle car non demandés par
les questions produit.

### 2.5 Photos
`apps/mobile/src/screens/actions/AddPhotos.tsx`, `RatePark.tsx` (photo jointe à un avis),
`ReportProblem.tsx` (photo jointe à un signalement), `packages/shared/src/api/parkDetails.ts`
(`addMedia`/`addParkPhotos`). Ne jamais envoyer l'URL ou le contenu du fichier en propriété
d'événement — `has_photo` (booléen) suffit, déjà le choix fait dans `EVENT-TAXONOMY.md`
(`contribution_completed`).

### 2.6 Tokens / credentials Supabase
`packages/shared/src/api/auth.ts`, session Supabase (JWT côté client). **Risque concret** : si
l'autocapture réseau de PostHog (capture des requêtes XHR/fetch) est activée sans exclusion, les
en-têtes `Authorization` des appels Supabase pourraient être capturés. Ce risque concerne aussi le
futur Sentry (Error Monitoring) — les deux outils doivent scrubber les en-têtes d'auth par
configuration avant toute mise en prod, pas après coup.

## 3. Approche de minimisation des données

- Chaque événement de `EVENT-TAXONOMY.md` n'embarque que les propriétés strictement nécessaires
  à la question produit qu'il sert (traçable dans `TRACKING-PLAN.md` §1) — pas de propriété
  "au cas où".
- Catégorisation systématique plutôt que valeur brute : `distance_bucket` au lieu de coordonnées,
  tranches d'étape (`last_step`) au lieu de timestamps précis d'interaction, énumérations fermées
  (`channel`, `discovery_source`, `reason`) au lieu de chaînes libres.
- Aucune propriété composite non vérifiable n'est inventée (`data_completeness` explicitement
  écarté, `EVENT-TAXONOMY.md` fin de document) — mieux vaut ne pas mesurer que mesurer avec une
  formule inventée qui pourrait elle-même encoder des données non désirées.
- Identification utilisateur : utiliser l'ID Supabase (`userId`, déjà un UUID opaque) comme
  `distinct_id` PostHog après connexion, jamais l'e-mail comme identifiant visible dans les
  interfaces PostHog si évitable (préférer un UUID, l'e-mail restant consultable via un lookup
  contrôlé côté Supabase si nécessaire).

## 4. Autocapture — recommandation explicite pour l'implémentation future

Le SDK PostHog propose par défaut une autocapture (clics, soumissions de formulaire, snapshots
DOM). Compte tenu des zones de risque listées en §2 (formulaires email/mot de passe, contact,
enfant, avis, signalement, note de modération), **l'autocapture ne doit pas être activée telle
quelle**. Recommandation pour la phase d'implémentation (hors périmètre de cette phase d'audit) :
soit la désactiver entièrement et ne s'appuyer que sur les événements explicites de
`EVENT-TAXONOMY.md`, soit l'activer avec un masquage strict de tous les champs de saisie
(`maskAllInputs` ou équivalent) et une liste d'exclusion explicite des écrans listés en §2.

## 5. Session Replay

**OFF par défaut. Non implémenté à cette phase**, conformément à la consigne. Si activé un jour,
il faudrait une revue spécifique des mêmes écrans (§2) avant activation, puisqu'un replay capture
potentiellement le contenu visuel des champs de saisie même masqués analytiquement.

## 6. Règles d'implémentation PostHog — checklist canonique à respecter dès la configuration initiale

Cette section consolide, sous forme de règles d'implémentation actionnables, les principes déjà
justifiés en détail dans les sections précédentes (§2–§5). C'est la checklist à cocher au moment
de configurer le SDK, pas un nouveau principe :

**Statut : implémenté.** Le socle (`posthog-js` + `@posthog/react`, sans aucun événement métier
câblé) vit dans `apps/mobile/src/lib/analytics/` :
- `config.ts` — la configuration PostHog exacte (source unique à relire pour auditer ce qui est
  réellement envoyé/désactivé) : `autocapture: false`, `capture_pageview: false`,
  `capture_pageleave: false`, `disable_session_recording: true`, `disable_surveys: true`,
  `disable_web_experiments: true`, `disable_product_tours: true`, `disable_conversations: true`,
  `disable_external_dependency_loading: true`, `capture_exceptions: false`,
  `capture_heatmaps: false`, `capture_performance: false`, `capture_dead_clicks: false`, et
  `persistence: "memory"` + `disable_persistence: true` (voir §7bis, décision explicite).
- `events.ts` — les 26 noms d'événements et leurs propriétés typées, + une allowlist runtime des
  clés par événement (`EVENT_PROPERTY_ALLOWLIST`) appliquée à l'envoi, indépendamment de ce que
  TypeScript a laissé passer à la compilation — voir la règle "spread arbitraire" ci-dessous.
- `client.ts` — `isAnalyticsConfigured()`/`trackEvent()`, no-op complet sans `VITE_POSTHOG_KEY`/
  `VITE_POSTHOG_HOST` (voir §7).
- `AnalyticsProvider.tsx`/`index.ts` — provider et surface d'API publique minimale.

Aucun des 26 événements n'est encore appelé depuis un écran — le socle est prêt, l'instrumentation
est une phase ultérieure.

- **Autocapture PostHog = OFF par défaut** (justifié §4 : formulaires email/mot de passe,
  contact, enfant, avis, signalement, note de modération listés en §2 sont trop nombreux et trop
  sensibles pour un masquage partiel fiable).
- **Session Replay = OFF par défaut**, non implémenté à cette phase (§5).
- **Aucun tracking automatique de formulaires** — aucune soumission de formulaire (`AuthForm`,
  `Contact`, `ChildForm`, `EditProfile`, `RatePark`, `ReportProblem`, `EditInfo`, …) ne doit être
  capturée automatiquement ; seuls les événements explicites de `EVENT-TAXONOMY.md` sont émis, et
  uniquement pour les issues de succès définies (jamais le contenu saisi).
- **Événements explicitement déclarés uniquement** — chaque appel `posthog.capture(...)` doit
  correspondre à une fiche de `EVENT-TAXONOMY.md`, avec un nom d'événement et une liste de
  propriétés fixée à l'avance. Pas d'événement ad hoc ajouté en cours d'implémentation sans mise
  à jour de la taxonomie.
- **Aucune propriété analytics ne doit provenir directement d'un objet `user`/`profile`/`child`
  complet** (ex. `posthog.capture("x", { ...profile })` est interdit) — chaque propriété doit être
  extraite et nommée individuellement, jamais un objet entier passé en spread, précisément pour
  éviter qu'un champ sensible ajouté plus tard à `profiles`/`children` (nom, email, etc.) ne se
  retrouve capturé automatiquement sans revue. **Implémenté en deux couches** dans
  `lib/analytics/` : le typage par événement (`AnalyticsEventProperties`) décourage un appel
  correct, mais TypeScript ne bloque pas toujours un spread élargi (les propriétés en excès d'un
  littéral avec spread échappent à la vérification stricte du compilateur) — `client.ts` filtre
  donc *aussi* le payload au runtime avant tout envoi, ce qui est la garantie réelle. Testé
  explicitement dans `client.test.ts`.
- **Allowlist de propriétés par événement** — la liste de propriétés de chaque fiche
  `EVENT-TAXONOMY.md` est une liste fermée (allowlist), pas un exemple indicatif ; toute propriété
  hors liste nécessite une mise à jour documentée de la taxonomie avant d'être envoyée. Implémentée
  au runtime via `EVENT_PROPERTY_ALLOWLIST` (`lib/analytics/events.ts`).
- **Aucun texte libre** dans aucune propriété d'événement (§2.4) — ni commentaire d'avis, ni
  description de signalement, ni note de modérateur, ni requête de recherche en clair, ni prénom.
- **Aucune latitude/longitude utilisateur précise** (§2.3) — `distance_bucket` catégoriel
  uniquement.
- **Aucun token** (session Supabase, JWT, clé API) dans une propriété d'événement ni capturé via
  l'autocapture réseau (§2.6).
- **Aucun e-mail dans les propriétés événementielles** (§2.2, règle §1) — l'e-mail peut servir
  d'identifiant `identify()` PostHog côté compte, jamais de valeur de propriété métier.

## 7. Environnements — ne jamais polluer les données de production

**Obligation** : distinguer strictement `development`, `staging` et `production`. Les tests
locaux, les sessions Simulator et les sessions Claude Code ne doivent jamais faire remonter
d'événement dans le même espace de données que les utilisateurs réels de production.

**Statut : le mécanisme no-op est implémenté (voir ci-dessous) ; la séparation Staging (projet
PostHog distinct) reste, elle, non créée — un projet PostHog "Production" a été créé manuellement
en dehors de ce repo, aucun projet Staging n'existe encore.**

Le repo a déjà un précédent directement transposable : `CLAUDE.md` §4 impose une
séparation stricte entre le projet Supabase de **production** (lié en CLI) et le projet
**Staging** (`Toboggo Staging`, ref distincte, jamais lié en `--linked`), et `.env.local`
(gitignoré, prioritaire en dev) sépare déjà la configuration locale de la configuration commitée
(`CLAUDE.md` §3). La même logique s'applique naturellement à PostHog :

- **Local / Simulator / Claude Code (dev) — implémenté** : `.env.example` ne contient que
  `VITE_POSTHOG_KEY=`/`VITE_POSTHOG_HOST=` vides, avec un commentaire explicite interdisant d'y
  mettre une clé réelle — exactement le même pattern déjà en place dans ce repo pour
  `VITE_MAP_STYLE_URL` (absence ⇒ `FakeMap`, `ANALYTICS-AUDIT.md` §4) et `VITE_MAPTILER_KEY`
  (absence ⇒ `searchPlaces` renvoie `[]` silencieusement, `ANALYTICS-AUDIT.md` §6).
  `isAnalyticsConfigured()` (`lib/analytics/client.ts`) revérifie les deux variables à chaque
  appel : si absentes, `trackEvent()` ne fait rien, `posthog.init()` n'est jamais appelé, et
  `AnalyticsProvider` rend ses enfants sans jamais monter `PostHogProvider` — testé explicitement
  (`client.test.ts`, `AnalyticsProvider.test.tsx`). Un développeur qui a besoin de vérifier ses
  événements en local doit explicitement renseigner une clé de test dans son `.env.local`
  personnel (jamais commité).
- **Staging** : projet PostHog **distinct** de la production (nouveau projet, pas juste une
  propriété `environment: "staging"` sur un même projet) — c'est le choix le plus sûr et le plus
  cohérent avec la séparation déjà actée pour Supabase Staging, quitte à être un peu plus de
  configuration initiale : il rend structurellement impossible qu'un événement de staging
  apparaisse dans un dashboard de production, même en cas d'erreur de configuration d'une
  propriété. Une alternative plus légère (un seul projet PostHog, propriété `environment` sur
  chaque événement, filtrée dans les dashboards) est possible si le plan PostHog choisi ne permet
  qu'un seul projet, mais elle est moins sûre et dépend de la discipline de filtrage dans chaque
  dashboard — à documenter comme un compromis assumé si retenue.
- **Production** : clé PostHog dédiée, injectée uniquement via les variables d'environnement de
  build de production (jamais présente dans `.env.local` ni dans un fichier commité), miroir exact
  du traitement déjà réservé à `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY` de production
  (`CLAUDE.md` §4).

La partie Staging reste une proposition à valider — aucun projet PostHog Staging n'a été créé.

## 7bis. Persistance PostHog — décision prise pour le socle, à confirmer avant les événements P0

`lib/analytics/config.ts` fixe `persistence: "memory"` et `disable_persistence: true` : PostHog
n'écrit **rien** dans le navigateur (ni cookie, ni localStorage), et purge toute donnée qu'une
configuration antérieure aurait pu y laisser. Ce n'est **pas** le défaut de la librairie
(`localStorage+cookie`) — c'est un choix délibéré, dicté par l'absence actuelle de mécanisme de
consentement cookie dans l'app (§8 ci-dessous) : tant que cette décision RGPD n'est pas tranchée,
aucune configuration de persistance impliquant un stockage navigateur ne peut être choisie
arbitrairement ici.

**Conséquence assumée, à ne pas découvrir en prod** : le `distinct_id` anonyme de PostHog ne
survit pas à un rechargement de page ou à la fermeture de l'app — chaque nouvelle visite d'un
utilisateur non connecté est vue comme un nouvel anonyme. Les KPI reposant sur des utilisateurs
anonymes uniques dans la durée (nouveaux vs returning avant inscription, funnels multi-sessions
pour un invité) seront sous-évalués jusqu'à ce que ce point soit tranché. Un utilisateur connecté
reste, lui, correctement identifié (Supabase `userId` comme `distinct_id`), pas affecté par cette
limite.

## 8. Points nécessitant une validation RGPD/CNIL — ne pas trancher seul

- **Base légale du tracking comportemental** : aucun mécanisme de consentement/bannière cookies
  n'a été identifié dans le code exploré (`Legal.tsx`/`LegalIndex.tsx` sont des écrans
  d'information statique, pas des gestionnaires de consentement). Avant toute mise en prod de
  PostHog, il faut valider si un consentement explicite est requis (analytics non strictement
  nécessaire = généralement oui, sous réserve d'exemption "mesure d'audience" CNIL selon
  configuration) et, si oui, l'implémenter avant collecte — pas après. **Tant que ce point n'est
  pas tranché, la persistance PostHog reste volontairement en `memory` (§7bis)** — c'est la
  configuration la plus restrictive compatible avec un socle fonctionnel, pas une solution
  définitive : si le consentement est obtenu, `persistence`/`disable_persistence` devront être
  revus en conséquence (ex. `localStorage` uniquement après consentement explicite).
- **Produit destiné à des parents d'enfants** : bien que les données *sur* les enfants
  (mois/année de naissance, cf. §2.1) ne soient volontairement jamais envoyées au tracking
  analytics selon ce document, le simple fait que le produit collecte ce type de donnée (même
  hors analytics) mérite une vérification légale de la politique de confidentialité existante —
  hors périmètre technique de cet audit.
- **Localisation d'hébergement des données PostHog** (UE vs US) et DPA associé — dépend du plan
  PostHog choisi à l'implémentation, à valider avec le fondateur avant signature.
- **Durée de rétention des événements analytics** — à définir explicitement dans la configuration
  PostHog au moment de l'implémentation, pas laissée par défaut.
- **Mise à jour de la politique de confidentialité** (`legalContent.ts`, contenu non audité en
  détail ici) pour mentionner l'outil de Product Analytics avant sa mise en production — à
  confirmer que le texte actuel ne l'exclut pas déjà implicitement.
