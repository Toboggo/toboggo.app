import { listMyParks } from "./parks";
import { listMyReviews } from "./reviews";
import { listMyReports } from "./reports";
import { listMyParkEdits } from "./contributions";
import { listMyMedia } from "./parkDetails";
import type { ParkMedia } from "../types";

export type UserContributionType = "park" | "edit" | "media" | "report" | "review";

export interface UserContribution {
  /** Stable render key — not a raw DB id for "media" (see grouping below). */
  id: string;
  /** The real row id in the source table (`parks.id` / `park_edits.id` /
   * `park_media.id` / `reports.id` / `reviews.id`). For a grouped "media"
   * batch this is the first photo's id — kept so a future detail screen can
   * still fetch the exact underlying record without re-parsing `id`. */
  sourceId: string;
  type: UserContributionType;
  parkId: string | null;
  parkName: string | null;
  city: string | null;
  createdAt: string;
  /** Raw status enum from the source table — `EditStatus | MediaStatus |
   * ReportStatus | ReviewStatus | ParkModerationStatus`. Never pre-translated
   * here; label/tone mapping is a UI concern (per contribution type). */
  status: string;
  thumbnail: string | null;
  /** `type === "edit"` only — which part of the park record was corrected
   * (`park_edits.changes.target`, set by EditInfo's wizard). */
  editTarget?: string | null;
  /** `type === "media"` only — number of photos submitted in the same batch. */
  photoCount?: number;
  /** `type === "review"` only. */
  rating?: number;
  /** `type === "report"` only — `reports.category`. */
  reportCategory?: string | null;
}

/**
 * One parent's contributions across every source table, newest first.
 *
 * Five independent queries — each already filtered server-side by `user_id`
 * (RLS-backed), one request per source, no N+1 — merged and sorted
 * client-side. Deliberately not a new `contributions` table: `parks`,
 * `park_edits`, `park_media`, `reports` and `reviews` stay the source of
 * truth, this is a read-time projection over them.
 *
 * A batch of photos submitted together by `addParkPhotos` shares the exact
 * same `created_at` (rows from one `INSERT`), so they're grouped into a
 * single "N photos ajoutées" entry instead of one row per photo.
 */
export async function listMyContributions(userId: string): Promise<UserContribution[]> {
  const [parks, edits, media, reports, reviews] = await Promise.all([
    listMyParks(userId),
    listMyParkEdits(userId),
    listMyMedia(userId),
    listMyReports(userId),
    listMyReviews(userId),
  ]);

  const items: UserContribution[] = [];

  for (const p of parks) {
    items.push({
      id: `park:${p.id}`,
      sourceId: p.id,
      type: "park",
      parkId: p.id,
      parkName: p.name,
      city: p.city,
      createdAt: p.created_at,
      status: p.moderation_status,
      thumbnail: p.cover_photo,
    });
  }

  for (const e of edits) {
    // `changes` is free-form jsonb (see `ParkEdit.changes`); EditInfo always
    // writes `{ kind: "correction", target, park_name, items, note }`.
    const changes = e.changes as { target?: string } | null;
    items.push({
      id: `edit:${e.id}`,
      sourceId: e.id,
      type: "edit",
      parkId: e.park_id,
      parkName: e.parks?.name ?? null,
      city: e.parks?.city ?? null,
      createdAt: e.created_at,
      status: e.status,
      thumbnail: null,
      editTarget: changes?.target ?? null,
    });
  }

  const mediaBatches = new Map<string, ParkMedia[]>();
  for (const m of media) {
    const key = `${m.park_id}|${m.created_at}`;
    const batch = mediaBatches.get(key);
    if (batch) batch.push(m);
    else mediaBatches.set(key, [m]);
  }
  for (const batch of mediaBatches.values()) {
    const first = batch[0] as (typeof media)[number];
    items.push({
      id: `media:${first.id}`,
      sourceId: first.id,
      type: "media",
      parkId: first.park_id,
      parkName: first.parks?.name ?? null,
      city: first.parks?.city ?? null,
      createdAt: first.created_at,
      status: first.status,
      thumbnail: first.url,
      photoCount: batch.length,
    });
  }

  for (const r of reports) {
    items.push({
      id: `report:${r.id}`,
      sourceId: r.id,
      type: "report",
      parkId: r.park_id,
      parkName: r.parks?.name ?? null,
      city: r.parks?.city ?? null,
      createdAt: r.created_at,
      status: r.status,
      thumbnail: r.photo ?? null,
      reportCategory: r.category ?? null,
    });
  }

  for (const rv of reviews) {
    items.push({
      id: `review:${rv.id}`,
      sourceId: rv.id,
      type: "review",
      parkId: rv.park_id,
      parkName: rv.parks?.name ?? null,
      city: rv.parks?.city ?? null,
      createdAt: rv.created_at,
      status: rv.status,
      thumbnail: null,
      rating: rv.rating,
    });
  }

  items.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  return items;
}

export interface UserImpactStats {
  /** Contributions that reached a "published/approved"-equivalent state for
   * their type — see `COMPLETED_STATUS`. */
  publishedCount: number;
  /** Distinct parks touched by one of those completed contributions. */
  parksImprovedCount: number;
}

/** Per-type status values that count as "done" for the impact metrics — the
 * closest real equivalent to the mockup's "publié". Deliberately excludes
 * `pending`/`open`/`in_progress`/`rejected`/`dismissed`/`flagged`/`hidden`:
 * only a real, verifiable outcome counts. */
const COMPLETED_STATUS: Record<UserContributionType, readonly string[]> = {
  park: ["published"],
  edit: ["approved", "auto_approved"],
  media: ["approved"],
  report: ["resolved"],
  review: ["published"],
};

/** The only two metrics backed by real, calculable data — no "parents aidés"
 * or other unverifiable counter (chantier decision, see the hub's "Votre
 * impact" section). */
export function computeImpactStats(items: UserContribution[]): UserImpactStats {
  const completed = items.filter((i) => COMPLETED_STATUS[i.type].includes(i.status));
  const parkIds = new Set(completed.map((i) => i.parkId).filter((id): id is string => id != null));
  return { publishedCount: completed.length, parksImprovedCount: parkIds.size };
}
