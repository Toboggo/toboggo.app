#!/usr/bin/env python3
import argparse, importlib.util, json, subprocess, sys, tempfile
from collections import Counter
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import address as address_lib  # noqa: E402  (après sys.path bootstrap)

PROJECTS = {
    "staging": {"ref": "hfuaouskwysqxiwpwvqy", "label": "Toboggo Staging"},
    "prod": {"ref": "dfzrsygetbhnjzfssgub", "label": "Toboggo Production"},
}
HERE = Path(__file__).resolve().parent
LOCAL_IMPORTER = HERE / "import-osm-local.py"

def load_local():
    spec = importlib.util.spec_from_file_location("osm_local", LOCAL_IMPORTER)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(module)
    return module

def q(v):
    if v is None:
        return "null"
    return "'" + str(v).replace("'", "''") + "'"

def n(v):
    return "null" if v is None else str(v)

def build_candidates(pbf, local):
    mapping = local.load_mapping()
    with tempfile.TemporaryDirectory(prefix="toboggo-osm-remote-") as tmp:
        tmp = Path(tmp)
        filtered = tmp / "playgrounds.osm.pbf"
        geojson = tmp / "playgrounds.geojsonseq"

        subprocess.run(["osmium","tags-filter",str(pbf),"nwr/leisure=playground","-o",str(filtered),"--overwrite"], check=True)
        subprocess.run(["osmium","export",str(filtered),"-f","geojsonseq","--attributes","type,id","-o",str(geojson),"--overwrite"], check=True)

        candidates, seen = [], set()
        skipped, enrich = Counter(), Counter()

        with geojson.open("r", encoding="utf-8") as f:
            for line in f:
                line = line.lstrip("\x1e\ufeff").strip()
                if not line:
                    continue
                feature = json.loads(line)
                props = feature.get("properties", {})
                if props.get("leisure") != "playground":
                    continue

                osm_type, osm_id = local.get_osm_ref(feature)
                if not osm_id:
                    skipped["missing_osm_id"] += 1
                    continue

                external_id = f"{osm_type or 'unknown'}/{osm_id}"
                if external_id in seen:
                    skipped["duplicate_osm_geometry"] += 1
                    continue
                seen.add(external_id)

                point = local.representative_point(feature.get("geometry"))
                if not point:
                    skipped["invalid_geometry"] += 1
                    continue

                access = local.classify_access(props)
                if access == "private":
                    skipped["access_private"] += 1
                    continue
                if access == "customers":
                    skipped["access_customers"] += 1
                    continue

                lng, lat = point
                # `has_osm_name` distinguishes a real OSM `name` tag from the
                # "Aire de jeux" placeholder this importer writes to satisfy
                # `parks.name NOT NULL` when OSM has none — see `park_sql()`,
                # which only gates re-imports / records provenance for a
                # genuine name (park-display-name Phase 2, §H). Mirrors
                # `import-osm-local.py`'s `has_osm_name` (already correct).
                has_osm_name = bool(props.get("name"))
                name = local.decode_osm_value(str(props["name"])) if has_osm_name else "Aire de jeux"
                equipment = local.map_playground_features(props.get("playground"), mapping)
                attrs = local.build_attribute_features(props)
                for a in attrs:
                    enrich[a["code"]] += 1

                candidates.append({
                    "osm_type": osm_type or "unknown",
                    "osm_id": str(osm_id),
                    "external_id": external_id,
                    "name": name,
                    "has_osm_name": has_osm_name,
                    "latitude": lat,
                    "longitude": lng,
                    "min_age": local.parse_age(props.get("min_age")),
                    "max_age": local.parse_age(props.get("max_age")),
                    "address": address_lib.extract_address_from_tags(props),
                    "features": equipment,
                    "attribute_features": attrs,
                })
    return candidates, skipped, enrich

