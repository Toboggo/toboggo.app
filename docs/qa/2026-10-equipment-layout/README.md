# Recette — page Équipements en grille, résumés courts (fix/equipment-columns-compact)

Captures locales (Supabase local, données de test, aucune donnée personnelle).

- `00` avant (#167) : capsules de largeur variable, « · Vérifié » dans le badge.
- `01` première version de la grille (noms longs) ; `02` ES 320 px après raccourcissement des noms (plus de mot coupé) ; `03` FR 430 px.
- `04` fiche complète : badges courts, présents seulement, sans « Vérifié ». `05` panneau compact idem.

Note : avant #167, la page était une liste d'une colonne de rangées pleine largeur (pictogramme + nom | coche). La grille à deux colonnes demandée est donc une mise en page nouvelle, avec les pictogrammes d'origine (`ParkGlyph`).

Page Équipements : groupes Présents / Absents / À confirmer ; cellule = pictogramme + nom court + ligne de statut discrète (« Absent », « À confirmer », « Vérifié » seulement avec `verified_at`). Noms courts de services dans `features:state.name.*` (FR/EN/ES). Logique présent/absent/inconnu de `lib/parkAmenities.ts` inchangée.
