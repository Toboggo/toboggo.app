#!/usr/bin/env python3
"""Backfill des adresses parcs par reverse geocoding (Geoapify).

SÉCURITÉ / PÉRIMÈTRE :
  - `--env` n'accepte QUE `local` ou `staging` — 'prod' n'est même pas une
    option possible dans ce script. Le support production sera un choix
    délibéré futur, ajouté séparément une fois staging validé.
  - Sans `--commit` : DRY-RUN — rien n'est écrit, tout est affiché.
  - Sélectionne uniquement les parcs dont l'adresse est absente ET dont
    aucune source de priorité >= reverse_geocode (45) ne la protège déjà
    (`can_source_replace_attribute`, migration 0024/0028) — ce qui rend le
    script naturellement IDEMPOTENT et REPRENABLE : un parc déjà traité par
    un run précédent (source 'reverse_geocode' déjà enregistrée) ressort
    avec une priorité 45, donc n'est plus jamais resélectionné par un run
    suivant tant qu'aucune source supérieure n'est venue le remplacer.
  - La clé Geoapify vient uniquement de `GEOAPIFY_API_KEY` (voir geoapify.py).

Usage :
  python3 scripts/osm/backfill-addresses.py --env staging --limit 10
  python3 scripts/osm/backfill-addresses.py --env staging --limit 10 --commit
"""
from __future__ import annotations

import argparse
import json
import subprocess
import sys
import tempfile
from pathlib import Path

import psycopg

sys.path.insert(0, str(Path(__file__).resolve().parent))
import address as address_lib  # noqa: E402
from geoapify import GeoapifyClient, GeoapifyError  # noqa: E402

LOCAL_DSN = "postgresql://postgres:postgres@127.0.0.1:54322/postgres"

# Doit rester identique à PROJECTS["staging"]["ref"] dans import-osm-remote.py.
STAGING_PROJECT_REF = "hfuaouskwysqxiwpwvqy"

# Départements de l'ancienne région Midi-Pyrénées — seule zone couverte par
# le jeu de données OSM importé (docs/operations/OSM.md). Un code postal hors
# de cette liste sur un résultat de reverse geocoding est un signal
# d'incohérence à vérifier manuellement (bord de région plausible, ou erreur
# Geoapify), pas une preuve d'erreur en soi.
MIDI_PYRENEES_DEPARTEMENTS = {"09", "12", "31", "32", "46", "65", "81", "82"}


def flag_result(value: dict) -> list[str]:
    """Signaux d'attention à faire vérifier manuellement — jamais une
    validation automatique, juste de quoi cibler la relecture humaine."""
    flags = []
    if not value.get("city"):
        flags.append("sans_ville")
    if not value.get("postal_code"):
        flags.append("sans_code_postal")
    elif value["postal_code"][:2] not in MIDI_PYRENEES_DEPARTEMENTS:
        flags.append(f"departement_hors_zone:{value['postal_code'][:2]}")
    if not value.get("address_line"):
        flags.append("sans_numero_rue")
    return flags


SELECT_CANDIDATES_SQL = """
select id, latitude, longitude
from parks
where latitude is not null
  and longitude is not null
  and (address_line is null or postal_code is null or city is null)
  and can_source_replace_attribute(id, 'address', 'reverse_geocode')
order by id
limit {limit}
"""


def q(v):
    if v is None:
        return "null"
    return "'" + str(v).replace("'", "''") + "'"


def n(v):
    return "null" if v is None else str(v)


