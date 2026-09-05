/**
 * Shared domain types, mirroring the Supabase schema in supabase/migrations
 * (implements toboggo_architecture_bdd_mondiale_v2_technique.pdf).
 *
 * Column names are snake_case to match Postgres/Supabase rows directly.
 *
 * The canonical model is normalised: a park is a geographic entity, its
 * amenities live in `features` + `park_features`, its internal areas in
 * `park_zones`, provenance in `park_sources` / `external_ids`, etc.
 * The `park_public` view also projects a flat compatibility shape (the
 * `*_compat` fields on `Park`) so UI code can migrate incrementally.
 */

import type { Json } from "./types/database.types";

export type { Json };

// ── Enums ──────────────────────────────────────────────────────────────────
export type ParkModerationStatus = "draft" | "pending" | "published" | "blocked" | "rejected";
/** Alias kept for existing UI code that reads `park.status`. */
export type ParkStatus = ParkModerationStatus;

export type ParkOperationalStatus =
  | "active"
  | "temporarily_closed"
  | "partially_closed"
  | "under_construction"
  | "permanently_closed"
  | "unknown";

export type VerificationStatus =
  | "unverified"
  | "community_verified"
  | "organization_verified"
  | "toboggo_verified";

export type FeatureStatus = "available" | "unavailable" | "unknown" | "temporarily_unavailable";
export type FeatureCategory = "play" | "service" | "environment" | "accessibility" | "safety";

export type SourceType = "osm" | "open_data" | "municipality" | "partner" | "user" | "toboggo" | "other";
export type EditStatus = "pending" | "approved" | "rejected" | "auto_approved";

export type ReportCategory =
  | "broken_equipment"
  | "safety"
  | "cleanliness"
  | "vegetation"
  | "accessibility"
  | "wrong_info"
  | "other";
/** Legacy alias. */
export type ReportReason = ReportCategory;
export type ReportStatus = "open" | "in_progress" | "resolved" | "dismissed";
export type ReportSeverity = "low" | "medium" | "high" | "critical";

export type ReviewStatus = "published" | "flagged" | "hidden" | "pending";
export type MediaCategory =
  | "cover"
  | "play_area"
  | "entrance"
  | "equipment"
  | "surroundings"
  | "accessibility"
  | "other";
export type MediaStatus = "pending" | "approved" | "rejected";

export type OrganizationType =
  | "municipality"
  | "intercommunality"
  | "department"
  | "region"
  | "state"
  | "private_operator"
  | "association"
  | "other";
export type OrganizationParkRole = "owner" | "manager" | "operator" | "maintainer" | "contributor";

export type EquipmentCondition = "new" | "good" | "fair" | "poor" | "out_of_service" | "unknown";
export type EquipmentStatus = "installed" | "removed" | "planned" | "unknown";
export type EntranceType = "main" | "secondary" | "pmr" | "parking" | "service";
export type AccessLevel = "yes" | "limited" | "no" | "unknown";

export type AgeBand = "all" | "under3" | "3-6" | "6-12";
export type MaintenanceRecurrence = "none" | "monthly" | "yearly";
export type TeamRole = "super_admin" | "moderation" | "support" | "gestionnaire" | "contributeur";
export type NotificationType = "resolved" | "newPark" | "thanks" | "confirm" | "recommend";

// ── §17 Organisations ─────────────────────────────────────────────────────
export interface Organization {
  id: string;
  name: string;
  type: OrganizationType;
  country_code: string | null;
  contact_email: string | null;
  email_notif: boolean;
  website: string | null;
  verified: boolean;
  created_at: string;
  updated_at: string;
}
/** Legacy alias — the back office still says "commune". */
export type Commune = Organization;

export interface OrganizationPark {
  organization_id: string;
  park_id: string;
  role: OrganizationParkRole;
  verified: boolean;
  created_at: string;
}

// ── §3 Feature catalogue ──────────────────────────────────────────────────
export interface Feature {
  id: string;
  code: string;
  category: FeatureCategory;
  label_key: string;
  icon_key: string | null;
  value_set: string[] | null;
  sort_order: number;
  is_active: boolean;
  created_at: string;
}

