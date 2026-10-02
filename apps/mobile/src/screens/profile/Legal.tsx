import { useLocation, useNavigate, useParams } from "react-router-dom";
import { LEGAL_DOCS } from "./legalContent";
import { SettingsPage, SettingsCard, kit } from "./SettingsKit";

export default function Legal() {
  const { doc } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const content = LEGAL_DOCS[doc ?? "terms"];
  if (!content) return null;

  // `key === "default"` = première entrée de l'historique (ouverture directe
  // du document, lien profond, rechargement) : aucune page précédente dans
  // l'app. Sinon on dépile l'historique (comme le geste de retour natif) :
  // un `navigate("/legal")` EMPILERAIT une entrée de plus, et le retour natif
  // suivant rouvrirait le document.
  function onBack() {
    if (location.key !== "default") navigate(-1);
    else navigate("/legal", { replace: true });
  }

  return (
    <SettingsPage title={content.title} onBack={onBack}>
      <SettingsCard>
        <div className={kit.doc}>
          {content.sections.map((s) => (
            <div key={s.heading} className={kit.docSection}>
              <h2>{s.heading}</h2>
              <p>{s.body}</p>
            </div>
          ))}
        </div>
      </SettingsCard>
    </SettingsPage>
  );
}
