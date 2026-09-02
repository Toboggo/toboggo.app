#!/usr/bin/env python3
import argparse, json, os, subprocess, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
CONFIG_PATH = Path(__file__).resolve().parent / "regions.json"

def load_config():
    return json.loads(CONFIG_PATH.read_text(encoding="utf-8"))

def data_dir(config):
    raw = os.environ.get("TOBOGGO_OSM_DIR") or config["data_dir"]
    return Path(raw).expanduser().resolve()

def resolve_pbf(config, region):
    cfg = config["regions"].get(region)
    if not cfg:
        raise SystemExit(f"Zone inconnue: {region}")
    matches = []
    for pattern in cfg.get("patterns", []):
        matches += list(data_dir(config).glob(pattern))
    if not matches:
        raise SystemExit(f"Aucun PBF trouvé pour {region}")
    return max(matches, key=lambda p: p.stat().st_mtime)

def run(cmd):
    print("Commande:")
    print(" ".join(map(str, cmd)))
    subprocess.run([str(x) for x in cmd], cwd=ROOT, check=True)

def main():
    config = load_config()
    ap = argparse.ArgumentParser()
    sub = ap.add_subparsers(dest="cmd", required=True)

    sub.add_parser("list")

    a = sub.add_parser("analyze")
    a.add_argument("region")

    for name in ["import-local","import-staging","import-prod"]:
        p = sub.add_parser(name)
        p.add_argument("region")
        p.add_argument("--commit", action="store_true")
        p.add_argument("--publish", action="store_true")

    args = ap.parse_args()

    if args.cmd == "list":
        print(f"Dossier OSM: {data_dir(config)}")
        for key in config["regions"]:
            try:
                print(f"{key:<18} -> {resolve_pbf(config,key).name}")
            except SystemExit:
                print(f"{key:<18} -> aucun fichier")
        return

    pbf = resolve_pbf(config, args.region)

    if args.cmd == "analyze":
        run([sys.executable, ROOT/"scripts/osm/analyze-osm.py", pbf])
        return

    if args.cmd == "import-local":
        cmd = [sys.executable, ROOT/"scripts/osm/import-osm-local.py", pbf]
        if args.commit: cmd.append("--commit")
        run(cmd)
        return

    env = "staging" if args.cmd == "import-staging" else "prod"
    cmd = [sys.executable, ROOT/"scripts/osm/import-osm-remote.py", env, pbf]
    if args.commit: cmd.append("--commit")
    if args.publish: cmd.append("--publish")
    run(cmd)

if __name__ == "__main__":
    main()
