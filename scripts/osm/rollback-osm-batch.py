#!/usr/bin/env python3
"""Retour arrière d'un lot d'import OSM — STRICTEMENT limité aux parcs créés par ce lot.

Génère (et, avec --commit, exécute) UNE transaction SQL gardée qui supprime
uniquement les parcs dont l'`external_id` OSM appartient au lot (liste calculée
depuis le PBF, comme l'import) ET qui satisfont des préconditions de
« non-contamination » : aucun parc publié, aucune donnée humaine rattachée,
aucune autre identité, aucune source autre qu'OSM / reverse geocoding. Toute
précondition en échec ⇒ exception ⇒ transaction annulée, RIEN n'est supprimé.

Modes :
  (défaut)        DRY-RUN : lecture seule — compte les parcs concernés et rapporte
                  chaque précondition (aucune écriture).
  --emit-sql F    écrit le script gardé dans F (à coller dans le SQL Editor, sans
                  connexion) ; aucune connexion à la base.
  --commit        exécute la transaction (staging/prod : confirmation tapée).

Exemple : python3 scripts/osm/rollback-osm-batch.py staging new-york-261004.osm.pbf \
            --country-code US --import-started-at 2026-10-12T09:00:00Z --expected-count 6778
"""
import argparse
import importlib.util
import json
import re
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

PROJECTS = {  # refs publiques déjà référencées par import-osm-remote.py
    "staging": "hfuaouskwysqxiwpwvqy",
    "prod": "dfzrsygetbhnjzfssgub",
}

# Tables dont les lignes rattachées à un parc du lot signent une contribution humaine
# ou une dépendance fonctionnelle : le lot n'est alors plus « pur » ⇒ arrêt.
HUMAN_OR_FUNCTIONAL_TABLES = [
    "reviews", "reports", "park_edits", "park_edit_history", "park_media", "park_confirmations",
    "maintenance", "groups", "notifications", "organization_parks", "park_zones", "park_entrances",
    "park_opening_hours", "park_equipment", "park_scores", "park_names", "park_duplicate_candidates",
]


def q(v):
    return "null" if v is None else "'" + str(v).replace("'", "''") + "'"


