-- ════════════════════════════════════════════════════════════════════════════
-- 0027 — Modération des photos de parc (`park_media`) + durcissement Storage
-- ────────────────────────────────────────────────────────────────────────────
-- NON DESTRUCTIF. `DROP POLICY` uniquement pour recréer immédiatement la même
-- policy corrigée (même approche que 0026). Ne modifie AUCUNE migration figée
-- (0001→0026). Ne touche pas aux colonnes / tables / triggers V1. Ne désactive
-- JAMAIS la RLS. Ne réécrit aucune donnée métier (`park_media` est vide en
-- local / staging / prod au moment de cette migration — 0 ligne impactée).
--
-- CONTEXTE
-- --------
-- Avant 0027, une photo déposée par un parent était insérée directement en
-- `status = 'approved'` (défaut SQL de la colonne) et devenait publique sans
-- aucune revue. La policy `park_media_insert` (0018) n'imposait que
-- `auth.uid() is not null` : n'importe quel utilisateur authentifié pouvait
-- écrire une ligne `approved`, avec n'importe quelle `url`, `source`, `is_cover`.
-- `park_media_update` autorisait `user_id = auth.uid()` → auto-approbation
-- possible après coup.
--
-- Règle produit : Toboggo préfère AUCUNE photo plutôt qu'une photo fausse,
-- générique, d'un autre parc, générée, ou de provenance douteuse. Les dépôts
-- des contributeurs doivent passer par une file de validation.
--
-- CORRECTIF
-- ---------
--  1. `park_media_insert` — deux cas seulement :
--       • source de confiance : `manages_park(auth.uid(), park_id)` (équipe de
--         la collectivité propriétaire OU staff Toboggo) → peut publier
--         directement (décision produit : collectivité vérifiée = approved).
--       • contributeur : utilisateur authentifié, forcé dans la file
--         (`status = 'pending'`), sur SA propre ligne (`user_id = auth.uid()`),
--         photo réelle d'utilisateur (`source = 'user'`), jamais `is_cover`.
--  2. `park_media_update` — réservé aux gestionnaires / staff (modération,
--     couverture, légende). Supprime l'auto-approbation par `user_id`.
--  3. `park_media_delete` — gestionnaires / staff à tout moment ; un
--     contributeur peut retirer SA photo tant qu'elle est encore `pending`.
--  4. `park_media_read` — inchangé sur le fond, recréé pour lisibilité :
--     public = `approved` ; le contributeur voit ses `pending` ; le
--     gestionnaire voit tout sur ses parcs.
--  5. Storage `park-photos` :
--       • upload borné au dossier de l'uploadeur
--         (`(storage.foldername(name))[1] = auth.uid()::text`) → un utilisateur
--         ne peut pas écrire dans le dossier d'un autre.
--       • nouvelle policy DELETE (uploadeur OU staff) → l'app peut purger le
--         fichier quand une photo est retirée / refusée (aucune policy DELETE
--         n'existait : les fichiers restaient orphelins).
--       • `file_size_limit` + `allowed_mime_types` sur le bucket.
--
-- `park_public.photos` / `cover_photo` filtrent DÉJÀ `status = 'approved'`
-- (0017) : l'exposition publique reste correcte sans changement de vue.
--
-- Idempotent : `drop policy if exists` + `create policy`.
-- ════════════════════════════════════════════════════════════════════════════

-- ── 1..4 — RLS `park_media` ────────────────────────────────────────────────
drop policy if exists park_media_read on park_media;
create policy park_media_read on park_media for select using (
  status = 'approved'
  or user_id = auth.uid()
  or manages_park(auth.uid(), park_id)
);

drop policy if exists park_media_insert on park_media;
create policy park_media_insert on park_media for insert with check (
  -- source de confiance : équipe de la collectivité propriétaire ou staff Toboggo
  manages_park(auth.uid(), park_id)
  -- contributeur : forcé dans la file de validation, sur sa propre ligne
  or (
    auth.uid() is not null
    and user_id = auth.uid()
    and source = 'user'::source_type
    and status = 'pending'::media_status
    and is_cover = false
  )
);

drop policy if exists park_media_update on park_media;
create policy park_media_update on park_media for update
  using (manages_park(auth.uid(), park_id))
  with check (manages_park(auth.uid(), park_id));

drop policy if exists park_media_delete on park_media;
create policy park_media_delete on park_media for delete using (
  manages_park(auth.uid(), park_id)
  or (user_id = auth.uid() and status = 'pending'::media_status)
);

-- ── 5 — Storage : bucket `park-photos` ─────────────────────────────────────
update storage.buckets
   set file_size_limit    = 8388608,                                  -- 8 MiB
       allowed_mime_types  = array['image/jpeg', 'image/png', 'image/webp']
 where id = 'park-photos';

drop policy if exists "Authenticated upload park photos" on storage.objects;
create policy "Authenticated upload park photos" on storage.objects for insert
  with check (
    bucket_id = 'park-photos'
    and auth.uid() is not null
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "Owner or staff delete park photos" on storage.objects;
create policy "Owner or staff delete park photos" on storage.objects for delete
  using (
    bucket_id = 'park-photos'
    and (owner = auth.uid() or is_toboggo_staff(auth.uid()))
  );

-- ════════════════════════════════════════════════════════════════════════════
-- Assertions structurelles
-- ════════════════════════════════════════════════════════════════════════════
do $$
declare ins text; upd text; udel text; rd text;
begin
  if not (select relrowsecurity from pg_class where oid = 'public.park_media'::regclass) then
    raise exception '0027: RLS désactivée sur public.park_media';
  end if;

  select with_check into ins  from pg_policies where schemaname='public' and tablename='park_media' and policyname='park_media_insert';
  select qual       into upd  from pg_policies where schemaname='public' and tablename='park_media' and policyname='park_media_update';
  select qual       into udel from pg_policies where schemaname='public' and tablename='park_media' and policyname='park_media_delete';
  select qual       into rd   from pg_policies where schemaname='public' and tablename='park_media' and policyname='park_media_read';

  if ins is null or upd is null or udel is null or rd is null then
    raise exception '0027: une policy park_media est absente après recréation';
  end if;

  -- INSERT : le contributeur est forcé en pending, sur sa propre ligne
  if ins !~ 'manages_park' or ins !~ 'pending' or ins !~ 'user_id = auth\.uid\(\)' or ins !~ 'is_cover' then
    raise exception '0027: park_media_insert ne borne pas le dépôt contributeur : %', ins;
  end if;
  -- UPDATE : plus d'auto-approbation par user_id
  if upd ~ 'user_id = auth\.uid\(\)' or upd !~ 'manages_park' then
    raise exception '0027: park_media_update autorise encore le contributeur : %', upd;
  end if;
  -- DELETE : contributeur borné à ses lignes pending
  if udel !~ 'manages_park' or udel !~ 'pending' then
    raise exception '0027: park_media_delete mal bornée : %', udel;
  end if;
end $$;

do $$
declare up text; dl text; lim bigint; mimes text[];
begin
  select with_check into up from pg_policies
    where schemaname='storage' and tablename='objects' and policyname='Authenticated upload park photos';
  select qual into dl from pg_policies
    where schemaname='storage' and tablename='objects' and policyname='Owner or staff delete park photos';

  if up is null then raise exception '0027: policy upload park-photos absente'; end if;
  if dl is null then raise exception '0027: policy delete park-photos absente'; end if;
  if up !~ 'foldername' or up !~ 'auth\.uid\(\)' then
    raise exception '0027: upload park-photos non borné au dossier de l''uploadeur : %', up;
  end if;

  select file_size_limit, allowed_mime_types into lim, mimes from storage.buckets where id = 'park-photos';
  if lim is null or lim > 20971520 then
    raise exception '0027: file_size_limit park-photos non posé / trop large : %', lim;
  end if;
  if mimes is null or not (mimes @> array['image/webp']) then
    raise exception '0027: allowed_mime_types park-photos incomplet : %', mimes;
  end if;
end $$;

-- ════════════════════════════════════════════════════════════════════════════
-- Assertions comportementales (rôle anon)
-- ────────────────────────────────────────────────────────────────────────────
-- Fixtures éphémères, mêmes coordonnées large-au-vent que 0026, UUID fixes.
-- Le rôle authentifié (contributeur / gestionnaire) est vérifié hors migration
-- par supabase/tests/park_media_moderation.test.sql (comptes réels requis).
-- ════════════════════════════════════════════════════════════════════════════
insert into public.parks (id, name, latitude, longitude, country_code, timezone, moderation_status)
values ('b0270027-0000-4000-a000-000000000001', 'zzz_media0027_park', 42.5, 4.5, 'FR', 'Europe/Paris', 'published');

insert into public.park_media (id, park_id, url, source, status, is_cover)
values
  ('b0270027-0000-4000-a000-0000000000a1', 'b0270027-0000-4000-a000-000000000001', 'approved.webp', 'user', 'approved', false),
  ('b0270027-0000-4000-a000-0000000000a2', 'b0270027-0000-4000-a000-000000000001', 'pending.webp',  'user', 'pending',  false);

set local role anon;
do $$
declare n int;
begin
  -- anon voit la photo approuvée
  select count(*) into n from public.park_media where park_id = 'b0270027-0000-4000-a000-000000000001' and status = 'approved';
  if n <> 1 then raise exception '0027: anon ne voit pas une photo approuvée (obtenu %)', n; end if;

  -- anon ne voit PAS la photo en attente
  select count(*) into n from public.park_media where park_id = 'b0270027-0000-4000-a000-000000000001' and status = 'pending';
  if n <> 0 then raise exception '0027: anon voit une photo pending (obtenu %)', n; end if;

  -- anon ne peut pas insérer
  begin
    insert into public.park_media (park_id, url, source, status)
    values ('b0270027-0000-4000-a000-000000000001', 'hack.webp', 'user', 'pending');
    raise exception '0027: anon a pu insérer dans park_media';
  exception when insufficient_privilege or check_violation then null;
  end;

  -- anon ne peut pas supprimer
  begin
    delete from public.park_media where id = 'b0270027-0000-4000-a000-0000000000a1';
    if (select count(*) from public.park_media where id = 'b0270027-0000-4000-a000-0000000000a1') = 0 then
      raise exception '0027: anon a pu supprimer une photo';
    end if;
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

-- park_public n'expose toujours que les photos approuvées
do $$
declare arr text[];
begin
  select photos into arr from public.park_public where id = 'b0270027-0000-4000-a000-000000000001';
  if arr is distinct from array['approved.webp'] then
    raise exception '0027: park_public.photos expose autre chose que les photos approuvées : %', arr;
  end if;
end $$;

-- ── Nettoyage des fixtures (+ lignes d'audit générées) ─────────────────────
delete from public.park_media where park_id = 'b0270027-0000-4000-a000-000000000001';
delete from public.parks      where id      = 'b0270027-0000-4000-a000-000000000001';
delete from public.audit_log  where entity_type in ('parks','park_media')
  and entity_id in ('b0270027-0000-4000-a000-000000000001',
                    'b0270027-0000-4000-a000-0000000000a1',
                    'b0270027-0000-4000-a000-0000000000a2');

do $$ begin
  raise notice '0027 OK — park_media : dépôts contributeurs forcés en pending, auto-approbation retirée, contributeur peut retirer ses pending ; Storage park-photos borné au dossier de l''uploadeur + policy DELETE + limites mime/taille ; park_public inchangée';
end $$;
