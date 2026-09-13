import { useTranslation } from "react-i18next";
import { BottomSheet, Button, Icon } from "@toboggo/design-system";

/**
 * End-of-contribution confirmation for the "Ajouter un parc" flow — a real
 * BottomSheet (not a full-screen route) so the finished wizard never lingers
 * behind it as an interactive-looking form. Prototype scoped to AddPark only
 * (see CLAUDE.md / Phase 2 spec) — not yet promoted to `packages/design-system`.
 */
export function ContributionSuccessSheet({
  open,
  onSeePark,
  onBackToMap,
}: {
  open: boolean;
  onSeePark: () => void;
  onBackToMap: () => void;
}) {
  const { t } = useTranslation("contribute");

  return (
    <BottomSheet open={open} onClose={onBackToMap} snapPoints={["fit"]} initialSnap={0} showBackdrop>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", padding: "4px 20px 8px" }}>
        <div
          style={{
            width: 64,
            height: 64,
            borderRadius: "50%",
            background: "var(--color-primary-tint)",
            color: "var(--color-primary)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Icon name="ic-check" size={30} />
        </div>
        <h2 style={{ fontSize: 18, marginTop: 12, marginBottom: 0 }}>{t("addPark.success.title")}</h2>
        <p style={{ color: "var(--color-text-muted)", fontSize: 13, marginTop: 8, marginBottom: 0, maxWidth: 280 }}>
          {t("addPark.success.body")}
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: 10, width: "100%", marginTop: 22 }}>
          <Button block onClick={onSeePark}>
            {t("common.seePark")}
          </Button>
          <Button variant="secondary" block onClick={onBackToMap}>
            {t("addPark.success.backToMap")}
          </Button>
        </div>
      </div>
    </BottomSheet>
  );
}
