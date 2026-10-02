import { useCallback, useEffect, useRef, useState } from "react";
import { isValidCoordinate, reverseGeocode, type ReverseGeocodedAddress } from "@toboggo/shared";

/** Deux positions arrondies à ~1 m sont « la même » : évite le double appel
 * d'une même action (ex. GPS puis `moveend` du flyTo). */
const positionKey = (lat: number, lng: number) => `${lat.toFixed(5)},${lng.toFixed(5)}`;

/**
 * Reverse geocoding (Geoapify, via Edge Function) d'une position CHOISIE par
 * l'utilisateur. N'est jamais appelé tout seul : seul `resolve` déclenche un
 * appel, et l'appelant ne l'invoque que sur une action utilisateur (fin de
 * déplacement, « Ma position », nudge) — pas au montage ni à la restauration
 * d'un brouillon.
 *
 *  - invalide → aucun appel ;
 *  - même position que la dernière demandée → aucun appel ;
 *  - nouvelle demande → la précédente est abandonnée (AbortController) ET sa
 *    réponse éventuelle est ignorée (compteur) : une réponse ancienne ne peut
 *    jamais remplacer l'adresse d'une position plus récente ;
 *  - échec / aucun résultat → `onUnresolved` (l'appelant garde l'adresse existante).
 */
export function useAddressResolver(opts: {
  /** Appelé quand une NOUVELLE requête démarre (jamais pour une position dédoublonnée
   * ni invalide) : l'appelant invalide ce qui décrivait l'ancienne position. */
  onStart?: () => void;
  onResolved: (address: ReverseGeocodedAddress, position: { lat: number; lng: number }) => void;
  onUnresolved?: () => void;
}) {
  const optsRef = useRef(opts);
  optsRef.current = opts;
  const seq = useRef(0);
  const controller = useRef<AbortController | null>(null);
  const lastKey = useRef<string | null>(null);
  const [resolving, setResolving] = useState(false);

  const resolve = useCallback((lat: number, lng: number) => {
    if (!isValidCoordinate(lat, lng)) return;
    const key = positionKey(lat, lng);
    if (key === lastKey.current) return;
    lastKey.current = key;

    controller.current?.abort();
    const ctrl = new AbortController();
    controller.current = ctrl;
    const id = ++seq.current;
    setResolving(true);
    optsRef.current.onStart?.();

    reverseGeocode(lat, lng, { signal: ctrl.signal })
      .then((address) => {
        if (id !== seq.current) return;
        if (address) optsRef.current.onResolved(address, { lat, lng });
        else optsRef.current.onUnresolved?.();
      })
      .catch(() => {
        if (id !== seq.current) return;
        lastKey.current = null; // permet de retenter la même position
        optsRef.current.onUnresolved?.();
      })
      .finally(() => {
        if (id === seq.current) setResolving(false);
      });
  }, []);

  useEffect(
    () => () => {
      seq.current++; // ignore toute réponse après démontage
      controller.current?.abort();
    },
    [],
  );

  return { resolve, resolving };
}
