# Référence Sanity — blog Toboggo

> Fichier de connaissance du Projet Claude « Rédaction SEO Toboggo ». Reflète le schéma du dépôt
> (`apps/studio/schemaTypes/`) au 11 octobre 2026. En cas d'écart avec `get_schema`, **le schéma réel fait foi** :
> signale l'écart au fondateur.

## 1. Connexion

- Projet `1m1y03h0`, dataset `production`, workspace `toboggo`.
- Le site public affiche **uniquement** les documents publiés (`_id` sans `drafts.`), avec un `slug`, et dont
  `publishedAt` est passé. Les brouillons n'apparaissent nulle part en public ; le fondateur les prévisualise via le
  Studio (« Prévisualiser »).
- `create_documents` crée des **brouillons** (`drafts.<id>`). `patch_documents` modifie le brouillon.

## 2. Champs du type `article`

| Champ | Type | Règles | Tu le renseignes ? |
|---|---|---|---|
| `title` | string | obligatoire, ≤ 120 caractères | oui |
| `slug` | slug `{ _type: "slug", current: "…" }` | obligatoire, **unique**, minuscules/tirets, ≤ 96 caractères | oui |
| `excerpt` | text | obligatoire, 40 à 300 caractères | oui |
| `coverImage` | image + `alt` | **obligatoire à la publication**, `alt` obligatoire | **non** (le fondateur) |
| `category` | référence → `category` | obligatoire | oui (référence publiée) |
| `author` | référence → `author` | obligatoire | oui (référence publiée) |
| `publishedAt` | datetime ISO 8601 | obligatoire | oui (date du jour) |
| `updatedAt` | datetime | vide sauf mise à jour de fond | non |
| `body` | tableau Portable Text | obligatoire | oui |
| `seoTitle` | string | optionnel, ≤ 60 conseillé (70 max) | oui |
| `seoDescription` | text | optionnel, ≤ 155 conseillé (170 max) | oui |

Le site utilise `seoTitle` / `seoDescription` pour `<title>` et la méta description (repli : titre / résumé), et
l'image de couverture pour le partage (Open Graph).

Types liés : `category` (`title`, `slug`, `description`) et `author` (`name`, `slug`, `role`, `bio`, `image`).

## 3. Contenu riche (`body`)

Éléments autorisés :

- Bloc `block` avec `style` ∈ `normal`, `h2`, `h3`, `h4`, `blockquote` ; `listItem` ∈ `bullet`, `number` (avec
  `level: 1`) ; marques `strong`, `em` ; annotation `link` (`href` en `https`, `mailto:` ou chemin relatif).
- Image dans le contenu : **ne pas utiliser** (alt obligatoire, téléversement interdit).
- **Chaque** bloc, chaque `span` et chaque définition de lien a une `_key` unique (chaîne courte, ex. `b1`, `s1`, `l1`).
- Pas de H1.

Exemple minimal valide (paragraphe, H2, liste, lien interne, lien externe) :

```json
[
  { "_type": "block", "_key": "b1", "style": "normal", "markDefs": [],
    "children": [ { "_type": "span", "_key": "s1", "text": "Réponse directe à la question du parent, en deux phrases.", "marks": [] } ] },
  { "_type": "block", "_key": "b2", "style": "h2", "markDefs": [],
    "children": [ { "_type": "span", "_key": "s2", "text": "Les critères à regarder en priorité", "marks": [] } ] },
  { "_type": "block", "_key": "b3", "style": "normal", "listItem": "bullet", "level": 1, "markDefs": [],
    "children": [ { "_type": "span", "_key": "s3", "text": "La tranche d'âge indiquée sur les jeux", "marks": [] } ] },
  { "_type": "block", "_key": "b4", "style": "normal",
    "markDefs": [ { "_type": "link", "_key": "l1", "href": "/fonctionnalites/" },
                  { "_type": "link", "_key": "l2", "href": "https://www.service-public.fr/" } ],
    "children": [
      { "_type": "span", "_key": "s4", "text": "Retrouvez ces critères dans ", "marks": [] },
      { "_type": "span", "_key": "s5", "text": "les fonctionnalités de Toboggo", "marks": ["l1"] },
      { "_type": "span", "_key": "s6", "text": ", ou consultez ", "marks": [] },
      { "_type": "span", "_key": "s7", "text": "Service-public.fr", "marks": ["l2"] },
      { "_type": "span", "_key": "s8", "text": ".", "marks": [] } ] }
]
```

## 4. Création d'un brouillon — gabarit `create_documents`

```json
{
  "projectId": "1m1y03h0",
  "dataset": "production",
  "documents": [
    {
      "type": "article",
      "content": {
        "title": "…",
        "slug": { "_type": "slug", "current": "…" },
        "excerpt": "…",
        "category": { "_type": "reference", "_ref": "<id de la catégorie publiée>" },
        "author": { "_type": "reference", "_ref": "<id de l'auteur publié>" },
        "publishedAt": "2026-10-11T08:00:00.000Z",
        "seoTitle": "…",
        "seoDescription": "…",
        "body": [ "… voir §3 …" ]
      }
    }
  ]
}
```

Tous les champs vont dans `content`. Ne fournis pas `_id` (Sanity le génère). Ne renseigne pas `coverImage`.

## 5. Requêtes de contrôle (outil `query_documents`)

Catégories et auteurs **publiés** (références valides) :

```groq
{
  "categories": *[_type == "category"]{ _id, title, "slug": slug.current },
  "authors": *[_type == "author"]{ _id, name, role }
}
```
(`perspective: "published"`)

Slug déjà utilisé (brouillons et publiés) — doit renvoyer `0` :

```groq
count(*[_type == "article" && slug.current == $slug])
```
(`perspective: "raw"`, `params: { "slug": "mon-slug" }`)

Articles existants sur un sujet proche (anti-cannibalisation) :

```groq
*[_type == "article"]{ _id, title, "slug": slug.current, excerpt, publishedAt } | order(publishedAt desc)
```
(`perspective: "raw"`)

Relecture du brouillon créé :

```groq
*[_type == "article" && slug.current == $slug][0]{ _id, title, "slug": slug.current, excerpt, publishedAt, seoTitle, seoDescription, "category": category->title, "author": author->name, "blocs": count(body) }
```
(`perspective: "drafts"`, `params: { "slug": "mon-slug" }`) — doit renvoyer un `_id` commençant par `drafts.`,
une catégorie et un auteur non nuls, `blocs > 0`.

## 6. Liste de contrôle avant de rendre la main

- [ ] Slug unique, minuscules, sans accents, ≤ 96 caractères.
- [ ] `excerpt` 40–300 caractères ; `seoTitle` ≤ 60 ; `seoDescription` ≤ 155.
- [ ] Mot-clé principal naturellement présent (titre, résumé, titres SEO, premier paragraphe).
- [ ] Aucune affirmation sur Toboggo hors `fiche-toboggo.md` §4 ; rien de `fiche-toboggo.md` §5–§6.
- [ ] Chaque fait non trivial a une source citée ; section « Sources » présente.
- [ ] Pas de H1, pas d'image dans le contenu, `_key` uniques, liens valides (internes avec `/` final).
- [ ] `category` et `author` : références vers des documents publiés.
- [ ] Brouillon relu par requête (`perspective: "drafts"`), `_id` en `drafts.`. **Rien n'est publié.**
