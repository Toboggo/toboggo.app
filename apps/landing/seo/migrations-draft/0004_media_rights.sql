-- ⚠️ BROUILLON — NON APPLIQUÉ. Ne PAS copier dans supabase/migrations/ sans accord explicite.
-- Contraintes du dépôt : migration ADDITIVE uniquement (aucun DROP, aucune réécriture de 0001→0038),
-- jamais `db push --linked` ni `migration repair` en production ; validation locale puis staging (--db-url) d abord.
-- Numérotation cible : 0039+ (dernière migration existante : 0038).
--
-- Droits des photos. Aujourd'hui license / author / attribution sont NULL pour
-- toutes les photos : tout est donc 'unknown' et AUCUNE photo ne peut apparaître
-- sur une page SEO. Une photo n'est utilisable que si rights_status = 'validated'
-- (garanti par la contrainte ci-dessous) ET posé par le staff Toboggo.

do $$ begin
  create type media_rights_status as enum ('unknown', 'validated', 'rejected');
exception when duplicate_object then null; end $$;

alter table park_media
  add column if not exists rights_status     media_rights_status not null default 'unknown',
  add column if not exists rights_checked_at timestamptz,
  add column if not exists rights_checked_by uuid references auth.users (id) on delete set null,
  add column if not exists rights_note       text;

-- 'validated' exige une licence, un auteur ou une attribution, et une date de contrôle.
alter table park_media
  add constraint park_media_rights_validated_chk check (
    rights_status <> 'validated'
    or (
      nullif(trim(coalesce(license, '')), '') is not null
      and coalesce(nullif(trim(coalesce(author, '')), ''), nullif(trim(coalesce(attribution, '')), '')) is not null
      and rights_checked_at is not null
    )
  );

-- Seul le staff Toboggo peut changer le statut de droits (ni l'uploader, ni une collectivité).
create or replace function park_media_guard_rights() returns trigger
language plpgsql as $$
begin
  if (tg_op = 'INSERT' and new.rights_status <> 'unknown')
     or (tg_op = 'UPDATE' and new.rights_status is distinct from old.rights_status) then
    if not coalesce(is_toboggo_staff(auth.uid()), false) then
      raise exception 'rights_status can only be changed by Toboggo staff';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists park_media_guard_rights_biu on park_media;
create trigger park_media_guard_rights_biu
  before insert or update on park_media
  for each row execute function park_media_guard_rights();
