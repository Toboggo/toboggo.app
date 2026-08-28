import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { listMyParks, listMyReviews, signOut } from "@toboggo/shared";
import { BottomTabs } from "../../components/BottomTabs";
import { useSession } from "../../lib/session";
import styles from "./Profile.module.css";

const BADGES = [
  { key: "first_review", icon: "⭐", label: "Premier avis", earned: (s: Stats) => s.reviews >= 1 },
  { key: "contributor", icon: "🛝", label: "Contributeur", earned: (s: Stats) => s.parks >= 1 },
  { key: "explorer", icon: "🧭", label: "Explorateur", earned: (s: Stats) => s.favorites >= 5 },
  { key: "grand", icon: "🏆", label: "Grand contributeur", earned: (s: Stats) => s.parks + s.reviews >= 10 },
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
  const userId = useSession((s) => s.userId);
  const profile = useSession((s) => s.profile);

  const { data: myParks = [] } = useQuery({ queryKey: ["my-parks", userId], queryFn: () => listMyParks(userId!), enabled: !!userId });
  const { data: myReviews = [] } = useQuery({ queryKey: ["my-reviews", userId], queryFn: () => listMyReviews(userId!), enabled: !!userId });

  if (!profile) return null;

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
        <h2>Profil</h2>
      </div>

      <div className={styles.body}>
        <div className={styles.idRow}>
          <div className={styles.avatar}>{initials(profile.name)}</div>
          <div className={styles.idText}>
            <div className={styles.idName}>{profile.name}</div>
            <div className={styles.idEmail}>{profile.email}</div>
          </div>
          <button type="button" className={styles.editBtn} onClick={() => navigate("/profile/edit")}>
            Modifier
          </button>
        </div>

        <div className={styles.notifCard} onClick={() => navigate("/notifications/center")}>
          <span className={styles.notifIcon}>
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
              <path d="M13.73 21a2 2 0 0 1-3.46 0" />
            </svg>
          </span>
          <span className={styles.notifLabel}>Notifications</span>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#B3AC9C" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M9 6l6 6-6 6" />
          </svg>
        </div>

        <div className={styles.levelCard}>
          <span className={styles.levelBadge}>Nv.{level}</span>
          <div className={styles.levelBody}>
            <div className={styles.levelText}>
              {points} points · {100 - progress} avant le niveau suivant
            </div>
            <div className={styles.levelTrack}>
              <div style={{ width: `${progress}%` }} />
            </div>
          </div>
        </div>

        {profile.children.length > 0 && (
          <>
            <h6 className={styles.kicker}>Mes enfants</h6>
            <div className={styles.children}>
              {profile.children.map((c, i) => (
                <span key={i} className={styles.child}>
                  {c.age} ans
                </span>
              ))}
            </div>
          </>
        )}

        <div className={styles.stats}>
          <button type="button" className={styles.stat} onClick={() => navigate("/contributions")}>
            <span style={{ color: "#16a34a" }}>{stats.parks}</span>
            Parcs ajoutés
          </button>
          <button type="button" className={styles.stat} onClick={() => navigate("/contributions")}>
            <span style={{ color: "#ffc107" }}>{stats.reviews}</span>
            Avis
          </button>
          <button type="button" className={styles.stat} onClick={() => navigate("/favorites")}>
            <span style={{ color: "#ef4444" }}>{stats.favorites}</span>
            Favoris
          </button>
        </div>

        <h6 className={styles.kicker}>Badges</h6>
        <div className={styles.badges}>
          {BADGES.map((b) => (
            <div key={b.key} className={styles.badge} style={{ opacity: b.earned(stats) ? 1 : 0.35 }}>
              <div className={styles.badgeIcon}>{b.icon}</div>
              <span>{b.label}</span>
            </div>
          ))}
        </div>

        <h6 className={styles.kicker}>Communauté</h6>
        <div className={styles.group}>
          <button type="button" className={styles.groupRow} onClick={() => navigate("/group")}>
            Sortie de groupe
            <Chevron />
          </button>
          <button type="button" className={styles.groupRow} onClick={() => navigate("/activity")}>
            Fil d'activité
            <Chevron />
          </button>
        </div>

        <h6 className={styles.kicker}>Préférences</h6>
        <div className={styles.group}>
          <button type="button" className={styles.groupRow} onClick={() => navigate("/notifications")}>
            Notifications
            <Chevron />
          </button>
          <button type="button" className={styles.groupRow} onClick={() => navigate("/display")}>
            Affichage
            <Chevron />
          </button>
          <button type="button" className={styles.groupRow} onClick={() => navigate("/privacy")}>
            Confidentialité
            <Chevron />
          </button>
          <button type="button" className={styles.groupRow} onClick={() => navigate("/help")}>
            Aide
            <Chevron />
          </button>
        </div>

        <button type="button" className={styles.logout} onClick={logout}>
          Se déconnecter
        </button>
      </div>

      <BottomTabs />
    </div>
  );
}

function Chevron() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#B3AC9C" strokeWidth="2" aria-hidden>
      <path d="M9 6l6 6-6 6" />
    </svg>
  );
}
