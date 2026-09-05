import { useNavigate } from "react-router-dom";
import { Icon, IconButton, StepDots } from "@toboggo/design-system";
import { Stepper } from "./Stepper";

export function WizardHeader({
  step,
  total,
  onBack,
  onClose,
  steps,
}: {
  step: number;
  total: number;
  onBack: () => void;
  /** Defaults to navigating home. Pass a handler to clean up (e.g. drop a draft). */
  onClose?: () => void;
  /**
   * Per-step labels for the explicit, labelled progression (check/number/line).
   * Omit to keep the plain dots — existing wizards that don't pass this are
   * unaffected.
   */
  steps?: string[];
}) {
  const navigate = useNavigate();
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "calc(14px + var(--safe-top)) 16px 14px" }}>
      <IconButton aria-label="Retour" onClick={onBack}>
        <Icon name="ic-back" size={18} />
      </IconButton>
      <div style={{ flex: 1 }}>
        {steps ? <Stepper steps={steps} current={step} /> : <StepDots total={total} current={step} />}
      </div>
      <IconButton aria-label="Fermer" onClick={() => (onClose ? onClose() : navigate("/map"))}>
        <Icon name="ic-close" size={18} />
      </IconButton>
    </div>
  );
}