def build_rollback_sql(external_ids, expected_count, import_started_at, country_code="US"):
    """SQL gardé (transaction unique). `external_ids` : ids OSM du lot (« way/123 »)."""
    ids = sorted(set(external_ids))
    if not ids:
        raise ValueError("lot vide")
    arr = ",\n    ".join(q(i) for i in ids)
    tables = ", ".join(q(t) for t in HUMAN_OR_FUNCTIONAL_TABLES)
    return f"""-- ════════════════════════════════════════════════════════════════════════════
-- RETOUR ARRIÈRE d'un lot d'import OSM ({len(ids)} external_id, pays {country_code}) — généré par
-- scripts/osm/rollback-osm-batch.py. UNE transaction : toute garde en échec annule tout.
-- Supprime UNIQUEMENT les parcs de ce lot ; cascade (FK ON DELETE CASCADE) sur leurs
-- données dérivées d'OSM ; notifications.park_id passe à NULL (SET NULL).
-- ════════════════════════════════════════════════════════════════════════════
begin;

create temporary table _batch_ids (external_id text primary key) on commit drop;
insert into _batch_ids (external_id) values
    {", ".join("(" + q(i) + ")" for i in ids)};

do $guard$
declare
  expected int := {int(expected_count)};
  started timestamptz := {q(import_started_at)}::timestamptz;
  n int; bad int; t text;
begin
  -- 1. le lot cible exactement `expected` parcs
  select count(distinct e.park_id) into n
    from external_ids e join _batch_ids b on b.external_id = e.external_id where e.provider = 'osm';
  if n <> expected then
    raise exception 'ROLLBACK ARRÊTÉ : % parc(s) trouvé(s) pour le lot, % attendu(s)', n, expected;
  end if;

  -- 2. périmètre : pays, jamais publié, jamais attribué, créé par l'import
  select count(*) into bad from parks p
   where p.id in (select e.park_id from external_ids e join _batch_ids b on b.external_id = e.external_id where e.provider = 'osm')
     and (p.country_code <> {q(country_code)}
          or p.moderation_status <> 'pending'
          or p.created_by is not null
          or p.created_at < started);
  if bad > 0 then
    raise exception 'ROLLBACK ARRÊTÉ : % parc(s) hors périmètre (pays, statut ≠ pending, created_by, ou créé avant le lot)', bad;
  end if;

  -- 3. aucune autre identité externe (parc fusionné / lié à une autre source)
  select count(*) into bad from external_ids e
   where e.park_id in (select e2.park_id from external_ids e2 join _batch_ids b on b.external_id = e2.external_id where e2.provider = 'osm')
     and not (e.provider = 'osm' and e.external_id in (select external_id from _batch_ids));
  if bad > 0 then raise exception 'ROLLBACK ARRÊTÉ : % identité(s) externe(s) étrangère(s) au lot', bad; end if;

  -- 4. aucune donnée humaine / fonctionnelle rattachée
  foreach t in array array[{tables}] loop
    -- table absente de cet environnement (ex. STAGING sans 0043) : rien à contrôler
    if to_regclass(format('public.%I', t)) is null then continue; end if;
    execute format(
      'select count(*) from public.%I x where x.park_id in (select e.park_id from external_ids e join _batch_ids b on b.external_id = e.external_id where e.provider = ''osm'')', t)
      into bad;
    if bad > 0 then raise exception 'ROLLBACK ARRÊTÉ : % ligne(s) dans % rattachée(s) au lot', bad, t; end if;
  end loop;

  -- 5. provenance : uniquement OSM et reverse geocoding (jamais toboggo / municipality / partner…)
  select count(*) into bad from park_sources ps
   where ps.park_id in (select e.park_id from external_ids e join _batch_ids b on b.external_id = e.external_id where e.provider = 'osm')
     and ps.source_type not in ('osm', 'reverse_geocode');
  if bad > 0 then raise exception 'ROLLBACK ARRÊTÉ : % source(s) autre(s) que osm / reverse_geocode', bad; end if;

  select count(*) into bad from park_attribute_sources pas
    join park_sources ps on ps.id = pas.source_id
   where pas.park_id in (select e.park_id from external_ids e join _batch_ids b on b.external_id = e.external_id where e.provider = 'osm')
     and ps.source_type not in ('osm', 'reverse_geocode');
  if bad > 0 then raise exception 'ROLLBACK ARRÊTÉ : % attribut(s) de provenance humaine', bad; end if;

  -- 6. équipements : uniquement ceux posés par l'import OSM
  select count(*) into bad from park_features pf
   where pf.park_id in (select e.park_id from external_ids e join _batch_ids b on b.external_id = e.external_id where e.provider = 'osm')
     and (pf.source_id is null or pf.source_id not in (select id from park_sources where source_type = 'osm'));
  if bad > 0 then raise exception 'ROLLBACK ARRÊTÉ : % équipement(s) d''origine non OSM', bad; end if;
end
$guard$;

-- Suppression : uniquement les parcs du lot (jamais de filtre large).
with victims as (
  select e.park_id from external_ids e join _batch_ids b on b.external_id = e.external_id where e.provider = 'osm'
), del as (
  delete from parks where id in (select park_id from victims) returning id
)
select count(*) as parcs_supprimes from del;

-- Vérification : plus aucune trace du lot
do $post$
begin
  if exists (select 1 from external_ids e join _batch_ids b on b.external_id = e.external_id where e.provider = 'osm') then
    raise exception 'ROLLBACK : des external_id du lot subsistent — transaction annulée';
  end if;
end
$post$;

commit;
"""


def _load_remote():
    spec = importlib.util.spec_from_file_location("osm_remote", HERE / "import-osm-remote.py")
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m


def _load_local_importer():
    spec = importlib.util.spec_from_file_location("osm_local", HERE / "import-osm-local.py")
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m


def batch_external_ids(pbf, country_code):
    remote = _load_remote()
    local = _load_local_importer()
    cands, _skipped, _enrich = remote.build_candidates(Path(pbf), local, country_code=country_code)
    return [c["external_id"] for c in cands]


