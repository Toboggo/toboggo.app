-- ════════════════════════════════════════════════════════════════════════════
-- Test RLS `children` — isolation stricte entre parents (migration 0034)
-- ────────────────────────────────────────────────────────────────────────────
-- Vérifie le comportement sous rôle AUTHENTIFIÉ (parent A / parent B / anon) et
-- la cascade de suppression `auth.users → children`, ce que les assertions
-- embarquées dans 0034 ne couvrent pas (elles se limitent aux CHECK/FK
-- structurels, sans fixture auth.users). Nécessite un accès privilégié
-- (création d'`auth.users`) : à lancer sur base LOCALE ou avec une connexion
-- admin STAGING, pas via le rôle bas privilège de `supabase test db`.
--
-- USAGE (base LOCALE ou STAGING — JAMAIS la production) :
--   docker exec -i supabase_db_<project> psql -U postgres -d postgres \
--     -v ON_ERROR_STOP=1 < supabase/tests/children.test.sql
--
-- Tout est encapsulé dans une transaction terminée par ROLLBACK : aucune
-- donnée persistée (ni auth.users, ni children).
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
  ('c0340000-0000-4000-a000-00000000000a', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'zzz-parent-a-0034@test.local', '', now(), now(), now()),
  ('c0340000-0000-4000-a000-00000000000b', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'zzz-parent-b-0034@test.local', '', now(), now(), now());

-- ════════════════════════════════════════════════════════════════════════════
-- Parent A
-- ════════════════════════════════════════════════════════════════════════════
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"c0340000-0000-4000-a000-00000000000a","role":"authenticated"}', true);

-- 1. A crée un enfant pour lui-même → OK.
do $$
begin
  insert into children (id, parent_id, birth_month, birth_year)
  values ('c0340000-0000-4000-a000-0000000000d1', 'c0340000-0000-4000-a000-00000000000a', 9, 2022);
  raise notice '1 OK — parent A : création de son propre enfant autorisée';
end $$;

-- 2. A tente de créer un enfant pour B (usurpation de parent_id) → refusé.
do $$
begin
  begin
    insert into children (parent_id, birth_month, birth_year)
    values ('c0340000-0000-4000-a000-00000000000b', 3, 2020);
    raise exception '2 FAIL — usurpation parent_id acceptée';
  exception when insufficient_privilege then
    raise notice '2 OK — parent A : usurpation de parent_id refusée';
  end;
end $$;

-- 3. A relit ses enfants → 1 ligne visible.
do $$
declare cnt int;
begin
  select count(*) into cnt from children;
  if cnt <> 1 then
    raise exception '3 FAIL — parent A voit % lignes (attendu 1)', cnt;
  end if;
  raise notice '3 OK — parent A : 1 enfant visible';
end $$;

-- 4. A modifie son propre enfant → OK.
do $$
begin
  update children set birth_month = 10 where id = 'c0340000-0000-4000-a000-0000000000d1';
  if (select birth_month from children where id = 'c0340000-0000-4000-a000-0000000000d1') <> 10 then
    raise exception '4 FAIL — mise à jour non appliquée';
  end if;
  raise notice '4 OK — parent A : modification de son enfant autorisée';
end $$;

-- ════════════════════════════════════════════════════════════════════════════
-- Parent B
-- ════════════════════════════════════════════════════════════════════════════
select set_config('request.jwt.claims',
  '{"sub":"c0340000-0000-4000-a000-00000000000b","role":"authenticated"}', true);

-- 5. B crée son propre enfant → OK.
do $$
begin
  insert into children (id, parent_id, birth_month, birth_year)
  values ('c0340000-0000-4000-a000-0000000000d2', 'c0340000-0000-4000-a000-00000000000b', 1, 2019);
  raise notice '5 OK — parent B : création de son propre enfant autorisée';
end $$;

-- 6. B ne voit que son propre enfant (pas celui de A).
do $$
declare cnt int;
begin
  select count(*) into cnt from children;
  if cnt <> 1 then
    raise exception '6 FAIL — parent B voit % lignes (attendu 1)', cnt;
  end if;
  if not exists (select 1 from children where id = 'c0340000-0000-4000-a000-0000000000d2') then
    raise exception '6 FAIL — parent B ne voit pas son propre enfant';
  end if;
  raise notice '6 OK — parent B : isolation en lecture confirmée';
end $$;

-- 7. B tente de modifier l'enfant de A → 0 ligne affectée (RLS silencieuse en UPDATE).
do $$
declare affected int;
begin
  update children set birth_month = 1 where id = 'c0340000-0000-4000-a000-0000000000d1';
  get diagnostics affected = row_count;
  if affected <> 0 then
    raise exception '7 FAIL — parent B a modifié l''enfant de A (% ligne(s))', affected;
  end if;
  raise notice '7 OK — parent B : modification de l''enfant de A bloquée';
end $$;

-- 8. B tente de supprimer l'enfant de A → 0 ligne affectée.
do $$
declare affected int;
begin
  delete from children where id = 'c0340000-0000-4000-a000-0000000000d1';
  get diagnostics affected = row_count;
  if affected <> 0 then
    raise exception '8 FAIL — parent B a supprimé l''enfant de A (% ligne(s))', affected;
  end if;
  raise notice '8 OK — parent B : suppression de l''enfant de A bloquée';
end $$;

-- ════════════════════════════════════════════════════════════════════════════
-- Anonyme
-- ════════════════════════════════════════════════════════════════════════════
set local role anon;
select set_config('request.jwt.claims', null, true);

-- 9. anon ne voit aucun enfant.
do $$
declare cnt int;
begin
  select count(*) into cnt from children;
  if cnt <> 0 then
    raise exception '9 FAIL — anon voit % lignes (attendu 0)', cnt;
  end if;
  raise notice '9 OK — anon : aucun enfant visible';
end $$;

-- 10. anon ne peut pas créer d'enfant.
do $$
begin
  begin
    insert into children (parent_id, birth_month, birth_year)
    values ('c0340000-0000-4000-a000-00000000000a', 5, 2021);
    raise exception '10 FAIL — anon a pu créer un enfant';
  exception when insufficient_privilege then
    raise notice '10 OK — anon : création refusée';
  end;
end $$;

-- ════════════════════════════════════════════════════════════════════════════
-- Cascade `auth.users` → `children` (rôle postgres, privilégié)
-- ════════════════════════════════════════════════════════════════════════════
reset role;
select set_config('request.jwt.claims', null, true);

-- 11. Suppression du compte de A → son enfant disparaît (cascade), celui de B reste.
do $$
declare cnt_a int;
declare cnt_b int;
begin
  delete from auth.users where id = 'c0340000-0000-4000-a000-00000000000a';
  select count(*) into cnt_a from children where parent_id = 'c0340000-0000-4000-a000-00000000000a';
  select count(*) into cnt_b from children where id = 'c0340000-0000-4000-a000-0000000000d2';
  if cnt_a <> 0 then
    raise exception '11 FAIL — enfant de A survit à la suppression du compte (% ligne(s))', cnt_a;
  end if;
  if cnt_b <> 1 then
    raise exception '11 FAIL — enfant de B affecté à tort (% ligne(s))', cnt_b;
  end if;
  raise notice '11 OK — cascade auth.users → children confirmée, isolation préservée';
end $$;

rollback;
