import { useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { listParksByIds, formatDistance, haversineMeters } from "@toboggo/shared";
import { Icon } from "@toboggo/design-system";
import { TopBar } from "../../components/TopBar";
import { useGeo } from "../../lib/geo";
import { SERVICE_LABEL } from "../../lib/equipmentIcons";

const ROWS: { key: keyof typeof SERVICE_LABEL; label: string }[] = (Object.keys(SERVICE_LABEL) as (keyof typeof SERVICE_LABEL)[]).map((k) => ({
  key: k,
  label: SERVICE_LABEL[k],
}));

export default function Compare() {
  const [params] = useSearchParams();
  const ids = (params.get("ids") ?? "").split(",").filter(Boolean);
  const { lat, lng } = useGeo();
  const { data: parks = [] } = useQuery({ queryKey: ["compare-parks", ids], queryFn: () => listParksByIds(ids) });

  return (
    <div className="screen">
      <TopBar title="Comparer" />
      <div style={{ overflowX: "auto", padding: "0 16px" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 480 }}>
          <thead>
            <tr>
              <td />
              {parks.map((p) => (
                <th key={p.id} style={{ textAlign: "left", padding: 8, fontFamily: "var(--font-heading)", fontSize: 13 }}>
                  {p.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style={{ fontSize: 12.5, color: "var(--color-text-muted)", padding: 8 }}>Note</td>
              {parks.map((p) => (
                <td key={p.id} style={{ padding: 8, fontSize: 13 }}>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                    <Icon name="ic-star" size={14} style={{ color: "var(--color-accent)" }} />
                    {p.rating.toFixed(1)}
                  </span>
                </td>
              ))}
            </tr>
            <tr>
              <td style={{ fontSize: 12.5, color: "var(--color-text-muted)", padding: 8 }}>Âge conseillé</td>
              {parks.map((p) => (
                <td key={p.id} style={{ padding: 8, fontSize: 13 }}>
                  {p.age_min}-{p.age_max} ans
                </td>
              ))}
            </tr>
            <tr>
              <td style={{ fontSize: 12.5, color: "var(--color-text-muted)", padding: 8 }}>Sol</td>
              {parks.map((p) => (
                <td key={p.id} style={{ padding: 8, fontSize: 13 }}>
                  {p.surface}
                </td>
              ))}
            </tr>
            <tr>
              <td style={{ fontSize: 12.5, color: "var(--color-text-muted)", padding: 8 }}>Distance</td>
              {parks.map((p) => (
                <td key={p.id} style={{ padding: 8, fontSize: 13 }}>
                  {formatDistance(haversineMeters(lat, lng, p.lat, p.lng))}
                </td>
              ))}
            </tr>
            {ROWS.map((row) => (
              <tr key={row.key} style={{ borderTop: "1px solid var(--color-border)" }}>
                <td style={{ fontSize: 12.5, color: "var(--color-text-muted)", padding: 8 }}>{row.label}</td>
                {parks.map((p) => (
                  <td key={p.id} style={{ padding: 8, fontSize: 15 }}>
                    {(p as any)[row.key] ? (
                      <Icon name="ic-check" size={15} style={{ color: "var(--color-primary)" }} />
                    ) : (
                      <span style={{ color: "var(--color-text-faint)" }}>—</span>
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
