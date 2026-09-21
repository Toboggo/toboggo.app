# Dashboards cibles & séparation des responsabilités — Toboggo

## 1. Trois domaines distincts, à ne pas mélanger

| Domaine | Outil | Périmètre |
|---|---|---|
| **Product Analytics** | futur PostHog | Comportement utilisateur — tout `EVENT-TAXONOMY.md` |
| **Business / Data Quality** | Supabase existant | État réel du catalogue de parcs, sans aucune instrumentation nouvelle |
| **Error Monitoring** | futur Sentry | Erreurs et performance technique — hors périmètre de ce document |

Aucune migration ni vue SQL n'est créée à cette étape (interdit par la consigne) — la section 2
liste uniquement les colonnes déjà existantes permettant de calculer ces KPI **le jour où on les
requêtera**, sans rien construire ici. `ANALYTICS-AUDIT.md` §18 rappelle que
`apps/backoffice/src/screens/Statistiques.tsx` calcule déjà certains de ces KPI côté front pour
les collectivités — les dashboards Data Quality ci-dessous sont une vue **founder/produit**
transverse à toutes les organisations, pas un doublon de cet écran collectivité par collectivité.

**Confirmation explicite (règle de conception, pas une option)** : tout KPI métier déjà
calculable aujourd'hui depuis Supabase/back-office (nombre de parcs, couverture photo/âge/
équipements, fraîcheur, source des données, statut de modération, résolution des signalements —
liste complète §2) **ne doit jamais être recréé sous forme d'événement PostHog**. PostHog mesure
exclusivement le comportement utilisateur (`EVENT-TAXONOMY.md`) ; Supabase reste la source de
vérité unique des données métier et de l'état du catalogue. Si un besoin de dashboard ressemble à
une question déjà répondue par une requête Supabase, la réponse est cette requête, pas un nouvel
événement analytics.

**Filtre obligatoire sur les 4 dashboards Product Analytics ci-dessous (§3-§6)** : Toboggo utilise
**un seul projet PostHog** pour Staging et Production (le plan actuel n'en permet qu'un) —
Staging et Production ne sont PAS séparés par projet, mais par la propriété commune `environment`
(`"staging"` | `"production"`, ajoutée automatiquement à chaque événement, voir
`EVENT-TAXONOMY.md` "Propriétés communes"). **Tout dashboard Founder/Product ou toute analyse de
comportement utilisateur réel doit systématiquement filtrer `environment = production`** — sans
ce filtre, les événements générés par les tests, la QA ou des démonstrations en Staging fausseront
les chiffres. Les événements `environment = staging` restent disponibles séparément pour vérifier
que l'instrumentation fonctionne avant un déploiement, mais doivent être exclus de toute analyse
produit réelle.

## 2. KPI Data Quality calculables depuis le schéma Supabase existant

Colonnes confirmées par lecture des migrations réelles (`supabase/migrations/*.sql`) et du schéma
généré (`packages/shared/src/types/database.types.ts`) :

