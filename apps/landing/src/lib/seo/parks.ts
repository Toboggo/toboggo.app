/**
 * Modèle de parc pour les pages SEO + normalisation des libellés.
 * Aucune donnée en dur : les libellés ci-dessous traduisent les CODES de la
 * base (`features.code`, valeurs de `value_set`) en français. Quand l'app
 * mobile a déjà un libellé (apps/mobile/src/i18n/locales/fr/features.json) on
 * le reprend à l'identique ; les rares codes sans libellé dans l'app
 * (bascule, maisonnette, accès poussettes…) sont traduits littéralement.
 */

export interface RawFeature {
  status?: string | null;
  value?: string | null;
}

/** Parc tel que renvoyé par park_public (colonnes demandées uniquement). */
export interface SeoPark {
  name: string;
  city: string | null;
  postalCode: string | null;
  addressLine: string | null;
  latitude: number | null;
  longitude: number | null;
  minAge: number | null;
  maxAge: number | null;
  features: Record<string, RawFeature>;
}

const EQUIPMENT: Record<string, string> = {
  slide: "Toboggan",
  swing: "Balançoire",
  climbing: "Structure d’escalade",
  sandbox: "Bac à sable",
  springer: "Jeux à ressort",
  zipline: "Tyrolienne",
  carousel: "Carrousel",
  motor_course: "Piste de motricité",
  multisport: "Terrain multisport",
  water_play: "Jeux d’eau",
  play_structure: "Structure de jeux",
  seesaw: "Bascule",
  playhouse: "Maisonnette",
};

const SERVICES: Record<string, string> = {
  toilets: "Toilettes",
  drinking_water: "Point d’eau potable",
  benches: "Bancs",
  parking: "Parking",
  bike_parking: "Stationnement vélos",
  lighting: "Éclairage",
};

const ACCESSIBILITY: Record<string, string> = {
  wheelchair_access: "Accès fauteuil roulant",
  accessible_toilets: "Toilettes accessibles",
  accessible_parking: "Stationnement PMR",
  stroller_access: "Accès poussettes",
};

// `fence_status`, `shade_level`, `surface_type` : le libellé dépend de la VALEUR
// (un parc `not_fenced` n'est pas « clôturé »). `unknown` / `none` ne sont
// jamais affichés comme une qualité.
const FENCE: Record<string, string> = { fully_fenced: "Clôturé", partially_fenced: "Partiellement clôturé" };
const SHADE: Record<string, string> = { partial: "Ombre partielle", mostly_shaded: "Plutôt ombragé", fully_shaded: "Entièrement ombragé" };
const SURFACE: Record<string, string> = {
  rubber: "Sol souple",
  sand: "Sable",
  grass: "Gazon",
  wood_chips: "Copeaux de bois",
  gravel: "Gravier",
  concrete: "Béton",
  mixed: "Revêtement mixte",
};

export interface ParkDescription {
  equipment: string[];
  services: string[];
  accessibility: string[];
  /** « Clôturé », « Ombre partielle »… (environnement, valeurs connues seulement) */
  environment: string[];
  surface: string | null;
  /** Nombre d'informations utiles déclarées (hors revêtement). */
  declaredCount: number;
}

function availableCodes(park: SeoPark): string[] {
  return Object.entries(park.features ?? {})
    .filter(([, f]) => f?.status === "available")
    .map(([code]) => code)
    .sort();
}

export function describePark(park: SeoPark): ParkDescription {
  const codes = availableCodes(park);
  // Ordre d'affichage = ordre des tables ci-dessus (pas l'ordre alphabétique des codes).
  const pick = (table: Record<string, string>) => Object.keys(table).filter((c) => codes.includes(c)).map((c) => table[c]);
  const fence = FENCE[park.features?.fence_status?.value ?? ""];
  const shade = SHADE[park.features?.shade_level?.value ?? ""];
  const surfaceValue = park.features?.surface_type?.status === "available" ? park.features.surface_type.value ?? "" : "";
  const environment = [fence, shade].filter((x): x is string => Boolean(x));
  const equipment = pick(EQUIPMENT);
  const services = pick(SERVICES);
  const accessibility = pick(ACCESSIBILITY);
  return {
    equipment,
    services,
    accessibility,
    environment,
    surface: SURFACE[surfaceValue] ?? null,
    declaredCount: equipment.length + services.length + accessibility.length + environment.length,
  };
}

/** « De 2 à 12 ans » / « Dès 1 an » / null — jamais d'âge inventé. */
export function ageLabel(park: Pick<SeoPark, "minAge" | "maxAge">): string | null {
  const { minAge, maxAge } = park;
  if (minAge != null && maxAge != null) return `De ${minAge} à ${maxAge} ans`;
  if (minAge != null) return `Dès ${minAge} an${minAge > 1 ? "s" : ""}`;
  if (maxAge != null) return `Jusqu’à ${maxAge} ans`;
  return null;
}

const SMALL_WORDS = new Set(["de", "du", "des", "la", "le", "les", "sur", "et", "en", "sous", "au", "aux", "d", "l"]);

/**
 * Adresse lisible : retire un suffixe « , <code postal> <ville> » déjà présent
 * dans la donnée et remet en minuscules les particules (« Avenue De Millau-Plage »
 * → « Avenue de Millau-Plage »). Ne change aucun mot, ne complète rien.
 */
export function formatAddress(park: Pick<SeoPark, "addressLine" | "postalCode" | "city">): string | null {
  let line = (park.addressLine ?? "").trim();
  if (!line) return null;
  if (park.postalCode && park.city) {
    const suffix = new RegExp(`,?\\s*${park.postalCode}\\s+${park.city}\\s*$`, "i");
    line = line.replace(suffix, "").trim();
  }
  if (!line) return null;
  return line
    .split(/(\s+)/)
    .map((token, i) => {
      if (i === 0 || /^\s+$/.test(token)) return token;
      const [head, ...rest] = token.split("’").length > 1 ? token.split("’") : token.split("'");
      const sep = token.includes("’") ? "’" : "'";
      if (rest.length === 0) return SMALL_WORDS.has(token.toLowerCase()) ? token.toLowerCase() : token;
      return [SMALL_WORDS.has(head.toLowerCase()) ? head.toLowerCase() : head, ...rest].join(sep);
    })
    .join("");
}

/** Nom de rue sans numéro, pour regrouper (« 860 Avenue de l'Aigoual » → « Avenue de l'Aigoual »). */
export function streetOf(address: string | null): string | null {
  if (!address) return null;
  const street = address.replace(/^\d+\s*(bis|ter)?\s+/i, "").trim();
  return /^(rue|avenue|boulevard|chemin|route|impasse|allée|place|quai|cité|square|passage)\b/i.test(street) ? street : null;
}
