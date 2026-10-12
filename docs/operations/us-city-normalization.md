# Normalisation des villes US (« City/Town/Village of … »)

## Constat (pilote Geoapify US, 25 parcs STAGING)
4 villes sur 25 portent le statut administratif OSM : `Village of Massapequa Park`,
`Town of Waterford`, `City of Corning`, `City of Syracuse`. Les 21 autres sont propres,
dont les 11 « New York » (boroughs Brooklyn/Queens/Bronx/Staten Island, le borough est dans
`suburb`, conservé en provenance) et les villes hors NYC (Buffalo, New Rochelle, Schenectady…).
Rue : `356 REAR Euclid Ave`, `134-29 166th Pl`, ZIP 5 chiffres : conformes.

## Règle
`address.normalize_us_city` (miroir TS `normalizeUsCity`) : **US uniquement**, retire un préfixe
`City of ` / `Town of ` / `Village of ` (insensible à la casse) **en tête** et seulement s'il est
suivi d'un nom. « New York », hamlets, noms contenant « of » ailleurs, « Town of » seul : inchangés.
FR/ES : aucune modification.

La valeur brute n'est pas perdue : `geoapify.py` renvoie `city_raw` (uniquement si modifiée) et
`backfill-addresses.py` l'écrit dans la **provenance** (`park_attribute_sources.value_json`),
comme `neighbourhood`/`state_code`. Aucune colonne ni migration.

## Impact sur les 25 parcs déjà écrits (STAGING) — NON exécuté
Seuls 4 parcs changent de `city` ; `formatted_address` (vue) suit automatiquement.
Méthode ciblée proposée, à valider avant toute écriture :
1. Lecture seule : `geoapify-pilot-check.py after` signale désormais `ville_prefixe_administratif`.
2. Transaction unique sur STAGING limitée aux parcs `country_code='US'` dont
   `city ~* '^(city|town|village)\s+of\s+\S'` ET qui ont une source `reverse_geocode` :
   `update parks set city = <valeur normalisée>, updated_at = now() where id = any(<ids>)`,
   et mise à jour de `value_json` (`city` normalisée + `city_raw` brute) de la source `reverse_geocode`.
   Aucun changement de `moderation_status`, nom, coordonnées. Contrôle `after` ensuite.
3. Alternative sans SQL manuel : ne rien corriger et re-lancer le pilote sur ces 4 parcs
   (4 appels Geoapify) après avoir levé la protection de priorité — plus lourd, déconseillé.
Le backfill à grande échelle doit utiliser la règle corrigée : les 6 739 restants seront
écrits normalisés d'emblée.
