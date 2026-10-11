#!/usr/bin/env python3
"""État AVANT import (et comparaison APRÈS) — LECTURE SEULE stricte.

Photographie un projet Supabase (staging/prod) : parcs par statut/pays, external_ids,
sources, provenance, équipements, empreintes (parcs hors lot, fonctions, vue), tailles.
Écrit un JSON horodaté et, avec --export, une copie des tables concernées (SELECT).
Chaque requête est vérifiée « SELECT seulement » avant envoi : aucune écriture possible.

  python3 scripts/osm/prod-import-snapshot.py prod --out backups/prod-ny-import-pre [--export]
  python3 scripts/osm/prod-import-snapshot.py prod --compare backups/prod-ny-import-pre/etat_avant_import.json --exclude-country US
"""
import argparse
import datetime
import json
import os
import re
import subprocess
import sys
import tempfile
from pathlib import Path

PROJECTS = {"staging": "hfuaouskwysqxiwpwvqy", "prod": "dfzrsygetbhnjzfssgub"}
FORBIDDEN = re.compile(r"\b(insert|update|delete|drop|alter|create|truncate|grant|revoke|call|do)\b", re.I)


def assert_read_only(sql):
    bare = re.sub(r"'(?:[^']|'')*'", "''", sql)       # sans littéraux
    if not re.match(r"\s*(select|with)\b", bare, re.I) or FORBIDDEN.search(bare):
        raise ValueError("requête refusée : lecture seule uniquement")


def ro(sql, ref):
    assert_read_only(sql)
    with tempfile.NamedTemporaryFile("w", suffix=".sql", delete=False, encoding="utf-8") as f:
        path = Path(f.name)
        f.write(sql)
    try:
        r = subprocess.run(["supabase", "db", "query", "--linked", "--project-ref", ref, "--file", str(path), "--output", "json"],
                           check=True, capture_output=True, text=True)
    finally:
        path.unlink(missing_ok=True)
    return json.loads(re.search(r"\[.*\]", r.stdout, re.S).group(0))


FP = "id::text||'|'||name||'|'||moderation_status::text||'|'||coalesce(address_line,'')||'|'||coalesce(city,'')||'|'||latitude::text||'|'||longitude::text"


def snapshot(ref, exclude_country=None):
    where = f"where country_code <> '{exclude_country}'" if exclude_country else ""
    s = {"horodatage_utc": datetime.datetime.utcnow().isoformat() + "Z", "projet": ref}
    s["parks_par_statut_pays"] = ro("select country_code, moderation_status, verification_status, count(*) n from parks group by 1,2,3 order by 1,2,3", ref)
    s["external_ids"] = ro("select provider, count(*) n, count(distinct external_id) d from external_ids group by 1", ref)
    s["park_sources"] = ro("select source_type, count(*) n from park_sources group by 1 order by 1", ref)
    s["park_attribute_sources"] = ro("select ps.source_type, pas.attribute_key, count(*) n from park_attribute_sources pas join park_sources ps on ps.id=pas.source_id group by 1,2 order by 1,2", ref)
    s["park_features"] = ro("select f.code, pf.status, count(*) n from park_features pf join features f on f.id=pf.feature_id group by 1,2 order by 1,2", ref)
    s["audit_log"] = ro("select count(*) n, max(created_at) dernier from audit_log", ref)
    s["empreinte_parks"] = ro(f"select md5(coalesce(string_agg({FP}, ';' order by id), '')) h, count(*) n from parks {where}", ref)
    s["empreintes_fonctions"] = ro("select proname, md5(pg_get_functiondef(oid)) md5 from pg_proc where proname in ('nearby_parks','nearby_parks_page','us_state_abbr','can_source_replace_attribute','set_park_attribute_source') order by 1", ref)
    s["vue_md5"] = ro("select md5(pg_get_viewdef('public.park_public'::regclass,true)) m", ref)
    s["taille_db"] = ro("select pg_size_pretty(pg_database_size(current_database())) taille", ref)
    return s


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("environment", choices=["staging", "prod"])
    ap.add_argument("--out", help="dossier de sortie (JSON ; ignoré par git si sous backups/)")
    ap.add_argument("--export", action="store_true", help="copie JSON des tables concernées (SELECT)")
    ap.add_argument("--compare", metavar="JSON", help="compare l'état courant à un état précédent")
    ap.add_argument("--exclude-country", metavar="CC", help="exclut ce pays de l'empreinte (ex. US : parcs hors lot)")
    args = ap.parse_args()
    ref = PROJECTS[args.environment]
    cur = snapshot(ref, args.exclude_country)
    if args.compare:
        before = json.loads(Path(args.compare).read_text())
        ok = True
        for k in ("empreintes_fonctions", "vue_md5"):
            same = before.get(k) == cur[k]
            ok &= same
            print(f"{k:24s} {'identique' if same else 'DIFFÉRENT'}")
        same = before["empreinte_parks"][0]["h"] == cur["empreinte_parks"][0]["h"]
        ok &= same
        print(f"{'empreinte parcs (hors ' + (args.exclude_country or 'aucun') + ')':24s} {'identique' if same else 'DIFFÉRENT'}")
        print("COMPARAISON :", "OK" if ok else "ÉCART — ne pas poursuivre sans diagnostic")
        sys.exit(0 if ok else 1)
    out = Path(args.out or "backups/prod-ny-import-pre")
    out.mkdir(parents=True, exist_ok=True)
    (out / "etat_avant_import.json").write_text(json.dumps(cur, indent=1, default=str))
    print("état écrit :", out / "etat_avant_import.json")
    if args.export:
        for t in ("external_ids", "park_sources", "park_attribute_sources", "park_features"):
            rows = ro(f"select * from {t}", ref)
            (out / f"{t}.json").write_text(json.dumps(rows, default=str))
            print(f"export {t}: {len(rows)} lignes")
        rows = ro("select id, name, description, latitude, longitude, country_code, timezone, address_line, postal_code, city, admin_area_1, admin_area_2, min_age, max_age, ages_derived, moderation_status, operational_status, verification_status, created_by, rating, review_count, views, created_at, updated_at, commune_id from parks", ref)
        (out / "parks.json").write_text(json.dumps(rows, default=str))
        print(f"export parks: {len(rows)} lignes")


if __name__ == "__main__":
    main()
