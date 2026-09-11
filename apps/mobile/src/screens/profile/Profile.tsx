import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { listMyParks, listMyReviews, signOut } from "@toboggo/shared";
import { useTheme, type ThemePreference } from "@toboggo/design-system";
import { BottomTabs } from "../../components/BottomTabs";
import { useSession } from "../../lib/session";
import { useFormat } from "../../i18n/useFormat";
import { useLocale } from "../../i18n/useLocale";
import { LANGUAGE_ENDONYM } from "../../i18n/languageNames";
import styles from "./Profile.module.css";

const APPEARANCE_LABEL_KEY: Record<ThemePreference, string> = {
  system: "settings.appearanceSystem",
  light: "settings.appearanceLight",
  dark: "settings.appearanceDark",
};

const BADGES: { key: string; icon: string; labelKey: string; earned: (s: Stats) => boolean }[] = [
  { key: "first_review", icon: "⭐", labelKey: "badge.firstReview", earned: (s) => s.reviews >= 1 },
  { key: "contributor", icon: "🛝", labelKey: "badge.contributor", earned: (s) => s.parks >= 1 },
  { key: "explorer", icon: "🧭", labelKey: "badge.explorer", earned: (s) => s.favorites >= 5 },
  { key: "grand", icon: "🏆", labelKey: "badge.grand", earned: (s) => s.parks + s.reviews >= 10 },
];

interface Stats {
  parks: number;
  reviews: number;
  favorites: number;
}

function initials(name: string) {
  return name.split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase();
}

