import { useNavigate } from "react-router-dom";
import { Toast } from "@toboggo/design-system";
import { useToastStore } from "../lib/toast";
import { useVisitPrompt } from "../lib/visitPrompt";
import { VisitRatingPrompt } from "./VisitRatingPrompt";

export function GlobalOverlays() {
  const navigate = useNavigate();
  const { message, clear } = useToastStore();
  const { visible, parkId, dismiss } = useVisitPrompt();

  return (
    <>
      <Toast message={message} onDone={clear} />
      <VisitRatingPrompt
        open={visible}
        onClose={dismiss}
        onRate={(stars) => {
          dismiss();
          if (parkId) navigate(`/rate?park=${encodeURIComponent(parkId)}&stars=${stars}&source=visit_prompt`);
        }}
      />
    </>
  );
}
