import { useEffect, useRef, useState } from "react";
import { Route, Routes, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AppFeedbackNotEditableError,
  AppFeedbackTooSoonError,
  createAppFeedback,
  listMyAppFeedback,
  nextAppFeedbackAt,
  updateAppFeedback,
  type AppFeedbackEntry as AppFeedbackRow,
} from "@toboggo/shared";
import { Button, Icon, StarRating, StarInput, Textarea } from "@toboggo/design-system";
import { SettingsPage } from "./SettingsKit";
import { useSession } from "../../lib/session";
import { useFormat } from "../../i18n/useFormat";
import styles from "./AppFeedback.module.css";

const BODY_MAX = 2000;
const THANKS_REDIRECT_MS = 2500;

export const appFeedbackKey = (userId: string | null) => ["app-feedback", userId] as const;

/**
 * Avis sur l'application Toboggo (privé : auteur + admins Toboggo, RLS 0039/0044).
 *   /profile/feedback       sans avis → formulaire ; avec avis → lecture + historique
 *   /profile/feedback/edit  modifier le DERNIER avis (date de création conservée)
 *   /profile/feedback/new   nouvel avis, autorisé 30 jours après la création du dernier
 * Le délai est contrôlé côté serveur ; l'écran ne fait que l'afficher.
 */
export default function AppFeedback() {
  return (
    <Routes>
      <Route index element={<FeedbackHome />} />
      <Route path="edit" element={<FeedbackGate mode="edit" />} />
      <Route path="new" element={<FeedbackGate mode="new" />} />
    </Routes>
  );
}

/** Loads the history; renders `children` once available, with loading / error / signed-out states. */
function useHistory() {
  const userId = useSession((s) => s.userId);
  const query = useQuery({
    queryKey: appFeedbackKey(userId),
    queryFn: () => listMyAppFeedback(userId!),
    enabled: !!userId,
  });
  return { userId, ...query };
}

function Shell({ children, backTo }: { children: React.ReactNode; backTo?: () => void }) {
  const { t } = useTranslation("profile");
  return (
    <SettingsPage white title={t("appFeedback.title")} onBack={backTo}>
      {children}
    </SettingsPage>
  );
}

function Gate({ children }: { children: (userId: string, history: AppFeedbackRow[]) => React.ReactNode }) {
  const { t } = useTranslation("profile");
  const navigate = useNavigate();
  const { userId, data, isLoading, isError, refetch, isFetching } = useHistory();

  if (!userId) {
    return (
      <Shell>
        <div className={styles.wrap}>
          <p className={styles.intro}>{t("appFeedback.signInPrompt")}</p>
          <Button block onClick={() => navigate("/login-method")}>
            {t("action.signIn", { ns: "common" })}
          </Button>
        </div>
      </Shell>
    );
  }
  if (isLoading) {
    return (
      <Shell>
        <div className={styles.wrap} role="status" aria-live="polite">
          <p className={styles.intro}>{t("appFeedback.loading")}</p>
        </div>
      </Shell>
    );
  }
  // Never fall back to an empty form on a load error: it could hide an existing
  // history and let the user believe they have not reviewed yet.
  if (isError || !data) {
    return (
      <Shell>
        <div className={styles.wrap}>
          <p role="alert" className={styles.error}>
            {t("appFeedback.loadError")}
          </p>
          <Button block variant="secondary" loading={isFetching} onClick={() => void refetch()}>
            {t("appFeedback.retry")}
          </Button>
        </div>
      </Shell>
    );
  }
  return <>{children(userId, data)}</>;
}

function FeedbackHome() {
  return (
    <Gate>
      {(userId, history) =>
        history.length === 0 ? (
          <FeedbackForm userId={userId} mode="create" history={history} />
        ) : (
          <FeedbackRead history={history} />
        )
      }
    </Gate>
  );
}

function FeedbackGate({ mode }: { mode: "edit" | "new" }) {
  return (
    <Gate>
      {(userId, history) => <FeedbackForm userId={userId} mode={mode === "edit" ? "edit" : "create"} history={history} />}
    </Gate>
  );
}

