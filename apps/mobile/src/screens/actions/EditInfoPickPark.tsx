import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { DetailHeader } from "../../components/DetailHeader";
import { ParkPicker } from "../../components/ParkPicker";

/**
 * `EditInfo` requires a `?park=` in context (it has no picker step of its
 * own, unlike RatePark/ReportProblem/AddPhotos). Reached from the
 * Contributions hub's "Modifier les informations" quick action, which has no
 * park in context — this screen is just the existing `ParkPicker`, then a
 * redirect into `/contribute/edit?park=`. No new selection logic.
 */
export default function EditInfoPickPark() {
  const navigate = useNavigate();
  const { t } = useTranslation("contribute");

  return (
    <div className="screen">
      <DetailHeader title={t("edit.pickParkTitle")} onBack={() => navigate("/contributions")} />
      <ParkPicker
        onPick={(park) => navigate(`/contribute/edit?park=${park.id}`, { replace: true })}
        onNone={() => navigate("/action-intro/add")}
      />
    </div>
  );
}