export default function Profile() {
  const navigate = useNavigate();
  const { t } = useTranslation("profile");
  const f = useFormat();
  const { language } = useLocale();
  const [, appearance] = useTheme();
  const appearanceLabel = t(APPEARANCE_LABEL_KEY[appearance], { ns: "common" });
  const userId = useSession((s) => s.userId);
  const profile = useSession((s) => s.profile);

  const { data: myParks = [] } = useQuery({ queryKey: ["my-parks", userId], queryFn: () => listMyParks(userId!), enabled: !!userId });
  const { data: myReviews = [] } = useQuery({ queryKey: ["my-reviews", userId], queryFn: () => listMyReviews(userId!), enabled: !!userId });

  // Guest: no account yet. Still expose the account-independent settings
  // (language above all) and a sign-in entry, instead of a blank screen.
  if (!profile) {
    if (userId) return null; // signed in, profile still loading
    return (
      <div className={styles.screen}>
        <div className={styles.titleBar}>
          <h2>{t("title")}</h2>
        </div>
        <div className={styles.body}>
          <p style={{ fontSize: 13.5, color: "var(--color-text-muted)", lineHeight: 1.5, margin: "4px 0 16px" }}>
            {t("guestProfile.prompt", { ns: "common" })}
          </p>
          <button type="button" className={styles.signInCta} onClick={() => navigate("/login-method")}>
            {t("action.signIn", { ns: "common" })}
          </button>

          <h6 className={styles.kicker}>{t("preferencesTitle")}</h6>
          <div className={styles.group}>
            <Row label={t("language")} value={LANGUAGE_ENDONYM[language]} onClick={() => navigate("/language")} />
            <Row label={t("appearance")} value={appearanceLabel} onClick={() => navigate("/appearance")} />
          </div>

          <h6 className={styles.kicker}>{t("helpInfoTitle")}</h6>
          <div className={styles.group}>
            <Row label={t("help")} onClick={() => navigate("/help")} />
            <Row label={t("contactUs")} onClick={() => navigate("/contact")} />
          </div>
        </div>
        <BottomTabs />
      </div>
    );
  }

  const stats: Stats = { parks: myParks.length, reviews: myReviews.length, favorites: profile.favorites.length };
  const points = stats.parks * 30 + stats.reviews * 15 + stats.favorites * 5;
  const level = Math.floor(points / 100) + 1;
  const progress = points % 100;

  async function logout() {
    await signOut();
    navigate("/");
  }

  return (
    <div className={styles.screen}>
      <div className={styles.titleBar}>
        <h2>{t("title")}</h2>
      </div>

      <div className={styles.body}>
        <div className={styles.idRow}>
          <div className={styles.avatar}>{initials(profile.name)}</div>
          <div className={styles.idText}>
            <div className={styles.idName}>{profile.name}</div>
            <div className={styles.idEmail}>{profile.email}</div>
          </div>
          <button type="button" className={styles.editBtn} onClick={() => navigate("/profile/edit")}>
            {t("edit")}
          </button>
        </div>

        <div className={styles.notifCard} onClick={() => navigate("/notifications/center")}>
          <span className={styles.notifIcon}>
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
              <path d="M13.73 21a2 2 0 0 1-3.46 0" />
            </svg>
          </span>
          <span className={styles.notifLabel}>{t("notifications")}</span>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" style={{ color: "var(--color-text-faint)" }} aria-hidden>
            <path d="M9 6l6 6-6 6" />
          </svg>
        </div>

        <div className={styles.levelCard}>
          <span className={styles.levelBadge}>{t("level", { level })}</span>
          <div className={styles.levelBody}>
            <div className={styles.levelText}>
              {t("levelProgress", { points, remaining: 100 - progress })}
            </div>
            <div className={styles.levelTrack}>
              <div style={{ width: `${progress}%` }} />
            </div>
          </div>
        </div>

        {profile.children.length > 0 && (
          <>
            <h6 className={styles.kicker}>{t("myChildren")}</h6>
            <div className={styles.children}>
              {profile.children.map((c, i) => (
                <span key={i} className={styles.child}>
                  {f.ageRange(c.age, c.age)}
                </span>
              ))}
            </div>
          </>
        )}

        <div className={styles.stats}>
          <button type="button" className={styles.stat} onClick={() => navigate("/contributions")}>
            <span style={{ color: "var(--color-primary)" }}>{stats.parks}</span>
            {t("stats.parks")}
          </button>
          <button type="button" className={styles.stat} onClick={() => navigate("/contributions")}>
            <span style={{ color: "var(--color-accent)" }}>{stats.reviews}</span>
            {t("stats.reviews")}
          </button>
          <button type="button" className={styles.stat} onClick={() => navigate("/favorites")}>
            <span style={{ color: "var(--color-error)" }}>{stats.favorites}</span>
            {t("stats.favorites")}
          </button>
        </div>

        <h6 className={styles.kicker}>{t("badgesTitle")}</h6>
        <div className={styles.badges}>
          {BADGES.map((b) => (
            <div key={b.key} className={styles.badge} style={{ opacity: b.earned(stats) ? 1 : 0.35 }}>
              <div className={styles.badgeIcon}>{b.icon}</div>
              <span>{t(b.labelKey)}</span>
            </div>
          ))}
        </div>

        <h6 className={styles.kicker}>{t("myToboggoTitle")}</h6>
        <div className={styles.group}>
          <Row label={t("favorites.title")} onClick={() => navigate("/favorites")} />
          <Row label={t("myContributions")} onClick={() => navigate("/contributions")} />
          <Row label={t("activity.title")} onClick={() => navigate("/activity")} />
          <Row label={t("groupOuting")} onClick={() => navigate("/group")} />
        </div>

        <h6 className={styles.kicker}>{t("preferencesTitle")}</h6>
        <div className={styles.group}>
          <Row label={t("language")} value={LANGUAGE_ENDONYM[language]} onClick={() => navigate("/language")} />
          <Row label={t("appearance")} value={appearanceLabel} onClick={() => navigate("/appearance")} />
        </div>

        <h6 className={styles.kicker}>{t("helpInfoTitle")}</h6>
        <div className={styles.group}>
          <Row label={t("help")} onClick={() => navigate("/help")} />
          <Row label={t("contactUs")} onClick={() => navigate("/contact")} />
          <Row label={t("privacy")} onClick={() => navigate("/privacy")} />
        </div>

        <h6 className={styles.kicker}>{t("accountTitle")}</h6>
        <div className={styles.group}>
          <button type="button" className={styles.groupRow} onClick={logout}>
            <span>{t("signOut")}</span>
          </button>
        </div>
      </div>

      <BottomTabs />
    </div>
  );
}

function Row({ label, value, onClick }: { label: string; value?: string; onClick: () => void }) {
  return (
    <button type="button" className={styles.groupRow} onClick={onClick}>
      <span>{label}</span>
      <span className={styles.groupRowTrailing}>
        {value && <span className={styles.groupRowValue}>{value}</span>}
        <Chevron />
      </span>
    </button>
  );
}

function Chevron() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ color: "var(--color-text-faint)" }} aria-hidden>
      <path d="M9 6l6 6-6 6" />
    </svg>
  );
}
