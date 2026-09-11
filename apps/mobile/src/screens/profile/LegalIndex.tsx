import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { TopBar } from "../../components/TopBar";
import styles from "./Profile.module.css";

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
    <div className="screen">
      <TopBar title={t("privacyScreen.title")} />
      <div style={{ padding: "0 20px" }}>
        <div className={styles.group}>
          {docs.map((d) => (
            <button
              key={d.doc}
              type="button"
              className={styles.groupRow}
              onClick={() => navigate(`/legal/${d.doc}`)}
            >
              <span>{t(d.labelKey)}</span>
              <Chevron />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function Chevron() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ color: "var(--color-text-faint)" }} aria-hidden>
      <path d="M9 6l6 6-6 6" />
    </svg>
  );
}
