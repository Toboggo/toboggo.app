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
    window.open(url, "_blank", "noopener,noreferrer");
  };
}
