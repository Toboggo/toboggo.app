import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { fetchNearbyParks, getPark, listReviewsForPark, type NearbyParksParams } from "@toboggo/shared";

export function useNearbyParks(params: NearbyParksParams) {
  return useQuery({
    queryKey: ["nearby-parks", params],
    queryFn: () => fetchNearbyParks(params),
    // Keep the previous results visible while filters/location change so the
    // Explore sheet doesn't flip to a loading state on every tweak.
    placeholderData: keepPreviousData,
  });
}

export function usePark(id: string | undefined) {
  return useQuery({
    queryKey: ["park", id],
    queryFn: () => getPark(id!),
    enabled: !!id,
  });
}

export function useParkReviews(parkId: string | undefined) {
  return useQuery({
    queryKey: ["park-reviews", parkId],
    queryFn: () => listReviewsForPark(parkId!),
    enabled: !!parkId,
  });
}
