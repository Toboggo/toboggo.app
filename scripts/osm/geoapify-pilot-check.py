#!/usr/bin/env python3
"""Contrôles AVANT / APRÈS du pilote Geoapify US (STAGING) — LECTURE SEULE stricte.

Aucun appel Geoapify, aucune écriture : seulement des SELECT (garde de
`prod-import-snapshot.py`). Le pilote lui-même se lance avec backfill-addresses.py.

  # 1. AVANT (fige les 25 candidats exacts + la base de référence)
  python3 scripts/osm/geoapify-pilot-check.py before --out backups/geoapify-pilot-us/<date> --limit 25
  # 2. pilote (voir docs/operations/geoapify-us-pilot.md) en journalisant :  … 2>&1 | tee <out>/pilot.log
  # 3. APRÈS
  python3 scripts/osm/geoapify-pilot-check.py after --out backups/geoapify-pilot-us/<date> [--log <out>/pilot.log]
"""
import argparse
import datetime
import hashlib
import importlib.util
import json
import re
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import address as address_lib  # noqa: E402


def _load(name, filename):
    spec = importlib.util.spec_from_file_location(name, HERE / filename)
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m


snap = _load("prod_import_snapshot", "prod-import-snapshot.py")   # ro() + garde SELECT-only
backfill = _load("backfill_addresses", "backfill-addresses.py")   # SELECT_CANDIDATES_SQL exact du pilote

ZIP_RE = re.compile(r"^\d{5}(-\d{4})?$")
HAS_DIGIT = re.compile(r"\d")
STREET_WORDS = {w.lower() for w in list(address_lib.US_STREET_SUFFIXES.values()) + list(address_lib.US_STREET_SUFFIXES)
                + list(address_lib.US_DIRECTIONS.values()) + list(address_lib.US_DIRECTIONS)}
STREET_WORDS |= {"way", "plaza", "alley", "broadway", "bowery", "row", "path", "walk", "pike", "turnpike", "route", "rt", "hwy", "dr", "ave", "st"}


def zip_valid(z):
    return z is None or bool(ZIP_RE.match(z))


def looks_like_poi(address_line):
    """Heuristique : une « adresse » sans numéro ni mot de voie (St, Ave, W…) est probablement le NOM d'un lieu
    (repli sur `address_line1` de Geoapify), pas une rue. À relire à la main."""
    if not address_line:
        return False
    if HAS_DIGIT.search(address_line):
        return False
    words = {w.strip(".,").lower() for w in address_line.split()}
    return not (words & STREET_WORDS)


def flags_for(row):
    """Signaux d'attention sur une adresse écrite (US)."""
    f = []
    if not zip_valid(row.get("postal_code")):
        f.append("zip_invalide")
    if not row.get("admin_area_1"):
        f.append("sans_etat")
    elif address_lib.us_state_name(row["admin_area_1"]) is None:
        f.append("etat_non_reconnu")
    elif address_lib.us_state_name(row["admin_area_1"]) != "New York":
        f.append("etat_hors_NY")
    if not row.get("city"):
        f.append("sans_ville")
    if not row.get("address_line"):
        f.append("sans_rue")
    elif looks_like_poi(row["address_line"]):
        f.append("rue_ressemble_a_un_POI")
    return f


LOG_LINE = re.compile(r"^\[(OK|SUSPECT|VIDE|ERREUR)\]", re.M)


def parse_log(text):
    """Compte les résultats du pilote depuis sa sortie (lignes [OK] / [SUSPECT] / [VIDE] / [ERREUR]) et le RÉSUMÉ."""
    counts = {k: 0 for k in ("OK", "SUSPECT", "VIDE", "ERREUR")}
    for m in LOG_LINE.finditer(text):
        counts[m.group(1)] += 1
    out = {"lignes": counts}
    for label, key in (("Traités", "traites"), ("Écrits", "ecrits"), ("Sans résultat", "sans_resultat"), ("Erreurs", "erreurs"), ("Signalés", "signales")):
        m = re.search(rf"{label}\s*:\s*(\d+)", text)
        if m:
            out[key] = int(m.group(1))
    out["appels_geoapify_estimes"] = counts["OK"] + counts["SUSPECT"] + counts["VIDE"] + counts["ERREUR"]
    return out


