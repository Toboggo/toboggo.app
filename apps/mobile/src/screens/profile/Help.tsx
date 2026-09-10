import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Button } from "@toboggo/design-system";
import { TopBar } from "../../components/TopBar";

const FAQ_KEYS = ["geoloc", "filters", "addPark", "report", "municipality"] as const;

export default function Help() {
  const navigate = useNavigate();
  const { t } = useTranslation("profile");
  return (
    <div className="screen">
      <TopBar title={t("helpScreen.title")} />
      <div style={{ padding: "0 20px" }}>
        {FAQ_KEYS.map((key) => (
          <details key={key} style={{ padding: "12px 0", borderBottom: "1px solid var(--color-border)" }}>
            <summary style={{ fontFamily: "var(--font-heading)", fontWeight: 600, fontSize: 14.5, cursor: "pointer" }}>
              {t(`helpScreen.faq.${key}.q`)}
            </summary>
            <p style={{ fontSize: 13.5, color: "var(--color-text-muted)", marginTop: 8 }}>{t(`helpScreen.faq.${key}.a`)}</p>
          </details>
        ))}
        <Button block style={{ marginTop: 24 }} onClick={() => navigate("/contact")}>
          {t("helpScreen.contactSupport")}
        </Button>
      </div>
    </div>
  );
}
