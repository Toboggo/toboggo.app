import { useState } from "react";
import { useParams } from "react-router-dom";
import { DetailHeader } from "../../components/DetailHeader";
import { usePark } from "../../lib/parksQuery";
import styles from "./ScoreDetail.module.css";

const FACTORS = [
  { key: "clean", label: "Propreté", desc: "Signalements de saleté et fréquence d'entretien constatée." },
  { key: "safety", label: "Sécurité", desc: "État des équipements et absence de signalements de danger." },
  { key: "equipment", label: "Équipements", desc: "Diversité et état des jeux disponibles pour l'âge indiqué." },
  { key: "accessibility", label: "Accessibilité", desc: "Accès PMR, proximité des transports et places de parking." },
] as const;

export default function ScoreDetail() {
  const { id } = useParams();
  const { data: park } = usePark(id);
  const [open, setOpen] = useState(false);
  if (!park) return null;

  const score = park.rating * 2;
  const tier = score >= 8 ? "Excellent" : score >= 6 ? "Bon" : "À améliorer";
  const tierColor = score >= 8 ? "#16A34A" : score >= 6 ? "#F08A2E" : "#EF4444";
  const breakdown = [
    { label: "Propreté", pct: Math.min(100, Math.round(park.rating * 18)) },
    { label: "Sécurité", pct: park.has_open_report ? 55 : Math.min(100, Math.round(park.rating * 20)) },
    { label: "Équipements", pct: Math.min(100, (park.play_equipment?.length ?? 0) * 15) },
    { label: "Accessibilité", pct: park.pmr ? 90 : 45 },
  ];

  return (
    <div className={styles.screen}>
      <DetailHeader title="Toboggo Score" />
      <div className={styles.body}>
        <div className={styles.hero}>
          <div className={styles.big}>
            <span style={{ color: tierColor }}>{score.toFixed(1)}</span>
            <span className={styles.slash}>/10</span>
          </div>
          <span className={styles.tier} style={{ background: tierColor }}>
            {tier}
          </span>
          <div className={styles.heroSub}>
            Très adapté aux enfants {park.age_min}–{park.age_max} ans
          </div>
        </div>

        {breakdown.map((b) => (
          <div key={b.label}>
            <div className={styles.barLabel}>
              <span>{b.label}</span>
              <span>{b.pct}%</span>
            </div>
            <div className={styles.bar}>
              <div style={{ width: `${b.pct}%` }} />
            </div>
          </div>
        ))}

        <div className={styles.card}>
          <div className={styles.cardRow}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#16A34A" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M4 12l5 5L20 6" />
            </svg>
            <span>Informations vérifiées <em>par la communauté</em></span>
          </div>
          <div className={styles.cardRow}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#16A34A" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <circle cx="9" cy="8" r="3" />
              <circle cx="17" cy="9" r="2.6" />
              <path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6" />
              <path d="M15 14.5c2.5.3 4.5 2.3 5 5.5" />
            </svg>
            <span>{park.review_count} avis pris en compte</span>
          </div>
          <div className={styles.cardRow}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={park.has_open_report ? "#EF4444" : "#16A34A"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M12 2l8 4v6c0 5-3.5 8-8 10-4.5-2-8-5-8-10V6z" />
            </svg>
            <span>{park.has_open_report ? "1 signalement en cours" : "Aucun signalement en cours"}</span>
          </div>
        </div>

        <div className={styles.infoCard}>
          <button type="button" className={styles.infoToggle} onClick={() => setOpen((o) => !o)}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#8A8578" strokeWidth="2" aria-hidden>
              <circle cx="12" cy="12" r="9" />
              <line x1="12" y1="16" x2="12" y2="11" />
              <circle cx="12" cy="8" r="0.6" fill="#8A8578" stroke="none" />
            </svg>
            <span>Comment est calculé le score ?</span>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#8A8578" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" style={{ transform: open ? "rotate(90deg)" : "none", transition: "transform .15s" }} aria-hidden>
              <path d="M9 6l6 6-6 6" />
            </svg>
          </button>
          {open && (
            <div className={styles.factors}>
              {FACTORS.map((f) => (
                <div key={f.key} className={styles.factor}>
                  <div className={styles.factorLabel}>{f.label}</div>
                  <div className={styles.factorDesc}>{f.desc}</div>
                </div>
              ))}
            </div>
          )}
        </div>

        <p className={styles.foot}>
          Le Toboggo Score est mis à jour régulièrement grâce à vous et aux parents de la communauté.
        </p>
      </div>
    </div>
  );
}
