import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Icon } from "@toboggo/design-system";
import { TopBar } from "../../components/TopBar";
import { useToastStore } from "../../lib/toast";
import styles from "../onboarding/Onboarding.module.css";

export default function MoreActions() {
  const navigate = useNavigate();
  const showToast = useToastStore((s) => s.show);
  const { t } = useTranslation("contribute");
  const { t: tCommon } = useTranslation("common");

  return (
    <div className="screen">
      <TopBar title={t("menu.more")} />
      <div style={{ padding: "0 24px" }}>
        <button className={styles.methodRow} onClick={() => navigate("/photo-add")}>
          <span className="icon">📷</span>
          {t("menu.addPhoto")}
        </button>
        <button className={styles.methodRow} onClick={() => showToast(tCommon("comingSoon"))}>
          <span className="icon"><Icon name="ic-question" size={18} /></span>
          {t("menu.ask")}
        </button>
      </div>
    </div>
  );
}