def run_remote_sql(sql, ref):
    with __import__("tempfile").NamedTemporaryFile("w", suffix=".sql", delete=False, encoding="utf-8") as f:
        path = Path(f.name)
        f.write(sql)
    try:
        r = subprocess.run(["supabase", "db", "query", "--linked", "--project-ref", ref, "--file", str(path), "--output", "json"],
                           check=True, capture_output=True, text=True)
        return r.stdout
    finally:
        path.unlink(missing_ok=True)


def existing_tables_sql():
    arr = ", ".join(q(t) for t in HUMAN_OR_FUNCTIONAL_TABLES)
    return f"select t from unnest(array[{arr}]) t where to_regclass('public.' || t) is not null order by 1"


def dry_run_report_sql(ids, country_code, tables=None):
    """Requêtes SELECT (lecture seule) : combien de parcs du lot existent et pourquoi un rollback serait refusé."""
    arr = ", ".join(q(i) for i in sorted(set(ids)))
    victims = f"(select e.park_id from external_ids e where e.provider = 'osm' and e.external_id = any(array[{arr}]))"
    checks = [
        ("parcs_du_lot", f"select count(*) n from parks where id in {victims}"),
        ("hors_perimetre", f"select count(*) n from parks where id in {victims} and (country_code <> {q(country_code)} or moderation_status <> 'pending' or created_by is not null)"),
    ]
    # `tables` : tables réellement présentes dans l'environnement (une table absente — ex. STAGING sans
    # park_confirmations — ne peut pas figurer dans une requête statique : elle est ignorée).
    for t in (HUMAN_OR_FUNCTIONAL_TABLES if tables is None else tables):
        checks.append((f"lignes_{t}", f"select count(*) n from public.{t} where park_id in {victims}"))
    return checks


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("environment", choices=["staging", "prod"])
    ap.add_argument("pbf")
    ap.add_argument("--country-code", required=True)
    ap.add_argument("--import-started-at", required=True, help="horodatage ISO (UTC) du début de l'import à annuler")
    ap.add_argument("--expected-count", required=True, type=int)
    ap.add_argument("--emit-sql", metavar="FICHIER", help="écrit le script gardé (aucune connexion)")
    ap.add_argument("--commit", action="store_true")
    args = ap.parse_args()

    ids = batch_external_ids(args.pbf, args.country_code)
    print(f"Lot : {len(ids)} external_id OSM (PBF {Path(args.pbf).name})")
    if len(ids) != args.expected_count:
        raise SystemExit(f"Le PBF produit {len(ids)} candidats, {args.expected_count} attendus — arrêt.")
    sql = build_rollback_sql(ids, args.expected_count, args.import_started_at, args.country_code)

    if args.emit_sql:
        Path(args.emit_sql).write_text(sql, encoding="utf-8")
        print(f"Script écrit : {args.emit_sql} ({len(sql)} octets). Aucune connexion, aucune écriture.")
        return

    ref = PROJECTS[args.environment]
    print(f"Environnement : {args.environment.upper()} ({ref}) — {'COMMIT' if args.commit else 'DRY-RUN (lecture seule)'}")
    if not args.commit:
        present = [r["t"] for r in json.loads(re.search(r"\[.*\]", run_remote_sql(existing_tables_sql(), ref), re.S).group(0))]
        for t in sorted(set(HUMAN_OR_FUNCTIONAL_TABLES) - set(present)):
            print(f"  (table absente de cet environnement, ignorée : {t})")
        for label, check in dry_run_report_sql(ids, args.country_code, present):
            print(f"  {label:34s} {run_remote_sql(check, ref).strip()[:120]}")
        print("DRY-RUN : aucune écriture. Relancer avec --commit pour exécuter la transaction gardée.")
        return
    if input(f"Taper ROLLBACK-{args.environment.upper()} pour supprimer le lot : ").strip() != f"ROLLBACK-{args.environment.upper()}":
        raise SystemExit("Annulé.")
    print(run_remote_sql(sql, ref))


if __name__ == "__main__":
    main()
