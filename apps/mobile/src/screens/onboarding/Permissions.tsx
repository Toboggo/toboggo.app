import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { createChild } from "@toboggo/shared";
import { useGeo, requestBrowserLocation, DEFAULT_GEO_LABEL } from "../../lib/geo";
import { useSession } from "../../lib/session";
import { ChildBirthFields } from "../../components/ChildBirthFields";
import { ChevronRight, PinIcon } from "./authIcons";
import styles from "./Permissions.module.css";

export default function Permissions() {
  const navigate = useNavigate();
  const { t } = useTranslation("onboarding");
  const [birthMonth, setBirthMonth] = useState<number | null>(null);
  const [birthYear, setBirthYear] = useState<number | null>(null);
  const [showPermModal, setShowPermModal] = useState(false);
  const [zone, setZone] = useState<string | null>(null);
  const setLocation = useGeo((s) => s.setLocation);
  const setPermission = useGeo((s) => s.setPermission);
  const userId = useSession((s) => s.userId);

  // Adding a child here is optional — skipping ("later") or continuing
  // without filling the fields both just leave it for the "Mes enfants"
  // screen later. Never blocks onboarding: a failed insert is silent here.
  function finish() {
    if (userId && birthMonth != null && birthYear != null) {
      void createChild(userId, { birth_month: birthMonth, birth_year: birthYear });
    }
    navigate("/map");
  }

  async function grantLocation() {
    setShowPermModal(false);
    try {
      const pos = await requestBrowserLocation();
      setLocation(pos.lat, pos.lng, DEFAULT_GEO_LABEL);
      setPermission("granted");
      setZone(t("permissions.zoneActive"));
    } catch {
      setPermission("denied");
    }
    finish();
  }

  return (
    <div className={styles.wrap}>
      <div className={styles.body}>
        <div className={styles.head}>
          <h1>{t("permissions.title")}</h1>
          <p>{t("permissions.subtitle")}</p>
        </div>

        <div>
          <h6 className={styles.kicker}>{t("permissions.ageKicker")}</h6>
          <ChildBirthFields
            birthMonth={birthMonth}
            birthYear={birthYear}
            onChangeMonth={setBirthMonth}
            onChangeYear={setBirthYear}
            monthLabel={t("permissions.birthMonth")}
            yearLabel={t("permissions.birthYear")}
            monthPlaceholder={t("permissions.selectMonth")}
            yearPlaceholder={t("permissions.selectYear")}
          />
          <p className={styles.hint}>{t("permissions.noExactDob")}</p>
        </div>

        <div>
          <h6 className={styles.kicker}>{t("permissions.zoneKicker")}</h6>
          <button type="button" className={styles.zone} data-active={zone ? "1" : undefined} onClick={() => setShowPermModal(true)}>
            <span className={styles.zoneTile}>
              <PinIcon />
            </span>
            <span className={styles.zoneBody}>
              <span className={styles.zoneTitle}>{t("permissions.zoneTitle")}</span>
              <span className={styles.zoneSub}>{zone ?? t("permissions.zoneHint")}</span>
            </span>
            <ChevronRight />
          </button>
        </div>
      </div>

      <button type="button" className={styles.cta} onClick={finish}>
        {t("permissions.continue")}
      </button>
      <p className={styles.later}>
        <span onClick={finish}>{t("permissions.later")}</span>
      </p>

      {showPermModal && (
        <div className={styles.modalOverlay}>
          <div className={styles.iosAlert}>
            <div className={styles.iosBody}>
              <div className={styles.iosTitle} style={{ whiteSpace: "pre-line" }}>
                {t("permissions.iosTitle")}
              </div>
              <p>{t("permissions.iosBody")}</p>
            </div>
            <div className={styles.iosActions}>
              <button type="button" className={styles.iosAllow} onClick={grantLocation}>
                {t("permissions.iosAllow")}
              </button>
              <button
                type="button"
                className={styles.iosDeny}
                onClick={() => (setShowPermModal(false), setPermission("denied"))}
              >
                {t("permissions.iosDeny")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
