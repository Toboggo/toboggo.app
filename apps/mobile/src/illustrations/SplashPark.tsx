import type { IllustrationProps } from "./index";

/**
 * Splash / onboarding hero — park scene with a slide and three figures.
 * Ported 1:1 from the Claude Design prototype (viewBox 0 0 400 420,
 * rendered with preserveAspectRatio="xMidYMax slice").
 */
export function SplashPark({ style, className }: IllustrationProps) {
  return (
    <svg
      viewBox="0 0 400 420"
      preserveAspectRatio="xMidYMax slice"
      className={className}
      style={{ position: "absolute", inset: 0, width: "100%", height: "100%", ...style }}
    >
      <rect x="0" y="0" width="400" height="420" fill="#EAF7EF" />
      <circle cx="70" cy="70" r="26" fill="#fff" opacity=".7" />
      <circle cx="330" cy="55" r="20" fill="#fff" opacity=".6" />
      <rect x="260" y="60" width="30" height="150" fill="#D8E9E2" />
      <rect x="300" y="90" width="24" height="120" fill="#D8E9E2" />
      <rect x="60" y="100" width="26" height="110" fill="#D8E9E2" />
      <rect x="0" y="230" width="400" height="190" fill="#6DBE6B" />
      <ellipse cx="70" cy="245" rx="60" ry="26" fill="#5DAE5C" />
      <ellipse cx="330" cy="255" rx="70" ry="28" fill="#5DAE5C" />
      <g>
        <rect x="55" y="255" width="8" height="60" fill="#7A4A2B" />
        <circle cx="59" cy="245" r="30" fill="#3E9B4F" />
      </g>
      <g>
        <rect x="315" y="250" width="9" height="65" fill="#7A4A2B" />
        <circle cx="320" cy="238" r="34" fill="#379244" />
      </g>
      <g>
        <rect x="360" y="270" width="7" height="45" fill="#7A4A2B" />
        <circle cx="364" cy="262" r="24" fill="#4DA857" />
      </g>
      <polygon points="200,150 245,205 155,205" fill="#059669" />
      <rect x="185" y="205" width="30" height="45" fill="#7A4A2B" />
      <rect x="182" y="208" width="8" height="42" fill="#5C3A20" />
      <rect x="210" y="208" width="8" height="42" fill="#5C3A20" />
      <path d="M200 250 C200 300 260 300 262 340" stroke="#F5B841" strokeWidth="26" fill="none" strokeLinecap="round" />
      <path d="M200 250 C200 300 260 300 262 340" stroke="#FFCE5C" strokeWidth="18" fill="none" strokeLinecap="round" />
      <path d="M200 250 C155 285 130 285 128 320" stroke="#F5B841" strokeWidth="24" fill="none" strokeLinecap="round" />
      <path d="M200 250 C155 285 130 285 128 320" stroke="#FFCE5C" strokeWidth="16" fill="none" strokeLinecap="round" />
      <g>
        <circle cx="120" cy="330" r="9" fill="#F3D9C4" />
        <rect x="110" y="338" width="20" height="24" rx="6" fill="#E4573B" />
      </g>
      <g>
        <circle cx="258" cy="352" r="9" fill="#F3D9C4" />
        <rect x="248" y="360" width="20" height="26" rx="6" fill="#F08A2E" />
        <rect x="248" y="382" width="9" height="22" fill="#E4573B" />
        <rect x="259" y="382" width="9" height="22" fill="#E4573B" />
      </g>
      <g>
        <circle cx="222" cy="358" r="9" fill="#F3D9C4" />
        <rect x="212" y="366" width="20" height="26" rx="6" fill="#3E7BC4" />
        <rect x="212" y="388" width="9" height="20" fill="#24303A" />
        <rect x="223" y="388" width="9" height="20" fill="#24303A" />
      </g>
    </svg>
  );
}
