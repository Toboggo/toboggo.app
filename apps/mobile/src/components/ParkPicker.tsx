import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { Button, Input } from "@toboggo/design-system";
import { getParkDisplayName, searchParks, type Park } from "@toboggo/shared";

export function ParkPicker({ onPick, onNone }: { onPick: (park: Park) => void; onNone: () => void }) {
  const { t } = useTranslation("contribute");
  const [query, setQuery] = useState("");
  const { data: results = [] } = useQuery({
    queryKey: ["park-picker", query],
    queryFn: () => searchParks(query),
    enabled: query.trim().length >= 2,
  });

  return (
    <div style={{ padding: "0 20px" }}>
      <Input placeholder={t("picker.placeholder")} value={query} onChange={(e) => setQuery(e.target.value)} />
      <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 8 }}>
        {results.map((p) => (
          <button
            key={p.id}
            onClick={() => onPick(p)}
            style={{
              textAlign: "left",
              padding: 14,
              borderRadius: 14,
              border: "1.5px solid var(--color-border-strong)",
              background: "var(--color-surface)",
              cursor: "pointer",
            }}
          >
            <div style={{ fontFamily: "var(--font-heading)", fontWeight: 600, fontSize: 14 }}>{getParkDisplayName(p, t)}</div>
            <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>{p.formatted_address}</div>
          </button>
        ))}
      </div>
      <Button variant="ghost" block style={{ marginTop: 16 }} onClick={onNone}>
        {t("picker.none")}
      </Button>
    </div>
  );
}
