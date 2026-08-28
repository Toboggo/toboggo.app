import { useQuery } from "@tanstack/react-query";
import { getCommunityActivity } from "@toboggo/shared";
import { DetailHeader } from "../../components/DetailHeader";

export default function Activity() {
  const { data: items = [], isLoading } = useQuery({ queryKey: ["community-activity"], queryFn: () => getCommunityActivity() });

  return (
    <div style={{ minHeight: "100vh", background: "var(--color-bg)", display: "flex", flexDirection: "column" }}>
      <DetailHeader title="Activité" />
      <div style={{ flex: 1, overflow: "auto", padding: "6px 20px 30px" }}>
        {isLoading ? (
          <p style={{ color: "var(--color-text-muted)", fontSize: 13 }}>Chargement…</p>
        ) : items.length === 0 ? (
          <p style={{ textAlign: "center", color: "var(--color-text-muted)", fontSize: 13, marginTop: 40 }}>Aucune activité ici.</p>
        ) : (
          items.map((item) => (
            <div
              key={item.id}
              style={{ display: "flex", gap: 12, padding: "12px 0", borderBottom: "1px solid var(--color-border)" }}
            >
              <span style={{ fontSize: 18, flex: "none" }}>{item.icon}</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13.5, color: "var(--color-text)" }}>{item.text}</div>
                <div style={{ fontSize: 11.5, color: "var(--color-text-faint)", marginTop: 2 }}>
                  {new Date(item.time).toLocaleString("fr-FR")}
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
