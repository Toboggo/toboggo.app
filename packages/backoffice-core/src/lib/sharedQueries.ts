import { useQuery } from "@tanstack/react-query";
import {
  countAllUsers,
  getParkCountryDistribution,
  listOrganizationsWithCounts,
  listParkEdits,
  listPendingMedia,
  type OrganizationWithCounts,
  type ParkCountryCount,
  type ParkEdit,
  type PendingMedia,
} from "@toboggo/shared";

/**
 * One query key per dataset, shared by every screen that needs it.
 *
 * The Shell badges and the dashboards used to fetch the same rows under
 * different keys (`shell-pending-media` / `dash-pending-media` …), so React
 * Query could not dedupe them and each page load sent the request twice (or
 * three times). Consumers that only need a count pass `select` instead of
 * keeping a second cache entry holding a number.
 *
 * Invalidate with these keys (prefix match) after a mutation.
 */
export const boQueryKeys = {
  pendingMedia: (communeId?: string) => ["bo-pending-media", communeId] as const,
  /** Staff-wide pending `park_edits` queue (Admin only). */
  pendingEditsAdmin: ["bo-pending-edits-admin"] as const,
  parkCountries: ["bo-park-countries"] as const,
  organizations: ["bo-organizations"] as const,
  usersCount: ["bo-users-count"] as const,
};

interface QueryOpts<TData, TSelected> {
  enabled?: boolean;
  select?: (data: TData) => TSelected;
  /** Opt in to refetching on tab focus (the app-wide default is off, see `queryClient.ts`). */
  refetchOnWindowFocus?: boolean;
}

export function usePendingMedia<TSelected = PendingMedia[]>(
  communeId: string | undefined,
  opts: QueryOpts<PendingMedia[], TSelected> = {},
) {
  return useQuery({
    queryKey: boQueryKeys.pendingMedia(communeId),
    queryFn: () => listPendingMedia({ communeId }),
    ...opts,
  });
}

export function usePendingEditsAdmin<TSelected = ParkEdit[]>(opts: QueryOpts<ParkEdit[], TSelected> = {}) {
  return useQuery({
    queryKey: boQueryKeys.pendingEditsAdmin,
    queryFn: () => listParkEdits({ status: ["pending"] }),
    ...opts,
  });
}

export function useParkCountries(opts: QueryOpts<ParkCountryCount[], ParkCountryCount[]> = {}) {
  return useQuery({
    queryKey: boQueryKeys.parkCountries,
    queryFn: () => getParkCountryDistribution(),
    staleTime: 60_000,
    ...opts,
  });
}

/** `organizations` + park counts (2 requests). Also serves callers that only
 * need the plain organisation list — `OrganizationWithCounts` extends `Organization`. */
export function useOrganizations(opts: QueryOpts<OrganizationWithCounts[], OrganizationWithCounts[]> = {}) {
  return useQuery({
    queryKey: boQueryKeys.organizations,
    queryFn: () => listOrganizationsWithCounts(),
    staleTime: 60_000,
    ...opts,
  });
}

export function useUsersCount(opts: QueryOpts<number, number> = {}) {
  return useQuery({
    queryKey: boQueryKeys.usersCount,
    queryFn: () => countAllUsers(),
    ...opts,
  });
}
