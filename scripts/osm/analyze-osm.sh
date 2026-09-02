#!/bin/bash

set -e

PBF="$1"

if [ -z "$PBF" ]; then
  echo "Usage: ./scripts/osm/analyze-osm.sh /chemin/fichier.osm.pbf"
  exit 1
fi

if [ ! -f "$PBF" ]; then
  echo "Fichier introuvable: $PBF"
  exit 1
fi

TMP_FILE="/tmp/toboggo-playgrounds.opl"

echo ""
echo "TOBOGGO OSM AUDIT"
echo "================="
echo ""

osmium tags-filter -R "$PBF" nwr/leisure=playground -f opl -o "$TMP_FILE" --overwrite

TOTAL=$(wc -l < "$TMP_FILE" | tr -d ' ')
NODES=$(grep '^n' "$TMP_FILE" | wc -l | tr -d ' ')
WAYS=$(grep '^w' "$TMP_FILE" | wc -l | tr -d ' ')
RELATIONS=$(grep '^r' "$TMP_FILE" | wc -l | tr -d ' ')

echo "Playgrounds: $TOTAL"
echo ""
echo "Geometry:"
echo "  Nodes:     $NODES"
echo "  Ways:      $WAYS"
echo "  Relations: $RELATIONS"
echo ""

count_tag () {
  TAG="$1"
  COUNT=$(grep -o "${TAG}=" "$TMP_FILE" | wc -l | tr -d ' ')
  PERCENT=$(awk "BEGIN {printf \"%.1f\", ($COUNT/$TOTAL)*100}")
  printf "  %-16s %5s (%s%%)\n" "$TAG" "$COUNT" "$PERCENT"
}

echo "Coverage:"
count_tag "name"
count_tag "operator"
count_tag "playground"
count_tag "wheelchair"
count_tag "min_age"
count_tag "max_age"
count_tag "surface"
count_tag "fenced"

echo ""

echo ""
echo "Playground values:"
grep -o 'playground=[^, ]*' "$TMP_FILE" \
  | sed 's/^playground=//' \
  | sort \
  | uniq -c \
  | sort -nr \
  | head -50

echo ""
echo "Surface values:"
grep -o 'surface=[^, ]*' "$TMP_FILE" \
  | sed 's/^surface=//' \
  | sort \
  | uniq -c \
  | sort -nr \
  | head -50

echo ""
echo "Wheelchair values:"
grep -o 'wheelchair=[^, ]*' "$TMP_FILE" \
  | sed 's/^wheelchair=//' \
  | sort \
  | uniq -c \
  | sort -nr

echo ""
echo "Access values:"
grep -o 'access=[^, ]*' "$TMP_FILE" \
  | sed 's/^access=//' \
  | sort \
  | uniq -c \
  | sort -nr

echo "Done."