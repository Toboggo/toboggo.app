-- 0034 — table `children`.
-- Profil enfant minimal, rattaché au parent (auth.uid()), privé, sans identité
-- humaine (pas de prénom/nom/photo — décision produit : l'UI affiche
-- "Enfant 1", "Enfant 2"… par ordre de création, cf. children_order_idx).
-- Âge dérivé à la volée depuis birth_month/birth_year, jamais persisté, jamais
-- de faux jour de naissance — voir packages/shared/src/utils/childAge.ts.

create table children (
  id uuid primary key default gen_random_uuid(),
  parent_id uuid not null references auth.users(id) on delete cascade,
  birth_month smallint not null check (birth_month between 1 and 12),
  -- Borne large de sanité uniquement (ne dépend jamais de l'année courante,
  -- donc ne devient jamais obsolète) : la validation "pas dans le futur" et
  -- la limite d'âge produit vivent côté application, cf. childAge.ts.
  birth_year smallint not null check (birth_year between 1900 and 2100),
  created_at timestamptz not null default now()
);

create index children_parent_id_idx on children(parent_id);
-- Ordre d'affichage déterministe ("Enfant 1", "Enfant 2"…) sans champ dédié.
create index children_parent_created_idx on children(parent_id, created_at);

alter table children enable row level security;

-- Isolation stricte entre parents : un parent ne lit/écrit que ses propres
-- enfants. Même pattern que `profiles_self_*` (0002_rls.sql), adapté au FK
-- parent_id plutôt qu'à la PK directe.
create policy children_self_select on children
  for select using (parent_id = auth.uid());

create policy children_self_insert on children
  for insert with check (parent_id = auth.uid());

create policy children_self_update on children
  for update using (parent_id = auth.uid()) with check (parent_id = auth.uid());

create policy children_self_delete on children
  for delete using (parent_id = auth.uid());

comment on table children is
  'Enfants d''un parent — mois/année de naissance uniquement, âge calculé à la volée. RLS : isolation stricte par parent_id = auth.uid().';

-- ─────────────────────────────────────────────────────────────────────
-- Assertions structurelles — aucune fixture auth.users créée ici (réservé
-- à supabase/tests/children.test.sql, sur base LOCALE/STAGING uniquement).
-- Les CHECK sont évalués avant le trigger FK, donc un parent_id inexistant
-- mais syntaxiquement valide suffit à isoler chaque cas d'erreur.
-- ─────────────────────────────────────────────────────────────────────
do $$
declare
  ghost_parent uuid := '50000034-0034-4000-8000-000000000001';
begin
  -- T1 — birth_month = 0 rejeté.
  begin
    insert into children (parent_id, birth_month, birth_year) values (ghost_parent, 0, 2022);
    raise exception '0034 T1 FAIL — birth_month=0 accepté à tort';
  exception when check_violation then
    raise notice '0034 T1 OK — birth_month=0 rejeté';
  end;

  -- T2 — birth_month = 13 rejeté.
  begin
    insert into children (parent_id, birth_month, birth_year) values (ghost_parent, 13, 2022);
    raise exception '0034 T2 FAIL — birth_month=13 accepté à tort';
  exception when check_violation then
    raise notice '0034 T2 OK — birth_month=13 rejeté';
  end;

  -- T3 — birth_year hors borne basse rejeté.
  begin
    insert into children (parent_id, birth_month, birth_year) values (ghost_parent, 6, 1899);
    raise exception '0034 T3 FAIL — birth_year=1899 accepté à tort';
  exception when check_violation then
    raise notice '0034 T3 OK — birth_year=1899 rejeté';
  end;

  -- T4 — birth_year hors borne haute rejeté.
  begin
    insert into children (parent_id, birth_month, birth_year) values (ghost_parent, 6, 2101);
    raise exception '0034 T4 FAIL — birth_year=2101 accepté à tort';
  exception when check_violation then
    raise notice '0034 T4 OK — birth_year=2101 rejeté';
  end;

  -- T5 — parent_id NULL rejeté.
  begin
    insert into children (parent_id, birth_month, birth_year) values (null, 6, 2022);
    raise exception '0034 T5 FAIL — parent_id NULL accepté à tort';
  exception when not_null_violation then
    raise notice '0034 T5 OK — parent_id NULL rejeté';
  end;

  -- T6 — parent_id syntaxiquement valide mais inexistant rejeté (FK réelle,
  -- distincte des CHECK ci-dessus : birth_month/birth_year valides ici).
  begin
    insert into children (parent_id, birth_month, birth_year) values (ghost_parent, 6, 2022);
    raise exception '0034 T6 FAIL — parent_id inexistant accepté à tort';
  exception when foreign_key_violation then
    raise notice '0034 T6 OK — parent_id inexistant rejeté (FK)';
  end;

  raise notice '0034 OK — contraintes children (T1..T6 PASS)';
end $$;
