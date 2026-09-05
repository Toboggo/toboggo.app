#!/usr/bin/env python3
"""Backfill des adresses parcs par reverse geocoding (Geoapify).

SÉCURITÉ / PÉRIMÈTRE :
  - `--env` accepte `local`, `staging` ou `prod`. `prod` est un choix
    DÉLIBÉRÉ : le dry-run production ne demande rien de plus que `--env prod`
    (il ne touche jamais la base), mais un `--commit` sur `prod` est
    verrouillé par une pile de garde-fous cumulatifs (voir
    `confirm_prod_commit`) — aucun ne peut être atteint par accident,
    réflexe shell ou job non-interactif.
  - Sans `--commit` : DRY-RUN — rien n'est écrit, tout est affiché.
    (Le dry-run appelle quand même Geoapify pour de vrai : il consomme du
    quota. Cf. avertissement affiché en tête de run `prod`.)
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
  python3 scripts/osm/backfill-addresses.py --env prod --limit 50            # dry-run prod
  TOBOGGO_ALLOW_PROD_BACKFILL=1 \\
    python3 scripts/osm/backfill-addresses.py --env prod --limit 50 --commit \\
    --i-understand-this-writes-to-production                                 # écriture prod
"""
from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
import tempfile
from pathlib import Path

import psycopg

sys.path.insert(0, str(Path(__file__).resolve().parent))
import address as address_lib  # noqa: E402
from geoapify import GeoapifyClient, GeoapifyError  # noqa: E402

LOCAL_DSN = "postgresql://postgres:postgres@127.0.0.1:54322/postgres"

# Doivent rester identiques à PROJECTS[...]["ref"] dans import-osm-remote.py
# (mêmes refs, déjà versionnées là-bas — ce ne sont pas des secrets : la ref
# est le sous-domaine de l'URL API publique, protégée par RLS + clés).
STAGING_PROJECT_REF = "hfuaouskwysqxiwpwvqy"
PROD_PROJECT_REF = "dfzrsygetbhnjzfssgub"

# ── Garde-fous écriture PRODUCTION ─────────────────────────────────────────
# Un `--commit` sur `--env prod` exige les QUATRE conditions ci-dessous,
# cumulatives. Chacune seule est insuffisante ; aucune n'est franchissable
# par un job non-interactif, un rappel d'historique shell ou une faute de
# frappe. Le dry-run prod, lui, n'exige rien de plus que `--env prod`.
PROD_COMMIT_ENV_GATE = "TOBOGGO_ALLOW_PROD_BACKFILL"  # doit valoir exactement "1"
PROD_COMMIT_FLAG = "--i-understand-this-writes-to-production"


def _prod_commit_phrase(candidate_count: int) -> str:
    """Phrase exacte à retaper à la main pour confirmer une écriture prod.
    Inclut le nombre de candidats : impossible à préparer d'avance sans
    avoir lu la sortie de sélection."""
    return f"BACKFILL PROD {candidate_count}"


def confirm_prod_commit(project_ref: str, candidate_count: int, flag_ack: bool) -> None:
    """Verrou d'écriture production. Lève SystemExit si une seule condition
    manque. N'écrit rien, ne consomme aucun quota — pur contrôle d'accès."""
    problems = []

    # (1) Ref réellement ciblée == ref prod attendue (anti mauvaise cible).
    if project_ref != PROD_PROJECT_REF:
        problems.append(
            f"la ref ciblée ({project_ref!r}) n'est pas la ref production attendue"
        )

    # (2) Opt-in explicite en ligne de commande.
    if not flag_ack:
        problems.append(f"drapeau {PROD_COMMIT_FLAG} absent")

    # (3) Opt-in explicite d'environnement (jamais dans un .env commité).
    if os.environ.get(PROD_COMMIT_ENV_GATE) != "1":
        problems.append(f"variable d'environnement {PROD_COMMIT_ENV_GATE}=1 absente")

    # (4) Session interactive : un humain doit être au clavier (stdin TTY).
    if not sys.stdin.isatty():
        problems.append(
            "session non-interactive : une écriture prod ne peut pas être "
            "automatisée par ce script (pas de cron / CI / pipe sur stdin)"
        )

    if problems:
        print()
        print("ÉCRITURE PRODUCTION REFUSÉE — garde-fous non satisfaits :")
        for p in problems:
            print(f"  - {p}")
        print()
        raise SystemExit(2)

    # (5) Confirmation tapée à la main, avec le compte de candidats.
    expected = _prod_commit_phrase(candidate_count)
    print()
    print("╔═══════════════════════════════════════════════════════════════╗")
    print("║  ÉCRITURE RÉELLE EN BASE DE PRODUCTION TOBOGGO                  ║")
    print("╚═══════════════════════════════════════════════════════════════╝")
    print(f"  Cible          : {PROD_PROJECT_REF} (Toboggo Production)")
    print(f"  Candidats      : {candidate_count} parc(s)")
    print(f"  Action         : écriture parks.address_* + park_attribute_sources")
    print(f"                   (source 'reverse_geocode', priorité 45)")
    print()
    got = input(f'  Retape exactement « {expected} » pour confirmer : ').strip()
    if got != expected:
        raise SystemExit("Écriture production annulée (phrase de confirmation incorrecte).")
    print("  Confirmé.")
    print()

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
        description="Backfill adresses via reverse geocoding Geoapify (LOCAL / STAGING / PROD)."
    )
    ap.add_argument(
        "--env",
        choices=["local", "staging", "prod"],
        required=True,
        help="Base ciblée. 'prod' : dry-run libre, mais --commit sous garde-fous forts.",
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
        PROD_COMMIT_FLAG,
        dest="i_understand_prod",
        action="store_true",
        help="Obligatoire (avec --commit --env prod) : accusé de réception explicite d'une écriture production.",
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


def run_remote_sql(sql: str, project_ref: str) -> list[dict]:
    """Exécute du SQL sur un projet Supabase distant (staging ou prod) via
    `supabase db query --linked --project-ref <ref>` (même mécanisme que
    import-osm-remote.py — jamais --db-url ici car ce n'est pas une migration,
    juste une lecture/écriture de données)."""
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


class RemoteConn:
    """Connexion à un projet Supabase distant (staging ou prod). Le ciblage
    passe toujours par `--project-ref` explicite : jamais de dépendance au
    `supabase link` courant du dossier."""

    def __init__(self, project_ref, label):
        self.project_ref = project_ref
        self.label = label

    def select(self, sql):
        return run_remote_sql(sql, self.project_ref)

    def execute_sql_text(self, sql):
        run_remote_sql(sql, self.project_ref)

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
    elif args.env == "staging":
        conn = RemoteConn(STAGING_PROJECT_REF, "Toboggo Staging")
    else:  # prod
        conn = RemoteConn(PROD_PROJECT_REF, "Toboggo Production")
        print("⚠  PRODUCTION")
        print(f"   Cible : {PROD_PROJECT_REF}")
        if commit:
            print("   Mode COMMIT demandé — garde-fous vérifiés après sélection.")
        else:
            print("   DRY-RUN : aucune écriture DB. MAIS chaque candidat déclenche")
            print("   un appel Geoapify réel — ce dry-run consomme du quota.")
        print()

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

    # Verrou d'écriture production : après la sélection (on connaît N), avant
    # le moindre appel Geoapify de la boucle de commit.
    if commit and args.env == "prod":
        confirm_prod_commit(
            conn.project_ref, len(candidates), flag_ack=args.i_understand_prod
        )

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
