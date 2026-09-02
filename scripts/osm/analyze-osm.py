#!/usr/bin/env python3

import json
import subprocess
import sys
import tempfile
import urllib.parse
from collections import Counter
from pathlib import Path

if len(sys.argv) < 2:
    print("Usage: python3 scripts/osm/analyze-osm.py /chemin/fichier.osm.pbf")
    sys.exit(1)

pbf = Path(sys.argv[1])

if not pbf.exists():
    print(f"Fichier introuvable: {pbf}")
    sys.exit(1)

mapping_path = Path("scripts/osm/mappings/playground-v1.json")

with mapping_path.open("r", encoding="utf-8") as f:
    mapping = json.load(f)

direct = mapping.get("direct", {})
normalized = mapping.get("normalized", {})
pending = mapping.get("pending", {})
ignored = mapping.get("ignored", {})

with tempfile.NamedTemporaryFile(suffix=".opl", delete=False) as tmp:
    opl_path = Path(tmp.name)

subprocess.run(
    [
        "osmium",
        "tags-filter",
        "-R",
        str(pbf),
        "nwr/leisure=playground",
        "-f",
        "opl",
        "-o",
        str(opl_path),
        "--overwrite",
    ],
    check=True,
)

lines = opl_path.read_text(encoding="utf-8").splitlines()

total = len(lines)
nodes = sum(1 for line in lines if line.startswith("n"))
ways = sum(1 for line in lines if line.startswith("w"))
relations = sum(1 for line in lines if line.startswith("r"))

tags_to_check = [
    "name",
    "operator",
    "playground",
    "wheelchair",
    "min_age",
    "max_age",
    "surface",
    "fenced",
]

coverage = {}
playground_values = Counter()

for line in lines:
    for tag in tags_to_check:
        if f"{tag}=" in line:
            coverage[tag] = coverage.get(tag, 0) + 1

    marker = "playground="

    if marker in line:
        raw = line.split(marker, 1)[1].split(" ", 1)[0]
        raw = raw.split(",", 1)[0]

        decoded = urllib.parse.unquote(raw)
        decoded = decoded.replace("%20%", " ")
        decoded = decoded.replace("%20", " ")
        decoded = decoded.replace("%", " ")

        for value in decoded.split(";"):
            value = value.strip()

            if value:
                playground_values[value] += 1

print()
print("TOBOGGO OSM AUDIT")
print("=================")
print()

print(f"Playgrounds: {total}")
print()

print("Geometry:")
print(f"  Nodes:     {nodes}")
print(f"  Ways:      {ways}")
print(f"  Relations: {relations}")
print()

print("Coverage:")

for tag in tags_to_check:
    count = coverage.get(tag, 0)
    pct = (count / total * 100) if total else 0
    print(f"  {tag:<16} {count:5} ({pct:.1f}%)")

print()
print("Equipment mapping:")
print()

categories = {
    "direct": Counter(),
    "normalized": Counter(),
    "pending": Counter(),
    "ignored": Counter(),
    "unknown": Counter(),
}

for value, count in playground_values.items():
    if value in direct:
        categories["direct"][value] += count

    elif value in normalized:
        categories["normalized"][value] += count

    elif value in pending:
        categories["pending"][value] += count

    elif value in ignored:
        categories["ignored"][value] += count

    else:
        categories["unknown"][value] += count

for key in ["direct", "normalized", "pending", "ignored", "unknown"]:
    print(f"{key.capitalize():<12}: {sum(categories[key].values())}")

for key in ["pending", "unknown"]:
    print()
    print(f"{key.capitalize()} values:")

    if not categories[key]:
        print("  none")

    else:
        for value, count in categories[key].most_common():
            print(f"  {count:4}  {value}")

print()
print("Done.")

opl_path.unlink(missing_ok=True)