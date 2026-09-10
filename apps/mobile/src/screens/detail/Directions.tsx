import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { haversineMeters } from "@toboggo/shared";
import { DetailHeader } from "../../components/DetailHeader";
import { usePark } from "../../lib/parksQuery";
import { useGeo } from "../../lib/geo";
import { useVisitPrompt } from "../../lib/visitPrompt";
import { useToastStore } from "../../lib/toast";
import { useFormat } from "../../i18n/useFormat";
import styles from "./Directions.module.css";

const MODES = [
  { value: "walk", labelKey: "route.modeWalk", speedKmh: 4.8 },
  { value: "bike", labelKey: "route.modeBike", speedKmh: 15 },
  { value: "car", labelKey: "route.modeCar", speedKmh: 30 },
] as const;

const STOPS = [
  { value: "bakery", labelKey: "route.stopBakery" },
  { value: "parking", labelKey: "route.stopParking" },
  { value: "water", labelKey: "route.stopWater" },
] as const;

export default function Directions() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { t } = useTranslation("detail");
  const f = useFormat();
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
  const selectedEta = `${f.walk(etaFor(MODES.find((m) => m.value === mode)!.speedKmh))} · ${f.distance(distanceM)}`;

  function startNav() {
    setNavigating(true);
    showToast(t("route.started"));
    schedule(park!.id, park!.name);
  }

  return (
    <div className={styles.screen}>
      <DetailHeader title={t("route.title")} />
      <div className={styles.body}>
        <div className={styles.card}>
          <div className={styles.parkName}>{park.name}</div>
          <div className={styles.parkAddr}>{park.formatted_address}</div>
        </div>

        <div className={styles.mini}>
          <span className={styles.miniDot} />
          <span className={styles.miniPath} />
          <span className={styles.miniPin}>{f.rating(park.rating)}</span>
        </div>

        <div>
          <label className={styles.label}>{t("route.mode")}</label>
          <div className={styles.modes}>
            {MODES.map((m) => (
              <button
                key={m.value}
                type="button"
                className={styles.mode}
                data-on={mode === m.value ? "1" : undefined}
                onClick={() => setMode(m.value)}
              >
                <span>{t(m.labelKey)}</span>
                <em>{f.walk(etaFor(m.speedKmh))}</em>
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className={styles.label}>{t("route.addStop")}</label>
          <div className={styles.stops}>
            {STOPS.map((s) => (
              <button
                key={s.value}
                type="button"
                className={styles.stop}
                data-on={stops.includes(s.value) ? "1" : undefined}
                onClick={() => setStops((v) => (v.includes(s.value) ? v.filter((x) => x !== s.value) : [...v, s.value]))}
              >
                {t(s.labelKey)}
              </button>
            ))}
          </div>
        </div>

        <button type="button" className={styles.cta} disabled={navigating} onClick={startNav}>
          {navigating ? t("route.inProgress") : t("route.start", { eta: selectedEta })}
        </button>
        {navigating && (
          <button type="button" className={styles.ghost} onClick={() => navigate(`/park/${park.id}`)}>
            {t("route.backToPark")}
          </button>
        )}
      </div>
    </div>
  );
}
