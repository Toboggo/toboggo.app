/** Fabriques de parcs pour les tests (aucune donnée réelle). */
import type { SeoPark } from "./parks";

let counter = 0;

export function resetFixtureIds(): void {
  counter = 0;
}

export function uuid(n: number): string {
  return `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
}

export function park(overrides: Partial<SeoPark> = {}): SeoPark {
  counter += 1;
  return {
    id: uuid(counter),
    name: "Aire de jeux",
    city: "Millau",
    adminArea2: "Aveyron",
    postalCode: "12100",
    addressLine: "1 Rue Test",
    latitude: 44.1,
    longitude: 3.07,
    minAge: null,
    maxAge: null,
    features: {},
    slug: null,
    verificationStatus: "unverified",
    lastVerifiedAt: null,
    collectivityVerified: false,
    photos: [],
    ...overrides,
  };
}

/** Parc documenté (âge complet + 3 infos). */
export function rich(overrides: Partial<SeoPark> = {}): SeoPark {
  return park({
    name: "Parc Test",
    minAge: 2,
    maxAge: 12,
    features: { slide: { status: "available" }, toilets: { status: "available" }, benches: { status: "available" } },
    ...overrides,
  });
}

export const many = (n: number, make: () => SeoPark): SeoPark[] => Array.from({ length: n }, make);
