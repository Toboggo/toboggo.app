import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { computeChildAge, listMyParks, listMyReviews, signOut, purgeDraftsForPrincipal } from "@toboggo/shared";
import { useTheme, Icon, type ThemePreference, type IconName } from "@toboggo/design-system";
import { BottomTabs } from "../../components/BottomTabs";
import { useSession } from "../../lib/session";
import { useChildren } from "../../lib/children";
import { useFormat } from "../../i18n/useFormat";
import { useLocale } from "../../i18n/useLocale";
import { LANGUAGE_ENDONYM } from "../../i18n/languageNames";
import styles from "./Profile.module.css";

const APPEARANCE_LABEL_KEY: Record<ThemePreference, string> = {
  system: "settings.appearanceSystem",
  light: "settings.appearanceLight",
  dark: "settings.appearanceDark",
};

interface Stats {
  parks: number;
  reviews: number;
  favorites: number;
}

const BADGES: {
  key: string;
  icon: IconName;
  labelKey: string;
  earned: (s: Stats) => boolean;
  progress?: (s: Stats) => { current: number; target: number };
}[] = [
  { key: "first_review", icon: "ic-review", labelKey: "badge.firstReview", earned: (s) => s.reviews >= 1 },
  { key: "contributor", icon: "ic-slide", labelKey: "badge.contributor", earned: (s) => s.parks >= 1 },
  {
    key: "explorer",
    icon: "ic-explore",
    labelKey: "badge.explorer",
    earned: (s) => s.favorites >= 5,
    progress: (s) => ({ current: Math.min(s.favorites, 5), target: 5 }),
  },
  {
    key: "grand",
    icon: "ic-star",
    labelKey: "badge.grand",
    earned: (s) => s.parks + s.reviews >= 10,
    progress: (s) => ({ current: Math.min(s.parks + s.reviews, 10), target: 10 }),
  },
];

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
  const { data: myChildren = [] } = useChildren();

  async function handleSignOut() {
    // Captured before the session is cleared: only this account's local
    // drafts are purged on a shared device.
    const uid = useSession.getState().userId;
    await signOut();
    if (uid) purgeDraftsForPrincipal({ userId: uid });
    navigate("/");
  }

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
            <Row label={t("about.title")} onClick={() => navigate("/about")} />
            <Row label={t("privacyScreen.title")} onClick={() => navigate("/legal")} />
          </div>
        </div>
        <BottomTabs />
      </div>
    );
  }

  const stats: Stats = { parks: myParks.length, reviews: myReviews.length, favorites: profile.favorites.length };

  return (
    <div className={styles.screen}>
      <div className={styles.titleBar}>
        <h2>{t("title")}</h2>
      </div>

      <div className={styles.body}>
        {/* Identité — avatar, nom, informations et stats essentielles. Zone volontairement sobre. */}
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
          {BADGES.map((b) => {
            const earned = b.earned(stats);
            const prog = !earned ? b.progress?.(stats) : undefined;
            const iconWrapClass = earned
              ? b.key === "grand"
                ? `${styles.badgeIconWrap} ${styles.badgeIconWrapAccent}`
                : `${styles.badgeIconWrap} ${styles.badgeIconWrapEarned}`
              : styles.badgeIconWrap;
            return (
              <div key={b.key} className={styles.badgeCard}>
                <div className={iconWrapClass}>
                  <Icon name={b.icon} size={20} />
                  {earned && (
                    <span className={styles.badgeCheck} role="img" aria-label={t("badge.earnedLabel")}>
                      <Icon name="ic-check" size={10} />
                    </span>
                  )}
                </div>
                <div className={styles.badgeBody}>
                  <span className={styles.badgeLabel}>{t(b.labelKey)}</span>
                  {prog && prog.target > 1 && (
                    <div className={styles.badgeProgress}>
                      <div className={styles.badgeProgressTrack}>
                        <div style={{ width: `${(prog.current / prog.target) * 100}%` }} />
                      </div>
                      <span className={styles.badgeFraction}>
                        {prog.current}/{prog.target}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <div className={styles.childrenHeader}>
          <h6 className={styles.kicker}>{t("myChildren")}</h6>
          <button type="button" className={styles.manageLink} onClick={() => navigate("/profile/children")}>
            {t("children.manage")}
            <Chevron />
          </button>
        </div>
        {myChildren.length > 0 && (
          <div className={styles.children}>
            {myChildren.map((c) => {
              const age = computeChildAge(c);
              return (
                <button
                  key={c.id}
                  type="button"
                  className={styles.child}
                  onClick={() => navigate(`/profile/children/${c.id}`)}
                >
                  {age != null ? f.ageRange(age, age) : t("children.ageUnknown")}
                </button>
              );
            })}
          </div>
        )}
        <button type="button" className={styles.addChild} onClick={() => navigate("/profile/children/new")}>
          <span aria-hidden>+</span> {t("children.add")}
        </button>

        <h6 className={styles.kicker}>{t("myToboggoTitle")}</h6>
        <div className={styles.group}>
          <Row label={t("notificationsCenter")} onClick={() => navigate("/notifications/center")} />
          <Row label={t("favorites.title")} onClick={() => navigate("/favorites")} />
          <Row label={t("myContributions")} onClick={() => navigate("/contributions")} />
          <Row label={t("activity.title")} onClick={() => navigate("/activity")} />
          <Row label={t("groupOuting")} onClick={() => navigate("/group")} />
        </div>

        <h6 className={styles.kicker}>{t("preferencesTitle")}</h6>
        <div className={styles.group}>
          <Row label={t("language")} value={LANGUAGE_ENDONYM[language]} onClick={() => navigate("/language")} />
          <Row label={t("appearance")} value={appearanceLabel} onClick={() => navigate("/appearance")} />
          <Row label={t("notifications")} onClick={() => navigate("/notifications")} />
        </div>

        <h6 className={styles.kicker}>{t("helpInfoTitle")}</h6>
        <div className={styles.group}>
          <Row label={t("help")} onClick={() => navigate("/help")} />
          <Row label={t("contactUs")} onClick={() => navigate("/contact")} />
          <Row label={t("about.title")} onClick={() => navigate("/about")} />
        </div>

        <h6 className={styles.kicker}>{t("accountTitle")}</h6>
        <div className={styles.group}>
          <Row label={t("accountScreen.managementKicker")} onClick={() => navigate("/profile/account")} />
        </div>

        <button type="button" className={styles.signOutBtn} onClick={handleSignOut}>
          {t("signOut")}
        </button>
        <p className={styles.versionText}>{t("about.version", { version: __APP_VERSION__ })}</p>
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