export interface ParkFeature {
  park_id: string;
  feature_id: string;
  status: FeatureStatus;
  value: string | null;
  quantity: number | null;
  note: string | null;
  source_id: string | null;
  verified_at: string | null;
  updated_at: string;
}

/** Shape of a single entry in `Park.features` (from the `park_public` view). */
export interface ParkFeatureView {
  status: FeatureStatus;
  value: string | null;
  quantity: number | null;
  category: FeatureCategory;
  verified_at: string | null;
}

// ── §1 §2 Park (canonical) + compatibility projection ────────────────────
export interface Park {
  id: string;
  name: string;
  slug: string | null;
  description: string | null;

  latitude: number;
  longitude: number;
  /** @deprecated use `latitude` */
  lat: number;
  /** @deprecated use `longitude` */
  lng: number;
  boundary: unknown | null;
  country_code: string;
  timezone: string;

  address_line: string | null;
  postal_code: string | null;
  city: string | null;
  admin_area_1: string | null;
  admin_area_2: string | null;

  min_age: number | null;
  max_age: number | null;
  ages_derived: boolean;

  moderation_status: ParkModerationStatus;
  operational_status: ParkOperationalStatus;
  status_reason: string | null;
  status_from: string | null;
  status_until: string | null;
  verification_status: VerificationStatus;

  created_by: string | null;
  rating: number;
  review_count: number;
  has_open_report: boolean;
  views: number;
  created_at: string;
  updated_at: string;
  last_verified_at: string | null;

  // ── from the park_public view ──
  features: Record<string, ParkFeatureView>;
  cover_photo: string | null;
  photos: string[];
  translated_names: string[];
  score: number | null;
  has_score: boolean;

  // ── compatibility projection (see park_public) ──
  /** @deprecated use `min_age` */
  age_min: number;
  /** @deprecated use `max_age` */
  age_max: number;
  /** @deprecated use `moderation_status` */
  status: ParkModerationStatus;
  formatted_address: string | null;
  /** @deprecated use organization_parks / `organization_id` */
  commune_id: string | null;
  organization_id: string | null;
  /** @deprecated use `features.surface_type` */
  surface: "sable" | "gazon" | "sol_souple" | "non_precise";
  /** @deprecated use `features` (play category) */
  play_equipment: string[];
  /** @deprecated use `features.toilets` */
  wc: boolean;
  /** @deprecated use `features.shade_level` */
  shade: boolean;
  /** @deprecated use `features.fence_status` */
  fenced: boolean;
  /** @deprecated use `features.wheelchair_access` */
  pmr: boolean;
  /** @deprecated use `features.benches` */
  benches: boolean;
  /** @deprecated use `features.drinking_water` / `features.water_play` */
  water: boolean;
  /** @deprecated use `features.parking` */
  parking: boolean;
}

