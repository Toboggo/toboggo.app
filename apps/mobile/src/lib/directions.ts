import { useState } from "react";
import { useTranslation } from "react-i18next";
import { getDirectionsUrl, hasValidCoordinates, type MapProvider } from "@toboggo/shared";
import { useToastStore } from "./toast";
import { useVisitPrompt } from "./visitPrompt";

interface DirectionsTarget {
  id: string;
  latitude: number;
  longitude: number;
  displayName: string;
}

/**
 * The "Itinéraire" CTA (ParkDetail + ParkPreview): validates coordinates,
 * then lets the user pick a maps app via <DirectionsSheet>. No routing
 * engine, no mode/stops picker — just a hand-off to whichever app they pick.
 */
export function useDirections() {
  const { t } = useTranslation("detail");
  const showToast = useToastStore((s) => s.show);
  const schedule = useVisitPrompt((s) => s.schedule);
  const [target, setTarget] = useState<DirectionsTarget | null>(null);

  function openDirections(
    park: { id: string; latitude: number | null | undefined; longitude: number | null | undefined },
    displayName: string,
  ) {
    if (!hasValidCoordinates(park.latitude, park.longitude)) {
      showToast(t("directionsUnavailable"));
      return;
    }
    setTarget({ id: park.id, latitude: park.latitude as number, longitude: park.longitude as number, displayName });
  }

  function choose(provider: MapProvider) {
    if (!target) return;
    // Fired only once the user actually picks an app — before that we don't
    // yet know they're really about to leave Toboggo.
    schedule(target.id, target.displayName);
    // Same-tab navigation, not `window.open(url, "_blank")`: on iOS
    // Safari/PWA, `_blank` opens a new browsing context that the maps
    // universal link then hijacks into the native app, leaving a blank tab
    // behind for the user to close by hand. `location.assign` navigates the
    // current tab (still pushes a history entry, so the back gesture returns
    // here) — no extra context is ever created, on any platform.
    window.location.assign(getDirectionsUrl(provider, target.latitude, target.longitude));
    setTarget(null);
  }

  return {
    openDirections,
    directionsSheetProps: {
      open: target !== null,
      onChoose: choose,
      onClose: () => setTarget(null),
    },
  };
}
