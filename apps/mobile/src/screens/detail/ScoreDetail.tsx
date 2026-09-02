import { useState } from "react";
import { useParams } from "react-router-dom";
import { Icon } from "@toboggo/design-system";
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
  const tierColor =
    score >= 8 ? "var(--color-success)" : score >= 6 ? "var(--color-accent)" : "var(--color-error)";
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
            <Icon name="ic-check" size={16} style={{ color: "var(--color-primary)" }} />
            <span>Informations vérifiées <em>par la communauté</em></span>
          </div>
          <div className={styles.cardRow}>
            <Icon name="ic-users" size={16} style={{ color: "var(--color-primary)" }} />
            <span>{park.review_count} avis pris en compte</span>
          </div>
          <div className={styles.cardRow}>
            <Icon
              name="ic-shield"
              size={16}
              style={{ color: park.has_open_report ? "var(--color-error)" : "var(--color-primary)" }}
            />
            <span>{park.has_open_report ? "1 signalement en cours" : "Aucun signalement en cours"}</span>
          </div>
        </div>

        <div className={styles.infoCard}>
          <button type="button" className={styles.infoToggle} onClick={() => setOpen((o) => !o)}>
            <Icon name="ic-question" size={16} style={{ color: "var(--color-text-muted)" }} />
            <span>Comment est calculé le score ?</span>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" style={{ color: "var(--color-text-muted)", transform: open ? "rotate(90deg)" : "none", transition: "transform .15s" }} aria-hidden>
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
