import type { IconName } from "@toboggo/design-system";

/**
 * `activity_log.text` has no structured event type — every entry is a French
 * sentence written by `logActivity()` call sites (see grep across
 * `screens/`/`components/`). `color` is never anything but the "primary"
 * default, so it carries no real signal. This derives a display icon purely
 * from the wording those call sites actually produce today; anything that
 * doesn't match falls back to `undefined` (a plain dot, same as before)
 * rather than guessing.
 */
export function activityIcon(text: string): IconName | undefined {
  if (text.includes("Signalement")) return "ic-flag";
  if (text.includes("Contrôle") || text.includes("Inspection")) return "ic-check";
  if (text.includes("Invitation")) return "ic-users";
  if (
    text.includes("Parc") ||
    text.includes("Caractéristiques") ||
    /^(Validé|Refusé|Bloqué|Débloqué|Retiré)\b/.test(text)
  ) {
    return "ic-list";
  }
  return undefined;
}
