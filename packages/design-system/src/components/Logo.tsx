import { useId } from "react";
import type { CSSProperties } from "react";

/**
 * Toboggo brand mark — the "T-toboggan": a white T whose vertical bar slides
 * down into a curve and ends in an orange ball. Rounded green-gradient tile.
 *
 * Geometry is copied verbatim from the Claude Design handoff
 * ("Localisateur de parcs enfants/Toboggo Logo.dc.html"), which is the single
 * source of truth for the mark across the landing site, the app and the back
 * office. Do not eyeball-tweak the paths — re-export from the design file.
 */

const GRAD_FROM = "#3DBE90";
const GRAD_TO = "#1F7D5F";
const BALL = "#FFB020";

export function LogoMark({
  size = 32,
  rounded = true,
  style,
  title = "Toboggo",
}: {
  size?: number;
  /** draw the rounded tile background; set false when the host already clips (e.g. OS app icon) */
  rounded?: boolean;
  style?: CSSProperties;
  title?: string;
}) {
  const gid = useId();
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 56 56"
      role="img"
      aria-label={title}
      style={{ display: "block", flex: "none", ...style }}
    >
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={GRAD_FROM} />
          <stop offset="1" stopColor={GRAD_TO} />
        </linearGradient>
      </defs>
      {rounded ? (
        <rect width="56" height="56" rx="16" fill={`url(#${gid})`} />
      ) : (
        <rect width="56" height="56" fill={`url(#${gid})`} />
      )}
      <path
        d="M17 15 L39 15 M28 15 L28 30"
        fill="none"
        stroke="#FFFFFF"
        strokeWidth="6"
        strokeLinecap="round"
      />
      <path
        d="M28 30 C28 39 34 39 34 45"
        fill="none"
        stroke="#FFFFFF"
        strokeWidth="6"
        strokeLinecap="round"
      />
      <circle cx="34" cy="45" r="4.2" fill={BALL} />
    </svg>
  );
}

/**
 * Full lockup: the mark plus the "Toboggo" wordmark set in Fredoka, as used in
 * the landing nav/footer and the back-office sidebar.
 */
export function Logo({
  size = 28,
  wordmark = true,
  tone = "auto",
  suffix,
}: {
  /** height of the mark in px; the wordmark scales with it */
  size?: number;
  wordmark?: boolean;
  /** "auto" follows the current text color; "light" forces white (dark backgrounds) */
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
          Toboggo
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
