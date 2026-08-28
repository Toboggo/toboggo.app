import { useNavigate } from "react-router-dom";
import { IconButton, StepDots } from "@toboggo/design-system";

export function WizardHeader({ step, total, onBack }: { step: number; total: number; onBack: () => void }) {
  const navigate = useNavigate();
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "calc(14px + var(--safe-top)) 16px 14px" }}>
      <IconButton aria-label="Retour" onClick={onBack}>
        ←
      </IconButton>
      <div style={{ flex: 1 }}>
        <StepDots total={total} current={step} />
      </div>
      <IconButton aria-label="Fermer" onClick={() => navigate("/map")}>
        ✕
      </IconButton>
    </div>
  );
}
