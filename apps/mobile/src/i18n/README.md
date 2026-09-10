# i18n — app Parents

Socle d'internationalisation (`fr` / `es` / `en`). Mis en place en Phase 1 de la
migration décrite dans l'audit i18n.

## Règles produit

1. La langue est **indépendante du pays et de la géolocalisation**.
2. Un changement de position GPS ne déclenche **jamais** de changement de langue.
3. Le choix manuel de l'utilisateur est **prioritaire** sur la langue du navigateur.
4. Le choix manuel est **persisté localement** (`localStorage["toboggo:lang"]`),
   jamais côté Supabase (pour l'instant).
5. Détection initiale : `fr-*` → `fr`, `es-*` → `es`, `en-*` → `en`, sinon `en`.
6. Repli : `en`. Namespace de repli : `common`.

## Fichiers

| Fichier | Rôle |
|---|---|
| `config.ts` | Constantes, `normalizeLanguage()`, `INTL_LOCALE`, liste des namespaces |
| `detect.ts` | Détection initiale + persistance (`localStorage`) |
| `resources.ts` | Chargement paresseux d'un JSON par `(langue, namespace)` via `import.meta.glob` |
| `backend.ts` | Backend i18next branché sur `resources.ts` |
| `index.ts` | `i18n.init(...)` + synchro `<html lang>`. À importer une fois dans `main.tsx` |
| `useLocale.ts` | Hook : `{ language, setLanguage, intlLocale }` |
| `useFormat.ts` | Hook : nombres / notes / distances / minutes / % / âges localisés (Intl + pluriels i18next) |
| `locales/<lang>/<ns>.json` | Catalogues de traduction |

## Namespaces (découpage par domaine)

`common`, `onboarding`, `map`, `detail`, `contribute`, `reviews`, `profile`,
`features`, `errors`, `legal`.

**Remplis** : `common`, `features`, `map`, `detail` (parcours découverte —
carte, recherche, filtres, ParkCard, fiche parc, équipements, score) et
`profile` (shell utilisateur — Profil, Favoris, Contributions/Aportaciones,
Comparer, Activité, ainsi que Modifier le profil / Confidentialité / Sortie de
groupe accessibles depuis Profil).
`onboarding`, `contribute`, `reviews`, `errors`, `legal` : non encore créés —
un namespace sans fichier se résout en `{}` (repli `en` puis clé brute). Pour
ajouter un namespace : créer
`locales/fr/<ns>.json`, `locales/es/<ns>.json`, `locales/en/<ns>.json`, puis
consommer via `useTranslation("<ns>")`.

## Formatage nombres / dates / distances

Voir `packages/shared/src/utils/format.ts` (`formatNumber`, `formatCount`,
`formatRating`, `formatMeters`, `formatDate`, `formatDateTime`). Passer
`useLocale().intlLocale`. Ne pas réintroduire de locale `"fr-FR"` en dur ni de
`.replace(".", ",")`.

## Équipements / features

`lib/featureLabel.ts` — resolver `code → libellé` via le namespace `features`.
Aligné sur `features.code` / `features.label_key` de la base. **Non branché aux
filtres** en Phase 1 : la logique V1/V2 des filtres reste inchangée.
