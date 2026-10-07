/**
 * Contenu partagé d'un parc : texte du partage natif / WhatsApp / SMS / mail et
 * description des métadonnées de lien (Open Graph). Module pur, sans React ni
 * alias de workspace : il est aussi importé par la fonction Vercel
 * `api/park-meta.ts`, ce qui garantit un même texte dans l'app et dans l'aperçu.
 *
 * Données réelles uniquement : toute information absente est masquée, la note
 * suit la règle de la fiche (`hasRating` : avis > 0 ET note > 0).
 */

type Translate = (key: string, options?: Record<string, unknown>) => string;

export interface ShareParkInput {
  /** Nom d'affichage déjà résolu (`getParkDisplayName`). */
  name: string;
  address_line: string | null;
  city: string | null;
  rating: number;
  review_count: number;
}

const norm = (s: string) => s.trim().toLocaleLowerCase();

/** Même règle que la fiche (`hasRating` dans `parkDisplay.ts`). */
function isRated(p: Pick<ShareParkInput, "rating" | "review_count">): boolean {
  return (p.review_count ?? 0) > 0 && (p.rating ?? 0) > 0;
}

/**
 * « adresse courte, commune » — sans doublon avec le nom du parc, ni entre
 * l'adresse et la commune. `null` s'il ne reste rien.
 */
export function shortLocation(p: Pick<ShareParkInput, "name" | "address_line" | "city">): string | null {
  const name = norm(p.name);
  let address = p.address_line?.trim() || "";
  let city = p.city?.trim() || "";
  if (address && norm(address) === name) address = "";
  if (city && norm(city) === name) city = "";
  if (address && city && norm(address).includes(norm(city))) city = "";
  const parts = [address, city].filter(Boolean);
  return parts.length ? parts.join(", ") : null;
}

/** « ⭐ 4,3/5 · 12 avis » ou `null` sans avis. */
export function ratingLine(
  p: Pick<ShareParkInput, "rating" | "review_count">,
  t: Translate,
  formatRating: (n: number) => string,
): string | null {
  if (!isRated(p)) return null;
  return `⭐ ${t("share.ratingLine", { rating: formatRating(p.rating), count: p.review_count })}`;
}

/** Texte complet du partage, URL incluse une seule fois (en dernière ligne). */
export function buildShareText(
  p: ShareParkInput,
  url: string,
  t: Translate,
  formatRating: (n: number) => string,
): string {
  const location = shortLocation(p);
  return [
    t("share.intro"),
    p.name,
    location ? `📍 ${location}` : null,
    ratingLine(p, t, formatRating),
    t("share.cta"),
    url,
  ]
    .filter((line): line is string => Boolean(line))
    .join("\n");
}

/** Description d'aperçu de lien : localisation · note/avis, ou repli générique. */
export function buildShareDescription(
  p: ShareParkInput,
  t: Translate,
  formatRating: (n: number) => string,
): string {
  const parts = [shortLocation(p), ratingLine(p, t, formatRating)].filter((s): s is string => Boolean(s));
  return parts.length ? parts.join(" · ") : t("share.metaFallback");
}
