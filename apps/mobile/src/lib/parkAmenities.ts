import type { FeatureStatus, Park } from "@toboggo/shared";
import { canonicalFeatureCode } from "./featureLabel";

/**
 * Three-state reading of what a park says about its services and play
 * equipment. The distinction matters: « no WC » (explicitly recorded as
 * unavailable) is information, « WC not recorded » is not — an unknown value
 * is NEVER turned into « absent ».
 *
 * What the data really says (see `park_public`):
 *  - flat availability projections (`wc`, `pmr`, `benches`, `water`, `parking`)
 *    are `fstatus(...) = 'available'`: `true` = available, `null` = no
 *    `park_features` row, but **`false` covers unavailable, unknown and
 *    temporarily_unavailable alike** — a `false` alone cannot prove absence. The
 *    `features` map (`status`) is the only source that tells them apart.
 *  - value-based projections (`fenced`, `shade`) are computed from the recorded
 *    value: `false` = a value is recorded and it is not fenced / shaded (explicit
 *    absence), `null` = nothing recorded.
 * `temporarily_unavailable` is neither present nor permanently absent nor
 * unknown: it is its own `temporary` state, read from the detailed status
 * BEFORE the aggregated flags (so it never falls into « unknown » nor into the
 * present summaries).
 *
 * `verified` is true only when the feature row carries a `verified_at`: a plain
 * `false` is not proof of a verification.
 *
 * Limit: the model has no per-feature « unknown » row for games the park never
 * mentioned, so only games that exist in `features` are listed as present /
 * absent / unknown — the catalogue is never enumerated as « to confirm ».
 */
export type AmenityState = "present" | "absent" | "unknown" | "temporary";

export interface AmenityEntry {
  /** Raw code: service key (`wc`) or catalogue play code (`slide`). */
  code: string;
  kind: "service" | "play";
  state: AmenityState;
  verified: boolean;
}

export const SERVICE_KEYS = ["wc", "shade", "fenced", "pmr", "benches", "water", "parking"] as const;
export type ServiceKey = (typeof SERVICE_KEYS)[number];

type ServiceFields = Partial<Record<ServiceKey, boolean | null>>;
type ParkAmenityInput = Partial<Pick<Park, "features" | "play_equipment">> & ServiceFields;

export function stateFromStatus(status: FeatureStatus | undefined): AmenityState {
  if (status === "available") return "present";
  if (status === "unavailable") return "absent";
  if (status === "temporarily_unavailable") return "temporary";
  return "unknown";
}

/** Flat projections computed from a recorded value rather than from a status. */
const VALUE_BASED: readonly ServiceKey[] = ["fenced", "shade"];

function serviceState(flat: boolean | null | undefined, view: { status: FeatureStatus } | undefined, key: ServiceKey): AmenityState {
  // Detailed status first: a temporary closure wins over any aggregated flag.
  if (view?.status === "temporarily_unavailable") return "temporary";
  if (flat === true) return "present";
  if (VALUE_BASED.includes(key)) {
    if (flat === false) return "absent";
    return view?.status === "unavailable" ? "absent" : "unknown";
  }
  // Availability-based: `false` is ambiguous, only the feature status decides.
  return stateFromStatus(view?.status);
}

export function serviceEntry(park: ParkAmenityInput, key: ServiceKey): AmenityEntry {
  const view = park.features?.[canonicalFeatureCode(key)];
  const state = serviceState(park[key], view, key);
  return { code: key, kind: "service", state, verified: state !== "unknown" && Boolean(view?.verified_at) };
}

export function serviceEntries(park: ParkAmenityInput): AmenityEntry[] {
  return SERVICE_KEYS.map((key) => serviceEntry(park, key));
}

/** Games recorded on the park: present (available), absent (unavailable),
 * temporary (temporarily unavailable) or unknown (row exists, status unknown). Legacy
 * `play_equipment` codes count as present. */
export function playEntries(park: ParkAmenityInput): AmenityEntry[] {
  const out = new Map<string, AmenityEntry>();
  for (const [code, view] of Object.entries(park.features ?? {})) {
    if (view.category !== "play") continue;
    const state = stateFromStatus(view.status);
    out.set(canonicalFeatureCode(code), {
      code: canonicalFeatureCode(code),
      kind: "play",
      state,
      verified: state !== "unknown" && Boolean(view.verified_at),
    });
  }
  for (const code of park.play_equipment ?? []) {
    const canonical = canonicalFeatureCode(code);
    if (!out.has(canonical)) out.set(canonical, { code: canonical, kind: "play", state: "present", verified: false });
  }
  return [...out.values()];
}

export function amenityEntries(park: ParkAmenityInput): AmenityEntry[] {
  return [...playEntries(park), ...serviceEntries(park)];
}
