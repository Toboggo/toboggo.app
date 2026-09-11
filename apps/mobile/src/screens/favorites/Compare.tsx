import { useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { getParkDisplayName, listParksByIds, haversineMeters } from "@toboggo/shared";
import { Icon } from "@toboggo/design-system";
import { TopBar } from "../../components/TopBar";
import { useGeo } from "../../lib/geo";
import { useFeatureLabel } from "../../lib/featureLabel";
import { useFormat } from "../../i18n/useFormat";

// Flat service/criteria columns compared (same keys as the map filters).
const SERVICE_KEYS = ["wc", "shade", "fenced", "pmr", "benches", "water", "parking"] as const;

export default function Compare() {
  const [params] = useSearchParams();
  const { t } = useTranslation("profile");
  const { t: tf } = useTranslation("features");
  const featureLabel = useFeatureLabel();
  const f = useFormat();
  const ids = (params.get("ids") ?? "").split(",").filter(Boolean);
  const { lat, lng } = useGeo();
  const { data: parks = [] } = useQuery({ queryKey: ["compare-parks", ids], queryFn: () => listParksByIds(ids) });

  return (
    <div className="screen">
      <TopBar title={t("compare.title")} />
      <div style={{ overflowX: "auto", padding: "0 16px" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 480 }}>
          <thead>
            <tr>
              <td />
              {parks.map((p) => (
                <th key={p.id} style={{ textAlign: "left", padding: 8, fontFamily: "var(--font-heading)", fontSize: 13 }}>
                  {getParkDisplayName(p, t)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style={{ fontSize: 12.5, color: "var(--color-text-muted)", padding: 8 }}>{t("compare.rating")}</td>
              {parks.map((p) => (
                <td key={p.id} style={{ padding: 8, fontSize: 13 }}>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                    <Icon name="ic-star" size={14} style={{ color: "var(--color-accent)" }} />
                    {f.rating(p.rating)}
                  </span>
                </td>
              ))}
            </tr>
            <tr>
              <td style={{ fontSize: 12.5, color: "var(--color-text-muted)", padding: 8 }}>{t("compare.age")}</td>
              {parks.map((p) => (
                <td key={p.id} style={{ padding: 8, fontSize: 13 }}>
                  {f.ageRange(p.age_min, p.age_max)}
                </td>
              ))}
            </tr>
            <tr>
              <td style={{ fontSize: 12.5, color: "var(--color-text-muted)", padding: 8 }}>{t("compare.surface")}</td>
              {parks.map((p) => (
                <td key={p.id} style={{ padding: 8, fontSize: 13 }}>
                  {p.surface ? tf(`surface.${p.surface}`, { defaultValue: String(p.surface) }) : "—"}
                </td>
              ))}
            </tr>
            <tr>
              <td style={{ fontSize: 12.5, color: "var(--color-text-muted)", padding: 8 }}>{t("compare.distance")}</td>
              {parks.map((p) => (
                <td key={p.id} style={{ padding: 8, fontSize: 13 }}>
                  {f.distance(haversineMeters(lat, lng, p.lat, p.lng))}
                </td>
              ))}
            </tr>
            {SERVICE_KEYS.map((key) => (
              <tr key={key} style={{ borderTop: "1px solid var(--color-border)" }}>
                <td style={{ fontSize: 12.5, color: "var(--color-text-muted)", padding: 8 }}>{featureLabel(key)}</td>
                {parks.map((p) => (
                  <td key={p.id} style={{ padding: 8, fontSize: 15 }}>
                    {(p as unknown as Record<string, unknown>)[key] ? (
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
