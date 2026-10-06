import type { Park } from "@toboggo/shared";
import { canonicalFeatureCode } from "./featureLabel";

/**
 * Codes catalogue (V2) des jeux réellement présents sur un parc : uniquement
 * ce que les données déclarent (`features` play « available » + legacy
 * `play_equipment`), dédoublonnés, sans valeur par défaut.
 */
export function presentPlayCodes(park: Pick<Park, "features" | "play_equipment">): string[] {
  const codes: string[] = [];
  const add = (code: string) => {
    const canonical = canonicalFeatureCode(code);
    if (!codes.includes(canonical)) codes.push(canonical);
  };
  for (const [code, view] of Object.entries(park.features ?? {})) {
    if (view.category === "play" && view.status === "available") add(code);
  }
  for (const code of park.play_equipment ?? []) add(code);
  return codes;
}
