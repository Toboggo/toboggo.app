import { useParams } from "react-router-dom";
import { PLAY_EQUIPMENT_LABEL } from "@toboggo/shared";
import { Icon, equipmentIcon, serviceIcon, type IconName } from "@toboggo/design-system";
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

  const rows: { label: string; iconName?: IconName; emoji?: string; on: boolean }[] = [
    ...equipment.map((eq) => ({
      label: PLAY_EQUIPMENT_LABEL[eq] ?? eq,
      iconName: equipmentIcon(eq),
      emoji: EQUIPMENT_ICON[eq] ?? "🧩",
      on: true,
    })),
    ...serviceKeys.map((k) => ({
      label: SERVICE_LABEL[k],
      iconName: serviceIcon(k),
      emoji: SERVICE_ICON[k],
      on: Boolean((park as unknown as Record<string, unknown>)[k]),
    })),
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
              <span className={styles.icon}>
                {r.iconName ? <Icon name={r.iconName} size={18} /> : r.emoji}
              </span>
              {r.label}
            </span>
            {r.on ? (
              <Icon name="ic-check" size={16} style={{ color: "var(--color-primary)" }} />
            ) : (
              <span className={styles.dash}>—</span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