def h(rows, cols):
    s = ";".join("|".join(str(r.get(c)) for c in cols) for r in sorted(rows, key=lambda r: r["id"]))
    return hashlib.md5(s.encode()).hexdigest()


FIELDS = "id, name, latitude::float8 lat, longitude::float8 lng, address_line, postal_code, city, admin_area_1, admin_area_2, moderation_status, verification_status, country_code"
CMP = ["id", "name", "lat", "lng", "address_line", "postal_code", "city", "admin_area_1", "admin_area_2", "moderation_status", "verification_status"]


def uuid_array(ids):
    return "array[" + ",".join("'" + i + "'" for i in ids) + "]::uuid[]"


def state(ref, ids):
    ro = lambda sql: snap.ro(sql, ref)
    arr = uuid_array(ids)
    s = {"horodatage_utc": datetime.datetime.utcnow().isoformat() + "Z"}
    s["pilot_rows"] = ro(f"select {FIELDS}, (select count(*) from park_sources ps where ps.park_id = p.id and ps.source_type = 'reverse_geocode') as n_rg from parks p where id = any({arr}) order by id")
    s["others_us"] = ro(f"select {FIELDS} from parks where country_code = 'US' and not (id = any({arr})) order by id")
    s["us_par_statut"] = ro("select moderation_status, verification_status, count(*) n from parks where country_code = 'US' group by 1, 2 order by 1, 2")
    s["us_sources"] = ro("select ps.source_type, count(*) n from park_sources ps join parks p on p.id = ps.park_id where p.country_code = 'US' group by 1 order by 1")
    s["us_attr_address"] = ro("select ps.source_type, count(*) n from park_attribute_sources pas join park_sources ps on ps.id = pas.source_id join parks p on p.id = pas.park_id where p.country_code = 'US' and pas.attribute_key = 'address' group by 1 order by 1")
    return s


def prod_state():
    ro = lambda sql: snap.ro(sql, snap.PROJECTS["prod"])
    rows = ro(f"select {FIELDS} from parks where country_code = 'US' order by id")
    return {"us": len(rows), "statuts": ro("select moderation_status, count(*) n from parks where country_code = 'US' group by 1"),
            "empreinte_us": h(rows, CMP), "nearby": [r["md5"] for r in ro("select md5(pg_get_functiondef(oid)) md5 from pg_proc where proname in ('nearby_parks','nearby_parks_page') order by proname")]}


def cmd_before(args):
    ref = snap.PROJECTS["staging"]
    sel = backfill.SELECT_CANDIDATES_SQL.format(country_filter=f"and country_code = '{args.country_code.upper()}'", limit=args.limit)
    cands = snap.ro(sel, ref)
    ids = [c["id"] for c in cands]
    out = Path(args.out); out.mkdir(parents=True, exist_ok=True)
    s = state(ref, ids)
    s["candidate_ids"] = ids
    s["prod"] = prod_state()
    (out / "before.json").write_text(json.dumps(s, indent=1, default=str))
    print(f"AVANT écrit : {out / 'before.json'} — {len(ids)} candidats (même sélection que backfill-addresses --limit {args.limit}).")
    print("  statuts des candidats :", sorted({r['moderation_status'] for r in s['pilot_rows']}), "| déjà reverse_geocode :", sum(r['n_rg'] for r in s['pilot_rows']))
    print("  base US hors pilote :", len(s["others_us"]), "parcs | PROD US :", s["prod"]["us"])


