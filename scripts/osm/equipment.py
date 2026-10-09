"""Découpage des valeurs OSM `playground=*` — partagé par l'import et l'audit."""
from __future__ import annotations

import re

_WHITESPACE = re.compile(r"\s+")


def known_equipment_keys(mapping: dict) -> set[str]:
    keys: set[str] = set()
    for section in ("direct", "normalized", "pending", "ignored"):
        keys.update(mapping.get(section, {}))
    return keys


def split_playground_values(decoded: str, mapping: dict) -> list[str]:
    """Sépare une valeur `playground` déjà décodée en valeurs individuelles.

    - espaces collapsés (`"swing  set"` → `"swing set"`) ;
    - séparateur OSM standard `;` ;
    - une virgule n'est traitée comme séparateur que si TOUS les jetons du
      segment sont déjà des clés connues du mapping (`"teenshelter, slide,
      climbingwall"`). Sinon le segment reste intact : aucun mapping
      « deviné » à partir d'une saisie libre ambiguë.
    """
    known = known_equipment_keys(mapping)
    values: list[str] = []
    for chunk in _WHITESPACE.sub(" ", decoded).split(";"):
        chunk = chunk.strip()
        if not chunk:
            continue
        if "," in chunk:
            tokens = [t.strip() for t in chunk.split(",") if t.strip()]
            if tokens and all(t in known for t in tokens):
                values.extend(tokens)
                continue
        values.append(chunk)
    return values
