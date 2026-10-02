// Edge Function `reverse-geocode` — coordonnées → adresse structurée (Geoapify).
//
// La clé Geoapify vit UNIQUEMENT ici, en secret Supabase (`GEOAPIFY_API_KEY`) :
// jamais dans le bundle front (aucune variable VITE_*).
//
// ACCÈS INVITÉ : `verify_jwt = false` (voir `[functions.reverse-geocode]` dans
// supabase/config.toml). Raison : le parcours « ajouter un parc » doit marcher
// sans compte, et `supabase-js` n'envoie PAS d'`Authorization: Bearer` aux
// fonctions quand la clé est au format `sb_publishable_*` et qu'il n'y a pas de
// session — la passerelle rejetterait donc tous les invités. La clé publishable
// n'étant de toute façon pas un secret, un JWT apporterait peu ; la fonction se
// protège elle-même (handler.ts) :
//   - POST uniquement, corps ≤ 512 o, `lat`/`lng` strictement validés ;
//   - destination Geoapify fixe, aucun paramètre libre, aucune réponse brute ;
//   - timeout amont 8 s ;
//   - limiteur par IP, best effort PAR ISOLAT (Supabase n'a pas de rate limiting
//     natif pour les Edge Functions) ;
//   - `ALLOWED_ORIGINS` (optionnel) : refuse les requêtes navigateur d'autres
//     origines. Un client non-navigateur peut forger l'en-tête Origin : ce n'est
//     pas une authentification.
// Plafond dur réel du coût : le quota / budget du compte Geoapify.
//
// Déploiement (action humaine, NON faite ici) :
//   supabase secrets set GEOAPIFY_API_KEY=... [ALLOWED_ORIGINS=https://app...,...]
//   supabase functions deploy reverse-geocode --project-ref <ref>

import { handleRequest } from "./handler.ts";
import { createRateLimiter, parseAllowedOrigins } from "./guard.ts";

const limiter = createRateLimiter({ max: 30, windowMs: 60_000 });

Deno.serve((req: Request) =>
  handleRequest(req, {
    apiKey: Deno.env.get("GEOAPIFY_API_KEY"),
    allowedOrigins: parseAllowedOrigins(Deno.env.get("ALLOWED_ORIGINS")),
    limiter,
    fetchImpl: fetch,
  }),
);
