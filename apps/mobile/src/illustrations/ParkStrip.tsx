import type { IllustrationProps } from "./index";

/** Short park strip used at the bottom of the "Se connecter" method chooser. */
export function ParkStrip({ style, className }: IllustrationProps) {
  return (
    <svg
      viewBox="0 0 400 200"
      preserveAspectRatio="xMidYMax slice"
      className={className}
      style={{ position: "absolute", inset: 0, width: "100%", height: "100%", ...style }}
    >
      <rect x="0" y="0" width="400" height="200" fill="#EAF7EF" />
      <rect x="20" y="20" width="20" height="90" fill="#D8E9E2" />
      <rect x="340" y="10" width="22" height="100" fill="#D8E9E2" />
      <rect x="0" y="90" width="400" height="110" fill="#6DBE6B" />
      <g>
        <rect x="70" y="95" width="7" height="40" fill="#7A4A2B" />
        <circle cx="73" cy="88" r="22" fill="#3E9B4F" />
      </g>
      <g>
        <rect x="330" y="90" width="7" height="45" fill="#7A4A2B" />
        <circle cx="334" cy="82" r="24" fill="#379244" />
      </g>
      <polygon points="220,60 250,95 190,95" fill="#059669" />
      <rect x="210" y="95" width="22" height="32" fill="#7A4A2B" />
      <path d="M220 127 C220 155 265 155 267 178" stroke="#F5B841" strokeWidth="16" fill="none" strokeLinecap="round" />
      <path d="M220 127 C220 155 265 155 267 178" stroke="#FFCE5C" strokeWidth="10" fill="none" strokeLinecap="round" />
    </svg>
  );
}