| KPI | Colonnes sources | Table |
|---|---|---|
| Nombre total de parcs | `COUNT(*)` | `parks` |
| Couverture photo | `EXISTS(park_media WHERE park_id=… AND status='approved')` | `park_media` |
| Couverture âge | `min_age`/`max_age` IS NOT NULL, ou `ages_derived = false` (v2 — plus fiable que les colonnes V1 `age_min`/`age_max`, qui ont des défauts 0/12 masquant l'absence de saisie) | `parks` |
| Couverture équipements | `park_features.status = 'available'` par parc/feature attendue (plus fin que les colonnes plates V1 `wc`/`shade`/… déjà utilisées par `Statistiques.tsx`) | `park_features` |
| Couverture services | idem, catégorie `service` du catalogue `features` | `park_features` |
| Fraîcheur | `updated_at`, `created_at` | `parks` |
| Source des données | `park_sources.source_type` (par parc), `park_attribute_sources` (par attribut, avec priorité toboggo>municipality>open_data>partner>osm>user>other) | `park_sources` |
| Contributions & statut | `park_edits.status` (`pending`/`approved`/`rejected`/`auto_approved`) | `park_edits` |
| Modération photos | `park_media.status` (`pending`/`approved`/`rejected`), `park_media.source` | `park_media` |
| Signalements & résolution | `reports.status`, `resolution_days`, `resolved_at`, `category`, `severity` | `reports` |

**Réserve explicite** (reportée de l'audit backoffice) : les tables `park_sources`,
`park_attribute_sources` et `park_edits` semblent créées vides ou quasi vides selon les
commentaires de migration — un KPI de couverture "source" pourrait afficher un chiffre proche de
0 % par absence de backfill historique, pas par vrai problème de qualité. À vérifier avec une
vraie requête en base avant de présenter ce chiffre au fondateur comme un signal d'alerte.

**Modération réelle par type de contenu** (rappel `ANALYTICS-AUDIT.md`) :
- Photos utilisateur : file `pending → approved/rejected` réelle depuis la migration `0027`.
- Photos collectivité/Toboggo : auto-approuvées (décision produit).
- Avis : **aucune file de modération**, publication immédiate (`reviews.status` défaut
  `published`) — `flagReview` existe mais n'est consommé par aucun écran back-office.
- Signalements (`reports`) : workflow de résolution complet et réel.
- Modifications d'infos (`park_edits`) : statut `pending` existe, mais **aucun écran de
  traitement dédié côté back-office** (`Dashboard.tsx` le documente explicitement en commentaire
  comme non implémenté, "Lot 6").

## 3. Dashboard 1 — Founder / Product

**KPI** : DAU/WAU/MAU, nouveaux vs returning, North Star "Weekly Park Intentions" (avec ses trois
composantes affichées séparément, pas seulement le composite — cf. limites documentées dans
`TRACKING-PLAN.md` §2), rétention D1/D7/D30, contributeurs actifs.

**Funnels** : `app_opened` → `park_viewed` → (`park_favorited` | `park_shared` |
`route_requested`) ; `app_opened` → `signup_completed`.

**Cohortes/segments utiles** : nouveaux utilisateurs de la semaine vs cohortes précédentes
(rétention par cohorte hebdomadaire), utilisateurs invités vs connectés, utilisateurs avec ≥1
enfant renseigné vs sans (teste si la personnalisation par âge corrèle avec l'engagement, sans
jamais exposer l'âge exact de l'enfant lui-même — juste le fait binaire "profil enfant
renseigné").

**Décisions produit permises** : prioriser la correction du mock Itinéraire ou l'implémentation
Apple/téléphone selon le volume réel de demande observé ; arbitrer entre investissement carte
(réelle vs FakeMap) et autres priorités selon le taux d'usage effectif.

## 4. Dashboard 2 — Discovery

**KPI** : répartition des sessions par mode de découverte (`map_viewed` réel vs fake, recherche,
liste), zero-result rate par cause (`reason`), taux d'utilisation de chaque filtre, taux de
conversion filtre → fiche → intention forte.

**Funnels** : `map_viewed`/`search_performed` → `filter_applied` → `park_viewed` →
intention forte ; `search_performed` → `zero_results`.

**Cohortes/segments utiles** : utilisateurs géolocalisés vs recherche par lieu (comportement
différent attendu), sessions avec `map_kind: fake` vs `real` (à isoler dans toute analyse
d'engagement carte pour ne pas fausser les conclusions).

**Décisions produit permises** : quels filtres mériteraient d'être mis en avant (les plus
utilisés et les plus convertissants), où la carte réelle manque le plus (zones à forte proportion
de `FakeMap`), quelles zones géographiques génèrent le plus de zero-results (signal d'expansion
catalogue).

## 5. Dashboard 3 — Contributions

**KPI** : volume par type de contribution, taux de complétion par type, temps médian
started→completed, top étapes d'abandon (`last_step` de `contribution_abandoned`), taux
d'interruption "juste-à-temps" (proportion de `contribution_completed` avec
`had_just_in_time_auth: true`).

**Funnels** : `contribution_started` → (interruption auth si invité) → `contribution_completed`,
par `contribution_type` ; `contribution_completed` → revisite ultérieure de l'app (teste si
contribuer favorise la rétention, question produit explicite).

**Cohortes/segments utiles** : contributeurs invités interrompus par l'auth juste-à-temps vs
utilisateurs déjà connectés (la friction d'auth fait-elle perdre des contributions ?),
contributeurs récurrents (≥2 `contribution_completed`) vs ponctuels.

**Décisions produit permises** : si l'auth juste-à-temps fait perdre trop de contributions au
moment de la soumission, envisager un pré-check plus tôt dans le flow (compromis UX/conversion) ;
identifier le wizard le plus abandonné pour prioriser une refonte ; mesurer si les modifications
d'infos (`park_edits`, actuellement sans écran de traitement back-office) génèrent un volume
justifiant de construire cet écran (Lot 6 mentionné dans le code).

## 6. Dashboard 4 — Acquisition & Rétention

**KPI** : nouveaux utilisateurs par période, provider d'auth utilisé (`email` vs `google`, et
volume de clics sur les CTA Apple/téléphone actuellement mock — signal de demande latente),
rétention D1/D7/D30, `account_deleted` comme churn explicite à soustraire des actifs.

**Funnels** : `app_opened` (1ère fois) → `signup_started` → `signup_completed` → premier
`park_viewed` → premier événement d'intention forte, dans la première session.

**Cohortes/segments utiles** : cohortes hebdomadaires de nouveaux inscrits, utilisateurs
Google OAuth vs e-mail (taux de rétention comparé, utile pour arbitrer un futur investissement
Apple), utilisateurs dont la première action est une contribution (vs une simple consultation) —
teste si "arriver pour contribuer" prédit une meilleure rétention que "arriver pour consulter".

**Décisions produit permises** : arbitrer l'investissement sur Apple/téléphone (aujourd'hui mock)
selon le volume de demande captée ; identifier si un provider d'auth particulier corrèle avec une
meilleure rétention ; quantifier l'impact réel de `account_deleted` sur la base active.
