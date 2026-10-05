#!/usr/bin/env bash
# Concurrence ancien client (UPDATE / upsert) × renouvellement RPC `give_app_feedback` (0044).
# USAGE (base LOCALE ou STAGING — JAMAIS la production) :
#   DB_CONTAINER=supabase_db_<project> bash supabase/tests/app_feedback_concurrency.sh
# Chaque scénario utilise de vraies sessions psql concurrentes ; l'utilisateur de test est supprimé à la fin.
set -u
C=${DB_CONTAINER:-supabase_db_Toboggo_App}
psql_() { docker exec -i "$C" psql -U postgres -d postgres -v ON_ERROR_STOP=0 -qtA "$@" 2>/dev/null; }
U=f0440000-0000-4000-a000-0000000000ee
CLAIMS="{\"sub\":\"$U\",\"role\":\"authenticated\"}"
fail=0
check() { if [ "$2" = "$3" ]; then echo "OK   $1 ($2)"; else echo "FAIL $1 : obtenu '$2', attendu '$3'"; fail=1; fi; }

reset() { # courant antidaté de 40 j (créé avant les 30 j) avec note 2 / « avant »
  psql_ -c "delete from auth.users where id='$U'" >/dev/null
  psql_ -c "insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at) values ('$U','00000000-0000-0000-0000-000000000000','authenticated','authenticated','zzz-conc-0044@test.local','',now(),now(),now())" >/dev/null
  psql_ -c "insert into app_feedback (user_id, rating, title, body, created_at) values ('$U', 2, 'T', 'avant', now() - interval '40 days')" >/dev/null
}
as_user() { printf "begin; set local role authenticated; select set_config('request.jwt.claims','%s',true); %s" "$CLAIMS" "$1"; }

echo "── Scénario 1 : l'ancien client MODIFIE (transaction ouverte 2 s) pendant que la RPC renouvelle"
reset
{ as_user "update app_feedback set rating = 5, body = 'EDIT-CONCURRENT' where user_id = '$U'; select pg_sleep(2); commit;" | psql_ >/dev/null; } &
sleep 0.7
psql_ <<SQL >/dev/null
begin; set local role authenticated; select set_config('request.jwt.claims','$CLAIMS',true);
select give_app_feedback(4::smallint, 'nouvel avis'); commit;
SQL
wait
check "historique : 1 archive" "$(psql_ -c "select count(*) from app_feedback_history where user_id='$U'")" 1
check "l'archive contient la modification concurrente (non perdue)" "$(psql_ -c "select rating||'/'||body from app_feedback_history where user_id='$U'")" "5/EDIT-CONCURRENT"
check "courant = nouvel avis" "$(psql_ -c "select rating||'/'||body from app_feedback where user_id='$U'")" "4/nouvel avis"

echo "── Scénario 2 : upsert ancien client (INSERT … ON CONFLICT DO UPDATE) concurrent avec la RPC"
reset
{ as_user "insert into app_feedback (user_id, rating, title, body) values ('$U', 1, 'T', 'UPSERT-CONCURRENT') on conflict (user_id) do update set rating = excluded.rating, title = excluded.title, body = excluded.body; select pg_sleep(2); commit;" | psql_ >/dev/null; } &
sleep 0.7
psql_ <<SQL >/dev/null
begin; set local role authenticated; select set_config('request.jwt.claims','$CLAIMS',true);
select give_app_feedback(4::smallint, 'nouvel avis'); commit;
SQL
wait
check "historique : 1 archive" "$(psql_ -c "select count(*) from app_feedback_history where user_id='$U'")" 1
check "l'archive contient l'upsert concurrent (non perdu)" "$(psql_ -c "select rating||'/'||body from app_feedback_history where user_id='$U'")" "1/UPSERT-CONCURRENT"
check "un seul avis courant" "$(psql_ -c "select count(*) from app_feedback where user_id='$U'")" 1

echo "── Scénario 3 : la RPC tient le verrou (transaction ouverte), l'ancien client modifie pendant ce temps"
reset
{ psql_ <<SQL >/dev/null
begin; set local role authenticated; select set_config('request.jwt.claims','$CLAIMS',true);
select give_app_feedback(4::smallint, 'nouvel avis'); select pg_sleep(2); commit;
SQL
} &
sleep 0.7
as_user "insert into app_feedback (user_id, rating, title, body) values ('$U', 3, 'T', 'UPSERT-APRES') on conflict (user_id) do update set rating = excluded.rating, title = excluded.title, body = excluded.body; commit;" | psql_ >/dev/null
wait
check "historique : 1 archive, intacte (l'ancien avis d'origine)" "$(psql_ -c "select rating||'/'||body from app_feedback_history where user_id='$U'")" "2/avant"
check "l'upsert s'est appliqué à l'avis courant (rien de perdu)" "$(psql_ -c "select rating||'/'||body from app_feedback where user_id='$U'")" "3/UPSERT-APRES"
check "un seul avis courant" "$(psql_ -c "select count(*) from app_feedback where user_id='$U'")" 1

echo "── Scénario 4 : 8 renouvellements RPC + 8 upserts d'ancien client simultanés (course aléatoire)"
reset
for i in 1 2 3 4 5 6 7 8; do
  { psql_ <<SQL >/dev/null
begin; set local role authenticated; select set_config('request.jwt.claims','$CLAIMS',true);
select give_app_feedback(4::smallint, 'rpc$i'); commit;
SQL
  } &
  { as_user "insert into app_feedback (user_id, rating, title, body) values ('$U', 3, 'T', 'old$i') on conflict (user_id) do update set body = excluded.body; commit;" | psql_ >/dev/null; } &
done
wait
check "toujours exactement 1 avis courant" "$(psql_ -c "select count(*) from app_feedback where user_id='$U'")" 1
check "au plus 1 archive (délai 30 j respecté)" "$(psql_ -c "select count(*) <= 1 from app_feedback_history where user_id='$U'")" t

psql_ -c "delete from auth.users where id='$U'" >/dev/null
[ $fail = 0 ] && echo "TOUS LES SCÉNARIOS OK" || { echo "ÉCHEC"; exit 1; }
