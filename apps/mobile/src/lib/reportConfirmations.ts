import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { listActiveReports, respondToReport, type ActiveReport, type ReportResponse } from "@toboggo/shared";
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

/** Reflète une réponse enregistrée (ma réponse + compteurs) sans attendre le rechargement. */
export function applyResponse(reports: ActiveReport[], reportId: string, response: ReportResponse): ActiveReport[] {
  return reports.map((r) => {
    if (r.id !== reportId || r.my_response === response) return r;
    return {
      ...r,
      my_response: response,
      still_present_count: Math.max(0, r.still_present_count + (response === "still_present" ? 1 : 0) - (r.my_response === "still_present" ? 1 : 0)),
      resolved_count: Math.max(0, r.resolved_count + (response === "resolved" ? 1 : 0) - (r.my_response === "resolved" ? 1 : 0)),
    };
  });
}

export function useRespondToReport(parkId: string) {
  const userId = useSession((s) => s.userId);
  const client = useQueryClient();
  return useMutation({
    mutationFn: (v: { reportId: string; response: ReportResponse }) => respondToReport(v.reportId, v.response),
    onSuccess: (_data, v) => {
      // Enregistrement réussi : la bannière l'affiche aussitôt, puis rechargement serveur.
      client.setQueryData<ActiveReport[]>(activeReportsKey(parkId, userId), (old) =>
        old ? applyResponse(old, v.reportId, v.response) : old,
      );
      return client.invalidateQueries({ queryKey: ["park-active-reports", parkId], refetchType: "all" });
    },
  });
}
