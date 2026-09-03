-- ════════════════════════════════════════════════════════════════════════════
-- Test RLS `park_media` — modération des photos (migration 0027)
-- ────────────────────────────────────────────────────────────────────────────
-- Vérifie le comportement sous rôle AUTHENTIFIÉ (contributeur / gestionnaire /
-- gestionnaire d'une autre collectivité), ce que les assertions embarquées dans
-- 0027 ne couvrent pas (elles se limitent à `anon` + structure, comme 0026).
-- 14 scénarios. Nécessite un accès privilégié (création d'`auth.users`) : à
-- lancer sur base LOCALE ou avec une connexion admin STAGING, pas via le rôle
-- bas privilège de `supabase test db`.
--
-- USAGE (base LOCALE ou STAGING — JAMAIS la production) :
--   docker exec -i supabase_db_<project> psql -U postgres -d postgres \
--     -v ON_ERROR_STOP=1 < supabase/tests/park_media_moderation.test.sql
--
-- Tout est encapsulé dans une transaction terminée par ROLLBACK : aucune
-- donnée persistée (ni parcs, ni auth.users, ni park_media).
--
-- Impersonation : le rôle et `request.jwt.claims` sont posés au niveau SQL
-- AVANT chaque bloc `do` (donc hors de toute sous-transaction plpgsql : un
-- `begin/exception` interne ne les annule pas).
-- ════════════════════════════════════════════════════════════════════════════

begin;

-- ── Fixtures (rôle postgres) ──────────────────────────────────────────────
insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
                        email_confirmed_at, created_at, updated_at)
values
  ('c0270000-0000-4000-a000-00000000000a', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'contrib-a@test.local', '', now(), now(), now()),
  ('c0270000-0000-4000-a000-00000000000b', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'contrib-b@test.local', '', now(), now(), now()),
  ('c0270000-0000-4000-a000-00000000000c', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'gestion-c@test.local', '', now(), now(), now()),
  ('c0270000-0000-4000-a000-00000000000d', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'gestion-d@test.local', '', now(), now(), now());

insert into organizations (id, name, type)
values ('c0270000-0000-4000-a000-0000000000f1', 'zzz_test_commune_0027', 'municipality'),
       ('c0270000-0000-4000-a000-0000000000f2', 'zzz_autre_commune_0027', 'municipality');

-- Coexistence V1 : team_members_v1_compat_biu recopie organization_id ->
-- commune_id (FK vers `communes`), d'où les lignes miroir.
insert into communes (id, name)
values ('c0270000-0000-4000-a000-0000000000f1', 'zzz_test_commune_0027'),
       ('c0270000-0000-4000-a000-0000000000f2', 'zzz_autre_commune_0027');

insert into team_members (user_id, organization_id, name, email, role)
values ('c0270000-0000-4000-a000-00000000000c', 'c0270000-0000-4000-a000-0000000000f1',
        'Gestion Test', 'gestion-c@test.local', 'gestionnaire'),
       -- G2 gère une AUTRE collectivité, sans lien avec le parc de test
       ('c0270000-0000-4000-a000-00000000000d', 'c0270000-0000-4000-a000-0000000000f2',
        'Gestion Autre', 'gestion-d@test.local', 'gestionnaire');

insert into parks (id, name, latitude, longitude, country_code, timezone, moderation_status)
values ('c0270000-0000-4000-a000-0000000000e1', 'zzz_test_park_0027', 42.5, 4.5, 'FR', 'Europe/Paris', 'published');

insert into organization_parks (organization_id, park_id, role)
values ('c0270000-0000-4000-a000-0000000000f1', 'c0270000-0000-4000-a000-0000000000e1', 'owner');

-- Photos pending posées en tant que postgres pour servir de cible aux tests.
insert into park_media (id, park_id, url, user_id, source, status)
values ('c0270000-0000-4000-a000-0000000000d1', 'c0270000-0000-4000-a000-0000000000e1',
        'a-seed.webp', 'c0270000-0000-4000-a000-00000000000a', 'user', 'pending'),
       ('c0270000-0000-4000-a000-0000000000d3', 'c0270000-0000-4000-a000-0000000000e1',
        'a-seed3.webp', 'c0270000-0000-4000-a000-00000000000a', 'user', 'pending'),
       ('c0270000-0000-4000-a000-0000000000d4', 'c0270000-0000-4000-a000-0000000000e1',
        'a-seed4.webp', 'c0270000-0000-4000-a000-00000000000a', 'user', 'pending');

-- ════════════════════════════════════════════════════════════════════════════
-- Contributeur A
-- ════════════════════════════════════════════════════════════════════════════
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"c0270000-0000-4000-a000-00000000000a","role":"authenticated"}', true);