def cmd_after(args):
    ref = snap.PROJECTS["staging"]
    out = Path(args.out)
    b = json.loads((out / "before.json").read_text())
    ids = b["candidate_ids"]
    a = state(ref, ids)
    (out / "after.json").write_text(json.dumps(a, indent=1, default=str))
    res = []

    def check(name, ok, detail=""):
        res.append((name, ok, detail))

    check("seuls les parcs du pilote ont changé (hors-pilote US identiques)", h(a["others_us"], CMP) == h(b["others_us"], CMP), f"{len(a['others_us'])} parcs hors pilote")
    check("statuts de publication inchangés (US par statut)", a["us_par_statut"] == b["us_par_statut"], str(a["us_par_statut"]))
    bp = {r["id"]: r for r in b["pilot_rows"]}
    ap = {r["id"]: r for r in a["pilot_rows"]}
    check("aucun parc du pilote n'a changé de statut / vérification / nom / coordonnées",
          all(all(bp[i][k] == ap[i][k] for k in ("moderation_status", "verification_status", "name", "lat", "lng", "country_code")) for i in ids))
    written = [i for i in ids if (ap[i]["address_line"], ap[i]["postal_code"], ap[i]["city"], ap[i]["admin_area_1"], ap[i]["admin_area_2"]) != (bp[i]["address_line"], bp[i]["postal_code"], bp[i]["city"], bp[i]["admin_area_1"], bp[i]["admin_area_2"])]
    check("parcs du pilote écrits", True, f"{len(written)} / {len(ids)}")
    rg = {r["id"]: r["n_rg"] for r in a["pilot_rows"]}
    check("tout parc écrit a une source reverse_geocode (provenance)", all(rg[i] >= 1 for i in written))
    prov = snap.ro("select pas.park_id, pas.value_json, pas.is_current, ps.source_type from park_attribute_sources pas join park_sources ps on ps.id = pas.source_id "
                   f"where pas.attribute_key = 'address' and ps.source_type = 'reverse_geocode' and pas.park_id = any({uuid_array(ids)})", ref)
    pv = {r["park_id"]: r for r in prov if r["is_current"] in (True, "t", "true")}
    ok = all(i in pv and all(k in (pv[i]["value_json"] if isinstance(pv[i]["value_json"], dict) else json.loads(pv[i]["value_json"])) for k in ("address_line", "postal_code", "city", "admin_area_1", "admin_area_2")) for i in written)
    check("provenance 'address' courante complète pour chaque parc écrit", ok, f"{len(pv)} provenances courantes")
    srcs = {r["source_type"] for r in a["us_sources"]}
    check("sources US : uniquement osm et reverse_geocode", srcs <= {"osm", "reverse_geocode"}, str(sorted(srcs)))
    vue = {r["id"]: r["formatted_address"] for r in snap.ro(f"select id, formatted_address from park_public where id = any({uuid_array(ids)})", ref)}
    bad_fmt = [i for i in written if vue.get(i) != address_lib.build_formatted_address({k: ap[i][k] for k in ("address_line", "postal_code", "city", "admin_area_1")}, "US")]
    check("formatted_address (vue 0049) == format US attendu", not bad_fmt, f"{len(bad_fmt)} écart(s)")
    flagged = {i: flags_for(ap[i]) for i in written if flags_for(ap[i])}
    detail = "; ".join(f"{i[:8]}:{','.join(f)}" for i, f in flagged.items())
    check("qualité des adresses écrites (ZIP, État, ville, rue/POI) — à relire", True, f"{len(flagged)} signalé(s) {detail}")
    pn = prod_state()
    check("PROD inchangée (parcs US : empreinte, statuts, fonctions)", pn["empreinte_us"] == b["prod"]["empreinte_us"] and pn["statuts"] == b["prod"]["statuts"] and pn["nearby"] == b["prod"]["nearby"], f"US={pn['us']}")
    if args.log:
        lg = parse_log(Path(args.log).read_text(errors="replace"))
        check("journal du pilote : 0 erreur", lg.get("erreurs", lg["lignes"]["ERREUR"]) == 0, str(lg))
        check("consommation Geoapify ≈ nombre de parcs traités", lg["appels_geoapify_estimes"] <= len(ids), f"{lg['appels_geoapify_estimes']} appel(s) comptés dans le journal (+ retries éventuels)")
    print("\nCONTRÔLES APRÈS PILOTE")
    ko = 0
    for name, ok, detail in res:
        print(f"  [{'OK' if ok else 'KO'}] {name}" + (f" — {detail}" if detail else ""))
        ko += (not ok)
    for i in written:
        print(f"     {i[:8]} {vue.get(i)!s:60s} {ap[i]['admin_area_1']!s:10s} {','.join(flags_for(ap[i]))}")
    print("VERDICT :", "OK" if not ko else f"{ko} contrôle(s) en échec — ne pas étendre")
    sys.exit(1 if ko else 0)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)
    b = sub.add_parser("before"); b.add_argument("--out", required=True); b.add_argument("--limit", type=int, default=25); b.add_argument("--country-code", default="US")
    a = sub.add_parser("after"); a.add_argument("--out", required=True); a.add_argument("--log")
    args = ap.parse_args()
    {"before": cmd_before, "after": cmd_after}[args.cmd](args)


if __name__ == "__main__":
    main()
