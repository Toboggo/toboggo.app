import { useTranslation } from "react-i18next";
import { Icon, equipmentIcon, serviceIcon, type IconName } from "@toboggo/design-system";
import { useFeatureLabel } from "../lib/featureLabel";
import type { AmenityEntry } from "../lib/parkAmenities";
import styles from "./ParkBadge.module.css";

export type ParkBadgeVariant = "age" | "present" | "absent" | "unknown";

/**
 * Descriptive badge of a park (age, equipment, service). One component, four
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
  suffix,
}: {
  variant: ParkBadgeVariant;
  label: string;
  icon?: IconName;
  /** Icon in a round pill; the label becomes the accessible name. */
  iconOnly?: boolean;
  /** Secondary text after the label (e.g. « Vérifié », only with proof). */
  suffix?: string;
}) {
  const asIcon = iconOnly && icon != null;
  return (
    <span
      className={styles.badge}
      data-variant={variant}
      data-icon-only={asIcon ? "1" : undefined}
      role={asIcon ? "img" : undefined}
      aria-label={asIcon ? label : undefined}
      title={asIcon ? label : undefined}
    >
      {icon && <Icon name={icon} size={asIcon ? 13 : 12} />}
      {!asIcon && label}
      {!asIcon && suffix && <span className={styles.verified}>· {suffix}</span>}
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
export function AmenityBadge({ entry, iconOnly = false }: { entry: AmenityEntry; iconOnly?: boolean }) {
  const { t } = useTranslation("features");
  const label = useAmenityLabel()(entry);
  return (
    <ParkBadge
      variant={entry.state}
      label={label}
      icon={amenityIcon(entry)}
      iconOnly={iconOnly}
      suffix={entry.verified ? t("state.verified") : undefined}
    />
  );
}