function Stars({ value }: { value: number }) {
  const { t } = useTranslation("profile");
  return (
    <span className={styles.stars} role="img" aria-label={t("appFeedback.ratingOutOf", { count: value })}>
      <StarRating value={value} showValue={false} />
    </span>
  );
}

function FeedbackRead({ history }: { history: AppFeedbackRow[] }) {
  const { t } = useTranslation("profile");
  const navigate = useNavigate();
  const f = useFormat();
  const [latest, ...previous] = history;
  const nextAt = nextAppFeedbackAt(latest)!;
  const canRenew = Date.now() >= nextAt.getTime();
  const edited = !!latest.edited_at;

  return (
    <Shell>
      <div className={styles.wrap}>
        <section className={styles.card} aria-labelledby="fb-latest">
          <h2 id="fb-latest" className={styles.sectionTitle}>
            {t("appFeedback.latestTitle")}
          </h2>
          <div className={styles.cardHead}>
            <Stars value={latest.rating} />
            <span className={styles.rating}>{t("appFeedback.ratingOutOf", { count: latest.rating })}</span>
          </div>
          <p className={styles.date}>
            {t("appFeedback.givenOn", { date: f.date(latest.created_at) })}
            {edited && ` · ${t("appFeedback.editedOn", { date: f.date(latest.edited_at!) })}`}
          </p>
          {latest.title && <p className={styles.legacyTitle}>{latest.title}</p>}
          {latest.body ? <p className={styles.body}>{latest.body}</p> : <p className={styles.noComment}>{t("appFeedback.noComment")}</p>}
        </section>

        <div className={styles.actions}>
          {canRenew ? (
            <Button block onClick={() => navigate("/profile/feedback/new")}>
              {t("appFeedback.newReview")}
            </Button>
          ) : (
            <p className={styles.cooldown} role="status">
              {t("appFeedback.nextAllowed", { date: f.date(nextAt) })}
            </p>
          )}
          <Button block variant="secondary" onClick={() => navigate("/profile/feedback/edit")}>
            {t("appFeedback.editReview")}
          </Button>
        </div>

        <section aria-labelledby="fb-history">
          <h2 id="fb-history" className={styles.sectionTitle}>
            {t("appFeedback.historyTitle")}
          </h2>
          {previous.length === 0 ? (
            <p className={styles.intro}>{t("appFeedback.historyEmpty")}</p>
          ) : (
            <ul className={styles.history}>
              {previous.map((r) => (
                <li key={r.id} className={styles.historyItem}>
                  <div className={styles.cardHead}>
                    <Stars value={r.rating} />
                    <span className={styles.date}>{f.date(r.created_at)}</span>
                  </div>
                  {r.title && <p className={styles.legacyTitle}>{r.title}</p>}
                  {r.body && <p className={styles.body}>{r.body}</p>}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </Shell>
  );
}

function FeedbackForm({
  userId,
  mode,
  history,
}: {
  userId: string;
  mode: "create" | "edit";
  history: AppFeedbackRow[];
}) {
  const { t } = useTranslation("profile");
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const f = useFormat();
  const latest = history[0] ?? null;
  const editing = mode === "edit" ? latest : null;
  const nextAt = nextAppFeedbackAt(latest);
  const blocked = mode === "create" && nextAt != null && Date.now() < nextAt.getTime();

  const [rating, setRating] = useState(editing?.rating ?? 0);
  const [body, setBody] = useState(editing?.body ?? "");
  const [sending, setSending] = useState(false);
  const [failure, setFailure] = useState<null | "generic" | "tooSoon" | "notEditable">(null);
  const [tooSoonAt, setTooSoonAt] = useState<Date | null>(null);
  const [thanks, setThanks] = useState(false);
  const inFlight = useRef(false); // double-tap guard, effective before React re-renders
  const saved = useRef(false);

  // The history is refreshed only when leaving: refetching it earlier would
  // swap this form for the read screen and cut the thank-you short.
  useEffect(
    () => () => {
      if (saved.current) void queryClient.invalidateQueries({ queryKey: appFeedbackKey(userId) });
    },
    [queryClient, userId],
  );

  useEffect(() => {
    if (!thanks) return;
    const id = window.setTimeout(() => navigate("/profile", { replace: true }), THANKS_REDIRECT_MS);
    return () => window.clearTimeout(id);
  }, [thanks, navigate]);

  const canSend = rating >= 1 && !sending && !blocked;

  async function submit() {
    if (inFlight.current || !canSend) return;
    inFlight.current = true;
    setSending(true);
    setFailure(null);
    try {
      if (editing) await updateAppFeedback(userId, editing.id, { rating, body });
      else await createAppFeedback(userId, { rating, body });
      saved.current = true;
      setThanks(true);
    } catch (e) {
      // Generic messages only — never surface the raw database error.
      if (e instanceof AppFeedbackTooSoonError) {
        setTooSoonAt(e.nextAt ?? nextAt);
        setFailure("tooSoon");
        void queryClient.invalidateQueries({ queryKey: appFeedbackKey(userId) });
      } else if (e instanceof AppFeedbackNotEditableError) {
        setFailure("notEditable");
        void queryClient.invalidateQueries({ queryKey: appFeedbackKey(userId) });
      } else {
        setFailure("generic");
      }
    } finally {
      inFlight.current = false;
      setSending(false);
    }
  }

  if (thanks) {
    return (
      <div className={`screen ${styles.white}`}>
        <div className={styles.done} role="status">
          <span className={styles.doneStars} aria-hidden>
            {Array.from({ length: rating }, (_, i) => (
              <Icon key={i} name="ic-star" size={26} />
            ))}
          </span>
          <h1 className={styles.doneTitle}>{t("appFeedback.thanks")}</h1>
          <Button block onClick={() => navigate("/profile", { replace: true })}>
            {t("appFeedback.backToSettings")}
          </Button>
        </div>
      </div>
    );
  }

  // "Edit" without anything to edit (e.g. deep link): the read screen is the right place.
  if (mode === "edit" && !editing) {
    return (
      <Shell>
        <div className={styles.wrap}>
          <p className={styles.intro}>{t("appFeedback.nothingToEdit")}</p>
          <Button block onClick={() => navigate("/profile/feedback", { replace: true })}>
            {t("appFeedback.title")}
          </Button>
        </div>
      </Shell>
    );
  }

  const intro = editing ? t("appFeedback.introEdit") : t("appFeedback.intro");

  return (
    <Shell backTo={history.length > 0 ? () => navigate("/profile/feedback", { replace: true }) : undefined}>
      <form
        className={styles.wrap}
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <p className={styles.intro}>{intro}</p>
        {blocked && nextAt && (
          <p role="status" className={styles.cooldown}>
            {t("appFeedback.nextAllowed", { date: f.date(nextAt) })}
          </p>
        )}
        <div className={styles.ratingBlock}>
          <span className={styles.label}>{t("appFeedback.ratingLabel")}</span>
          <StarInput value={rating} onChange={setRating} starLabel={(n) => t("appFeedback.starLabel", { count: n })} />
        </div>
        <Textarea
          className={styles.field}
          label={t("appFeedback.bodyLabel")}
          placeholder={t("appFeedback.bodyPlaceholder")}
          value={body}
          maxLength={BODY_MAX}
          rows={6}
          onChange={(e) => setBody(e.target.value)}
        />
        {failure === "tooSoon" && (
          <p role="alert" className={styles.error}>
            {tooSoonAt ? t("appFeedback.nextAllowed", { date: f.date(tooSoonAt) }) : t("appFeedback.tooSoon")}
          </p>
        )}
        {failure === "notEditable" && (
          <p role="alert" className={styles.error}>
            {t("appFeedback.notEditable")}
          </p>
        )}
        {failure === "generic" && (
          <p role="alert" className={styles.error}>
            {t("appFeedback.error")}
          </p>
        )}
        <Button type="submit" block disabled={!canSend} loading={sending}>
          {t(editing ? "appFeedback.update" : "appFeedback.send")}
        </Button>
      </form>
    </Shell>
  );
}
