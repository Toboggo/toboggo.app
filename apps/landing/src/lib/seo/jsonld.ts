/**
 * JSON-LD des pages SEO locales. Uniquement des propriétés réellement
 * présentes dans les données : name, adresse, coordonnées. Pas de LocalBusiness
 * (la page est une collection), pas d'avis/note/horaires/image/téléphone
 * (inexistants en base). Le BaseLayout ajoute le @context.
 */
import { SITE_URL } from "../../config/site";
import { placePath, type Place } from "./places";
import { formatAddress, type SeoPark } from "./parks";
import { hasValidCoordinates } from "./eligibility";

const abs = (path: string) => new URL(path, SITE_URL).toString();

export interface Crumb {
  name: string;
  path: string;
}

export function breadcrumbLd(crumbs: Crumb[]): Record<string, unknown> {
  return {
    "@type": "BreadcrumbList",
    itemListElement: crumbs.map((c, i) => ({ "@type": "ListItem", position: i + 1, name: c.name, item: abs(c.path) })),
  };
}

export function playgroundLd(park: SeoPark, countryCode: string): Record<string, unknown> {
  const street = formatAddress(park);
  const address: Record<string, unknown> = { "@type": "PostalAddress", addressCountry: countryCode };
  if (street) address.streetAddress = street;
  if (park.postalCode) address.postalCode = park.postalCode;
  if (park.city) address.addressLocality = park.city;
  return {
    "@type": "Playground",
    name: park.name,
    address,
    ...(hasValidCoordinates(park) ? { geo: { "@type": "GeoCoordinates", latitude: park.latitude, longitude: park.longitude } } : {}),
  };
}

/** ItemList des parcs AFFICHÉS sur la page (sans URL par parc : aucune fiche publique n'existe). */
export function parksItemListLd(parks: SeoPark[], countryCode: string): Record<string, unknown> {
  return {
    "@type": "ItemList",
    numberOfItems: parks.length,
    itemListElement: parks.map((park, i) => ({ "@type": "ListItem", position: i + 1, item: playgroundLd(park, countryCode) })),
  };
}

export function citiesItemListLd(cities: { place: Place }[]): Record<string, unknown> {
  return {
    "@type": "ItemList",
    numberOfItems: cities.length,
    itemListElement: cities.map((c, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: `Aires de jeux à ${c.place.name}`,
      url: abs(placePath(c.place)),
    })),
  };
}
