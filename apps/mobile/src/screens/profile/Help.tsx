import { useNavigate } from "react-router-dom";
import { Button } from "@toboggo/design-system";
import { TopBar } from "../../components/TopBar";

const FAQ = [
  {
    q: "Comment fonctionne la géolocalisation ?",
    a: "Toboggo utilise votre position pour afficher les parcs les plus proches, triés par distance. Vous pouvez aussi chercher une ville manuellement.",
  },
  {
    q: "Que signifient les filtres (WC, ombre, tranche d'âge) ?",
    a: "Ces informations sont fournies par la communauté ou les collectivités partenaires, et vérifiées avant publication.",
  },
  {
    q: "Comment ajouter un parc ?",
    a: "Depuis l'onglet Ajouter, indiquez le nom, l'adresse et les équipements présents. Votre ajout est vérifié par notre équipe avant d'apparaître sur la carte.",
  },
  {
    q: "Comment signaler un problème ?",
    a: "Utilisez le bouton « Signaler un problème » sur la fiche du parc. Notre équipe ou la collectivité concernée met à jour l'information.",
  },
  {
    q: "Je suis une collectivité, comment gérer mes parcs ?",
    a: "Les collectivités partenaires disposent d'un back-office dédié. Contactez-nous pour l'activer.",
  },
];

export default function Help() {
  const navigate = useNavigate();
  return (
    <div className="screen">
      <TopBar title="Aide" />
      <div style={{ padding: "0 20px" }}>
        {FAQ.map((item) => (
          <details key={item.q} style={{ padding: "12px 0", borderBottom: "1px solid var(--color-border)" }}>
            <summary style={{ fontFamily: "var(--font-heading)", fontWeight: 600, fontSize: 14.5, cursor: "pointer" }}>{item.q}</summary>
            <p style={{ fontSize: 13.5, color: "var(--color-text-muted)", marginTop: 8 }}>{item.a}</p>
          </details>
        ))}
        <Button block style={{ marginTop: 24 }} onClick={() => navigate("/contact")}>
          Contacter le support
        </Button>
      </div>
    </div>
  );
}
