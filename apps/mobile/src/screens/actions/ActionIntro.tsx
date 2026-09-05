import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { Button, Icon, StepDots, type IconName } from "@toboggo/design-system";
import { IconButton } from "@toboggo/design-system";

const CONTENT: Record<
  string,
  { iconName: IconName; title: string; subtitle: string; steps: string[]; to: string }
> = {
  add: {
    iconName: "ic-plus",
    title: "Ajouter un parc",
    subtitle: "Aidez d'autres familles en référençant un nouveau parc.",
    steps: ["Localisez le parc sur la carte", "Renseignez ses équipements", "Ajoutez une photo (facultatif)"],
    to: "/add",
  },
  rate: {
    iconName: "ic-review",
    title: "Donner mon avis",
    subtitle: "Votre avis aide d'autres parents à choisir le bon parc.",
    steps: ["Notez le parc de 1 à 5 étoiles", "Évaluez propreté, sécurité, équipements", "Ajoutez un commentaire"],
    to: "/rate",
  },
  report: {
    iconName: "ic-flag",
    title: "Signaler un problème",
    subtitle: "Prévenez la communauté et notre équipe d'un souci sur ce parc.",
    steps: ["Choisissez le type de problème", "Décrivez la situation", "Ajoutez une photo si possible"],
    to: "/report",
  },
};

export default function ActionIntro() {
  const { type } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const content = CONTENT[type ?? "add"];
  if (!content) return null;

  // Keep the park context (if any) when entering the flow, so the sub-flow
  // doesn't ask the user to pick the park again.
  const parkId = params.get("park");
  const target = parkId ? `${content.to}?park=${parkId}` : content.to;

  return (
    <div className="screen" style={{ display: "flex", flexDirection: "column" }}>
      <div style={{ padding: "calc(14px + var(--safe-top)) 16px" }}>
        <IconButton aria-label="Fermer" onClick={() => navigate(-1)}>
          <Icon name="ic-close" size={18} />
        </IconButton>
      </div>
      <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 32, textAlign: "center" }}>
        <div
          style={{
            width: 76,
            height: 76,
            marginBottom: 16,
            borderRadius: "50%",
            background: "var(--color-primary-tint)",
            color: "var(--color-primary)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Icon name={content.iconName} size={36} />
        </div>
        <h1 style={{ fontSize: 22 }}>{content.title}</h1>
        <p style={{ color: "var(--color-text-muted)", fontSize: 14, marginTop: 8, maxWidth: 280 }}>{content.subtitle}</p>

        <div style={{ marginTop: 28, textAlign: "left", width: "100%", maxWidth: 320 }}>
          {content.steps.map((s, i) => (
            <div key={s} style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 14 }}>
              <span
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: "50%",
                  background: "var(--color-primary-tint)",
                  color: "var(--color-primary-hover)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontFamily: "var(--font-heading)",
                  fontWeight: 700,
                  fontSize: 13,
                  flexShrink: 0,
                }}
              >
                {i + 1}
              </span>
              <span style={{ fontSize: 14 }}>{s}</span>
            </div>
          ))}
        </div>
        <StepDots total={3} current={0} />
      </div>
      <div style={{ padding: 24 }}>
        <Button block onClick={() => navigate(target)}>
          Commencer
        </Button>
      </div>
    </div>
  );
}
