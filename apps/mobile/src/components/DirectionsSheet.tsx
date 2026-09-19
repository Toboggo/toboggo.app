import { useTranslation } from "react-i18next";
import { BottomSheet, Button } from "@toboggo/design-system";
import { getAvailableMapProviders, type MapProvider } from "@toboggo/shared";
import styles from "./DirectionsSheet.module.css";

// Vrai logo par provider (voir public/logos/README.md pour la provenance /
// les droits) — pas d'icône Toboggo générique partagée : c'est justement ce
// qui distingue les 3 choix pour l'utilisateur.
const PROVIDER_LOGO: Record<MapProvider, string> = {
  apple: "/logos/apple.svg",
  google: "/logos/google.svg",
  waze: "/logos/waze.svg",
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
      <div className={styles.sheet}>
        <div className={styles.header}>
          <div className={styles.title}>{t("directionsSheet.title")}</div>
          <div className={styles.subtitle}>{t("directionsSheet.subtitle")}</div>
        </div>

        <div className={styles.list}>
          {providers.map((provider) => (
            <button key={provider} type="button" className={styles.row} onClick={() => onChoose(provider)}>
              <span className={styles.rowIcon}>
                <img src={PROVIDER_LOGO[provider]} alt="" width={20} height={20} />
              </span>
              <span className={styles.rowLabel}>{t(`directionsSheet.${provider}`)}</span>
              <svg
                className={styles.chevron}
                width="15"
                height="15"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.4"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden
              >
                <path d="M9 6l6 6-6 6" />
              </svg>
            </button>
          ))}
        </div>

        <Button type="button" variant="secondary" block onClick={onClose}>
          {t("action.cancel", { ns: "common" })}
        </Button>
      </div>
    </BottomSheet>
  );
}
