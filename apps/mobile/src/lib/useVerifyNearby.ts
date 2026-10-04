import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  confirmParkFeature,
  fetchNearbyParks,
  listFeatures,
  listMyConfirmationKeys,
  listParksToVerify,
  type ParkVerification,
} from "@toboggo/shared";
import { DEFAULT_GEO_LABEL, requestBrowserLocation, useGeo } from "./geo";
import { useSession } from "./session";

const VERIFY_RADIUS_M = 5000;

export type VerifyNearbyState = "locating" | "denied" | "loading" | "error" | "unavailable" | "empty" | "ready";

/** PostgREST / Postgres signal that `park_confirmations` does not exist (migration 0043 not applied yet). */
export function isConfirmationsUnavailable(err: unknown): boolean {
  const code = (err as { code?: string } | null)?.code;
  return code === "PGRST205" || code === "42P01";
}

/**
 * « À vérifier près de chez vous » — real nearby parks (current position, 5 km)
 * having a recorded equipment/service the user has not yet confirmed.
 * Confirming only records a signal (`park_confirmations`); it never edits the park.
 */
export function useVerifyNearby() {
  const qc = useQueryClient();
  const userId = useSession((s) => s.userId);
  const { lat, lng, hasFix, permission } = useGeo();
  const [locating, setLocating] = useState(false);

  const asked = useRef(false);
  async function locate() {
    setLocating(true);
    try {
      const pos = await requestBrowserLocation();
      useGeo.getState().setLocation(pos.lat, pos.lng, DEFAULT_GEO_LABEL);
      useGeo.getState().setPermission("granted");
    } catch {
      useGeo.getState().setPermission("denied");
    } finally {
      setLocating(false);
    }
  }
  useEffect(() => {
    if (asked.current || hasFix || permission === "denied") return;
    asked.current = true;
    void locate();
  }, [hasFix, permission]);

  const nearby = useQuery({
    queryKey: ["verify-nearby", Math.round(lat * 1000), Math.round(lng * 1000)],
    queryFn: () => fetchNearbyParks({ lat, lng, radiusMeters: VERIFY_RADIUS_M }),
    enabled: hasFix,
  });
  const catalogue = useQuery({ queryKey: ["features"], queryFn: () => listFeatures() });
  const confirmed = useQuery({
    queryKey: ["my-confirmations", userId],
    queryFn: () => listMyConfirmationKeys(userId!),
    enabled: !!userId,
    // A missing table will not appear by retrying: show the unavailable state at once.
    retry: (count, err) => !isConfirmationsUnavailable(err) && count < 3,
  });

  const items = useMemo<ParkVerification[]>(() => {
    if (!nearby.data || !catalogue.data) return [];
    return listParksToVerify(nearby.data, catalogue.data, confirmed.data ?? new Set());
  }, [nearby.data, catalogue.data, confirmed.data]);

  const confirm = useMutation({
    mutationFn: (v: ParkVerification) =>
      confirmParkFeature({ userId: userId!, parkId: v.park.id, featureId: v.feature.id, status: v.status }),
    onSuccess: (_data, v) => {
      // The confirmed park leaves the list at once (no wait for the refetch);
      // the server's list then replaces this optimistic entry.
      qc.setQueryData<Set<string>>(["my-confirmations", userId], (prev) =>
        new Set(prev ?? []).add(`${v.park.id}:${v.feature.id}`),
      );
      void qc.invalidateQueries({ queryKey: ["my-confirmations", userId] });
      void qc.invalidateQueries({ queryKey: ["my-confirmations-count", userId] });
    },
  });

  let state: VerifyNearbyState;
  if (!hasFix) state = locating || permission !== "denied" ? "locating" : "denied";
  else if (isConfirmationsUnavailable(confirmed.error)) state = "unavailable";
  else if (nearby.isError || catalogue.isError || confirmed.isError) state = "error";
  else if (nearby.isLoading || catalogue.isLoading || (!!userId && confirmed.isLoading)) state = "loading";
  else state = items.length > 0 ? "ready" : "empty";

  return {
    state,
    items,
    confirm,
    retry: () => {
      void nearby.refetch();
      void catalogue.refetch();
      void confirmed.refetch();
    },
    locate,
    isSignedIn: !!userId,
  };
}
