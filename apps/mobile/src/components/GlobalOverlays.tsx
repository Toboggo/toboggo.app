import { useNavigate } from "react-router-dom";
import { Toast } from "@toboggo/design-system";
import { useToastStore } from "../lib/toast";
import { useVisitPrompt } from "../lib/visitPrompt";

export function GlobalOverlays() {
  const navigate = useNavigate();
  const { message, clear } = useToastStore();
  const { visible, parkId, parkName, dismiss } = useVisitPrompt();

  return (
    <>
      <Toast message={message} onDone={clear} />
      {visible && (
        <div
          style={{
            position: "fixed",
            left: "50%",
            bottom: 100,
            transform: "translateX(-50%)",
            background: "var(--color-surface)",
            boxShadow: "var(--shadow-lg)",
            borderRadius: "var(--radius-md)",
            padding: "14px 16px",
            width: "88%",
            maxWidth: 420,
            zIndex: 300,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 12,
          }}
        >
          <span style={{ fontSize: 13.5 }}>Vous étiez peut-être à {parkName} ? Donnez votre avis.</span>
          <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
            <button
              onClick={dismiss}
              style={{ background: "none", border: "none", color: "var(--color-text-muted)", fontSize: 13, cursor: "pointer" }}
            >
              Plus tard
            </button>
            <button
              onClick={() => {
                dismiss();
                navigate(`/rate?park=${parkId}`);
              }}
              style={{
                background: "var(--color-primary)",
                color: "white",
                border: "none",
                borderRadius: 999,
                padding: "6px 14px",
                fontFamily: "var(--font-heading)",
                fontWeight: 600,
                fontSize: 13,
                cursor: "pointer",
              }}
            >
              Avis
            </button>
          </div>
        </div>
      )}
    </>
  );
}
