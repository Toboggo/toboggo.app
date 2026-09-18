/**
 * External navigation (Itinéraire — V1): deep-links to the platform's own
 * maps app for a park's exact GPS coordinates. Toboggo does not embed a
 * routing engine — this only validates coordinates and builds an HTTPS URL;
 * the caller (app layer) is responsible for opening it.
 *
 * HTTPS only (never `maps://`/`geo:`): those schemes fail silently with no
 * app installed, whereas the map provider's own site is a reliable fallback
 * in a browser or an installed PWA.
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

function isApplePlatform(userAgent: string, maxTouchPoints: number): boolean {
  if (/iPhone|iPad|iPod/.test(userAgent)) return true;
  // iPadOS 13+ identifies as "Macintosh" in its UA string but, unlike a real
  // Mac, exposes multi-touch — the only reliable way to tell them apart.
  return /Macintosh/.test(userAgent) && maxTouchPoints > 1;
}

export interface DirectionsUrlOptions {
  userAgent?: string;
  maxTouchPoints?: number;
}

/**
 * Builds an HTTPS directions URL to `latitude,longitude`: Apple Maps on
 * iOS/iPadOS, Google Maps everywhere else (Android and desktop). Caller must
 * validate coordinates first with `hasValidCoordinates`.
 */
export function getDirectionsUrl(
  latitude: number,
  longitude: number,
  options: DirectionsUrlOptions = {},
): string {
  const userAgent = options.userAgent ?? (typeof navigator !== "undefined" ? navigator.userAgent : "");
  const maxTouchPoints =
    options.maxTouchPoints ?? (typeof navigator !== "undefined" ? navigator.maxTouchPoints : 0);
  const destination = `${latitude},${longitude}`;

  if (isApplePlatform(userAgent, maxTouchPoints)) {
    return `https://maps.apple.com/?${new URLSearchParams({ daddr: destination })}`;
  }
  return `https://www.google.com/maps/dir/?${new URLSearchParams({ api: "1", destination })}`;
}
