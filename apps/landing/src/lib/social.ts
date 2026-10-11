/**
 * Réseaux sociaux affichables : uniquement des liens https valides avec un libellé. Toute entrée
 * invalide est ignorée (jamais de lien cassé, jamais de `javascript:`), et une liste vide n'affiche rien.
 */
export interface SocialLink {
  label: string;
  href: string;
}

export function listSocials(links: readonly SocialLink[]): SocialLink[] {
  return links.filter((link) => {
    if (!link.label?.trim()) return false;
    try {
      const url = new URL(link.href);
      return url.protocol === "https:" && url.hostname.includes(".");
    } catch {
      return false;
    }
  });
}
