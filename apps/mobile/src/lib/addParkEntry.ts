/**
 * Entrée « Ajouter un parc » depuis un autre parcours (« Je ne trouve pas mon
 * parc ») : `/add?new=1&from=<route d'origine>`. `from` sert à « Annuler » pour
 * revenir au parcours d'origine ; il est validé (route interne uniquement).
 */
export function addParkFromHref(origin: string): string {
  return `/add?new=1&from=${encodeURIComponent(origin)}`;
}

/** Route d'origine sûre (interne, jamais `//hôte` ni `/add` lui-même), sinon `null`. */
export function safeFromRoute(raw: string | null): string | null {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//") || raw.startsWith("/\\")) return null;
  if (raw === "/add" || raw.startsWith("/add?") || raw.startsWith("/login")) return null;
  return raw;
}