-- 1. dépôt d'une photo pending sur sa propre ligne → OK
do $$
begin
  insert into park_media (park_id, url, user_id, source, status)
  values ('c0270000-0000-4000-a000-0000000000e1', 'a-1.webp',
          'c0270000-0000-4000-a000-00000000000a', 'user', 'pending');
  raise notice '1 OK — contributeur : dépôt pending autorisé';
end $$;

-- 2. dépôt direct en approved → refusé
do $$
begin
  begin
    insert into park_media (park_id, url, user_id, source, status)
    values ('c0270000-0000-4000-a000-0000000000e1', 'a-2.webp',
            'c0270000-0000-4000-a000-00000000000a', 'user', 'approved');
    raise exception '2 FAIL — approved accepté';
  exception when insufficient_privilege then
    raise notice '2 OK — contributeur : auto-publication (approved) refusée';
  end;
end $$;

-- 3. usurpation source=municipality → refusé
do $$
begin
  begin
    insert into park_media (park_id, url, user_id, source, status)
    values ('c0270000-0000-4000-a000-0000000000e1', 'a-3.webp',
            'c0270000-0000-4000-a000-00000000000a', 'municipality', 'pending');
    raise exception '3 FAIL — source=municipality accepté';
  exception when insufficient_privilege then
    raise notice '3 OK — contributeur : usurpation source=municipality refusée';
  end;
end $$;

-- 4. dépôt sur la ligne d'un autre utilisateur → refusé
do $$
begin
  begin
    insert into park_media (park_id, url, user_id, source, status)
    values ('c0270000-0000-4000-a000-0000000000e1', 'a-4.webp',
            'c0270000-0000-4000-a000-00000000000b', 'user', 'pending');
    raise exception '4 FAIL — user_id d''un autre accepté';
  exception when insufficient_privilege then
    raise notice '4 OK — contributeur : écrit seulement sa propre ligne';
  end;
end $$;

-- 5. is_cover forcé au dépôt → refusé
do $$
begin
  begin
    insert into park_media (park_id, url, user_id, source, status, is_cover)
    values ('c0270000-0000-4000-a000-0000000000e1', 'a-5.webp',
            'c0270000-0000-4000-a000-00000000000a', 'user', 'pending', true);
    raise exception '5 FAIL — is_cover=true accepté';
  exception when insufficient_privilege then
    raise notice '5 OK — contributeur : is_cover forcé refusé';
  end;
end $$;

-- 6. auto-approbation post-dépôt → 0 ligne modifiée (RLS)
do $$
declare touched int;
begin
  update park_media set status = 'approved'
   where id = 'c0270000-0000-4000-a000-0000000000d1';
  get diagnostics touched = row_count;
  if touched <> 0 then
    raise exception '6 FAIL — % ligne(s) approuvée(s) par le contributeur', touched;
  end if;
  raise notice '6 OK — contributeur : auto-approbation post-dépôt bloquée (0 ligne)';
end $$;

-- ════════════════════════════════════════════════════════════════════════════
-- Contributeur B
-- ════════════════════════════════════════════════════════════════════════════
select set_config('request.jwt.claims',
  '{"sub":"c0270000-0000-4000-a000-00000000000b","role":"authenticated"}', true);

-- 7. B ne peut pas supprimer la photo pending de A → 0 ligne supprimée
--    (la photo pending de A est aussi invisible en lecture pour B)
do $$
declare touched int; visible int;
begin
  delete from park_media where id = 'c0270000-0000-4000-a000-0000000000d1';
  get diagnostics touched = row_count;
  select count(*) into visible from park_media where id = 'c0270000-0000-4000-a000-0000000000d1';
  if touched <> 0 then
    raise exception '7 FAIL — B a supprimé % ligne(s) de A', touched;
  end if;
  if visible <> 0 then
    raise exception '7 FAIL — B voit la photo pending de A (attendu : invisible)';
  end if;
  raise notice '7 OK — B ne supprime ni ne voit la photo pending d''un autre';
end $$;

-- ════════════════════════════════════════════════════════════════════════════
-- Contributeur A — retrait de sa propre photo pending
-- ════════════════════════════════════════════════════════════════════════════
select set_config('request.jwt.claims',
  '{"sub":"c0270000-0000-4000-a000-00000000000a","role":"authenticated"}', true);

-- 8. A retire sa photo tant qu'elle est pending → 1 ligne supprimée
do $$
declare touched int;
begin
  delete from park_media where id = 'c0270000-0000-4000-a000-0000000000d1';
  get diagnostics touched = row_count;
  if touched <> 1 then
    raise exception '8 FAIL — A n''a pas pu retirer sa photo pending (% ligne)', touched;
  end if;
  raise notice '8 OK — retrait de sa propre photo pending autorisé';
