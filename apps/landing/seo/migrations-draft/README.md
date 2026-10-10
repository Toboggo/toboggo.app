# Migrations SEO — BROUILLONS (non appliquées)

Aucun de ces fichiers n'est dans `supabase/migrations/` : **rien n'a été appliqué**, ni en local, ni en staging, ni en production. Ils ont seulement été vérifiés par un essai **local dans une transaction annulée** (`BEGIN … ROLLBACK`) : syntaxe OK, aucune trace persistée.

| # | Fichier | Contenu |
|---|---|---|
| 1 | `0001_places.sql` | table de référence des communes (`places`), slug unique, RLS lecture publique / écriture staff, `seo_override` |
| 2 | `0002_parks_place_id.sql` | `parks.place_id` (nullable, aucun backfill) |
| 3 | `0003_parks_slug_and_history.sql` | format + unicité `(place_id, slug)`, `park_slug_history`, trigger d'archivage des anciens slugs |
| 4 | `0004_media_rights.sql` | `rights_status` (unknown / validated / rejected), contrainte « validated ⇒ licence + auteur/attribution + date », trigger réservé au staff |
| 5 | `0005_parks_seo_override.sql` | `parks.seo_override` (index / noindex) |
| 6 | `0006_parks_editorial_verification.sql` | vérification éditoriale réelle (date, relecteur, note) |

## Garde-fous du dépôt (voir `CLAUDE.md` §4)
- additif uniquement (aucun `DROP`, aucune réécriture de `0001 → 0038`) ;
- jamais `db push --linked` ni `migration repair` en production ;
- validation locale, puis staging (`--db-url`), puis production **avec accord explicite** ;
- numérotation cible `0039+` (dernière existante : `0038`).

## Ordre d'application prévu
1 → 2 → (script de rapprochement ville + code postal, essai à blanc) → 3 → (script de slugs, essai à blanc) → 4 → 5 → 6.

## À décider avant application
- source des données de communes (INSEE / geo.api.gouv.fr : licence à vérifier) ;
- qui valide les droits des photos (staff Toboggo uniquement, d'après le trigger) ;
- les 6 fichiers peuvent être appliqués indépendamment, sauf 3 qui dépend de 1 et 2.
