/**
 * External navigation (Itinéraire — V1): deep-links to a maps app the user
 * picks for a park's exact GPS coordinates. Toboggo does not embed a routing
 * engine — this only validates coordinates and builds an HTTPS URL per
 * provider; the caller (app layer) opens it, in the current tab.
 *
 * HTTPS only (never `maps://`/`geo:`/`waze://`): those schemes fail silently
 * with no app installed, whereas each provider's own site is a reliable
 * fallback in a browser or an installed PWA.
 */

export function hasValidCoordinates(
  latitude: number | null | undefined,
  longitude: number | null | undefined,
): boolean {
  if (typeof latitude !== "number" || typeof longitude !== "number") return false;
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return false;
  if (latitude < -90 || latitude > 90) return false;
  if (longitude < -180 || longitude > 180) return false;
  // "Null island" — never a real Toboggo park, always a missing-data sentinel.
  if (latitude === 0 && longitude === 0) return false;
  return true;
}

export type MapProvider = "apple" | "google" | "waze";

function isApplePlatform(userAgent: string, maxTouchPoints: number): boolean {
  if (/iPhone|iPad|iPod/.test(userAgent)) return true;
  // iPadOS 13+ identifies as "Macintosh" in its UA string but, unlike a real
  // Mac, exposes multi-touch — the only reliable way to tell them apart.
  return /Macintosh/.test(userAgent) && maxTouchPoints > 1;
}

export interface PlatformOptions {
  userAgent?: string;
  maxTouchPoints?: number;
}

function resolvePlatform(options: PlatformOptions): { userAgent: string; maxTouchPoints: number } {
  return {
    userAgent: options.userAgent ?? (typeof navigator !== "undefined" ? navigator.userAgent : ""),
    maxTouchPoints: options.maxTouchPoints ?? (typeof navigator !== "undefined" ? navigator.maxTouchPoints : 0),
  };
}

/**
 * Which map apps make sense to offer, in display order. Apple Maps ("Plans")
 * only where it actually comes preinstalled (iOS/iPadOS) — Google Maps and
 * Waze are offered everywhere else (Android, desktop).
 */
export function getAvailableMapProviders(options: PlatformOptions = {}): MapProvider[] {
  const { userAgent, maxTouchPoints } = resolvePlatform(options);
  const providers: MapProvider[] = [];
  if (isApplePlatform(userAgent, maxTouchPoints)) providers.push("apple");
  providers.push("google", "waze");
  return providers;
}

/** Builds an HTTPS directions URL to `latitude,longitude` for one specific provider. */
export function getDirectionsUrl(provider: MapProvider, latitude: number, longitude: number): string {
  const destination = `${latitude},${longitude}`;
  switch (provider) {
    case "apple":
      return `https://maps.apple.com/?${new URLSearchParams({ daddr: destination })}`;
    case "google":
      return `https://www.google.com/maps/dir/?${new URLSearchParams({ api: "1", destination })}`;
    case "waze":
      return `https://waze.com/ul?${new URLSearchParams({ ll: destination, navigate: "yes" })}`;
  }
}
