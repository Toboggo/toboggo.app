import type { CSSProperties } from "react";

const roundedMarkUrl = new URL("../assets/brand/app-icon.svg", import.meta.url).href;
const squareMarkUrl = new URL("../assets/brand/app-icon-square.svg", import.meta.url).href;

/**
 * Official v3 assets copied unchanged from toboggo-brand-kit-v3/icon.
 * Keep the supplied geometry and colours; do not redraw the mark.
 */
export function LogoMark({
  size = 32,
  rounded = true,
  style,
  title = "Toboggo",
}: {
  size?: number;
  /** Select the official rounded or square asset. */
  rounded?: boolean;
  style?: CSSProperties;
  title?: string;
}) {
  return (
    <img
      src={rounded ? roundedMarkUrl : squareMarkUrl}
      width={size}
      height={size}
      alt={title}
      style={{ display: "block", flex: "none", ...style }}
    />
  );
}

/**
 * Full lockup: the mark plus the "Toboggo" wordmark set in Fredoka.
 *
 * - `variant="brand"` — official bicolour wordmark: "Tobo" in brand green
 *   (`--color-primary`), "ggo" in brand amber (`--color-accent`). This is the
 *   validated identity (see docs/identite-visuelle-formats.md). Use it on
 *   marketing / onboarding / hero surfaces (Splash, Auth).
 * - `variant="mono"` (default) — single-colour wordmark that follows the
 *   current text colour, or forced white with `tone="light"`. Use it in dense
 *   or functional surfaces and on coloured backgrounds (back-office sidebar,
 *   landing nav, small sizes).
 *
 * `tone` only applies to `variant="mono"`; the bicolour variant keeps its brand
 * colours on any background. The wordmark's decorative two-tone swoosh (see the
 * 02-wordmark-toboggo asset) is not reproduced here — this is the lockup, not
 * the artwork; use the asset file for pixel-perfect print/marketing use.
 */
export function Logo({
  size = 28,
  wordmark = true,
  variant = "mono",
  tone = "auto",
  suffix,
}: {
  /** height of the mark in px; the wordmark scales with it */
  size?: number;
  wordmark?: boolean;
  /** "brand" = official bicolour wordmark; "mono" = single colour (default) */
  variant?: "brand" | "mono";
  /** mono only — "auto" follows the current text color; "light" forces white */
  tone?: "auto" | "light";
  /** small muted label after the wordmark, e.g. "Admin" */
  suffix?: string;
}) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: size * 0.36,
        color: tone === "light" ? "#ffffff" : "var(--color-text, #24303a)",
        lineHeight: 1,
      }}
    >
      <LogoMark size={size} />
      {wordmark && (
        <span
          style={{
            fontFamily: "var(--font-heading, 'Fredoka', system-ui, sans-serif)",
            fontWeight: 700,
            fontSize: size * 0.62,
            letterSpacing: "-0.01em",
          }}
        >
          {variant === "brand" ? (
            <>
              <span style={{ color: "var(--color-primary)" }}>Tobo</span>
              <span style={{ color: "var(--color-accent)" }}>ggo</span>
            </>
          ) : (
            "Toboggo"
          )}
          {suffix && (
            <span style={{ opacity: 0.5, fontWeight: 600, fontSize: "0.7em", marginLeft: "0.4em" }}>
              {suffix}
            </span>
          )}
        </span>
      )}
    </span>
  );
}
