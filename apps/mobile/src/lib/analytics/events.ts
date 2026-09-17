/**
 * Taxonomie Product Analytics — typée depuis docs/analytics/EVENT-TAXONOMY.md.
 *
 * Ce fichier est la SEULE source de vérité pour les noms d'événements et leurs
 * propriétés côté code. Toute évolution doit d'abord être actée dans
 * docs/analytics/EVENT-TAXONOMY.md, puis répercutée ici — jamais l'inverse.
 * Aucun événement ci-dessous n'est encore câblé dans un écran (socle
 * uniquement, cf. audit — l'instrumentation des 14 P0 est une phase
 * ultérieure).
 *
 * `EVENT_PROPERTY_ALLOWLIST` liste, pour chaque événement, les clés
 * effectivement autorisées à quitter ce module. `client.ts` s'en sert pour
 * filtrer le payload à l'envoi — y compris si l'appelant a, par erreur ou en
 * spreadant un objet plus large (`{ ...profile, park_id }`), fourni des clés
 * en trop : TypeScript ne bloque pas toujours ce cas (le spread contourne la
 * vérification des propriétés en excès sur les littéraux d'objet), donc cette
 * liste est une garantie *au runtime*, pas seulement au typage. Elle doit
 * rester synchronisée avec `AnalyticsEventProperties` ci-dessous (les clés de
 * chaque entrée doivent correspondre exactement).
 *
 * Les propriétés communes (`is_authenticated`, `app_version`, `locale`,
 * distinct_id — cf. EVENT-TAXONOMY.md "Propriétés communes") ne sont PAS
 * incluses dans les types par-événement ci-dessous : leur auto-attachement
 * dépend de l'état de session/i18n de l'app, ce qui est de l'instrumentation,
 * pas du socle. `CommonProperties` est déclaré pour la compatibilité future
 * mais n'est pas encore câblé — voir le commentaire dans `client.ts`.
 */

export interface CommonProperties {
  is_authenticated: boolean;
  app_version: string;
  locale: string;
}

export type DiscoverySource =
  | "map_marker"
  | "cluster"
  | "list"
  | "carousel"
  | "search_park"
  | "search_place"
  | "favorites"
  | "share_link"
  | "notification"
  | "contribution_success"
  | "other";

export type DistanceBucket = "<1km" | "1-3km" | "3-10km" | "10-20km" | ">20km";

export type ContributionType = "add_park" | "add_photo" | "edit_info" | "report" | "review";

export type ShareChannel = "whatsapp" | "sms" | "email" | "instagram" | "copy_link";

export type TransportMode = "walk" | "bike" | "car";

/** Provider de navigation externe — conditionnelle, cf. EVENT-TAXONOMY.md
 * `route_requested` : à n'envoyer que lorsqu'une vraie ouverture externe
 * existe (pas encore le cas, Directions.tsx est un mock). */
export type RouteProvider = "apple_maps" | "google_maps" | "waze";

export type NotificationType = "resolved" | "new_park" | "thanks" | "recommend";

/**
 * Une entrée par événement de la taxonomie (26 au total). Une interface vide
 * (`Record<string, never>`) signifie qu'aucune propriété *spécifique* n'est
 * définie pour cet événement au-delà des propriétés communes.
 */
export interface AnalyticsEventProperties {
  // --- APP / ACCOUNT ---
  app_opened: Record<string, never>;
  signup_started: {
    entry_point: "splash" | "contribution_resume";
  };
  signup_completed: {
    /** Toujours "email" ici — un succès Google OAuth est un `login_completed`
     * (cf. EVENT-TAXONOMY.md), y compris pour une toute première connexion. */
    provider: "email";
    entry_point: "splash" | "contribution_resume";
  };
  login_completed: {
    provider: "email" | "google";
  };
  account_deleted: Record<string, never>;

  // --- DISCOVERY ---
  map_viewed: {
    map_kind: "real" | "fake";
    has_location_permission: boolean;
  };
  cluster_clicked: {
    cluster_size: number;
  };

  // --- SEARCH ---
  search_performed: {
    query_type: "park" | "place";
    results_count: number;
  };
  search_results_viewed: {
    query_type: "park" | "place";
    results_count: number;
  };
  zero_results: {
    reason:
      | "location_denied"
      | "filters_active"
      | "place_not_found"
      | "default_area"
      | "search_no_match"
      | "children_age_no_match";
  };

  // --- FILTER ---
  filter_opened: Record<string, never>;
  filter_applied: {
    filter_type: "age" | "amenity" | "for_children" | "sort";
    filter_value: string;
  };
  filter_cleared: {
    trigger_source: "filters_sheet" | "zero_results_cta";
  };

