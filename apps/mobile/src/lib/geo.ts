import { create } from "zustand";
import { countryFromTimezone } from "@toboggo/shared";

export interface GeoState {
  lat: number;
  lng: number;
  label: string;
  permission: "unknown" | "granted" | "denied";
  /** True once a real position (GPS or an explicit city pick) has replaced the default centre. */
  hasFix: boolean;
  setLocation: (lat: number, lng: number, label: string) => void;
  setPermission: (p: GeoState["permission"]) => void;
}

/**
 * Sentinel `label` value meaning « no explicit place picked » (default centre or
 * a plain GPS recentre). Never shown to the user — the UI renders the localized
 * "around you" string instead — so its text stays fixed and is compared, not
 * displayed. Keeping the historical wording avoids churn in the call sites that
 * still pass the literal (contribution / onboarding flows, out of i18n scope).
 */
export const DEFAULT_GEO_LABEL = "Autour de vous";

export interface MapCenter {
  lat: number;
  lng: number;
}

const LYON: MapCenter = { lat: 45.764, lng: 4.8357 };
const NEW_YORK: MapCenter = { lat: 40.758, lng: -73.9855 };

/** Marché déduit du FUSEAU HORAIRE de l'appareil (pas de la langue : un
 * téléphone `en-US` en France reste en France). Fuseau inconnu ou hors marchés
 * US → comportement historique. Ne lit jamais la géolocalisation. */
export function detectMarket(timeZone?: string): "us" | "default" {
  let tz = timeZone;
  if (tz === undefined) {
    try {
      tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    } catch {
      tz = undefined;
    }
  }
  return tz && countryFromTimezone(tz) === "US" ? "us" : "default";
}

/** Centre de carte tant qu'aucune position (GPS / ville choisie) n'est connue. */
export function defaultCenter(timeZone?: string): MapCenter {
  return detectMarket(timeZone) === "us" ? NEW_YORK : LYON;
}

// Default center: Lyon (matches seed data) — New York for US-timezone devices —
// until GPS/city selection resolves.
export const useGeo = create<GeoState>((set) => ({
  ...defaultCenter(),
  label: DEFAULT_GEO_LABEL,
  permission: "unknown",
  hasFix: false,
  setLocation: (lat, lng, label) => set({ lat, lng, label, hasFix: true }),
  setPermission: (permission) => set({ permission }),
}));

export function requestBrowserLocation(): Promise<{ lat: number; lng: number }> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("Géolocalisation non disponible"));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      (err) => reject(err),
      { timeout: 8000 },
    );
  });
}

export const CITIES: { name: string; region: string; lat: number; lng: number }[] = [
  { name: "Millau", region: "Occitanie", lat: 44.0989, lng: 3.0781 },
  { name: "Lyon", region: "Auvergne-Rhône-Alpes", lat: 45.764, lng: 4.8357 },
  { name: "Marseille", region: "Provence-Alpes-Côte d'Azur", lat: 43.2965, lng: 5.3698 },
  { name: "Lille", region: "Hauts-de-France", lat: 50.6292, lng: 3.0573 },
  { name: "Bordeaux", region: "Nouvelle-Aquitaine", lat: 44.8378, lng: -0.5792 },
  { name: "Toulouse", region: "Occitanie", lat: 43.6047, lng: 1.4442 },
  { name: "Nantes", region: "Pays de la Loire", lat: 47.2184, lng: -1.5536 },
];

// État de New York — les seuls parcs américains publiés pour l'instant.
export const US_CITIES: { name: string; region: string; lat: number; lng: number }[] = [
  { name: "Manhattan", region: "New York", lat: 40.758, lng: -73.9855 },
  { name: "Brooklyn", region: "New York", lat: 40.6782, lng: -73.9442 },
  { name: "Queens", region: "New York", lat: 40.7282, lng: -73.7949 },
  { name: "The Bronx", region: "New York", lat: 40.8448, lng: -73.8648 },
  { name: "Staten Island", region: "New York", lat: 40.5795, lng: -74.1502 },
  { name: "Buffalo", region: "New York", lat: 42.8864, lng: -78.8784 },
  { name: "Rochester", region: "New York", lat: 43.1566, lng: -77.6088 },
  { name: "Albany", region: "New York", lat: 42.6526, lng: -73.7562 },
];

/** Villes suggérées dans la recherche, selon le marché de l'appareil. */
export function suggestedCities(timeZone?: string): typeof CITIES {
  return detectMarket(timeZone) === "us" ? US_CITIES : CITIES;
}
