import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Button } from "@toboggo/design-system";
import type { ParkVerification } from "@toboggo/shared";
import { isConfirmationsUnavailable, useVerifyNearby, type VerifyNearbyState } from "../lib/useVerifyNearby";
import { useToastStore } from "../lib/toast";
import { VerifyItem } from "./VerifyItem";
import styles from "./NearbyVerifyCard.module.css";

/** Shared confirm / edit behaviour of one verification (card + « Voir tout » list). */
export function useVerifyActions() {
  const navigate = useNavigate();
  const { t } = useTranslation("contribute");
  const showToast = useToastStore((s) => s.show);
  const verify = useVerifyNearby();

  function confirm(v: ParkVerification) {
    if (!verify.isSignedIn) {
      navigate("/login");
      return;
    }
    verify.confirm.mutate(v, {
      onSuccess: () => {
        showToast(t("hub.verify.thanks"));
      },
      onError: (e) => showToast(t(isConfirmationsUnavailable(e) ? "hub.verify.unavailable" : "hub.verify.error")),
    });
  }
  const edit = (v: ParkVerification) => navigate(`/contribute/edit?park=${v.park.id}`);
  const busyId = verify.confirm.isPending ? `${verify.confirm.variables?.park.id}:${verify.confirm.variables?.feature.id}` : null;
  return { verify, confirm, edit, busyId };
}

/** Body states shared by the hub card and the full list. */
export function VerifyStateMessage({
  state,
  onRetry,
  onLocate,
}: {
  state: Exclude<VerifyNearbyState, "ready">;
  onRetry: () => void;
  onLocate: () => void;
}) {
  const { t } = useTranslation("contribute");
  const { t: tCommon } = useTranslation("common");
  if (state === "locating" || state === "loading") {
    return (
      <p className={styles.message} role="status">
        {t(state === "locating" ? "hub.verify.locating" : "hub.verify.loading")}
      </p>
    );
  }
  if (state === "denied") {
    return (
      <div className={styles.messageBlock}>
        <p className={styles.message}>{t("hub.verify.denied")}</p>
        <Button size="sm" variant="secondary" onClick={onLocate}>
          {t("hub.verify.enableLocation")}
        </Button>
      </div>
    );
  }
  if (state === "unavailable") {
    return <p className={styles.message}>{t("hub.verify.unavailable")}</p>;
  }
  if (state === "error") {
    return (
      <div className={styles.messageBlock}>
        <p className={styles.message}>{t("hub.verify.errorLoading")}</p>
        <Button size="sm" variant="secondary" onClick={onRetry}>
          {tCommon("action.retry")}
        </Button>
      </div>
    );
  }
  return <p className={styles.message}>{t("hub.verify.empty")}</p>;
}

export function NearbyVerifyCard() {
  const navigate = useNavigate();
  const { t } = useTranslation("contribute");
  const { t: tCommon } = useTranslation("common");
  const { verify, confirm, edit, busyId } = useVerifyActions();
  const current = verify.items[0];

  return (
    <section className={styles.card} aria-labelledby="verify-nearby-title">
      <div className={styles.header}>
        <h2 id="verify-nearby-title">{t("hub.verify.title")}</h2>
        {verify.state === "ready" && (
          <button type="button" className={styles.seeAll} onClick={() => navigate("/contributions/verify")}>
            {tCommon("action.seeAll")}
          </button>
        )}
      </div>
      {verify.state !== "ready" ? (
        <VerifyStateMessage state={verify.state} onRetry={verify.retry} onLocate={verify.locate} />
      ) : current ? (
        <VerifyItem
          item={current}
          busy={busyId === `${current.park.id}:${current.feature.id}`}
          onConfirm={() => confirm(current)}
          onEdit={() => edit(current)}
        />
      ) : null}
    </section>
  );
}
