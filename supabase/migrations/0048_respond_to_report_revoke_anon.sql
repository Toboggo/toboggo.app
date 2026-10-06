-- ════════════════════════════════════════════════════════════════════════════
-- 0048 — `respond_to_report` : retire l'EXECUTE d'anon (durcissement de 0045, renuméroté 0046→0048)
-- ────────────────────────────────────────────────────────────────────────────
-- Supabase accorde par défaut EXECUTE à anon sur toute nouvelle fonction du
-- schéma public ; le `revoke ... from public` de 0045 ne le retire pas. Sans
-- effet fonctionnel (la fonction rejette déjà auth.uid() null, 42501), mais le
-- droit n'a pas lieu d'exister : un visiteur ne vote pas.
-- IDEMPOTENTE, non destructive ; ne touche pas `park_active_reports` (lecture
-- publique voulue). Déjà exécutée à la main en production — voir
-- docs/runbook-report-confirmations-0045.md.
-- ════════════════════════════════════════════════════════════════════════════

revoke execute on function public.respond_to_report(uuid, text) from anon;
