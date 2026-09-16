import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { computeChildAge, listMyParks, listMyReviews } from "@toboggo/shared";
import { useTheme, LogoMark, Icon, type ThemePreference, type IconName } from "@toboggo/design-system";
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

// Preview strip on the hub shows at most this many badges, plus a "+N" tile
// for the rest — a full "Tous les badges" screen doesn't exist yet, so this
// cap is what keeps the preview compact rather than a real pagination.
const BADGES_PREVIEW_COUNT = 3;

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

          <h6 className={styles.kicker}>{t("applicationTitle")}</h6>
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
  const memberSinceYear = profile.created_at ? new Date(profile.created_at).getFullYear() : NaN;
  const previewBadges = BADGES.slice(0, BADGES_PREVIEW_COUNT);
  const extraBadgeCount = BADGES.length - previewBadges.length;

  return (
    <div className={styles.screen}>
      {/* Header hub — logo + titre + accès Réglages. L'édition du profil et
          les préférences vivent désormais dans /settings (sous-écran) : ce
          header n'est plus qu'une identité, pas un centre d'actions. */}
      <div className={styles.hubHeader}>
        <LogoMark size={28} />
        <h2 className={styles.hubTitle}>{t("title")}</h2>
        <button
          type="button"
          className={styles.settingsBtn}
          onClick={() => navigate("/settings")}
          aria-label={t("settingsScreen.open")}
        >
          <Icon name="ic-settings" size={18} />
        </button>
      </div>

      <div className={styles.body}>
        <div className={styles.idRow}>
          <div className={styles.avatar}>{initials(profile.name)}</div>
          <div className={styles.idText}>
            <div className={styles.idName}>{profile.name}</div>
            {!Number.isNaN(memberSinceYear) && (
              <div className={styles.idMeta}>{t("memberSince", { year: memberSinceYear })}</div>
            )}
          </div>
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

        {/* Famille — encart teinté (univers Toboggo), délibérément plus
            visible que le reste du hub : c'est le cœur du produit. */}
        <div className={styles.familyCard}>
          <div className={styles.familyHeader}>
            <h6 className={styles.familyKicker}>{t("myChildren")}</h6>
            <button type="button" className={styles.manageLink} onClick={() => navigate("/profile/children")}>
              {t("children.manage")}
              <Chevron />
            </button>
          </div>
          <p className={styles.familyIntro}>{t("children.formIntro")}</p>
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
        </div>

        {/* Mon activité — uniquement des éléments personnels réels ; jamais
            le fil communautaire (/activity), qui n'est pas "mon" historique. */}
        <h6 className={styles.kicker}>{t("myActivityTitle")}</h6>
        <div className={styles.group}>
          <Row icon="ic-heart" label={t("favorites.title")} value={String(stats.favorites)} onClick={() => navigate("/favorites")} />
          <Row icon="ic-list" label={t("myContributions")} onClick={() => navigate("/contributions")} />
          <Row icon="ic-users" label={t("groupOuting")} onClick={() => navigate("/group")} />
        </div>

        {/* Mes badges — aperçu compact, jamais la grille de grosses cartes.
            Pas d'affordance "Voir tout" : aucun écran "Tous les badges"
            n'existe, on n'en crée pas un juste pour la maquette — ni un
            texte qui ferait croire à une destination qui n'existe pas. */}
        <h6 className={styles.kicker}>{t("badgesTitle")}</h6>
        <div className={styles.badgesStrip}>
          {previewBadges.map((b) => {
            const earned = b.earned(stats);
            const prog = !earned ? b.progress?.(stats) : undefined;
            const iconWrapClass = earned
              ? b.key === "grand"
                ? `${styles.badgeIconWrap} ${styles.badgeIconWrapAccent}`
                : `${styles.badgeIconWrap} ${styles.badgeIconWrapEarned}`
              : styles.badgeIconWrap;
            const a11yLabel = `${t(b.labelKey)}${
              earned ? ` — ${t("badge.earnedLabel")}` : prog ? ` — ${prog.current}/${prog.target}` : ""
            }`;
            return (
              <div key={b.key} className={styles.badgeItem} role="img" aria-label={a11yLabel}>
                <div className={iconWrapClass}>
                  <Icon name={b.icon} size={17} />
                  {earned && (
                    <span className={styles.badgeCheck} aria-hidden>
                      <Icon name="ic-check" size={9} />
                    </span>
                  )}
                </div>
                <span className={styles.badgeItemLabel}>{t(b.labelKey)}</span>
              </div>
            );
          })}
          {extraBadgeCount > 0 && (
            <div className={styles.badgeItem} aria-hidden>
              <div className={styles.badgeIconWrap}>
                <span className={styles.badgeMoreText}>{t("badge.more", { count: extraBadgeCount })}</span>
              </div>
            </div>
          )}
        </div>
      </div>

      <BottomTabs />
    </div>
  );
}

function Row({
  icon,
  label,
  value,
  onClick,
}: {
  icon?: IconName;
  label: string;
  value?: string;
  onClick: () => void;
}) {
  return (
    <button type="button" className={styles.groupRow} onClick={onClick}>
      <span className={styles.groupRowMain}>
        {icon && (
          <span className={styles.groupRowIcon}>
            <Icon name={icon} size={15} />
          </span>
        )}
        <span>{label}</span>
      </span>
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