def parse_args():
    ap = argparse.ArgumentParser(
        description="Backfill adresses via reverse geocoding Geoapify (LOCAL/STAGING uniquement, jamais PROD)."
    )
    ap.add_argument(
        "--env",
        choices=["local", "staging"],
        required=True,
        help="'prod' n'est pas une option de ce script.",
    )
    ap.add_argument(
        "--dry-run",
        action="store_true",
        help="Explicite ; déjà le comportement par défaut sans --commit.",
    )
    ap.add_argument(
        "--commit",
        action="store_true",
        help="Écrit réellement dans la base ciblée par --env. Sans cette option = DRY-RUN.",
    )
    ap.add_argument(
        "--limit", type=int, default=10, help="Nombre max de parcs traités (défaut 10)."
    )
    ap.add_argument(
        "--min-interval",
        type=float,
        default=0.25,
        help="Délai minimum entre deux appels Geoapify, en secondes (défaut 0.25 = ~4 req/s).",
    )
    ap.add_argument("--max-retries", type=int, default=3)
    return ap.parse_args()


def run_staging_sql(sql: str, project_ref: str) -> list[dict]:
    """Exécute du SQL sur un projet Supabase distant via `supabase db query
    --linked` (même mécanisme que import-osm-remote.py — jamais --db-url ici
    car ce n'est pas une migration, juste une lecture/écriture de données)."""
    with tempfile.NamedTemporaryFile(
        "w", suffix=".sql", delete=False, encoding="utf-8"
    ) as f:
        path = Path(f.name)
        f.write(sql)
    try:
        result = subprocess.run(
            [
                "supabase", "db", "query", "--linked",
                "--project-ref", project_ref,
                "--file", str(path),
                "--output", "json",
            ],
            check=True, capture_output=True, text=True,
        )
    finally:
        path.unlink(missing_ok=True)
    out = result.stdout
    start = out.index("{")
    data = json.loads(out[start:])
    return data.get("rows", [])


class LocalConn:
    def __init__(self, dsn):
        self.conn = psycopg.connect(dsn)

    def select(self, sql):
        with self.conn.cursor() as cur:
            cur.execute(sql)
            cols = [d.name for d in cur.description]
            return [dict(zip(cols, row)) for row in cur.fetchall()]

    def execute_sql_text(self, sql):
        with self.conn.cursor() as cur:
            cur.execute(sql)
        self.conn.commit()

    def close(self):
        self.conn.close()


class StagingConn:
    def __init__(self, project_ref):
        self.project_ref = project_ref

    def select(self, sql):
        return run_staging_sql(sql, self.project_ref)

    def execute_sql_text(self, sql):
        run_staging_sql(sql, self.project_ref)

    def close(self):
        pass


def build_write_sql(park_id, value, confidence):
    value_json = q(json.dumps(value, ensure_ascii=False))
    return f"""
do $toboggo$
declare v_source_id uuid;
begin
  select id into v_source_id from park_sources
  where park_id={q(park_id)} and source_type='reverse_geocode' limit 1;

  if v_source_id is null then
    insert into park_sources (park_id, source_type, source_name, last_synced_at)
    values ({q(park_id)}, 'reverse_geocode', 'Geoapify', now())
    returning id into v_source_id;
  else
    update park_sources set last_synced_at=now() where id=v_source_id;
  end if;

  -- Double garde : la sélection a déjà filtré sur can_source_replace_attribute,
  -- on revérifie à l'écriture (défense en profondeur contre une course entre
  -- la sélection et l'écriture, ex. un run concurrent). Et idempotence : si
  -- la valeur 'address' courante (source reverse_geocode) est déjà identique,
  -- ne rien ré-écrire — sinon un run répété créerait une nouvelle ligne
  -- park_attribute_sources à chaque exécution (historique qui grossit pour
  -- rien, et `updated_at` qui bouge sans changement réel).
  if can_source_replace_attribute({q(park_id)}, 'address', 'reverse_geocode')
     and not exists (
       select 1 from park_attribute_sources pas
       join park_sources ps on ps.id = pas.source_id
       where pas.park_id = {q(park_id)} and pas.attribute_key = 'address'
         and pas.is_current = true and ps.source_type = 'reverse_geocode'
         and pas.value_json = {value_json}::jsonb
     ) then
    update parks set
      address_line={q(value['address_line'])},
      postal_code={q(value['postal_code'])},
      city={q(value['city'])},
      admin_area_1={q(value['admin_area_1'])},
      admin_area_2={q(value['admin_area_2'])},
      updated_at=now()
    where id={q(park_id)};

    perform set_park_attribute_source(
      {q(park_id)}, 'address', {value_json}::jsonb, v_source_id, {n(confidence)}, null
    );
  end if;
end
$toboggo$;
"""


