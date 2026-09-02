-- ════════════════════════════════════════════════════════════════════════════
-- 0026 — parks_public_read : lecture publique alignée sur `moderation_status`
-- ────────────────────────────────────────────────────────────────────────────
-- NON DESTRUCTIF. `DROP POLICY` uniquement pour recréer immédiatement la même
-- policy corrigée. Ne modifie AUCUNE migration figée (0001→0025). Ne touche pas
-- aux colonnes / tables / triggers V1. Ne désactive JAMAIS la RLS. Ne modifie
-- aucune donnée métier (les lignes `parks` ne sont pas réécrites).
--
-- CONTEXTE
-- --------
-- `parks_public_read` (définie en 0020) accorde la lecture publique via le champ
-- LEGACY V1 :
--     status = 'published'::park_status
-- Or le champ canonique V2 de modération est `parks.moderation_status`
-- (`park_moderation_status`). En coexistence, le trigger `parks_v1_compat_biu`
-- (0009) resynchronise `status` ⇄ `moderation_status` — MAIS uniquement quand il
-- s'exécute. Un import en masse qui écrit `moderation_status` avec les triggers
-- neutralisés (`session_replication_role = replica`) laisse `status` bloqué à sa
-- valeur d'insertion (`pending`). Les parcs OSM publiés ainsi
-- (`moderation_status = 'published'`, `status = 'pending'`) restent alors
-- INVISIBLES pour le rôle `anon` : `parks_public_read` teste le champ périmé, et
-- `nearby_parks` (0017, qui lit `park_public` en `security_invoker = true`)
-- renvoie 0 ligne sous le rôle `anon` alors qu'elle en renvoie en SQL admin.
--
-- La RPC `nearby_parks` et la vue `park_public` filtrent DÉJÀ sur
-- `moderation_status = 'published'` : seule la policy RLS restait sur le champ
-- legacy. C'est la dernière référence à `parks.status` pour la lecture publique
-- (audit : `park_media.park_media_read` teste `park_media.status`, colonne
-- distincte de type `media_status` — hors périmètre).
--
-- CORRECTIF
-- ---------
-- Remplacer la 1ʳᵉ branche par le champ canonique V2 :
--     moderation_status = 'published'::park_moderation_status
-- Les 4 autres branches d'accès sont CONSERVÉES à l'identique :
--   • created_by = auth.uid()                         (auteur)
--   • can_edit_park(auth.uid(), id)                   (V2 : created_by / manages_park / staff)
--   • commune_id is not null AND is_commune_member(…)  (coexistence V1)
--   • is_toboggo_staff(auth.uid())                    (staff Toboggo)
--
-- Les deux enums ont les mêmes libellés (`draft/pending/published/blocked/
-- rejected`, cf. 0001 + 0007) : `'published'` est valide pour
-- `park_moderation_status`.
-- ════════════════════════════════════════════════════════════════════════════

drop policy if exists parks_public_read on public.parks;
create policy parks_public_read on public.parks
for select using (
  moderation_status = 'published'::park_moderation_status
  or created_by = auth.uid()
  or can_edit_park(auth.uid(), id)                                             -- V2 : created_by OR manages_park OR staff
  or ((commune_id is not null) and is_commune_member(auth.uid(), commune_id))  -- V1 coexistence
  or is_toboggo_staff(auth.uid())
);

-- ── Assertion structurelle ─────────────────────────────────────────────────
do $$
declare q text;
begin
  select qual into q from pg_policies
   where schemaname = 'public' and tablename = 'parks' and policyname = 'parks_public_read';

  if q is null then
    raise exception '0026: policy parks_public_read absente après recréation';
  end if;
  if q !~ 'moderation_status = ''published''::park_moderation_status' then
    raise exception '0026: policy ne s''appuie pas sur moderation_status : %', q;
  end if;
  if q ~ '\mstatus = ''published''::park_status' then
    raise exception '0026: policy référence encore le champ legacy status : %', q;
  end if;
  if q !~ 'created_by' or q !~ 'can_edit_park'
     or q !~ 'is_commune_member' or q !~ 'is_toboggo_staff' then
    raise exception '0026: une branche d''accès existante a été perdue : %', q;
  end if;
  if not (select rowsecurity from pg_tables
            where schemaname = 'public' and tablename = 'parks') then
    raise exception '0026: la RLS a été désactivée sur public.parks';
  end if;
end $$;

-- ── Assertions comportementales (rôle anon) ────────────────────────────────
-- Fixtures éphémères aux mêmes coordonnées (large-au-vent du golfe du Lion,
-- aucun parc réel à proximité). UUID fixes -> nettoyage déterministe.
insert into public.parks (id, name, latitude, longitude, country_code, timezone, moderation_status)
values
  ('a0260026-0000-4000-a000-000000000001', 'zzz_rls0026_published', 42.5, 4.5, 'FR', 'Europe/Paris', 'published'),
  ('a0260026-0000-4000-a000-000000000002', 'zzz_rls0026_pending',   42.5, 4.5, 'FR', 'Europe/Paris', 'pending');

-- Reproduit l'incohérence réelle : publié en V2, `status` legacy resté périmé.
-- (triggers neutralisés le temps de l'INSERT ; la RLS reste active.)
set local session_replication_role = replica;
insert into public.parks (id, name, latitude, longitude, lat, lng, formatted_address,
                          country_code, timezone, moderation_status, status)
values ('a0260026-0000-4000-a000-000000000003', 'zzz_rls0026_stale_legacy', 42.5, 4.5, 42.5, 4.5, '—',
        'FR', 'Europe/Paris', 'published', 'pending');
set local session_replication_role = origin;

set local role anon;
do $$
declare n int;
begin
  -- 1. anon peut SELECT un parc publié (champ canonique V2)
  select count(*) into n from public.parks where name = 'zzz_rls0026_published';
  if n <> 1 then
    raise exception '0026: anon ne voit pas un parc moderation_status=published (obtenu %)', n;
  end if;

  -- 2. le champ legacy `status` périmé ne masque plus un parc publié en V2
  select count(*) into n from public.parks where name = 'zzz_rls0026_stale_legacy';
  if n <> 1 then
    raise exception '0026: anon ne voit pas un parc publié dont status legacy est resté pending (obtenu %)', n;
  end if;

  -- 3. un parc NON publié ne devient pas public
  select count(*) into n from public.parks where name = 'zzz_rls0026_pending';
  if n <> 0 then
    raise exception '0026: un parc non publié est visible pour anon (obtenu %)', n;
  end if;

  -- 4. nearby_parks sous rôle anon renvoie bien les parcs publiés autour d'eux
  select count(*) into n from nearby_parks(42.5, 4.5, 2000) where name like 'zzz_rls0026_%';
  if n <> 2 then
    raise exception '0026: nearby_parks (role anon) — attendu 2 parcs publiés, obtenu %', n;
  end if;
end $$;
reset role;

-- ── Nettoyage des fixtures (+ lignes d'audit générées) ─────────────────────
delete from public.parks where id in (
  'a0260026-0000-4000-a000-000000000001',
  'a0260026-0000-4000-a000-000000000002',
  'a0260026-0000-4000-a000-000000000003'
);
delete from public.audit_log where entity_type = 'parks' and entity_id in (
  'a0260026-0000-4000-a000-000000000001',
  'a0260026-0000-4000-a000-000000000002',
  'a0260026-0000-4000-a000-000000000003'
);

do $$ begin
  raise notice '0026 OK — parks_public_read basée sur moderation_status ; anon voit les parcs publiés (y compris status legacy périmé), les non-publiés restent masqués, nearby_parks(anon) OK';
end $$;