end $$;

-- ════════════════════════════════════════════════════════════════════════════
-- Gestionnaire de la collectivité
-- ════════════════════════════════════════════════════════════════════════════
select set_config('request.jwt.claims',
  '{"sub":"c0270000-0000-4000-a000-00000000000c","role":"authenticated"}', true);

-- 9. publication directe (approved) + définition de la couverture
do $$
begin
  insert into park_media (id, park_id, url, user_id, source, status)
  values ('c0270000-0000-4000-a000-0000000000d2', 'c0270000-0000-4000-a000-0000000000e1',
          'g-1.webp', 'c0270000-0000-4000-a000-00000000000c', 'municipality', 'approved');
  update park_media set is_cover = true where id = 'c0270000-0000-4000-a000-0000000000d2';
  if (select is_cover from park_media where id = 'c0270000-0000-4000-a000-0000000000d2') is not true then
    raise exception '9 FAIL — gestionnaire n''a pas pu définir la couverture';
  end if;
  raise notice '9 OK — gestionnaire : publication directe + couverture';
end $$;

-- 10. gestionnaire APPROUVE une photo pending → 1 ligne
do $$
declare touched int;
begin
  update park_media set status = 'approved' where id = 'c0270000-0000-4000-a000-0000000000d3';
  get diagnostics touched = row_count;
  if touched <> 1 then raise exception '10 FAIL — approve a touché % ligne(s)', touched; end if;
  raise notice '10 OK — gestionnaire : approve d''une photo pending';
end $$;

-- 11. gestionnaire REFUSE une photo pending → 1 ligne, statut rejected
do $$
declare touched int;
begin
  update park_media set status = 'rejected' where id = 'c0270000-0000-4000-a000-0000000000d4';
  get diagnostics touched = row_count;
  if touched <> 1 then raise exception '11 FAIL — reject a touché % ligne(s)', touched; end if;
  if (select status from park_media where id = 'c0270000-0000-4000-a000-0000000000d4') <> 'rejected' then
    raise exception '11 FAIL — statut non passé à rejected';
  end if;
  raise notice '11 OK — gestionnaire : reject d''une photo pending';
end $$;

-- ════════════════════════════════════════════════════════════════════════════
-- Gestionnaire d'une AUTRE collectivité (aucun lien avec ce parc)
-- ════════════════════════════════════════════════════════════════════════════
select set_config('request.jwt.claims',
  '{"sub":"c0270000-0000-4000-a000-00000000000d","role":"authenticated"}', true);

-- 12. aucun droit d'écriture / modération sur ce parc
do $$
declare touched int;
begin
  begin
    insert into park_media (park_id, url, user_id, source, status)
    values ('c0270000-0000-4000-a000-0000000000e1', 'intrus.webp',
            'c0270000-0000-4000-a000-00000000000d', 'municipality', 'approved');
    raise exception '12 FAIL — collectivité non autorisée a inséré une photo';
  exception when insufficient_privilege then null;
  end;
  update park_media set status = 'rejected' where id = 'c0270000-0000-4000-a000-0000000000d2';
  get diagnostics touched = row_count;
  if touched <> 0 then
    raise exception '12 FAIL — collectivité non autorisée a modifié % ligne(s)', touched;
  end if;
  raise notice '12 OK — collectivité non autorisée : aucun droit sur ce parc';
end $$;

-- ════════════════════════════════════════════════════════════════════════════
-- Public (anon)
-- ════════════════════════════════════════════════════════════════════════════
set local role anon;
select set_config('request.jwt.claims', null, true);

-- 13. park_public n'expose que les photos approuvées (d2 + d3 = 2)
do $$
declare n int;
begin
  select coalesce(array_length(photos, 1), 0) into n
    from park_public where id = 'c0270000-0000-4000-a000-0000000000e1';
  if n <> 2 then
    raise exception '13 FAIL — park_public.photos attendu 2 (approved), obtenu %', n;
  end if;
  raise notice '13 OK — park_public.photos = photos approuvées uniquement';
end $$;

-- 14. anon ne voit ni les pending ni les rejected
do $$
declare n int;
begin
  select count(*) into n from park_media
   where park_id = 'c0270000-0000-4000-a000-0000000000e1' and status <> 'approved';
  if n <> 0 then
    raise exception '14 FAIL — anon voit % photo(s) non approuvée(s)', n;
  end if;
  raise notice '14 OK — anon ne voit ni pending ni rejected';
end $$;

reset role;
select set_config('request.jwt.claims', null, true);

do $$ begin raise notice '━━━ park_media_moderation : 14/14 OK ━━━'; end $$;

rollback;
