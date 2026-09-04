import { create } from "zustand";

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

// Default center: Lyon (matches seed data) until GPS/city selection resolves.
export const useGeo = create<GeoState>((set) => ({
  lat: 45.764,
  lng: 4.8357,
  label: "Autour de vous",
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
