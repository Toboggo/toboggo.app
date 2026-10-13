import { useTranslation } from "react-i18next";
import { Icon, equipmentIcon, serviceIcon, type IconName } from "@toboggo/design-system";
import { useFeatureLabel } from "../lib/featureLabel";
import type { AmenityEntry } from "../lib/parkAmenities";
import styles from "./ParkBadge.module.css";

export type ParkBadgeVariant = "age" | "present" | "absent" | "temporary" | "unknown";

/**
 * Descriptive badge of a park (age, equipment, service). One component, five
 * explicit variants, used on every surface (Explorer lists, Favorites, compact
 * panel, full page) so the look cannot drift page by page. It is a plain
 * `<span>`: never a control, never styled like a selectable filter. (Age on top
 * of a photo keeps its own translucent tag in `ParkCard`.)
 */
export function ParkBadge({
  variant,
  label,
  icon,
  iconOnly = false,
  size = "sm",
  accessibleLabel,
}: {
  variant: ParkBadgeVariant;
  label: string;
  icon?: IconName;
  /** Icon in a round pill; the label becomes the accessible name. */
  iconOnly?: boolean;
  /** Compact sizes of the summaries: `sm` lists / Favorites, `md` compact panel,
   * `lg` full page (the paddings those surfaces had before the shared badge). */
  size?: "sm" | "md" | "lg";
  /** Spoken name when the visible text is terse (« +2 »). */
  accessibleLabel?: string;
}) {
  const asIcon = iconOnly && icon != null;
  return (
    <span
      className={styles.badge}
      data-variant={variant}
      data-size={size}
      data-icon-only={asIcon ? "1" : undefined}
      role={asIcon || accessibleLabel ? "img" : undefined}
      aria-label={asIcon ? label : accessibleLabel}
      title={asIcon ? label : undefined}
    >
      {icon && <Icon name={icon} size={asIcon ? 13 : 12} />}
      {!asIcon && label}
    </span>
  );
}

/** Localised text of an amenity in its state, without string concatenation:
 * services have one full phrase per state; games use a `{{item}}` template. */
export function useAmenityLabel() {
  const { t, i18n } = useTranslation("features");
  const featureLabel = useFeatureLabel();
  return (e: AmenityEntry): string => {
    if (e.kind === "service") return t(`state.${e.state}.${e.code}`);
    const item = featureLabel(e.code);
    if (e.state === "present") return item;
    if (e.state === "absent") return t("state.absentGame", { item: item.toLocaleLowerCase(i18n.language) });
    if (e.state === "temporary") return t("state.temporaryGame", { item: item.toLocaleLowerCase(i18n.language) });
    return t("state.unknownGame", { item });
  };
}

const SERVICE_FALLBACK_ICON: Record<string, IconName> = {
  wc: "ic-toilets",
  shade: "ic-shade",
  fenced: "ic-fence",
  pmr: "ic-pmr",
};

export function amenityIcon(e: AmenityEntry): IconName | undefined {
  if (e.kind === "service") return serviceIcon(e.code) ?? SERVICE_FALLBACK_ICON[e.code];
  return equipmentIcon(e.code);
}

/** Badge for one amenity entry in the variant matching its state. */
export function AmenityBadge({
  entry,
  iconOnly = false,
  size,
}: {
  entry: AmenityEntry;
  iconOnly?: boolean;
  size?: "sm" | "md" | "lg";
}) {
  const label = useAmenityLabel()(entry);
  return <ParkBadge variant={entry.state} label={label} icon={amenityIcon(entry)} iconOnly={iconOnly} size={size} />;
}
