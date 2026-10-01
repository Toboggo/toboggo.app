import type { SourceType } from "@toboggo/shared";

/** Human label of a data/photo provenance (`park_sources.source_type`,
 * `park_media.source`). Shared by the photos tab and the collectivité overview. */
export const SOURCE_LABEL: Partial<Record<SourceType, string>> = {
  user: "Contribution",
  municipality: "Collectivité",
  toboggo: "Toboggo",
  osm: "OpenStreetMap",
  open_data: "Open data",
  partner: "Partenaire",
  other: "Autre",
};
