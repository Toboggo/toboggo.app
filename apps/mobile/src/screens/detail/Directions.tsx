import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { formatDistance, haversineMeters } from "@toboggo/shared";
import { DetailHeader } from "../../components/DetailHeader";
import { usePark } from "../../lib/parksQuery";
import { useGeo } from "../../lib/geo";
import { useVisitPrompt } from "../../lib/visitPrompt";
import { useToastStore } from "../../lib/toast";
import styles from "./Directions.module.css";

const MODES = [
  { value: "walk", label: "À pied", speedKmh: 4.8 },
  { value: "bike", label: "Vélo", speedKmh: 15 },
  { value: "car", label: "Voiture", speedKmh: 30 },
] as const;

const STOPS = ["Boulangerie", "Parking", "Point d'eau"];

export default function Directions() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { data: park } = usePark(id);
  const { lat, lng } = useGeo();
  const [mode, setMode] = useState<(typeof MODES)[number]["value"]>("walk");
  const [stops, setStops] = useState<string[]>([]);
  const [navigating, setNavigating] = useState(false);
  const schedule = useVisitPrompt((s) => s.schedule);
  const showToast = useToastStore((s) => s.show);

  if (!park) return null;

  const distanceM = haversineMeters(lat, lng, park.lat, park.lng);
  const etaFor = (speed: number) => Math.max(1, Math.round((distanceM / 1000 / speed) * 60));
  const selectedEta = `${etaFor(MODES.find((m) => m.value === mode)!.speedKmh)} min · ${formatDistance(distanceM)}`;

  function startNav() {
    setNavigating(true);
    showToast("Navigation démarrée");
    schedule(park!.id, park!.name);
  }

  return (
    <div className={styles.screen}>
      <DetailHeader title="Itinéraire" />
      <div className={styles.body}>
        <div className={styles.card}>
          <div className={styles.parkName}>{park.name}</div>
          <div className={styles.parkAddr}>{park.formatted_address}</div>
        </div>

        <div className={styles.mini}>
          <span className={styles.miniDot} />
          <span className={styles.miniPath} />
          <span className={styles.miniPin}>{park.rating.toFixed(1)}</span>
        </div>

        <div>
          <label className={styles.label}>Mode de déplacement</label>
          <div className={styles.modes}>
            {MODES.map((m) => (
              <button
                key={m.value}
                type="button"
                className={styles.mode}
                data-on={mode === m.value ? "1" : undefined}
                onClick={() => setMode(m.value)}
              >
                <span>{m.label}</span>
                <em>{etaFor(m.speedKmh)} min</em>
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className={styles.label}>Ajouter une étape en chemin</label>
          <div className={styles.stops}>
            {STOPS.map((s) => (
              <button
                key={s}
                type="button"
                className={styles.stop}
                data-on={stops.includes(s) ? "1" : undefined}
                onClick={() => setStops((v) => (v.includes(s) ? v.filter((x) => x !== s) : [...v, s]))}
              >
                {s}
              </button>
            ))}
          </div>
        </div>

        <button type="button" className={styles.cta} disabled={navigating} onClick={startNav}>
          {navigating ? "Navigation en cours…" : `Démarrer la navigation · ${selectedEta}`}
        </button>
        {navigating && (
          <button type="button" className={styles.ghost} onClick={() => navigate(`/park/${park.id}`)}>
            Retour à la fiche du parc
          </button>
        )}
      </div>
    </div>
  );
}
