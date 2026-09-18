import { useTranslation } from "react-i18next";
import { BottomSheet } from "@toboggo/design-system";
import { getAvailableMapProviders, type MapProvider } from "@toboggo/shared";
import styles from "./QuickMenu.module.css";

// Pas de pictogramme "Plans"/"Google Maps"/"Waze" validé dans le sprite
// (marques tierces) — emoji conservé, comme QuickMenu/ContributeSheet.
const PROVIDER_ICON: Record<MapProvider, string> = {
  apple: "🧭",
  google: "🗺️",
  waze: "🚗",
};

export function DirectionsSheet({
  open,
  onClose,
  onChoose,
}: {
  open: boolean;
  onClose: () => void;
  onChoose: (provider: MapProvider) => void;
}) {
  const { t } = useTranslation("detail");
  const providers = getAvailableMapProviders();

  return (
    <BottomSheet open={open} onClose={onClose} snapPoints={["fit"]} initialSnap={0} showBackdrop>
      <div className={styles.menu}>
        <div style={{ fontSize: 12.5, fontWeight: 600, color: "var(--color-text-muted)", padding: "2px 6px 10px" }}>
          {t("directionsSheet.title")}
        </div>
        {providers.map((provider) => (
          <button key={provider} type="button" className={styles.item} onClick={() => onChoose(provider)}>
            <span className={styles.icon}>{PROVIDER_ICON[provider]}</span>
            {t(`directionsSheet.${provider}`)}
          </button>
        ))}
        <button
          type="button"
          className={styles.item}
          onClick={onClose}
          style={{ color: "var(--color-text-muted)", borderBottom: "none" }}
        >
          {t("action.cancel", { ns: "common" })}
        </button>
      </div>
    </BottomSheet>
  );
}
