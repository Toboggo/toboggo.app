/**
 * Mémorise que l'écran d'accueil a déjà été franchi sur cet appareil : un invité
 * qui a choisi « Explorer les parcs » ne le revoit pas à chaque ouverture.
 * Local à l'appareil, aucune donnée personnelle.
 */
const KEY = "toboggo:welcome-seen";

export function hasSeenWelcome(): boolean {
  try {
    return localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

export function markWelcomeSeen(): void {
  try {
    localStorage.setItem(KEY, "1");
  } catch {
    /* stockage indisponible : l'accueil réapparaîtra, sans gravité */
  }
}
