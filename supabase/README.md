# Toboggo — Supabase schema

Implements `toboggo_architecture_bdd_mondiale_v2_technique.pdf` — a worldwide,
geography-first parks model. A park is never tied to a French administrative
hierarchy; amenities are a catalogue + link table (not columns); provenance,
contributions and audit are first-class.

## Migrations

Run **in order** against your project:

| File | Contents |
|---|---|
| `0001_schema.sql` | Extensions (postgis, pg_trgm), all enums, all tables, indexes, generated `location` column, boundary polygons. |
| `0002_functions.sql` | `updated_at` / rating / open-report / derived-age triggers, generic `audit_log` trigger, auth signup hook, the `park_public` flattening view, `nearby_parks` (PostGIS), `find_duplicate_parks` (§11 dedup), `recalculate_park_score` (§16, versioned). |
| `0003_rls.sql` | RLS helper functions + policies for every table. Canonical park data is only mutated by the owning organisation's team or Toboggo staff; the public contributes through `park_edits`. |
| `0004_storage.sql` | Storage buckets + Data API grants (incl. the public `park_public` view). |
| `0005_fix_signup_trigger.sql` | Hardens `link_team_member_on_signup()` (schema-qualified + pinned `search_path`) so OAuth / email sign-up doesn't fail with "Database error saving new user". Folded into `0002` for clean resets; kept as a migration for already-deployed projects. |

The pre-PDF migrations are kept in `_archive_migrations_pre_pdf/` for reference.

### Applying — clean (recommended, pre-production)

The schema is a full replacement of the old one. On a project that still has the
old tables:

```bash
supabase db reset --linked      # DROPS and rebuilds public schema from migrations + seed.sql
```

or, in the SQL editor, `drop schema public cascade; create schema public;` then
paste each migration file in order, then `seed.sql`.

### Fresh project

```bash
supabase link --project-ref YOUR_REF
supabase db push
psql "$DB_URL" -f supabase/seed.sql
```

## Data model at a glance

```
organizations ──< organization_parks >── parks ──< park_names        (§18 i18n)
                                            │   ──< park_zones        (§6)
                                            │   ──< park_entrances    (§7)
                                            │   ──< park_features >── features   (§3 §4 §8)
                                            │   ──< park_equipment    (§5)
                                            │   ──< park_opening_hours (§9)
                                            │   ──< park_sources / external_ids (§10)
                                            │   ──< park_attribute_sources (§12)
                                            │   ──< park_edits        (§13 change-requests)
                                            │   ──< reviews / park_media / reports (§15)
                                            │   ──< park_scores       (§16 versioned)
                                            └──< park_duplicate_candidates (§11)
audit_log  — generic history for parks / equipment / reports / organizations / edits (§14)
```

`park_public` is a view that flattens the above for the consumer app and also
projects a backward-compatible flat shape (`wc`, `shade`, `surface`,
`play_equipment`, `age_min/max`, `status`, `commune_id`…) computed from
`park_features` — never stored on `parks`.

## Creating your first admin / collectivité team member

The back office is invite-gated: an auth user with no `team_members` row sees
"Accès non autorisé".

1. Sign up through either app (or Supabase Auth dashboard → Users → Add user).
2. In the SQL editor:
   ```sql
   -- Toboggo staff (super admin):
   insert into team_members (user_id, organization_id, name, email, role)
   values ('<auth-user-id>', null, 'Your Name', 'you@example.com', 'super_admin');

   -- or a collectivité account, scoped to one organisation:
   insert into team_members (user_id, organization_id, name, email, role)
   values ('<auth-user-id>', '00000000-0000-0000-0000-000000000001', 'Agent', 'agent@lyon.fr', 'gestionnaire');
   ```

## Environment variables

Both `apps/mobile` and `apps/backoffice` read a single root `.env` (see `.env.example`):

```
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...
VITE_MAPBOX_TOKEN=...
```

`apps/landing/config.js` needs the same Supabase URL/anon key for its contact form.
