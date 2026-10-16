import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { MAP_CREDIT, MAP_PROVIDER_LINKS, OSM_COPYRIGHT_URL, OSM_CREDIT, ODBL_URL } from "../../lib/dataAttribution";
import { SettingsCard, SettingsPage, kit } from "./SettingsKit";
import styles from "./DataSources.module.css";

/**
 * « Sources des données » — attribution des données de parcs issues
 * d'OpenStreetMap (© OpenStreetMap contributors, licence ODbL), distincte de
 * l'attribution du fond de carte (affichée sur la carte elle-même).
 * Attribution seulement : ne prétend pas régler les autres obligations de la
 * licence (voir `lib/dataAttribution.ts`).
 */
export default function DataSources() {
  const navigate = useNavigate();
  const { t } = useTranslation("profile");

  return (
    <SettingsPage title={t("dataSources.title")} onBack={() => navigate(-1)}>
      <SettingsCard>
        <div className={kit.doc}>
          <p style={{ margin: "0 0 18px", fontSize: 13.5, lineHeight: 1.6, color: "var(--color-text-muted)" }}>{t("dataSources.intro")}</p>

          <section className={kit.docSection} aria-labelledby="ds-parks">
            <h2 id="ds-parks">{t("dataSources.parks.heading")}</h2>
            <p>{t("dataSources.parks.body")}</p>
            <p className={styles.credit}>{OSM_CREDIT}</p>
            <ul className={styles.links}>
              <li>
                <a className={styles.link} href={OSM_COPYRIGHT_URL} target="_blank" rel="noopener noreferrer">
                  {t("dataSources.parks.copyright")}
                </a>
              </li>
              <li>
                <a className={styles.link} href={ODBL_URL} target="_blank" rel="noopener noreferrer">
                  {t("dataSources.parks.license")}
                </a>
              </li>
            </ul>
          </section>

          <section className={kit.docSection} aria-labelledby="ds-map">
            <h2 id="ds-map">{t("dataSources.map.heading")}</h2>
            <p>{t("dataSources.map.body")}</p>
            <p className={styles.credit}>{MAP_CREDIT}</p>
            <ul className={styles.links}>
              {MAP_PROVIDER_LINKS.map((l) => (
                <li key={l.href}>
                  <a className={styles.link} href={l.href} target="_blank" rel="noopener noreferrer">
                    {l.label}
                  </a>
                </li>
              ))}
              <li>
                <a className={styles.link} href={OSM_COPYRIGHT_URL} target="_blank" rel="noopener noreferrer">
                  OpenStreetMap
                </a>
              </li>
            </ul>
          </section>
        </div>
      </SettingsCard>
    </SettingsPage>
  );
}