def park_sql(p, publish):
    status = "published" if publish else "pending"
    source_url = f"https://www.openstreetmap.org/{p['osm_type']}/{p['osm_id']}"
    feature_sql = []

    # ── Nom : uniquement si CET objet OSM porte un tag `name` (has_osm_name)
    # ────────────────────────────────────────────────────────────────────
    # Le fallback technique "Aire de jeux" (has_osm_name=False) ne doit
    # JAMAIS : (a) écraser un nom existant lors d'un réimport — un parc dont
    # le nom réel aurait disparu d'un futur extrait OSM garde son nom actuel
    # plutôt que d'être renommé "Aire de jeux" ; (b) être enregistré comme
    # provenance `osm` dans `park_attribute_sources` — ce n'est pas une
    # donnée source, c'est un remplissage technique imposé par `parks.name
    # NOT NULL`. Sans cette distinction, il était impossible de savoir si
    # "Aire de jeux" en base venait vraiment d'OSM ou du fallback Toboggo
    # (audit `AUDIT-display-name-parcs-phase1.md` §C ; `import-osm-local.py`
    # a déjà ce garde-fou côté local — `allow_name = ... and has_osm_name` —
    # aligné ici sur le chemin prod). NON DESTRUCTIF : `parks.name` reste
    # `NOT NULL`, toujours rempli (par le fallback si besoin) à l'INSERT ;
    # aucune migration, aucune colonne nullable.
    name_update_sql = "parks.name"
    name_record_sql = ""
    if p["has_osm_name"]:
        name_update_sql = f"""case when can_source_replace_attribute(v_park_id,'name','osm')
        then {q(p['name'])} else parks.name end"""
        name_value_json = q(json.dumps(p["name"], ensure_ascii=False))
        name_record_sql = f"""
  if can_source_replace_attribute(v_park_id, 'name', 'osm')
     and not exists (
       select 1 from park_attribute_sources pas
       join park_sources ps on ps.id = pas.source_id
       where pas.park_id = v_park_id and pas.attribute_key = 'name'
         and pas.is_current = true and ps.source_type = 'osm'
         and pas.value_json = {name_value_json}::jsonb
     ) then
    perform set_park_attribute_source(
      v_park_id, 'name', {name_value_json}::jsonb, v_source_id, 0.700, null
    );
  end if;
"""

    # ── Adresse : uniquement si CET objet OSM apporte un tag addr:* ────────
    # Jamais de blanchiment d'une adresse existante faute de donnée neuve, et
    # jamais d'écrasement d'une source de priorité >= osm (toboggo/municipality/
    # open_data/partner) — cf. migration 0028 (source_priority).
    address = p.get("address")
    has_address = address_lib.has_usable_address(address)
    address_insert_cols = ""
    address_insert_vals = ""
    address_update_sql = ""
    address_record_sql = ""
    if has_address:
        address_insert_cols = ", address_line, postal_code, city"
        address_insert_vals = (
            f", {q(address.get('address_line'))}, "
            f"{q(address.get('postal_code'))}, {q(address.get('city'))}"
        )
        address_update_sql = f"""
      address_line=case when can_source_replace_attribute(v_park_id,'address','osm')
        then {q(address.get('address_line'))} else parks.address_line end,
      postal_code=case when can_source_replace_attribute(v_park_id,'address','osm')
        then {q(address.get('postal_code'))} else parks.postal_code end,
      city=case when can_source_replace_attribute(v_park_id,'address','osm')
        then {q(address.get('city'))} else parks.city end,"""
        address_value_json = q(json.dumps(address, ensure_ascii=False))
        address_record_sql = f"""
  if can_source_replace_attribute(v_park_id, 'address', 'osm')
     and not exists (
       select 1 from park_attribute_sources pas
       join park_sources ps on ps.id = pas.source_id
       where pas.park_id = v_park_id and pas.attribute_key = 'address'
         and pas.is_current = true and ps.source_type = 'osm'
         and pas.value_json = {address_value_json}::jsonb
     ) then
    perform set_park_attribute_source(
      v_park_id, 'address', {address_value_json}::jsonb, v_source_id, 0.700, null
    );
  end if;
"""

    for code in p["features"]:
        feature_sql.append(f"""
  insert into park_features (park_id, feature_id, status, value, source_id, updated_at)
  select v_park_id, f.id, 'available', null, v_source_id, now()
  from features f where f.code = {q(code)}
  on conflict (park_id, feature_id) do update set
    status=excluded.status, value=excluded.value, source_id=excluded.source_id, updated_at=now();
""")

    for a in p["attribute_features"]:
        feature_sql.append(f"""
  insert into park_features (park_id, feature_id, status, value, source_id, updated_at)
  select v_park_id, f.id, {q(a['status'])}::feature_status, {q(a['value'])}, v_source_id, now()
  from features f where f.code = {q(a['code'])}
  on conflict (park_id, feature_id) do update set
    status=excluded.status, value=excluded.value, source_id=excluded.source_id, updated_at=now();
""")

    return f"""
do $toboggo$
declare v_park_id uuid; v_source_id uuid;
begin
  select park_id into v_park_id from external_ids
  where provider='osm' and external_id={q(p['external_id'])} limit 1;

  if v_park_id is null then
    insert into parks (
      name, latitude, longitude, country_code, timezone, min_age, max_age,
      ages_derived, moderation_status, verification_status{address_insert_cols}
    ) values (
      {q(p['name'])}, {n(p['latitude'])}, {n(p['longitude'])},
      'FR', 'Europe/Paris', {n(p['min_age'])}, {n(p['max_age'])},
      false, '{status}', 'unverified'{address_insert_vals}
    ) returning id into v_park_id;

    insert into external_ids (park_id, provider, external_id)
    values (v_park_id, 'osm', {q(p['external_id'])})
    on conflict (provider, external_id) do nothing;
  else
    -- Réimport OSM : chaque attribut suivi par la provenance n'est réécrit
    -- QUE si aucune source de priorité >= osm ne le protège
    -- (`can_source_replace_attribute`, migrations 0024/0032). Une correction
    -- back-office (`apply_park_attribute` -> source toboggo/municipality) est
    -- donc préservée. `import-osm-local.py` applique le même gate sur
    -- name/min_age/max_age/address ; ici on l'aligne + on ajoute `location`.
    update parks set
      name={name_update_sql},
      latitude=case when can_source_replace_attribute(v_park_id,'location','osm')
        then {n(p['latitude'])} else parks.latitude end,
      longitude=case when can_source_replace_attribute(v_park_id,'location','osm')
        then {n(p['longitude'])} else parks.longitude end,
      min_age=case when can_source_replace_attribute(v_park_id,'min_age','osm')
        then {n(p['min_age'])} else parks.min_age end,
      max_age=case when can_source_replace_attribute(v_park_id,'max_age','osm')
        then {n(p['max_age'])} else parks.max_age end,
      ages_derived=case
        when can_source_replace_attribute(v_park_id,'min_age','osm')
          or can_source_replace_attribute(v_park_id,'max_age','osm')
        then false else parks.ages_derived end,{address_update_sql}
      updated_at=now()
    where id=v_park_id;
  end if;

  select id into v_source_id from park_sources
  where park_id=v_park_id and source_type='osm' limit 1;

  if v_source_id is null then
    insert into park_sources (park_id, source_type, source_name, source_url, license, last_synced_at)
    values (v_park_id, 'osm', 'OpenStreetMap', {q(source_url)}, 'ODbL', now())
    returning id into v_source_id;
  else
    update park_sources set source_name='OpenStreetMap', source_url={q(source_url)},
      license='ODbL', last_synced_at=now() where id=v_source_id;
  end if;
{name_record_sql}
{address_record_sql}
{''.join(feature_sql)}
end
$toboggo$;
"""

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("environment", choices=["staging","prod"])
    ap.add_argument("pbf")
    ap.add_argument("--commit", action="store_true")
    ap.add_argument("--publish", action="store_true")
    args = ap.parse_args()

    pbf = Path(args.pbf).expanduser().resolve()
    project = PROJECTS[args.environment]
    local = load_local()
    candidates, skipped, enrich = build_candidates(pbf, local)

    print(f"Environment : {args.environment.upper()}")
    print(f"Project ref : {project['ref']}")
    print(f"Mode        : {'COMMIT' if args.commit else 'DRY RUN'}")
    print(f"Candidats   : {len(candidates)}")
    print(f"Écartés     : {sum(skipped.values())}")
    for k,v in skipped.most_common():
        print(f"  {k}: {v}")
    print("Enrichissements:")
    for k in ["surface_type","wheelchair_access","fence_status"]:
        print(f"  {k}: {enrich.get(k,0)}")

    if not args.commit:
        print("AUCUNE DONNÉE DISTANTE ÉCRITE.")
        return

    if args.environment == "prod":
        confirm = input("Tape PROD pour confirmer l'écriture production : ").strip()
        if confirm != "PROD":
            raise SystemExit("Import production annulé.")

    batch_size = 50
    total_batches = (len(candidates) + batch_size - 1) // batch_size

    print(f"Import par lots de {batch_size} parcs")
    print(f"Nombre de lots : {total_batches}")

    for batch_number, start in enumerate(range(0, len(candidates), batch_size), start=1):
        batch = candidates[start:start + batch_size]

        with tempfile.NamedTemporaryFile(
            "w", suffix=".sql", delete=False, encoding="utf-8"
        ) as f:
            sql_path = Path(f.name)
            f.write("begin;\n")
            for p in batch:
                f.write(park_sql(p, args.publish))
            f.write("commit;\n")

        try:
            print(f"Lot {batch_number}/{total_batches} ({len(batch)} parcs)...")
            subprocess.run([
                "supabase",
                "db",
                "query",
                "--linked",
                "--project-ref",
                project["ref"],
                "--file",
                str(sql_path),
            ], check=True)
        finally:
            sql_path.unlink(missing_ok=True)

    print("IMPORT DISTANT TERMINÉ")
    print(f"Traités : {len(candidates)}")
    print(f"Nouveaux parcs : {'published' if args.publish else 'pending'}")

if __name__ == "__main__":
    main()
