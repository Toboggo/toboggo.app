import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Button } from "@toboggo/design-system";
import { computeChildAge } from "@toboggo/shared";
import { TopBar } from "../../components/TopBar";
import { useChildren } from "../../lib/children";
import { useFormat } from "../../i18n/useFormat";
import styles from "./Children.module.css";

export default function Children() {
  const navigate = useNavigate();
  const { t } = useTranslation("profile");
  const f = useFormat();
  const { data: children = [], isLoading } = useChildren();

  return (
    <div className="screen">
      <TopBar title={t("children.title")} />
      <div style={{ padding: "0 20px" }}>
        {!isLoading && children.length === 0 && <p className={styles.empty}>{t("children.emptyBody")}</p>}

        {children.length > 0 && (
          <div className={styles.group}>
            {children.map((c, i) => {
              const age = computeChildAge(c);
              return (
                <div key={c.id} className={styles.row}>
                  <div>
                    <div className={styles.name}>{t("children.childLabel", { index: i + 1 })}</div>
                    <div className={styles.age}>{age != null ? f.ageRange(age, age) : t("children.ageUnknown")}</div>
                  </div>
                  <button type="button" className={styles.edit} onClick={() => navigate(`/profile/children/${c.id}`)}>
                    {t("edit")}
                  </button>
                </div>
              );
            })}
          </div>
        )}

        <Button block variant={children.length > 0 ? "secondary" : "primary"} onClick={() => navigate("/profile/children/new")}>
          {t("children.add")}
        </Button>
      </div>
    </div>
  );
}
