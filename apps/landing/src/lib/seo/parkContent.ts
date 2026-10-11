/**
 * Contenu d'une fiche de parc, calculé UNIQUEMENT à partir des champs réellement
 * présents (équipements, âges, adresse, coordonnées). Aucune phrase générique,
 * aucune note, aucun avis, aucune photo, aucune donnée inventée. Une caractéristique
 * jamais renseignée est « non renseignée » : elle n'est jamais présentée comme absente.
 */
import { ageLabel, describePark, environmentLabels, formatAddress, unavailableLabels, featureStatus, type SeoPark } from "./parks";

export type CriterionState = "yes" | "partial" | "no" | "unknown";

export interface Criterion {
  key: "age" | "fence" | "shade" | "toilets" | "wheelchair" | "benches" | "water" | "parking";
  label: string;
  state: CriterionState;
  /** Texte affiché (« Oui », « Ombre partielle », « Non renseigné »…). */
  text: string;
}

const UNKNOWN_TEXT = "Non renseigné";

function yesNo(park: Pick<SeoPark, "features">, code: string, yes = "Oui", no = "Non"): { state: CriterionState; text: string } {
  const status = featureStatus(park, code);
  if (status === "available") return { state: "yes", text: yes };
  if (status === "unavailable") return { state: "no", text: no };
  return { state: "unknown", text: UNKNOWN_TEXT };
}

/** Les 8 critères famille de Toboggo, chacun avec son état réel (oui / non / partiel / non renseigné). */
export function criteriaOf(park: SeoPark): Criterion[] {
  const f = park.features ?? {};
  const env = environmentLabels(park);
  const age = ageLabel(park);

  const fenceValue = f.fence_status?.status === "available" ? f.fence_status.value : null;
  const fence: { state: CriterionState; text: string } =
    fenceValue === "fully_fenced" ? { state: "yes", text: "Entièrement clôturé" }
    : fenceValue === "partially_fenced" ? { state: "partial", text: "Partiellement clôturé" }
    : fenceValue === "not_fenced" ? { state: "no", text: "Non clôturé" }
    : { state: "unknown", text: UNKNOWN_TEXT };

  const shadeValue = f.shade_level?.status === "available" ? f.shade_level.value : null;
  const shade: { state: CriterionState; text: string } =
    shadeValue === "none" || f.shade_level?.status === "unavailable" ? { state: "no", text: "Pas d'ombre" }
    : env.shade === "Ombre partielle" ? { state: "partial", text: env.shade }
    : env.shade ? { state: "yes", text: env.shade }
    : { state: "unknown", text: UNKNOWN_TEXT };

  const toilets = yesNo(park, "toilets");
  if (toilets.state === "yes" && featureStatus(park, "accessible_toilets") === "available") toilets.text = "Oui, dont toilettes accessibles";

  const parking = yesNo(park, "parking");
  if (parking.state === "yes" && featureStatus(park, "accessible_parking") === "available") parking.text = "Oui, dont stationnement PMR";

  return [
    { key: "age", label: "Tranche d'âge", state: age ? "yes" : "unknown", text: age ?? UNKNOWN_TEXT },
    { key: "fence", label: "Clôture", ...fence },
    { key: "shade", label: "Ombre", ...shade },
    { key: "toilets", label: "Toilettes", ...toilets },
    { key: "wheelchair", label: "Accès fauteuil roulant", ...yesNo(park, "wheelchair_access") },
    { key: "benches", label: "Bancs", ...yesNo(park, "benches") },
    { key: "water", label: "Point d'eau potable", ...yesNo(park, "drinking_water") },
    { key: "parking", label: "Parking", ...parking },
  ];
}

export interface ParkContent {
  criteria: Criterion[];
  equipment: string[];
  services: string[];
  accessibility: string[];
  environment: string[];
  surface: string | null;
  /** Explicitement enregistrés comme non disponibles. */
  unavailable: string[];
  /** Ce qui n'est pas renseigné : à confirmer par un parent, la collectivité ou sur place. */
  toConfirm: string[];
  address: string | null;
  coordinates: { latitude: number; longitude: number; text: string; osmUrl: string } | null;
  declaredCount: number;
  /** Nombre de groupes non vides parmi jeux / services / accessibilité / environnement. */
  groupCount: number;
}

function formatCoordinate(value: number, positive: string, negative: string): string {
  return `${Math.abs(value).toFixed(5).replace(".", ",")}° ${value >= 0 ? positive : negative}`;
}

export function osmUrl(latitude: number, longitude: number): string {
  return `https://www.openstreetmap.org/?mlat=${latitude}&mlon=${longitude}#map=18/${latitude}/${longitude}`;
}

