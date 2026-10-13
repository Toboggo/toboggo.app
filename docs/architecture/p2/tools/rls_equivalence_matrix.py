"""Sandbox harness for LOT P2 (RLS read performance) — see ../README-p2.md.
Runs each statement as a given principal (SET LOCAL ROLE + request.jwt.claims) inside a
transaction that is always rolled back. Target: env P2_PSQL, default = the local Supabase
container's `rls_p2` scratch database. NEVER point it at production.
"""
import os, shlex, subprocess, sys, os, shlex
PSQL=shlex.split(os.environ.get("P2_PSQL","docker exec -i supabase_db_Toboggo_App psql -U postgres -d rls_p2 -At"))
USERS=[("staff_super_admin","authenticated","a0000000-0000-0000-0000-000000000001"),
("staff_support","authenticated","a0000000-0000-0000-0000-000000000002"),
("gestionnaire_lyon","authenticated","a0000000-0000-0000-0000-000000000003"),
("contributeur_lyon","authenticated","a0000000-0000-0000-0000-000000000004"),
("legacy_member_bordeaux","authenticated","a0000000-0000-0000-0000-000000000005"),
("creator_of_pending","authenticated","a0000000-0000-0000-0000-000000000006"),
("no_organization","authenticated","a0000000-0000-0000-0000-000000000007"),
("dual_staff_plus_gestionnaire","authenticated","5df27eca-2ef3-4d63-9a1d-68610cd76597"),
("authenticated_unknown_uid","authenticated","ffffffff-ffff-ffff-ffff-ffffffffffff"),
("v1_only_row_org_null","authenticated","a0000000-0000-0000-0000-000000000008"),
("v2_only_contributeur","authenticated","a0000000-0000-0000-0000-000000000009"),
("multi_org_support_plus_gestionnaire","authenticated","a0000000-0000-0000-0000-00000000000a"),
("anon","anon",None)]
TABLES=["parks","park_public","park_sources","park_features","park_names","park_scores","external_ids","park_equipment","park_entrances","park_zones","park_opening_hours","park_attribute_sources","park_media","organization_parks","reports"]
def cell(role,uid,t):
    claims='{"role":"%s"}'%role if not uid else '{"sub":"%s","role":"%s"}'%(uid,role)
    sel = "id::text" if t=="park_public" else "x::text"
    q = f"select count(*)||' '||coalesce(md5(string_agg({'id::text' if t=='park_public' else 'x::text'}, '|' order by {'id::text' if t=='park_public' else 'x::text'})),'-') from "+("(select id from park_public) x" if False else f"{t} x")
    if t=="park_public": q="select count(*)||' '||coalesce(md5(string_agg(id::text,'|' order by id::text)),'-') from park_public"
    s=f"begin; set local role {role}; select set_config('request.jwt.claims','{claims}',true); {q}; rollback;"
    out=subprocess.run(PSQL,input=s,capture_output=True,text=True)
    lines=[l for l in out.stdout.splitlines() if l and not l.startswith(("BEGIN","SET","ROLLBACK","{")) and "role" not in l[:6]]
    return (lines[-1] if lines else "ERR "+out.stderr.strip()[:80])
print("%-30s"%"user/table"+"".join("%-14s"%t[:13] for t in TABLES))
for u in USERS:
    print("%-30s"%u[0]+"".join("%-14s"%cell(u[1],u[2],t).split()[0] for t in TABLES))
print()
for u in USERS:
    for t in TABLES:
        print(u[0],t,cell(u[1],u[2],t))

print()
WT=["park_sources","park_features","park_names","park_scores","external_ids","park_equipment","park_entrances","park_zones","park_opening_hours","park_attribute_sources"]
def wcell(role,uid,sql):
    claims='{"role":"%s"}'%role if not uid else '{"sub":"%s","role":"%s"}'%(uid,role)
    s=f"begin; set local role {role}; select set_config('request.jwt.claims','{claims}',true); {sql}; rollback;"
    out=subprocess.run(PSQL,input=s,capture_output=True,text=True)
    res=[l for l in (out.stdout+out.stderr).splitlines() if l.startswith(("UPDATE","INSERT","DELETE","ERROR"))]
    return res[-1] if res else "?"
print("== writable rows (UPDATE ... SET park_id=park_id, rolled back) and INSERT/DELETE attempts")
for u in USERS:
    for t in WT:
        print("W",u[0],t,wcell(u[1],u[2],f"update {t} set park_id=park_id"))
    # insert on a published park, a Lyon pending park, a legacy-bordeaux pending park, creator's pending park, random pending
    for label,cond in [("published","moderation_status='published' and commune_id is null and created_by is null and id not in (select park_id from organization_parks)"),
                       ("lyon_pending","id in (select park_id from organization_parks where organization_id='00000000-0000-0000-0000-000000000001') and moderation_status='pending'"),
                       ("legacy_bdx_pending","commune_id='00000000-0000-0000-0000-000000000002' and moderation_status='pending' and id not in (select park_id from organization_parks)"),
                       ("creator_pending","created_by='a0000000-0000-0000-0000-000000000006'"),
                       ("random_pending","moderation_status='pending' and commune_id is null and created_by is null and id not in (select park_id from organization_parks)")]:
        print("I",u[0],label,wcell(u[1],u[2],f"insert into park_zones (park_id,name) select id,'t' from parks p where {cond} limit 1 returning 1") if False else
              wcell(u[1],u[2],f"insert into park_zones (park_id,name) values ((select id from (select id from parks where {cond} limit 1) q),'t')"))
    print("D",u[0],"park_zones",wcell(u[1],u[2],"delete from park_zones"))
