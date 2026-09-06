import type { ParkStatus } from "@toboggo/shared";

export interface ParkStatusTransition {
  label: string;
  next: ParkStatus;
  /** Audit / history note recorded with `setParkStatus`. */
  note: string;
}

/**
 * Moderation-status transitions offered for a park in a given state — the
 * single source of truth shared by the list ("…" menu) and the park page
 * header, so the two never drift (audit debt DT-4). Gated by `canEditPark`
 * at the call site; `moderation_status` is never an editable form field.
 */
export function parkStatusTransitions(status: ParkStatus): ParkStatusTransition[] {
  switch (status) {
    case "pending":
      return [
        { label: "Valider", next: "published", note: "Validé" },
        { label: "Refuser", next: "rejected", note: "Refusé" },
      ];
    case "published":
      return [{ label: "Bloquer", next: "blocked", note: "Bloqué" }];
    case "blocked":
      return [{ label: "Débloquer", next: "published", note: "Débloqué" }];
    default:
      return [];
  }
}
