"""Sandbox harness for LOT P2 (RLS read performance) — see ../README-p2.md.
Runs each statement as a given principal (SET LOCAL ROLE + request.jwt.claims) inside a
transaction that is always rolled back. Target: env P2_PSQL, default = the local Supabase
container's `rls_p2` scratch database. NEVER point it at production.
"""
import os, shlex, subprocess, re, sys, os, shlex
PSQL=shlex.split(os.environ.get("P2_PSQL","docker exec -i supabase_db_Toboggo_App psql -U postgres -d rls_p2 -At"))
COLS="id,name,slug,description,latitude,longitude,lat,lng,country_code,timezone,address_line,postal_code,city,admin_area_1,admin_area_2,min_age,max_age,ages_derived,moderation_status,operational_status,status_reason,status_from,status_until,verification_status,created_by,rating,review_count,has_open_report,views,created_at,updated_at,last_verified_at,features,cover_photo,photos,translated_names,score,has_score,age_min,age_max,status,formatted_address,commune_id,organization_id,wc,shade,fenced,pmr,benches,water,parking,surface,play_equipment"
LYON="select park_id from organization_parks where organization_id='00000000-0000-0000-0000-000000000001'"
Q=[("1_count_park_public","select count(*) from park_public"),
("2_page25_updated_at",f"select {COLS} from park_public order by updated_at desc, id limit 25"),
("3_pending_1000_rows",f"select {COLS} from park_public where moderation_status='pending' order by created_at desc limit 1000"),
("4_count_pending","select count(*) from park_public where moderation_status='pending'"),
("5_park_sources_osm","select count(*) from park_sources where source_type='osm'"),
("6_name_ilike_page","select id from park_public where name ilike '%par%' order by updated_at desc limit 25"),
("7_collectivity_ids",f"select {COLS} from park_public where id in ({LYON}) order by created_at desc"),
("8_published_list",f"select {COLS} from park_public where moderation_status='published' order by name limit 50"),
("9_country_page","select country_code from park_public offset 0 limit 1000"),
("10_park_features_cnt","select count(*) from park_features"),
]
ROLES=[("staff","authenticated","a0000000-0000-0000-0000-000000000001"),("support","authenticated","a0000000-0000-0000-0000-000000000002"),
("gestionnaire_lyon","authenticated","a0000000-0000-0000-0000-000000000003"),("nobody","authenticated","a0000000-0000-0000-0000-000000000007"),("anon","anon",None)]
def run(role,uid,sql):
    claims='{"role":"%s"}'%role if not uid else '{"sub":"%s","role":"%s"}'%(uid,role)
    s=f"begin; set local role {role}; select set_config('request.jwt.claims','{claims}',true); explain analyze {sql}; rollback;"
    out=subprocess.run(PSQL,input=s,capture_output=True,text=True).stdout
    m=re.search(r"Execution Time: ([0-9.]+) ms",out); return float(m.group(1)) if m else float('nan')
print("%-24s"%"query"+"".join("%-19s"%r[0] for r in ROLES))
for name,sql in Q:
    row="%-24s"%name
    for r in ROLES:
        row+="%-19s"%("%.1f"%min(run(r[1],r[2],sql) for _ in range(3)))
    print(row,flush=True)