  // --- PARK ---
  park_viewed: {
    park_id: string;
    discovery_source: DiscoverySource;
    has_photos: boolean;
    has_reviews: boolean;
    distance_bucket: DistanceBucket;
  };
  photo_viewed: {
    park_id: string;
    photo_count: number;
  };
  review_viewed: {
    park_id: string;
    review_count: number;
  };
  directions_viewed: {
    park_id: string;
  };

  // --- INTENT ---
  park_favorited: {
    park_id: string;
    discovery_source?: DiscoverySource;
  };
  park_unfavorited: {
    park_id: string;
  };
  park_shared: {
    park_id: string;
    channel: ShareChannel;
  };
  /** ⚠️ Ne doit pas être considéré comme correctement instrumentable dans
   * l'état actuel de Directions.tsx (mock) — voir EVENT-TAXONOMY.md et
   * TRACKING-PLAN.md §2. Type défini dès maintenant pour le socle ; le
   * `provider` ne doit être envoyé qu'une fois une vraie ouverture externe
   * implémentée. */
  route_requested: {
    park_id: string;
    transport_mode: TransportMode;
    provider?: RouteProvider;
  };

  // --- CONTRIBUTION ---
  contribution_started: {
    contribution_type: ContributionType;
    park_id?: string;
    entry_point: "park_detail_contribute_sheet" | "more_actions" | "direct_link" | "contribution_resume";
  };
  contribution_completed: {
    contribution_type: ContributionType;
    park_id?: string;
    had_just_in_time_auth: boolean;
    has_photo?: boolean;
  };
  contribution_abandoned: {
    contribution_type: ContributionType;
    last_step: string;
    had_just_in_time_auth_interrupt: boolean;
  };

  // --- RETENTION ---
  favorite_revisited: {
    favorites_count: number;
  };
  notification_opened: {
    notification_type: NotificationType;
  };
}

export type AnalyticsEventName = keyof AnalyticsEventProperties;

/**
 * Allowlist runtime des clés par événement — voir le commentaire d'en-tête.
 * `as const` + `satisfies` garantit que chaque valeur est bien un tableau de
 * clés du type de propriétés correspondant (une clé mal orthographiée ou
 * appartenant au mauvais événement ne compile pas), mais ne garantit PAS
 * l'exhaustivité inverse (une clé ajoutée à l'interface et oubliée ici ne
 * casse pas la compilation) — à vérifier manuellement lors d'un ajout
 * d'événement, ou via le test `analytics/client.test.ts` qui vérifie le
 * compte total d'événements connus.
 */
export const EVENT_PROPERTY_ALLOWLIST: {
  [K in AnalyticsEventName]: readonly (keyof AnalyticsEventProperties[K])[];
} = {
  app_opened: [],
  signup_started: ["entry_point"],
  signup_completed: ["provider", "entry_point"],
  login_completed: ["provider"],
  account_deleted: [],

  map_viewed: ["map_kind", "has_location_permission"],
  cluster_clicked: ["cluster_size"],

  search_performed: ["query_type", "results_count"],
  search_results_viewed: ["query_type", "results_count"],
  zero_results: ["reason"],

  filter_opened: [],
  filter_applied: ["filter_type", "filter_value"],
  filter_cleared: ["trigger_source"],

  park_viewed: ["park_id", "discovery_source", "has_photos", "has_reviews", "distance_bucket"],
  photo_viewed: ["park_id", "photo_count"],
  review_viewed: ["park_id", "review_count"],
  directions_viewed: ["park_id"],

  park_favorited: ["park_id", "discovery_source"],
  park_unfavorited: ["park_id"],
  park_shared: ["park_id", "channel"],
  route_requested: ["park_id", "transport_mode", "provider"],

  contribution_started: ["contribution_type", "park_id", "entry_point"],
  contribution_completed: ["contribution_type", "park_id", "had_just_in_time_auth", "has_photo"],
  contribution_abandoned: ["contribution_type", "last_step", "had_just_in_time_auth_interrupt"],

  favorite_revisited: ["favorites_count"],
  notification_opened: ["notification_type"],
};

/** Nombre total d'événements de la taxonomie — mirroir du compte documenté
 * dans EVENT-TAXONOMY.md (14 P0 + 5 P1 + 7 P2 = 26). Utilisé par
 * `client.test.ts` comme garde-fou anti-dérive. */
export const ANALYTICS_EVENT_COUNT = Object.keys(EVENT_PROPERTY_ALLOWLIST).length;
