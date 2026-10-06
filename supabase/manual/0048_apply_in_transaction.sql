-- ════════════════════════════════════════════════════════════════════════════
-- APPLICATION MANUELLE DE 0048 — SQL Editor Supabase, en une fois.
-- Le REVOKE a déjà été exécuté en production : ce script est idempotent et sert
-- à ENREGISTRER 0048 dans supabase_migrations.schema_migrations (évite toute
-- réapplication par le CLI). Migration = supabase/migrations/0048_respond_to_report_revoke_anon.sql.
-- ════════════════════════════════════════════════════════════════════════════
begin;

do $$
begin
  if to_regprocedure('public.respond_to_report(uuid,text)') is null then
    raise exception 'Prérequis manquant : public.respond_to_report (0045) — mauvais projet ?';
  end if;
end $$;

-- ───────────────────────── MIGRATION 0048 ─────────────────────────
revoke execute on function public.respond_to_report(uuid, text) from anon;
-- ───────────────────── FIN MIGRATION 0048 ─────────────────────

insert into supabase_migrations.schema_migrations (version, name)
values ('0048', 'respond_to_report_revoke_anon')
on conflict (version) do nothing;

commit;