def main():
    args = parse_args()
    commit = args.commit

    print()
    print("TOBOGGO — BACKFILL ADRESSES (reverse geocoding Geoapify)")
    print("=========================================================")
    print(f"Environnement : {args.env.upper()}")
    print(f"Mode          : {'COMMIT' if commit else 'DRY-RUN'}")
    print(f"Limite        : {args.limit}")
    print()

    if args.env == "local":
        conn = LocalConn(LOCAL_DSN)
    else:
        conn = StagingConn(STAGING_PROJECT_REF)

    try:
        client = GeoapifyClient(
            min_interval_s=args.min_interval, max_retries=args.max_retries
        )
    except GeoapifyError as e:
        raise SystemExit(str(e))

    candidates = conn.select(SELECT_CANDIDATES_SQL.format(limit=args.limit))
    print(f"Candidats éligibles : {len(candidates)}")
    print(
        "  (adresse absente ET aucune source de priorité >= reverse_geocode "
        "ne la protège déjà)"
    )
    print()

    if not candidates:
        print("Rien à faire.")
        conn.close()
        return

    processed = written = skipped_empty = errors = 0
    flagged_rows = []  # (park_id, lat, lon, formatted, flags) — pour le rapport

    for row in candidates:
        park_id = row["id"]
        lat, lon = row["latitude"], row["longitude"]
        processed += 1

        try:
            result = client.reverse_geocode(lat, lon)
        except GeoapifyError as e:
            errors += 1
            print(f"[ERREUR] {park_id}  ({lat}, {lon})\n         {e}")
            continue

        if not result:
            skipped_empty += 1
            print(f"[VIDE]   {park_id}  ({lat}, {lon})  — Geoapify sans résultat exploitable")
            continue

        value = {
            "address_line": result["address_line"],
            "postal_code": result["postal_code"],
            "city": result["city"],
            "admin_area_1": result["admin_area_1"],
            "admin_area_2": result["admin_area_2"],
        }
        formatted = address_lib.build_formatted_address(value)
        confidence_display = (
            result["confidence"] if result["confidence"] is not None else "n/a"
        )
        flags = flag_result(value)
        if flags:
            flagged_rows.append((park_id, lat, lon, formatted, flags))

        tag = "SUSPECT" if flags else "OK"
        print(
            f"[{tag}]   {park_id}  ({lat}, {lon})\n"
            f"         -> {formatted or '(aucun champ exploitable)'}"
            f"  (confiance={confidence_display})"
            + (f"\n         signalé : {', '.join(flags)}" if flags else "")
        )

        if not commit:
            continue

        # confidence=None -> NULL en base (jamais une valeur fabriquée) — cf. geoapify.py
        conn.execute_sql_text(build_write_sql(park_id, value, result["confidence"]))
        written += 1

    print()
    print("RÉSUMÉ")
    print("------")
    print(f"  Traités        : {processed}")
    if commit:
        print(f"  Écrits         : {written}")
    else:
        print(f"  Écrits         : 0  (DRY-RUN — rien n'a été écrit en base)")
        print(f"  Auraient été écrits si --commit : {processed - skipped_empty - errors}")
    print(f"  Sans résultat  : {skipped_empty}")
    print(f"  Erreurs        : {errors}")
    print(f"  Signalés       : {len(flagged_rows)}  (à relire manuellement — voir détail ci-dessus)")

    conn.close()


if __name__ == "__main__":
    main()
