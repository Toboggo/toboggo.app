import clsx from "clsx";

const Star = ({ fill }: { fill: number }) => (
  <svg width="16" height="16" viewBox="0 0 24 24" style={{ overflow: "visible" }}>
    <defs>
      <linearGradient id={`star-fill-${fill}`}>
        <stop offset={`${fill * 100}%`} stopColor="var(--color-accent)" />
        <stop offset={`${fill * 100}%`} stopColor="var(--color-border-strong)" />
      </linearGradient>
    </defs>
    <path
      d="M12 2.5l2.9 6.2 6.8.8-5 4.7 1.3 6.8L12 17.8l-6 3.2 1.3-6.8-5-4.7 6.8-.8z"
      fill={`url(#star-fill-${fill})`}
    />
  </svg>
);

export function StarRating({
  value,
  count,
  size = "md",
  showValue = true,
}: {
  value: number;
  count?: number;
  size?: "sm" | "md";
  showValue?: boolean;
}) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
      <span style={{ display: "inline-flex", gap: 1, transform: size === "sm" ? "scale(0.85)" : undefined }}>
        {[0, 1, 2, 3, 4].map((i) => (
          <Star key={i} fill={Math.max(0, Math.min(1, value - i))} />
        ))}
      </span>
      {showValue && (
        <span style={{ fontFamily: "var(--font-heading)", fontWeight: 700, fontSize: size === "sm" ? 12 : 13 }}>
          {value.toFixed(1)}
        </span>
      )}
      {count != null && (
        <span style={{ color: "var(--color-text-muted)", fontSize: size === "sm" ? 12 : 13 }}>({count})</span>
      )}
    </span>
  );
}

export function StarInput({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <span style={{ display: "inline-flex", gap: 6 }}>
      {[1, 2, 3, 4, 5].map((i) => (
        <button
          key={i}
          type="button"
          aria-label={`${i} étoiles`}
          onClick={() => onChange(i)}
          className={clsx()}
          style={{ background: "none", border: "none", cursor: "pointer", padding: 2 }}
        >
          <svg width="30" height="30" viewBox="0 0 24 24">
            <path
              d="M12 2.5l2.9 6.2 6.8.8-5 4.7 1.3 6.8L12 17.8l-6 3.2 1.3-6.8-5-4.7 6.8-.8z"
              fill={i <= value ? "var(--color-accent)" : "var(--color-border-strong)"}
            />
          </svg>
        </button>
      ))}
    </span>
  );
}
