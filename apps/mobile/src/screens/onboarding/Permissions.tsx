import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useGeo, requestBrowserLocation } from "../../lib/geo";
import { useSession } from "../../lib/session";
import { ChevronRight, PinIcon } from "./authIcons";
import styles from "./Permissions.module.css";

export default function Permissions() {
  const navigate = useNavigate();
  const [low, setLow] = useState(0);
  const [high, setHigh] = useState(6);
  const [showPermModal, setShowPermModal] = useState(false);
  const [zone, setZone] = useState<string | null>(null);
  const setLocation = useGeo((s) => s.setLocation);
  const setPermission = useGeo((s) => s.setPermission);
  const patchProfile = useSession((s) => s.patchProfile);

  const pct = (v: number) => (v / 12) * 100;
  const maxLabel = high >= 12 ? "12+" : String(high);

  function finish() {
    void patchProfile({ children: [{ age: Math.round((low + high) / 2) }] });
    navigate("/map");
  }

  async function grantLocation() {
    setShowPermModal(false);
    try {
      const pos = await requestBrowserLocation();
      setLocation(pos.lat, pos.lng, "Autour de vous");
      setPermission("granted");
      setZone("Position activée");
    } catch {
      setPermission("denied");
    }
    finish();
  }

  return (
    <div className={styles.wrap}>
      <div className={styles.body}>
        <div className={styles.head}>
          <h1>Pour qui cherchez-vous des parcs ? 🛝</h1>
          <p>Cela nous aide à vous proposer des endroits adaptés.</p>
        </div>

        <div>
          <h6 className={styles.kicker}>Âge recherché</h6>
          <div className={styles.ageLabel}>
            Adapté de {low} à {maxLabel} ans
          </div>
          <div className={styles.slider}>
            <div className={styles.trackBg} />
            <div className={styles.trackFill} style={{ left: `${pct(low)}%`, right: `${100 - pct(high)}%` }} />
            <input
              type="range"
              min={0}
              max={12}
              step={1}
              value={low}
              onChange={(e) => setLow(Math.min(Number(e.target.value), high))}
              aria-label="Âge minimum"
            />
            <input
              type="range"
              min={0}
              max={12}
              step={1}
              value={high}
              onChange={(e) => setHigh(Math.max(Number(e.target.value), low))}
              aria-label="Âge maximum"
            />
          </div>
        </div>

        <div>
          <h6 className={styles.kicker}>Votre zone</h6>
          <button type="button" className={styles.zone} data-active={zone ? "1" : undefined} onClick={() => setShowPermModal(true)}>
            <span className={styles.zoneTile}>
              <PinIcon />
            </span>
            <span className={styles.zoneBody}>
              <span className={styles.zoneTitle}>Autour de ma position</span>
              <span className={styles.zoneSub}>{zone ?? "Activez la localisation pour trier par distance"}</span>
            </span>
            <ChevronRight />
          </button>
        </div>
      </div>

      <button type="button" className={styles.cta} onClick={finish}>
        CONTINUER
      </button>
      <p className={styles.later}>
        <span onClick={finish}>Configurer plus tard</span>
      </p>

      {showPermModal && (
        <div className={styles.modalOverlay}>
          <div className={styles.iosAlert}>
            <div className={styles.iosBody}>
              <div className={styles.iosTitle}>
                « Toboggo » aimerait utiliser
                <br />
                votre position
              </div>
              <p>Afficher les parcs autour de vous et calculer leur distance.</p>
            </div>
            <div className={styles.iosActions}>
              <button type="button" className={styles.iosAllow} onClick={grantLocation}>
                Autoriser
              </button>
              <button
                type="button"
                className={styles.iosDeny}
                onClick={() => (setShowPermModal(false), setPermission("denied"))}
              >
                Ne pas autoriser
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
