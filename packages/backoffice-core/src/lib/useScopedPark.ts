import { useQuery } from "@tanstack/react-query";
import { getPark, listOrgParkIds } from "@toboggo/shared";
import { useOrgScope } from "./orgScope";

/** Thrown when a collectivité asks for a park that is not linked to it. */
export class ParkOutOfScopeError extends Error {
  constructor() {
    super("Parc hors du périmètre de la collectivité");
    this.name = "ParkOutOfScopeError";
  }
}

/**
 * Loads a park for the detail page, inside the active organisation's scope.
 *
 * `parks_public_read` (RLS) lets any signed-in user read a *published* park,
 * so a collectivité could otherwise open another organisation's park by typing
 * its id in the URL. For a collectivité the id must therefore belong to
 * `organization_parks` (same source of truth as `listParks({ communeId })`);
 * otherwise the query fails exactly like an unknown id. Admin is unscoped.
 *
 * The query key starts with `["park", id]`, so the existing prefix
 * invalidations keep working.
 */
export function useScopedPark(id: string) {
  const { communeId } = useOrgScope();
  return useQuery({
    queryKey: ["park", id, communeId ?? "all"],
    queryFn: async () => {
      if (communeId) {
        const ids = await listOrgParkIds(communeId);
        if (!ids.includes(id)) throw new ParkOutOfScopeError();
      }
      return getPark(id);
    },
    enabled: !!id,
  });
}
