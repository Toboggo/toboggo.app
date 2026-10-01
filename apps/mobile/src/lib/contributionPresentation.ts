import type { IconName } from "@toboggo/design-system";
import type { UserContribution, UserContributionType } from "@toboggo/shared";

/** Loosely typed on purpose — matches how `t` is used elsewhere in this app
 * (no i18next resource type augmentation is configured, see `i18n/config.ts`). */
type TFn = (key: string, options?: Record<string, unknown>) => string;

/** Presentation-only mapping of the real per-table status enums (`EditStatus`,
 * `MediaStatus`, `ReportStatus`, `ReviewStatus`, `ParkModerationStatus`) onto a
 * small set of user-facing labels/tones. The source data always keeps its own
 * enum value — this never writes back, it only decides how to show it. */
export type ContributionStatusTone = "primary" | "warning" | "info" | "error" | "neutral";

export interface ContributionStatusPresentation {
  labelKey: string;
  tone: ContributionStatusTone;
}

export function getContributionStatusPresentation(
  type: UserContributionType,
  status: string,
): ContributionStatusPresentation {
  switch (type) {
    case "park":
      if (status === "published") return { labelKey: "hub.status.published", tone: "primary" };
      if (status === "rejected" || status === "blocked") return { labelKey: "hub.status.rejected", tone: "error" };
      return { labelKey: "hub.status.pending", tone: "warning" }; // pending, draft
    case "edit":
      if (status === "approved" || status === "auto_approved") return { labelKey: "hub.status.published", tone: "primary" };
      if (status === "rejected") return { labelKey: "hub.status.rejected", tone: "error" };
      return { labelKey: "hub.status.pending", tone: "warning" };
    case "media":
      if (status === "approved") return { labelKey: "hub.status.published", tone: "primary" };
      if (status === "rejected") return { labelKey: "hub.status.rejected", tone: "error" };
      return { labelKey: "hub.status.pending", tone: "warning" };
    case "report":
      if (status === "resolved") return { labelKey: "hub.status.resolved", tone: "primary" };
      if (status === "in_progress") return { labelKey: "hub.status.inProgress", tone: "info" };
      if (status === "dismissed") return { labelKey: "hub.status.dismissed", tone: "neutral" };
      return { labelKey: "hub.status.pending", tone: "warning" }; // open
    case "review":
      if (status === "published") return { labelKey: "hub.status.published", tone: "primary" };
      if (status === "flagged") return { labelKey: "hub.status.rejected", tone: "error" };
      if (status === "hidden") return { labelKey: "hub.status.dismissed", tone: "neutral" };
      return { labelKey: "hub.status.pending", tone: "warning" };
  }
}

/** Fixed domain of contribution types — used to build the "Type" filter's
 * option list (unlike statuses/cities, this list is not derived from the
 * loaded data: all 5 are always offered, per the filters spec). */
export const CONTRIBUTION_TYPES: UserContributionType[] = ["media", "edit", "park", "report", "review"];

/** Short label for the "Type" filter dropdown — distinct from
 * `getContributionTitle` (a row's title, which is per-instance and often
 * pluralised/interpolated). */
export function getContributionTypeFilterLabel(type: UserContributionType, t: TFn): string {
  return t(`history.filters.type.${type}`);
}

export type ContributionTypeIcon = { iconName: IconName } | { emoji: string };

/** Mirrors the icons already used for these actions in `QuickMenu`/
 * `ContributeSheet` — no new pictogram invented here. */
export function getContributionTypeIcon(type: UserContributionType): ContributionTypeIcon {
  switch (type) {
    case "park":
      return { iconName: "ic-plus" };
    case "edit":
      return { emoji: "✏️" };
    case "media":
      return { emoji: "📷" };
    case "report":
      return { iconName: "ic-flag" };
    case "review":
      return { iconName: "ic-review" };
  }
}

/** Title line for a contribution row. Only uses fields the data actually
 * carries — `editTarget` (from `park_edits.changes.target`, already labelled
 * by the existing `edit.target.*` keys) and `photoCount` for pluralisation. */
export function getContributionTitle(item: UserContribution, t: TFn): string {
  switch (item.type) {
    case "park":
      return t("hub.type.park");
    case "edit":
      return item.editTarget ? t("hub.type.editTarget", { target: t(`edit.target.${item.editTarget}`) }) : t("hub.type.edit");
    case "media":
      return t("hub.type.media", { count: item.photoCount ?? 1 });
    case "report":
      return t("hub.type.report");
    case "review":
      return t("hub.type.review");
  }
}

/** Secondary detail line, when the data offers a more specific one than the
 * park name (report category via the existing `reason.*` keys; review rating). */
export function getContributionDetail(item: UserContribution, t: TFn): string | null {
  if (item.type === "report" && item.reportCategory) return t(`reason.${item.reportCategory}`);
  return null;
}
