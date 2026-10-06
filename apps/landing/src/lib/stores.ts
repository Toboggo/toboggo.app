/**
 * Boutons App Store / Google Play : affichés UNIQUEMENT pour une URL réelle et
 * plausible. Aucune URL inventée, aucun bouton mort : sans URL, la liste est vide.
 */
export interface StoreLink {
  id: "appStore" | "googlePlay";
  label: string;
  href: string;
}

const HOSTS: Record<StoreLink["id"], string[]> = {
  appStore: ["apps.apple.com", "testflight.apple.com"],
  googlePlay: ["play.google.com"],
};

function validUrl(id: StoreLink["id"], value: string | null): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && HOSTS[id].includes(url.hostname) ? url.toString() : null;
  } catch {
    return null;
  }
}

export function listStores(links: { appStore: string | null; googlePlay: string | null }): StoreLink[] {
  const result: StoreLink[] = [];
  const appStore = validUrl("appStore", links.appStore);
  const googlePlay = validUrl("googlePlay", links.googlePlay);
  if (appStore) result.push({ id: "appStore", label: "App Store", href: appStore });
  if (googlePlay) result.push({ id: "googlePlay", label: "Google Play", href: googlePlay });
  return result;
}
