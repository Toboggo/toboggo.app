import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { listMyParks, listMyReviews, listMyReports } from "@toboggo/shared";
import { DetailHeader } from "../../components/DetailHeader";
import { BottomTabs } from "../../components/BottomTabs";
import { parkPhotoUrl } from "../../lib/photos";
import { useSession } from "../../lib/session";
import styles from "./Contributions.module.css";

type Tab = "parks" | "reviews" | "reports";

function Stars({ value }: { value: number }) {
  return (
    <>
      {Array.from({ length: 5 }).map((_, i) => (
        <svg key={i} width="11" height="11" viewBox="0 0 24 24" fill={i < Math.round(value) ? "#FFC107" : "none"} stroke="#FFC107" strokeWidth="1.5" aria-hidden>
          <path d="M12 2l3.1 6.3 6.9 1-5 4.9 1.2 6.8L12 17.8 5.8 21l1.2-6.8-5-4.9 6.9-1z" />
        </svg>
      ))}
    </>
  );
}

const TABS: { value: Tab; label: string }[] = [
  { value: "parks", label: "Parcs ajoutés" },
  { value: "reviews", label: "Avis" },
  { value: "reports", label: "Signalements" },
];

export default function Contributions() {
  const navigate = useNavigate();
  const userId = useSession((s) => s.userId);
  const [tab, setTab] = useState<Tab>("parks");

  const { data: parks = [] } = useQuery({ queryKey: ["my-parks", userId], queryFn: () => listMyParks(userId!), enabled: !!userId });
  const { data: reviews = [] } = useQuery({ queryKey: ["my-reviews", userId], queryFn: () => listMyReviews(userId!), enabled: !!userId && tab === "reviews" });
  const { data: reports = [] } = useQuery({ queryKey: ["my-reports", userId], queryFn: () => listMyReports(userId!), enabled: !!userId && tab === "reports" });

  const emptyText =
    tab === "parks"
      ? "Vous n'avez pas encore ajouté de parc."
      : tab === "reviews"
        ? "Vous n'avez pas encore laissé d'avis."
        : "Vous n'avez pas encore signalé de problème.";

  return (
    <div className={styles.screen}>
      <DetailHeader title="Contributions" onBack={() => navigate("/map")} />
      <div className={styles.tabs}>
        {TABS.map((t) => (
          <button key={t.value} type="button" className={styles.tab} data-on={tab === t.value ? "1" : undefined} onClick={() => setTab(t.value)}>
            {t.label}
          </button>
        ))}
      </div>

      <div className={styles.body}>
        {tab === "parks" &&
          (parks.length === 0 ? (
            <div className={styles.empty}>{emptyText}</div>
          ) : (
            parks.map((p) => (
              <div key={p.id} className={styles.parkRow} onClick={() => navigate(`/park/${p.id}`)}>
                <div className={styles.thumb} style={{ backgroundImage: `url(${parkPhotoUrl(p, 0, 120, 120)})` }} />
                <div className={styles.rowBody}>
                  <div className={styles.rowName}>{p.name}</div>
                  <div className={styles.rowSub}>{p.formatted_address}</div>
                </div>
                {p.status !== "published" && <span className={styles.pending}>En attente</span>}
              </div>
            ))
          ))}

        {tab === "reviews" &&
          (reviews.length === 0 ? (
            <div className={styles.empty}>{emptyText}</div>
          ) : (
            reviews.map((r: any) => (
              <div key={r.id} className={styles.card}>
                <div className={styles.cardTop}>
                  <span className={styles.cardName}>{r.parks?.name ?? r.parkName}</span>
                  <span className={styles.cardDate}>{new Date(r.created_at).toLocaleDateString("fr-FR")}</span>
                </div>
                <div className={styles.cardStars}>
                  <Stars value={r.stars} />
                </div>
                {r.comment && <p>{r.comment}</p>}
              </div>
            ))
          ))}

        {tab === "reports" &&
          (reports.length === 0 ? (
            <div className={styles.empty}>{emptyText}</div>
          ) : (
            reports.map((r: any) => (
              <div key={r.id} className={styles.reportRow}>
                <span className={styles.cardName}>{r.parks?.name ?? r.parkName}</span>
                <span className={styles.cardDate}>{new Date(r.created_at).toLocaleDateString("fr-FR")}</span>
              </div>
            ))
          ))}
      </div>
      <BottomTabs />
    </div>
  );
}