// ── §6 Zones ─────────────────────────────────────────────────────────────
export interface ParkZone {
  id: string;
  park_id: string;
  name: string;
  description: string | null;
  min_age: number | null;
  max_age: number | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

// ── §7 Entrances ─────────────────────────────────────────────────────────
export interface ParkEntrance {
  id: string;
  park_id: string;
  name: string | null;
  type: EntranceType;
  wheelchair_access: AccessLevel;
  is_primary: boolean;
  created_at: string;
}

// ── §5 Physical equipment ────────────────────────────────────────────────
export interface ParkEquipment {
  id: string;
  park_id: string;
  zone_id: string | null;
  feature_id: string | null;
  name: string | null;
  manufacturer: string | null;
  model: string | null;
  quantity: number;
  condition: EquipmentCondition | null;
  status: EquipmentStatus;
  installation_date: string | null;
  last_inspection_at: string | null;
  next_inspection_at: string | null;
  created_at: string;
  updated_at: string;
}

// ── §9 Opening hours ─────────────────────────────────────────────────────
export interface ParkOpeningHours {
  id: string;
  park_id: string;
  opening_hours: string;
  timezone: string;
  season_from: string | null;
  season_until: string | null;
  note: string | null;
  source_id: string | null;
  created_at: string;
  updated_at: string;
}

// ── §10 Sources / external ids ───────────────────────────────────────────
export interface ParkSource {
  id: string;
  park_id: string;
  source_type: SourceType;
  source_name: string | null;
  source_url: string | null;
  license: string | null;
  last_synced_at: string | null;
  created_at: string;
}

export interface ExternalId {
  id: string;
  park_id: string;
  provider: string;
  external_id: string;
  created_at: string;
}

// ── §18 Multilingual names ───────────────────────────────────────────────
export interface ParkName {
  id: string;
  park_id: string;
  lang: string;
  name: string;
  is_primary: boolean;
  source_id: string | null;
  created_at: string;
}

// ── §12 Field-level provenance ───────────────────────────────────────────
export interface ParkAttributeSource {
  id: string;
  park_id: string;
  attribute_key: string;
  value_json: unknown;
  source_id: string | null;
  confidence: number | null;
  verified_at: string | null;
  is_current: boolean;
  created_at: string;
}

// ── §13 Change-requests ──────────────────────────────────────────────────
export interface ParkEdit {
  id: string;
  park_id: string | null;
  user_id: string | null;
  organization_id: string | null;
  /** Free-form proposed field changes — stored as a `jsonb` column. */
  changes: Json;
  status: EditStatus;
  reviewed_by: string | null;
  review_note: string | null;
  created_at: string;
  reviewed_at: string | null;
}

// ── §14 Audit log ────────────────────────────────────────────────────────
export interface AuditLogEntry {
  id: string;
  entity_type: string;
  entity_id: string;
  action: string;
  field: string | null;
  old_value: unknown;
  new_value: unknown;
  actor_id: string | null;
  source: string;
  created_at: string;
}
/** Per-park history row, projected from `audit_log` by `getParkHistory`. */
export interface ParkEditHistoryEntry {
  id: string;
  park_id: string;
  actor: string;
  action: string;
  note: string | null;
  created_at: string;
}

// ── §15 Reviews ──────────────────────────────────────────────────────────
export interface ReviewSubRatings {
  clean: number;
  safety: number;
  equipment: number;
  comfort: number;
}

export interface Review {
  id: string;
  park_id: string;
  user_id: string;
  author_name: string;
  rating: number;
  cleanliness: number | null;
  safety: number | null;
  equipment: number | null;
  comfort: number | null;
  recommended_min_age: number | null;
  recommended_max_age: number | null;
  comment: string | null;
  status: ReviewStatus;
  reply: string | null;
  reply_by: string | null;
  reply_at: string | null;
  created_at: string;
  updated_at: string;

  // compatibility accessors
  /** @deprecated use `rating` */
  stars: number;
  /** @deprecated use `status === "flagged"` */
  flagged: boolean;
  /** @deprecated split into `cleanliness` / `safety` / `equipment` / `comfort` */
  sub_ratings: ReviewSubRatings | null;
  /** @deprecated reviews no longer carry a single photo — see park_media */
  photo: string | null;
  /** @deprecated use `recommended_min_age` / `recommended_max_age` */
  age_band: AgeBand | null;
}

// ── §15 Media ────────────────────────────────────────────────────────────
export interface ParkMedia {
  id: string;
  park_id: string;
  zone_id: string | null;
  user_id: string | null;
  url: string;
  category: MediaCategory;
  caption: string | null;
  is_cover: boolean;
  status: MediaStatus;
  created_at: string;
  // ── provenance (0025) — a park photo must have an identifiable origin ──
  /** Where the photo comes from. `null` = unknown (legacy rows). OSM never
   * creates park_media rows. */
  source: SourceType | null;
  /** Original page/URL of the photo at the source. */
  source_url: string | null;
  /** Declared author / photographer. */
  author: string | null;
  /** Usage licence (e.g. `CC-BY-SA-4.0`, `© Ville de X`). */
  license: string | null;
  /** Ready-to-display credit line. */
  attribution: string | null;
}

// ── §15 Reports ──────────────────────────────────────────────────────────
export interface Report {
  id: string;
  park_id: string;
  zone_id: string | null;
  equipment_id: string | null;
  user_id: string | null;
  reported_by_name: string;
  category: ReportCategory;
  severity: ReportSeverity;
  equipment_label: string | null;
  description: string | null;
  photo: string | null;
  status: ReportStatus;
  resolution_note: string | null;
  resolution_photo: string | null;
  resolution_days: number | null;
  resolved_by: string | null;
  resolved_at: string | null;
  created_at: string;