export function buildParkContent(park: SeoPark): ParkContent {
  const d = describePark(park);
  const criteria = criteriaOf(park);
  const address = formatAddress(park);
  const hasCoords = typeof park.latitude === "number" && typeof park.longitude === "number";

  const toConfirm = criteria.filter((c) => c.state === "unknown").map((c) => `${c.label} : à confirmer`);
  if (!address) toConfirm.push("Adresse : non renseignée");

  return {
    criteria,
    equipment: d.equipment,
    services: d.services,
    accessibility: d.accessibility,
    environment: d.environment,
    surface: d.surface,
    unavailable: unavailableLabels(park),
    toConfirm,
    address,
    coordinates: hasCoords
      ? {
          latitude: park.latitude as number,
          longitude: park.longitude as number,
          text: `${formatCoordinate(park.latitude as number, "N", "S")}, ${formatCoordinate(park.longitude as number, "E", "O")}`,
          osmUrl: osmUrl(park.latitude as number, park.longitude as number),
        }
      : null,
    declaredCount: d.declaredCount,
    groupCount: [d.equipment, d.services, d.accessibility, d.environment].filter((g) => g.length > 0).length,
  };
}

const lowerFirst = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);
const upperFirst = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const list = (items: string[], max: number) => items.slice(0, max).map(lowerFirst).join(", ");

/** Phrases d'introduction : uniquement des faits enregistrés. */
export function parkLead(park: SeoPark, content: ParkContent, placeName: string): string[] {
  const sentences: string[] = [];
  const { minAge, maxAge } = park;
  if (minAge != null && maxAge != null) sentences.push(`Aire de jeux de ${placeName} pour les enfants de ${minAge} à ${maxAge} ans.`);
  else if (minAge != null) sentences.push(`Aire de jeux de ${placeName}, dès ${minAge} an${minAge > 1 ? "s" : ""}.`);
  else sentences.push(`Aire de jeux de ${placeName}.`);
  if (content.equipment.length > 0) sentences.push(`Jeux déclarés : ${list(content.equipment, 6)}.`);
  const extras = [...content.environment, ...content.services.slice(0, 2), ...content.accessibility.slice(0, 1)];
  if (extras.length > 0) sentences.push(`${extras.map((e, i) => (i === 0 ? e : lowerFirst(e))).join(", ")}.`);
  return sentences;
}

const TITLE_MAX = 65;
const BRAND_SUFFIX = " — Toboggo".length;

/** Titre unique : « Nom à Ville : équipements et âges » (version courte si trop long avec la marque). */
export function parkTitle(park: Pick<SeoPark, "name">, placeName: string): string {
  const base = `${park.name} à ${placeName}`;
  const full = `${base} : équipements et âges`;
  return full.length + BRAND_SUFFIX <= TITLE_MAX ? full : base;
}

const DESCRIPTION_MAX = 158;

/** Description unique construite à partir des faits (âge, jeux, services) ; jamais de texte générique seul. */
export function parkDescription(park: SeoPark, content: ParkContent, placeName: string): string {
  const where = `${park.name} à ${placeName}${park.postalCode ? ` (${park.postalCode})` : ""}`;
  const age = park.minAge != null && park.maxAge != null ? ` pour les enfants de ${park.minAge} à ${park.maxAge} ans` : park.minAge != null ? ` dès ${park.minAge} an${park.minAge > 1 ? "s" : ""}` : "";
  const equipment = content.equipment.length > 0 ? ` avec ${list(content.equipment, 3)}` : "";
  const extras = [...content.environment, ...content.services.slice(0, 2), ...content.accessibility.slice(0, 1)];
  const more = extras.length > 0 ? ` ${upperFirst(extras.map(lowerFirst).join(", "))}.` : "";
  // Évite « Aire de jeux de X : aire de jeux… » quand le nom le dit déjà.
  const named = /^aire de jeux/i.test(park.name);
  const intro = named ? `${where}${age ? `,${age}` : ""}${equipment ? `,${equipment}` : ""}.` : `${where} : aire de jeux${age}${equipment}.`;
  const text = `${intro}${more} Informations déclarées, non vérifiées sur place.`;
  if (text.length <= DESCRIPTION_MAX) return text;
  const cut = text.slice(0, DESCRIPTION_MAX - 1);
  return `${cut.slice(0, cut.lastIndexOf(" ")).replace(/[\s,.:;]+$/, "")}…`;
}

/** « 250 m » / « 1,2 km » (distance réelle calculée entre deux fiches). */
export function formatDistance(meters: number): string {
  return meters < 1000 ? `${Math.max(10, Math.round(meters / 10) * 10)} m` : `${(meters / 1000).toFixed(1).replace(".", ",")} km`;
}
