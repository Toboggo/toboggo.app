import { useNavigate } from "react-router-dom";
import { TopBar } from "../../components/TopBar";
import { useToastStore } from "../../lib/toast";
import styles from "../onboarding/Onboarding.module.css";

export default function MoreActions() {
  const navigate = useNavigate();
  const showToast = useToastStore((s) => s.show);

  return (
    <div className="screen">
      <TopBar title="Plus d'actions" />
      <div style={{ padding: "0 24px" }}>
        <button className={styles.methodRow} onClick={() => navigate("/photo-add")}>
          <span className="icon">📷</span>
          Ajouter une photo
        </button>
        <button className={styles.methodRow} onClick={() => showToast("Bientôt disponible")}>
          <span className="icon">💬</span>
          Poser une question
        </button>
      </div>
    </div>
  );
}
