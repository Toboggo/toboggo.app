import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getMyAppFeedback, saveAppFeedback, type AppFeedback as AppFeedbackRow } from "@toboggo/shared";
import { Button, Icon, Input, StarInput, Textarea } from "@toboggo/design-system";
import { TopBar } from "../../components/TopBar";
import { useSession } from "../../lib/session";
import styles from "./AppFeedback.module.css";

const TITLE_MAX = 100;
const BODY_MAX = 2000;

/**
 * « Évaluer Toboggo » — note de 1 à 5 (jamais présélectionnée), titre et avis
 * écrit. Un seul avis par utilisateur connecté, modifiable (upsert). Privé :
 * lisible par son auteur et les admins Toboggo uniquement (RLS, 0039).
 */
export default function AppFeedback() {
  const { t } = useTranslation("profile");
  const navigate = useNavigate();
  const userId = useSession((s) => s.userId);

  const { data: existing, isLoading, isError } = useQuery({
    queryKey: ["app-feedback", userId],
    queryFn: () => getMyAppFeedback(userId!),
    enabled: !!userId,
  });

  if (!userId) {
    return (
      <div className="screen">
        <TopBar title={t("appFeedback.title")} />
        <div className={styles.wrap}>
          <p className={styles.intro}>{t("appFeedback.signInPrompt")}</p>
          <Button block onClick={() => navigate("/login-method")}>
            {t("action.signIn", { ns: "common" })}
          </Button>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="screen">
        <TopBar title={t("appFeedback.title")} />
      </div>
    );
  }

  // The form below starts empty on a load error: submitting would then upsert
  // over the existing evaluation, which is the intended "edit" behaviour.
  return <FeedbackForm userId={userId} existing={existing ?? null} loadFailed={isError} />;
}

function FeedbackForm({
  userId,
  existing,
  loadFailed,
}: {
  userId: string;
  existing: AppFeedbackRow | null;
  loadFailed: boolean;
}) {
  const { t } = useTranslation("profile");
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [rating, setRating] = useState(existing?.rating ?? 0);
  const [title, setTitle] = useState(existing?.title ?? "");
  const [body, setBody] = useState(existing?.body ?? "");
  const [sending, setSending] = useState(false);
  const [failed, setFailed] = useState(false);
  const [sent, setSent] = useState<number | null>(null);

  const canSend = rating >= 1 && title.trim().length > 0 && body.trim().length > 0 && !sending;

  async function submit() {
    setSending(true);
    setFailed(false);
    try {
      const saved = await saveAppFeedback(userId, { rating, title, body });
      queryClient.setQueryData(["app-feedback", userId], saved);
      setSent(saved.rating);
    } catch {
      // Generic message only — never surface the raw database error.
      setFailed(true);
    } finally {
      setSending(false);
    }
  }

  if (sent != null) {
    return (
      <div className="screen">
        <div className={styles.done} role="status">
          <span className={styles.doneStars} aria-hidden>
            {Array.from({ length: sent }, (_, i) => (
              <Icon key={i} name="ic-star" size={26} />
            ))}
          </span>
          <h1 className={styles.doneTitle}>{t("appFeedback.sentTitle")}</h1>
          <p className={styles.doneBody}>{t("appFeedback.sentBody")}</p>
          <Button block onClick={() => navigate("/profile", { replace: true })}>
            {t("appFeedback.backToProfile")}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="screen">
      <TopBar title={t("appFeedback.title")} />
      <form
        className={styles.wrap}
        onSubmit={(e) => {
          e.preventDefault();
          if (canSend) void submit();
        }}
      >
        <p className={styles.intro}>{t(existing ? "appFeedback.introEdit" : "appFeedback.intro")}</p>
        {loadFailed && (
          <p role="alert" className={styles.error}>
            {t("appFeedback.loadError")}
          </p>
        )}
        <div className={styles.ratingBlock}>
          <span className={styles.label}>{t("appFeedback.ratingLabel")}</span>
          <StarInput value={rating} onChange={setRating} starLabel={(n) => t("appFeedback.starLabel", { count: n })} />
        </div>
        <Input
          className={styles.field}
          label={t("appFeedback.titleLabel")}
          placeholder={t("appFeedback.titlePlaceholder")}
          value={title}
          maxLength={TITLE_MAX}
          onChange={(e) => setTitle(e.target.value)}
        />
        <Textarea
          className={styles.field}
          label={t("appFeedback.bodyLabel")}
          placeholder={t("appFeedback.bodyPlaceholder")}
          value={body}
          maxLength={BODY_MAX}
          rows={6}
          onChange={(e) => setBody(e.target.value)}
        />
        {failed && (
          <p role="alert" className={styles.error}>
            {t("appFeedback.error")}
          </p>
        )}
        <Button type="submit" block disabled={!canSend} loading={sending}>
          {t(existing ? "appFeedback.update" : "appFeedback.send")}
        </Button>
      </form>
    </div>
  );
}
