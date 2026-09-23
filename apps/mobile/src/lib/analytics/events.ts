/**
 * Taxonomie Product Analytics — typée depuis docs/analytics/EVENT-TAXONOMY.md.
 *
 * Ce fichier est la SEULE source de vérité pour les noms d'événements et leurs
 * propriétés côté code. Toute évolution doit d'abord être actée dans
 * docs/analytics/EVENT-TAXONOMY.md, puis répercutée ici — jamais l'inverse.
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
 * `environment` — cf. EVENT-TAXONOMY.md "Propriétés communes") ne sont PAS
 * incluses dans les types par-événement ci-dessous : `client.ts` les ajoute
 * automatiquement à chaque `trackEvent()` (voir `commonProperties.ts`), et
 * elles ne passent jamais par `EVENT_PROPERTY_ALLOWLIST` — un appelant ne peut
 * donc structurellement pas les écraser en les glissant dans les propriétés
 * d'un événement (filtrées avant d'être fusionnées).
 */

/**
 * Un seul projet PostHog pour Toboggo (Staging + Production) — les données
 * sont séparées par cette propriété commune, pas par projet. Lue depuis
 * `VITE_APP_ENV` (voir `environment.ts`), jamais déduite de
 * `import.meta.env.MODE`/`PROD`/`DEV` : un build Vite "production" peut être
 * déployé sur l'environnement Staging, donc le mode de build ne dit rien sur
 * l'environnement applicatif réel.
 */
export type AppEnvironment = "staging" | "production";

export interface CommonProperties {
  is_authenticated: boolean;
  app_version: string;
  locale: string;
  environment: AppEnvironment;
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
  /** Une source réelle existe mais n'entre dans aucune des catégories
   * ci-dessus (catch-all documenté, pas un synonyme d'"inconnu"). */
  | "other"
  /** La provenance n'a pas pu être déterminée de façon fiable par le code
   * appelant — à distinguer de `other` : ici, on ne sait *pas* d'où vient
   * la vue, on ne prétend pas juste qu'elle vient d'ailleurs. Utilisé par
   * `park_viewed` tant que la provenance n'est pas propagée à travers les
   * écrans (voir ANALYTICS-AUDIT.md / le commentaire dans ParkDetail.tsx). */
  | "unknown";

export type DistanceBucket = "<1km" | "1-3km" | "3-10km" | "10-20km" | ">20km";

/** Catégorise une distance en mètres — jamais de coordonnées ni de distance
 * précise en propriété d'événement (`PRIVACY-RULES.md` §2.3). */
export function distanceBucket(distanceM: number): DistanceBucket {
  if (distanceM < 1000) return "<1km";
  if (distanceM < 3000) return "1-3km";
  if (distanceM < 10000) return "3-10km";
  if (distanceM < 20000) return "10-20km";
  return ">20km";
}

export type ContributionType = "add_park" | "add_photo" | "edit_info" | "report" | "review";

export type ShareChannel = "whatsapp" | "sms" | "email" | "instagram" | "copy_link";

/** Provider de navigation externe réellement choisi par l'utilisateur dans
 * `DirectionsSheet` — mappé depuis `MapProvider` (`packages/shared`) au point
 * d'émission, voir `lib/directions.ts`. */
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
  /** Émis dans `useDirections().choose()` (`lib/directions.ts`), au moment où
   * l'utilisateur choisit effectivement un provider dans `DirectionsSheet` —
   * juste avant la navigation externe réelle. L'ouverture seule du sheet, ou
   * sa fermeture/annulation, n'émettent rien. Pas de `transport_mode` : cette
   * propriété appartenait à l'ancien écran Directions (mock, ETA calculée
   * localement par mode de transport) — le flux actuel n'a plus de sélecteur
   * de mode, seulement un choix de provider de navigation externe. */
  route_requested: {
    park_id: string;
    provider: RouteProvider;
  };

  // --- CONTRIBUTION ---
  contribution_started: {
    contribution_type: ContributionType;
    park_id?: string;
    /** `visit_prompt` : RatePark ouvert depuis le rappel de visite
     * post-itinéraire (`GlobalOverlays.tsx` → `VisitRatingPrompt`), marqué
     * explicitement par `?source=visit_prompt` (jamais déduit de `?stars=`).
     * `unknown` : plusieurs écrans distincts peuvent mener au même wizard
     * avec la même URL (`?park=` sans marqueur de provenance) sans qu'on
     * puisse les distinguer depuis le wizard lui-même — ex. RatePark en
     * `/rate?park=` sans `source`. Préférer `unknown` à une valeur affirmée
     * à tort — voir RatePark.tsx. */
    entry_point:
      | "park_detail_contribute_sheet"
      | "more_actions"
      | "direct_link"
      | "contribution_resume"
      | "visit_prompt"
      | "unknown";
  };
  contribution_completed: {
    contribution_type: ContributionType;
    park_id?: string;
    /** Optionnelle : certains wizards (AddPhotos, voir son commentaire) ne
     * peuvent structurellement pas distinguer une auth déjà présente d'une
     * auth juste complétée — omettre plutôt qu'affirmer `false` à tort. */
    had_just_in_time_auth?: boolean;
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
  route_requested: ["park_id", "provider"],

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
