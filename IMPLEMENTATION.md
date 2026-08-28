# Toboggo — implementation

This is the real build of the Claude Design handoff described in `README.md` (see that file for
the original design bundle: `chats/` transcripts and `project/` prototypes). This document covers
the actual product in `apps/` and `packages/`.

## Structure

```
apps/
  mobile/       Consumer app (React + TS + Vite PWA) — the "Parcs de Jeux" experience
  backoffice/   Admin (Toboggo staff) + collectivité back office, role-routed, one app
  landing/      Static HTML/CSS/JS marketing site + FAQ/Contact/CGU/Mentions Légales
packages/
  design-system/  Shared CSS tokens + React UI primitives (Button, Card, BottomSheet, …)
  shared/          TypeScript types, Supabase client, data-access functions, utils
supabase/
  migrations/    SQL schema, RLS policies, storage buckets — see supabase/README.md
  seed.sql       Sample parks
```

## Setup

```bash
npm install
cp .env.example .env   # fill in VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, VITE_MAPBOX_TOKEN
```

Apply the SQL migrations to a real Supabase project — see `supabase/README.md` for the exact
steps and how to bootstrap your first back-office login (it's invite-gated by design).

## Running

```bash
npm run dev:mobile        # http://localhost:5173
npm run dev:backoffice    # http://localhost:5174
```

`apps/landing` is static — open its `.html` files directly, or serve the folder with any static
file server (`npx serve apps/landing`). Fill in `apps/landing/config.js` with your Supabase
URL/anon key for the contact form to work.

## Building

```bash
npm run build:mobile
npm run build:backoffice
```

## What's real vs. simplified in this pass

- **Real**: Supabase auth (email/password, password reset, account deletion), Postgres schema with
  PostGIS-backed "nearby parks", RLS-scoped multi-tenant back office (Toboggo staff vs. per-org
  gestionnaire/contributeur), Mapbox maps, photo upload to Supabase Storage, CSV export/import,
  PDF monthly report generation, Open-Meteo weather.
- **Database**: the schema now implements `toboggo_architecture_bdd_mondiale_v2_technique.pdf` —
  a worldwide, geography-first model (country_code + IANA timezone, PostGIS location/boundary),
  an extensible feature catalogue (`features` + `park_features` with available/unavailable/
  unknown/temporarily_unavailable), internal `park_zones`, physical `park_equipment`, `park_entrances`,
  `park_opening_hours`, provenance (`park_sources`, `external_ids`, `park_attribute_sources`),
  governance (`park_edits` change-requests, generic `audit_log`), community layer
  (`reviews`, `park_media`, `reports` targeting park/zone/equipment, versioned `park_scores`),
  `organizations` + `organization_parks` (the French model is not hard-coded), and a
  `find_duplicate_parks` dedup RPC. `park_public` is a view that flattens all of this for the
  apps and also projects the old flat shape (`wc`, `surface`, `play_equipment`…) so the current
  UI keeps working while it migrates to the `features` map. RLS covers every table.
- **Simplified / deferred** (flagged inline in code and the plan): Apple/Google social login (UI
  present, disabled — no OAuth app credentials exist yet), real push notifications, Stripe billing
  for collectivité subscriptions, native iOS/Android store submission (the app is a Capacitor-ready
  PWA, per the phased rollout already decided in the source chats), i18n, and a real
  "périmètre communal" polygon lookup for auto-assigning a park to a commune (v1 assigns
  `commune_id` manually/on import — this was an open question the product owner themselves never
  resolved in the source chats).
- The Maintenance (Entretien) screen's calendar view and the back office's global search/typeahead
  from the original prototype were not ported in this pass — the list view and per-page search
  filters cover the same data.

## Design notes

The three surfaces (consumer app, admin back office, collectivité back office) were designed
independently in the original prototype with three different ad-hoc palettes. This build
normalizes all of them onto one brand — the consumer app's green/orange/Fredoka/Nunito identity —
rather than porting three inconsistent looks. See `packages/design-system/src/tokens.css`.