  // compatibility accessors
  /** @deprecated use `category` */
  reason: ReportCategory;
  /** @deprecated use `equipment_label` */
  equipment: string | null;
  /** @deprecated use `description` */
  comment: string | null;
}

// ── §16 Toboggo Score ────────────────────────────────────────────────────
export interface ParkScore {
  id: string;
  park_id: string;
  overall_score: number | null;
  equipment_score: number | null;
  safety_score: number | null;
  cleanliness_score: number | null;
  comfort_score: number | null;
  accessibility_score: number | null;
  confidence_score: number | null;
  algorithm_version: string;
  calculated_at: string;
}

// ── §11 Duplicate candidates ─────────────────────────────────────────────
export interface ParkDuplicateCandidate {
  id: string;
  park_id: string;
  candidate_park_id: string;
  geo_distance_m: number | null;
  geo_distance_score: number | null;
  name_similarity: number | null;
  address_similarity: number | null;
  external_id_match: boolean;
  total_score: number | null;
  resolution: string;
  resolved_by: string | null;
  created_at: string;
  resolved_at: string | null;
}

// ── App-domain tables ────────────────────────────────────────────────────
export interface TeamMember {
  id: string;
  user_id: string;
  organization_id: string | null; // null = Toboggo staff
  name: string;
  email: string;
  role: TeamRole;
  invited_by: string | null;
  created_at: string;
  /** @deprecated renamed to `organization_id` */
  commune_id: string | null;
}

export interface Maintenance {
  id: string;
  park_id: string;
  organization_id: string;
  zone_id: string | null;
  equipment_id: string | null;
  date: string;
  note: string | null;
  assignee: string | null;
  recur: MaintenanceRecurrence;
  done: boolean;
  done_date: string | null;
  created_at: string;
  /** @deprecated renamed to `organization_id` */
  commune_id: string;
}

export interface AppNotification {
  id: string;
  user_id: string;
  type: NotificationType;
  title: string;
  description: string;
  park_id: string | null;
  read: boolean;
  created_at: string;
}

export interface ActivityLogEntry {
  id: string;
  organization_id: string | null;
  actor: string;
  text: string;
  color: string;
  created_at: string;
  /** @deprecated renamed to `organization_id` */
  commune_id: string | null;
}

export interface Profile {
  id: string;
  name: string;
  email: string;
  children: { age: number }[];
  favorites: string[];
  notif_prefs: {
    reports: boolean;
    newParks: boolean;
    reviewReplies: boolean;
    recommendations: boolean;
    news: boolean;
  };
  notif_channels: { push: boolean; email: boolean };
  privacy_prefs: { shareLocation: boolean; publicProfile: boolean };
  dark_mode: boolean;
  offline_mode: boolean;
  suspended: boolean;
  created_at: string;
}

export interface GroupOuting {
  id: string;
  park_id: string;
  code: string;
  created_by: string;
  active: boolean;
  created_at: string;
}

export interface GroupMember {
  id: string;
  group_id: string;
  name: string;
  status: string;
}

// ── Labels ───────────────────────────────────────────────────────────────
export const AGE_BAND_LABEL: Record<AgeBand, string> = {
  all: "Tout âge",
  under3: "-3 ans",
  "3-6": "3-6 ans",
  "6-12": "6-12 ans",
};

export const REPORT_REASON_LABEL: Record<ReportCategory, string> = {
  broken_equipment: "Jeu cassé / dangereux",
  safety: "Problème de sécurité",
  cleanliness: "Propreté",
  vegetation: "Végétation envahissante",
  accessibility: "Accessibilité PMR",
  wrong_info: "Information erronée",
  other: "Autre",
};

export const REPORT_SEVERITY_LABEL: Record<ReportSeverity, string> = {
  low: "Mineur",
  medium: "Moyen",
  high: "Important",
  critical: "Critique",
};

export const VERIFICATION_LABEL: Record<VerificationStatus, string> = {
  unverified: "Non vérifié",
  community_verified: "Vérifié par la communauté",
  organization_verified: "Vérifié par la collectivité",
  toboggo_verified: "Vérifié par Toboggo",
};

export const OPERATIONAL_STATUS_LABEL: Record<ParkOperationalStatus, string> = {
  active: "Ouvert",
  temporarily_closed: "Fermé temporairement",
  partially_closed: "Partiellement fermé",
  under_construction: "En travaux",
  permanently_closed: "Fermé définitivement",
  unknown: "Statut inconnu",
};

export const FEATURE_STATUS_LABEL: Record<FeatureStatus, string> = {
  available: "Disponible",
  unavailable: "Absent",
  unknown: "Non renseigné",
  temporarily_unavailable: "Temporairement indisponible",
};

/**
 * Consumer-facing labels for feature catalogue codes. Kept here (rather than a
 * DB round-trip) because the catalogue is small and stable; new codes fall back
 * to a humanised version of the code.
 */
export const FEATURE_LABEL: Record<string, string> = {
  slide: "Toboggan",
  swing: "Balançoire",
  climbing: "Structure d'escalade",
  sandbox: "Bac à sable",
  springer: "Jeux à ressort",
  zipline: "Tyrolienne",
  carousel: "Carrousel",
  motor_course: "Piste motricité",
  multisport: "Terrain multisport",
  water_play: "Jeux d'eau",
  toilets: "Toilettes",
  drinking_water: "Point d'eau potable",
  parking: "Parking",
  benches: "Bancs",
  picnic_tables: "Tables de pique-nique",
  lighting: "Éclairage",
  bike_parking: "Stationnement vélo",
  fence_status: "Clôture",
  shade_level: "Ombrage",
  surface_type: "Revêtement de sol",
  wheelchair_access: "Accès fauteuil roulant",
  stroller_access: "Accès poussette",
  accessible_toilets: "Toilettes accessibles",
  accessible_parking: "Parking accessible",
  inclusive_play: "Jeux inclusifs",
  // OSM playground import (0022/0023_add_osm_playground_features) — sans ces
  // entrées, featureLabel() retombe sur le code technique brut (ex. "play
  // structure") au lieu d'un libellé français.
  play_structure: "Structure de jeux",
  seesaw: "Bascule",
  playhouse: "Maisonnette",
  trampoline: "Trampoline",
  balance_beam: "Poutre d'équilibre",
  agility_trail: "Parcours d'agilité",
  horizontal_bar: "Barre de traction",
  hopscotch: "Marelle",
};

/** Legacy map — the old prototype's play-equipment codes. */
export const PLAY_EQUIPMENT_LABEL: Record<string, string> = {
  toboggan: "Toboggan",
  swing: "Balançoire",
  climbing: "Structure d'escalade",
  waterplay: "Jeux d'eau",
  sandbox: "Bac à sable",
  springs: "Jeux à ressort",
  zipline: "Tyrolienne",
  carousel: "Carrousel",
  motorcourse: "Piste motricité",
  multisport: "Terrain multisport",
};

export function featureLabel(code: string): string {
  return FEATURE_LABEL[code] ?? PLAY_EQUIPMENT_LABEL[code] ?? code.replace(/_/g, " ");
}

// Age-range formatting (`formatAgeRange` / `formatAgeClause`) lives in
// `./utils/age` — single source of truth, avoids the duplicate-export
// ambiguity of having two same-named helpers re-exported from this package.
