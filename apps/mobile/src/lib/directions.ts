import { useTranslation } from "react-i18next";
import { getDirectionsUrl, hasValidCoordinates } from "@toboggo/shared";
import { useToastStore } from "./toast";
import { useVisitPrompt } from "./visitPrompt";

/**
 * The "Itinéraire" CTA's click handler (ParkDetail + ParkPreview): opens the
 * platform's own maps app on the park's exact GPS coordinates. No routing
 * engine, no mode/stops picker — V1 is a straight external hand-off.
 */
export function useOpenDirections() {
  const { t } = useTranslation("detail");
  const showToast = useToastStore((s) => s.show);
  const schedule = useVisitPrompt((s) => s.schedule);

  return function openDirections(
    park: { id: string; latitude: number | null | undefined; longitude: number | null | undefined },
    displayName: string,
  ) {
    if (!hasValidCoordinates(park.latitude, park.longitude)) {
      showToast(t("directionsUnavailable"));
      return;
    }
    // Fired before the external hand-off — once the maps app takes over,
    // Toboggo has no reliable way to know the trip happened.
    schedule(park.id, displayName);
    const url = getDirectionsUrl(park.latitude as number, park.longitude as number);
    // Same-tab navigation, not `window.open(url, "_blank")`: on iOS Safari/PWA,
    // `_blank` opens a new browsing context that the maps.apple.com universal
    // link then hijacks into the Apple Maps app, leaving the blank tab behind
    // for the user to close by hand. `location.assign` navigates the current
    // tab (still pushes a history entry, so the back gesture returns here) —
    // no extra context is ever created, on any platform.
    window.location.assign(url);
  };
}
