import type { ReactNode } from "react";
import { BottomSheet, Button, Icon } from "@toboggo/design-system";

export interface ContributionSuccessCta {
  label: string;
  onPress: () => void;
}

/**
 * End-of-contribution confirmation shared by every contribution wizard
 * (AddPark, RatePark, AddPhotos, EditInfo, ReportProblem) — a real BottomSheet
 * (not a full-screen route) so the finished wizard never lingers behind it as
 * an interactive-looking form. Wording, CTAs and targets are entirely up to
 * the caller; this component only owns the shared shell and visual motif.
 */
export function ContributionSuccessSheet({
  open,
  title,
  body,
  primaryCta,
  secondaryCta,
  onDismiss,
}: {
  open: boolean;
  title: ReactNode;
  body: ReactNode;
  primaryCta: ContributionSuccessCta;
  secondaryCta: ContributionSuccessCta;
  onDismiss: () => void;
}) {
  return (
    <BottomSheet open={open} onClose={onDismiss} snapPoints={["fit"]} initialSnap={0} showBackdrop>
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
        <h2 style={{ fontSize: 18, marginTop: 12, marginBottom: 0 }}>{title}</h2>
        <p style={{ color: "var(--color-text-muted)", fontSize: 13, marginTop: 8, marginBottom: 0, maxWidth: 280 }}>
          {body}
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: 10, width: "100%", marginTop: 22 }}>
          <Button block onClick={primaryCta.onPress}>
            {primaryCta.label}
          </Button>
          <Button variant="secondary" block onClick={secondaryCta.onPress}>
            {secondaryCta.label}
          </Button>
        </div>
      </div>
    </BottomSheet>
  );
}
