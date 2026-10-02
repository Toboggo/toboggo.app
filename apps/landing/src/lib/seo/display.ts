/**
 * Seuils d'affichage des pages de ville : au-delà, la liste est repliée
 * (<details>, tout le contenu reste dans le HTML initial) pour éviter une page
 * énorme.
 */
export const DOCUMENTED_CARDS_VISIBLE = 12;
export const OTHERS_VISIBLE = 15;

export function splitVisible<T>(items: readonly T[], visible: number): { shown: T[]; folded: T[] } {
  return items.length > visible ? { shown: items.slice(0, visible), folded: items.slice(visible) } : { shown: [...items], folded: [] };
}
