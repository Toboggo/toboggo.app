/** Requêtes GROQ. Un article n'est public que s'il a un slug et une date de publication passée. */
const PUBLIC_FILTER = `_type == "article" && !(_id in path("drafts.**")) && defined(slug.current) && defined(publishedAt) && publishedAt <= now()`;

const IMAGE = `{ alt, "url": asset->url, "width": asset->metadata.dimensions.width, "height": asset->metadata.dimensions.height }`;

const CARD_FIELDS = `_id,
  title,
  "slug": slug.current,
  excerpt,
  publishedAt,
  updatedAt,
  "category": category->{ title, "slug": slug.current },
  "author": author->{ name, role },
  "cover": coverImage ${IMAGE}`;
const CARD = `{ ${CARD_FIELDS} }`;

const FULL = `{
  ${CARD_FIELDS},
  seoTitle,
  seoDescription,
  _updatedAt,
  "body": body[]{
    ...,
    _type == "image" => { ..., "url": asset->url, "width": asset->metadata.dimensions.width, "height": asset->metadata.dimensions.height }
  }
}`;

export const LIST_QUERY = `*[${PUBLIC_FILTER}] | order(publishedAt desc) ${CARD}`;
export const BY_SLUG_QUERY = `*[${PUBLIC_FILTER} && slug.current == $slug][0] ${FULL}`;

/** Prévisualisation (perspective « drafts » : le brouillon remplace déjà la version publiée), sans filtre de date. */
export const PREVIEW_BY_SLUG_QUERY = `*[_type == "article" && slug.current == $slug][0] ${FULL}`;
