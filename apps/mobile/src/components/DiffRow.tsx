import type { ReactNode } from "react";

/**
 * "Valeur actuelle → Votre correction" — a single structured change, shown on
 * the review step of the correction flow. Keeps a contribution readable for the
 * moderator instead of a free-text blob.
 */
export function DiffRow({
  label,
  current,
  proposed,
}: {
  label: string;
  current: ReactNode;
  proposed: ReactNode;
}) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 4,
        padding: "10px 0",
        borderBottom: "1px solid var(--color-border)",
      }}
    >
      <div style={{ fontFamily: "var(--font-heading)", fontWeight: 600, fontSize: 13 }}>{label}</div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, flexWrap: "wrap" }}>
        <span style={{ color: "var(--color-text-muted)", textDecoration: "line-through" }}>
          {current === "" || current == null ? "—" : current}
        </span>
        <span aria-hidden style={{ color: "var(--color-text-faint)" }}>
          →
        </span>
        <span style={{ color: "var(--color-primary)", fontWeight: 700 }}>
          {proposed === "" || proposed == null ? "—" : proposed}
        </span>
      </div>
    </div>
  );
}
