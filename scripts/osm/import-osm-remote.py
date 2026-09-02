#!/usr/bin/env python3
import argparse, importlib.util, json, subprocess, sys, tempfile
from collections import Counter
from pathlib import Path

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
                name = local.decode_osm_value(str(props["name"])) if props.get("name") else "Aire de jeux"
                equipment = local.map_playground_features(props.get("playground"), mapping)
                attrs = local.build_attribute_features(props)
                for a in attrs:
                    enrich[a["code"]] += 1

                candidates.append({
                    "osm_type": osm_type or "unknown",
                    "osm_id": str(osm_id),
                    "external_id": external_id,
                    "name": name,
                    "latitude": lat,
                    "longitude": lng,
                    "min_age": local.parse_age(props.get("min_age")),
                    "max_age": local.parse_age(props.get("max_age")),
                    "features": equipment,
                    "attribute_features": attrs,
                })
    return candidates, skipped, enrich

def park_sql(p, publish):
    status = "published" if publish else "pending"
    source_url = f"https://www.openstreetmap.org/{p['osm_type']}/{p['osm_id']}"
    feature_sql = []

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
      ages_derived, moderation_status, verification_status
    ) values (
      {q(p['name'])}, {n(p['latitude'])}, {n(p['longitude'])},
      'FR', 'Europe/Paris', {n(p['min_age'])}, {n(p['max_age'])},
      false, '{status}', 'unverified'
    ) returning id into v_park_id;

    insert into external_ids (park_id, provider, external_id)
    values (v_park_id, 'osm', {q(p['external_id'])})
    on conflict (provider, external_id) do nothing;
  else
    update parks set
      name={q(p['name'])}, latitude={n(p['latitude'])}, longitude={n(p['longitude'])},
      min_age={n(p['min_age'])}, max_age={n(p['max_age'])},
      ages_derived=false, updated_at=now()
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
