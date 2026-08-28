import { useParams } from "react-router-dom";
import { PLAY_EQUIPMENT_LABEL } from "@toboggo/shared";
import { DetailHeader } from "../../components/DetailHeader";
import { usePark } from "../../lib/parksQuery";
import { EQUIPMENT_ICON, SERVICE_ICON, SERVICE_LABEL } from "../../lib/equipmentIcons";
import styles from "./DetailAmenities.module.css";

export default function DetailAmenities() {
  const { id } = useParams();
  const { data: park } = usePark(id);
  if (!park) return null;

  const equipment = park.play_equipment ?? [];
  const serviceKeys = Object.keys(SERVICE_LABEL) as (keyof typeof SERVICE_LABEL)[];

  const rows: { label: string; icon: string; on: boolean }[] = [
    ...equipment.map((eq) => ({ label: PLAY_EQUIPMENT_LABEL[eq] ?? eq, icon: EQUIPMENT_ICON[eq] ?? "🧩", on: true })),
    ...serviceKeys.map((k) => ({ label: SERVICE_LABEL[k], icon: SERVICE_ICON[k], on: Boolean((park as unknown as Record<string, unknown>)[k]) })),
  ];

  return (
    <div className={styles.screen}>
      <DetailHeader title="Équipements" />
      <div className={styles.body}>
        {rows.length === 0 && (
          <p style={{ textAlign: "center", color: "var(--color-text-muted)", fontSize: 13, marginTop: 40 }}>
            Aucune information renseignée pour ce parc.
          </p>
        )}
        {rows.map((r) => (
          <div key={r.label} className={styles.row}>
            <span className={styles.left}>
              <span className={styles.icon}>{r.icon}</span>
              {r.label}
            </span>
            {r.on ? (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#16A34A" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M4 12l5 5L20 6" />
              </svg>
            ) : (
              <span className={styles.dash}>—</span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
