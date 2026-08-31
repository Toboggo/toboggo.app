import type { IconName } from "./Icon";

/**
 * Business code → sprite icon (`IconName`) mapping.
 *
 * A code appears here ONLY when its icon is a safe, unambiguous match that has
 * been (or can be) visually confirmed. A missing code means "no validated icon
 * yet" — the caller must keep its own fallback (emoji / text) until the icon is
 * approved. Screens should not know emojis or icon names themselves; they call
 * `equipmentIcon()` / `serviceIcon()` / `reportReasonIcon()`.
 *
 * Deliberately NOT mapped (pending founder visual validation — see
 * docs/DESIGN-SYSTEM.md §7):
 *   equipment "climbing" → ic-climb, "motorcourse" → ic-motor
 *   service   "wc"       → ic-toilets
 *   report    "wrong_info" → ic-report-info
 * No sprite symbol exists for: equipment "waterplay" / "zipline" / "carousel";
 *   report "vegetation" / "accessibility".
 */

/** Legacy play-equipment codes (`park.play_equipment`). */
export const EQUIPMENT_ICONS: Readonly<Record<string, IconName>> = {
  toboggan: "ic-slide",
  swing: "ic-swing",
  sandbox: "ic-sandbox",
  springs: "ic-spring",
  multisport: "ic-multisport",
};

/** Service / criteria codes (`park.wc`, `park.shade`, …). */
export const SERVICE_ICONS: Readonly<Record<string, IconName>> = {
  shade: "ic-shade",
  fenced: "ic-fence",
  pmr: "ic-pmr",
  benches: "ic-bench",
  water: "ic-water",
  parking: "ic-parking",
};

/** Report category codes (`ReportCategory`). */
export const REPORT_REASON_ICONS: Readonly<Record<string, IconName>> = {
  broken_equipment: "ic-report-broken",
  safety: "ic-report-safety",
  cleanliness: "ic-report-clean",
  other: "ic-report-other",
};

export function equipmentIcon(code: string): IconName | undefined {
  return EQUIPMENT_ICONS[code];
}

export function serviceIcon(code: string): IconName | undefined {
  return SERVICE_ICONS[code];
}

export function reportReasonIcon(code: string): IconName | undefined {
  return REPORT_REASON_ICONS[code];
}
