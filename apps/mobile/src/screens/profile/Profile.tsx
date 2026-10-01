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

// Preview strip on the hub shows at most this many badges — a full "Tous les
// badges" screen doesn't exist yet, so no "Voir tout" link either (would
// point nowhere).
const BADGES_PREVIEW_COUNT = 3;

// Illustrated hex art exists only for these two badges in their *earned*
// state and for "explorer" in its *locked* state (toboggo-profile-svg-pack).
// Any other key/earned combination (explorer earned, or first_review /
// contributor still locked) falls back to the plain icon treatment below —
// there's no drawn art for those states.
const BADGE_ART: Partial<Record<string, { src: string; earned: boolean }>> = {
  first_review: { src: "/profile/badge-first-review.svg", earned: true },
  contributor: { src: "/profile/badge-contributor.svg", earned: true },
  explorer: { src: "/profile/badge-explorer-locked.svg", earned: false },
};

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

  return (
    <div className={styles.screen}>
      {/* Header hub — logo + titre + accès Réglages, avec l'illustration
          décorative du parc en fond. L'édition du profil et les préférences
          vivent désormais dans /settings (sous-écran) : ce header n'est
          plus qu'une identité, pas un centre d'actions. */}
      <div className={styles.hero}>
        <img className={styles.heroImg} src="/profile/hero-playground.svg" alt="" aria-hidden="true" />
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
      </div>

      <div className={styles.idRow}>
        <div className={styles.avatar}>{initials(profile.name)}</div>
        <div className={styles.idText}>
          <div className={styles.idName}>{profile.name}</div>
          {!Number.isNaN(memberSinceYear) && (
            <div className={styles.idMeta}>{t("memberSince", { year: memberSinceYear })}</div>
          )}
        </div>
      </div>

      <div className={styles.body}>
        <div className={styles.statsCard}>
          <button type="button" className={styles.statItem} onClick={() => navigate("/contributions")}>
            <img className={styles.statIcon} src="/profile/icon-park-added.svg" alt="" aria-hidden="true" />
            <span className={styles.statText}>
              <span className={styles.statValue}>{stats.parks}</span>
              <span className={styles.statLabel}>{t("stats.parks")}</span>
            </span>
          </button>
          <button type="button" className={styles.statItem} onClick={() => navigate("/contributions")}>
            <img className={styles.statIcon} src="/profile/icon-review.svg" alt="" aria-hidden="true" />
            <span className={styles.statText}>
              <span className={styles.statValue}>{stats.reviews}</span>
              <span className={styles.statLabel}>{t("stats.reviews")}</span>
            </span>
          </button>
          <button type="button" className={styles.statItem} onClick={() => navigate("/favorites")}>
            <img className={styles.statIcon} src="/profile/icon-favorite.svg" alt="" aria-hidden="true" />
            <span className={styles.statText}>
              <span className={styles.statValue}>{stats.favorites}</span>
              <span className={styles.statLabel}>{t("stats.favorites")}</span>
            </span>
          </button>
        </div>

        {/* Famille — card blanche légère : chips par âge uniquement, jamais
            de prénom ni de photo réelle (le modèle Child n'en stocke pas). */}
        <div className={styles.familyCard}>
          <div className={styles.familyHeader}>
            <h6 className={styles.familyKicker}>{t("myChildren")}</h6>
            <button type="button" className={styles.manageLink} onClick={() => navigate("/profile/children")}>
              {t("children.manage")}
              <Chevron />
            </button>
          </div>
          <p className={styles.familyIntro}>{t("children.formIntro")}</p>
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
                  <img className={styles.childAvatar} src="/profile/child-neutral.svg" alt="" aria-hidden="true" />
                  {age != null ? f.ageRange(age, age) : t("children.ageUnknown")}
                </button>
              );
            })}
            <button type="button" className={styles.addChild} onClick={() => navigate("/profile/children/new")}>
              <span aria-hidden>+</span> {t("children.add")}
            </button>
          </div>
        </div>

        {/* Mon activité — uniquement des éléments personnels réels ; jamais
            le fil communautaire (/activity), qui n'est pas "mon" historique. */}
        <h6 className={styles.kicker}>{t("myActivityTitle")}</h6>
        <div className={styles.group}>
          <Row iconSrc="/profile/icon-favorite.svg" label={t("favorites.title")} value={String(stats.favorites)} onClick={() => navigate("/favorites")} />
          <Row iconSrc="/profile/icon-contributions.svg" label={t("myContributions")} onClick={() => navigate("/contributions")} />
          <Row iconSrc="/profile/icon-group.svg" label={t("groupOuting")} onClick={() => navigate("/group")} />
        </div>

        {/* Mes badges — aperçu compact, jamais la grille de grosses cartes.
            Pas d'affordance "Voir tout" : aucun écran "Tous les badges"
            n'existe, on n'en crée pas un juste pour la maquette — ni un
            texte qui ferait croire à une destination qui n'existe pas. */}
        <h6 className={styles.kicker}>{t("badgesTitle")}</h6>
        <div className={styles.badgesGrid}>
          {previewBadges.map((b) => {
            const earned = b.earned(stats);
            const prog = !earned ? b.progress?.(stats) : undefined;
            const art = BADGE_ART[b.key];
            const a11yLabel = `${t(b.labelKey)}${
              earned ? ` — ${t("badge.earnedLabel")}` : prog ? ` — ${prog.current}/${prog.target}` : ""
            }`;
            return (
              <div key={b.key} className={styles.badgeCard} role="img" aria-label={a11yLabel}>
                {art && art.earned === earned ? (
                  <img className={styles.badgeArt} src={art.src} alt="" aria-hidden="true" />
                ) : (
                  <div className={earned ? `${styles.badgeIconWrap} ${styles.badgeIconWrapEarned}` : styles.badgeIconWrap}>
                    <Icon name={b.icon} size={17} />
                    {earned ? (
                      <span className={styles.badgeCheck} aria-hidden>
                        <Icon name="ic-check" size={9} />
                      </span>
                    ) : (
                      <span className={styles.badgeLock} aria-hidden>
                        <Lock />
                      </span>
                    )}
                  </div>
                )}
                <span className={styles.badgeCardLabel}>{t(b.labelKey)}</span>
              </div>
            );
          })}
        </div>
      </div>

      <BottomTabs />
    </div>
  );
}

function Row({
  iconSrc,
  label,
  value,
  onClick,
}: {
  iconSrc?: string;
  label: string;
  value?: string;
  onClick: () => void;
}) {
  return (
    <button type="button" className={styles.groupRow} onClick={onClick}>
      <span className={styles.groupRowMain}>
        {iconSrc && <img className={styles.groupRowIcon} src={iconSrc} alt="" aria-hidden="true" />}
        <span>{label}</span>
      </span>
      <span className={styles.groupRowTrailing}>
        {value && <span className={styles.groupRowValue}>{value}</span>}
        <Chevron />
      </span>
    </button>
  );
}

function Lock() {
  return (
    <svg width="8" height="8" viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect x="4" y="10" width="16" height="12" rx="2.5" fill="currentColor" />
      <path d="M8 10V7a4 4 0 0 1 8 0v3" stroke="currentColor" strokeWidth="3" fill="none" />
    </svg>
  );
}

function Chevron() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ color: "var(--color-text-faint)" }} aria-hidden>
      <path d="M9 6l6 6-6 6" />
    </svg>
  );
}
