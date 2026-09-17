import type { PostHogConfig } from "posthog-js";

/**
 * Options PostHog privacy-safe, indépendantes de la clé/hôte (injectés par
 * `client.ts` au moment de l'init). Ce fichier est la SEULE chose à relire
 * pour auditer ce que PostHog est réellement autorisé à faire côté client —
 * voir docs/analytics/PRIVACY-RULES.md §6 pour la justification de chaque
 * flag.
 *
 * --- Persistance : le choix le plus restrictif possible, pas "localStorage"
 * par défaut ---
 * Aucun mécanisme de consentement cookie/localStorage n'existe encore dans
 * l'app (docs/analytics/PRIVACY-RULES.md §8 : pas de bannière identifiée).
 * Tant que cette décision RGPD/CNIL n'est pas tranchée par le fondateur,
 * PostHog ne doit écrire AUCUNE donnée dans le navigateur :
 *   - `persistence: "memory"` — aucune lecture/écriture cookie ni
 *     localStorage pour l'identité/les super-properties ;
 *   - `disable_persistence: true` — ceinture et bretelles : interdit
 *     explicitement toute persistance navigateur et purge toute donnée
 *     PostHog qui aurait pu être écrite par une session précédente.
 * Conséquence assumée : le `distinct_id` anonyme ne survit pas à un
 * rechargement de page/session — DAU/WAU/MAU anonymes seront sous-évalués
 * tant que ce choix reste en l'état. C'est un point à trancher explicitement
 * avant la mise en prod des événements P0 (voir
 * docs/analytics/PRIVACY-RULES.md), pas une décision technique définitive.
 */
export const ANALYTICS_PRIVACY_OPTIONS: Partial<PostHogConfig> = {
  // --- Mandaté explicitement (aucune autocapture, aucun pageview auto) ---
  autocapture: false,
  capture_pageview: false,
  capture_pageleave: false,

  // --- Session Replay : OFF ---
  disable_session_recording: true,

  // --- Persistance : voir commentaire ci-dessus ---
  persistence: "memory",
  disable_persistence: true,

  // --- Surfaces produit PostHog explicitement non voulues à ce stade ---
  disable_surveys: true, // Surveys
  disable_web_experiments: true, // Experiments
  disable_product_tours: true, // pas de "self-driving" côté UI produit
  disable_conversations: true, // idem — pas de widget/agent conversationnel
  disable_external_dependency_loading: true, // aucune extension chargée dynamiquement depuis PostHog

  // --- Error Tracking PostHog : explicitement hors périmètre (Sentry gère
  // les erreurs séparément, hors périmètre de cette phase). `false` désactive
  // entièrement la fonctionnalité — ses sous-options (capture_console_errors,
  // capture_unhandled_errors, capture_unhandled_rejections) ne s'appliquent
  // qu'à l'intérieur d'un objet `ExceptionAutoCaptureConfig`, pas ici. ---
  capture_exceptions: false,

  // --- Web Analytics / heatmaps / perf : hors périmètre, tracking minimal ---
  capture_heatmaps: false,
  capture_performance: false,
  capture_dead_clicks: false,

  // Note : `capture_copied_text` (copier/couper/coller) est une sous-option
  // de `autocapture` (type `AutocaptureConfig`), pas un champ racine — déjà
  // couverte par `autocapture: false` ci-dessus, donc pas répétée ici.
};
