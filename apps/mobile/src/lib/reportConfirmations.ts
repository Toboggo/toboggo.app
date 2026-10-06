import { useMutation, useQuery } from "@tanstack/react-query";
import { listActiveReports, respondToReport, type ReportResponse } from "@toboggo/shared";
import { queryClient } from "./queryClient";
import { useSession } from "./session";

/** Signalements actifs d'un parc (lecture publique) + ma réponse si connecté. */
export function activeReportsKey(parkId: string | undefined, userId: string | null) {
  return ["park-active-reports", parkId, userId] as const;
}

export function useActiveReports(parkId: string | undefined, enabled = true) {
  const userId = useSession((s) => s.userId);
  return useQuery({
    queryKey: activeReportsKey(parkId, userId),
    queryFn: () => listActiveReports(parkId!),
    enabled: !!parkId && enabled,
  });
}

/** `refetchType: "all"` : après une connexion juste-à-temps, la requête du nouvel utilisateur
 * peut être déjà en vol (ou inactive) quand la réponse reprise aboutit — on force le rafraîchissement. */
export function invalidateActiveReports(parkId: string) {
  return queryClient.invalidateQueries({ queryKey: ["park-active-reports", parkId], refetchType: "all" });
}

export function useRespondToReport(parkId: string) {
  return useMutation({
    mutationFn: (v: { reportId: string; response: ReportResponse }) => respondToReport(v.reportId, v.response),
    onSuccess: () => invalidateActiveReports(parkId),
  });
}
