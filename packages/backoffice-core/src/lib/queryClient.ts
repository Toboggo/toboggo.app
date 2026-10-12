import { QueryClient } from "@tanstack/react-query";

/**
 * Back-office defaults (shared by the Admin and Collectivité apps).
 *
 * - `staleTime: 60s` — a query younger than a minute is served from cache on
 *   remount / navigation instead of hitting the API again.
 * - `refetchOnWindowFocus: false` — React Query's default (true) refetches
 *   every stale active query each time the tab regains focus. On the Admin
 *   catalogue some of those requests are expensive, and a back-office user
 *   alt-tabs constantly, so this produced bursts of redundant traffic. Data
 *   still refreshes on mount (once stale), after the user's own mutations
 *   (explicit `invalidateQueries`) and via the manual retry buttons. The
 *   sidebar badges (Shell) opt back in individually: they live for the whole
 *   session and would otherwise never refresh.
 */
export const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 60_000, refetchOnWindowFocus: false, retry: 1 } },
});
