import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { NavRow, SettingsPage, SettingsSection } from "./SettingsKit";

/**
 * Index léger des documents légaux (politique de confidentialité, CGU,
 * mentions légales). Remplace l'ancien Privacy.tsx : ses toggles (partage
 * de position, profil public) et son export de données n'avaient aucun
 * effet réel — aucun consommateur trouvé nulle part dans le code — et sont
 * retirés de l'UI plutôt que déplacés ailleurs (refonte profil/réglages).
 * La suppression de compte, elle bien réelle, vit désormais dans la
 * section Compte du Profil (mêmes protections/RPC, inchangés).
 */
export default function LegalIndex() {
  const navigate = useNavigate();
  const { t } = useTranslation("profile");

  const docs: { labelKey: string; doc: string }[] = [
    { labelKey: "privacyScreen.privacyPolicy", doc: "privacy" },
    { labelKey: "privacyScreen.terms", doc: "terms" },
    { labelKey: "privacyScreen.legalNotice", doc: "mentions" },
  ];

  return (
    <SettingsPage title={t("privacyScreen.title")}>
      <SettingsSection>
        {docs.map((d) => (
          <NavRow key={d.doc} label={t(d.labelKey)} onClick={() => navigate(`/legal/${d.doc}`)} />
        ))}
      </SettingsSection>
    </SettingsPage>
  );
}
