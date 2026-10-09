"""Nom d'un parc OSM — vrai nom vs libellé technique de remplissage.

`parks.name` est `NOT NULL` en base (aucune migration, aucune colonne
nullable) : quand OSM ne porte pas de tag `name`, l'import doit quand même
écrire *une* chaîne à l'INSERT. Cette chaîne est un remplissage technique,
pas une donnée OSM :

  - `has_osm_name = False` l'accompagne toujours ;
  - elle n'écrase jamais un nom existant lors d'un réimport et n'est jamais
    enregistrée comme provenance `osm` (gates `allow_name` des importeurs) ;
  - elle est reconnue comme *générique* par `isGenericParkName`
    (`packages/shared/src/utils/parkName.ts`) : l'app affiche donc le libellé
    localisé (`common:park.generic` — Aire de jeux / Playground / Área de
    juegos) + un qualifiant (rue/ville), jamais la valeur stockée.

La valeur stockée est configurable par région (`placeholder_name` dans
`regions.json`, transmis par `osm.py` via `--placeholder-name`). Défaut =
« Aire de jeux » : comportement FR/ES strictement inchangé.

Contrainte : la valeur choisie DOIT figurer dans `GENERIC_NAMES` de
`parkName.ts` (sinon l'app l'afficherait telle quelle comme un vrai nom).
"""
from __future__ import annotations

from typing import Callable

DEFAULT_PLACEHOLDER_NAME = "Aire de jeux"


def resolve_park_name(
    raw_name,
    decode: Callable[[str], str | None],
    placeholder: str = DEFAULT_PLACEHOLDER_NAME,
) -> tuple[str, bool]:
    """Retourne `(name, has_osm_name)`.

    `has_osm_name` n'est vrai que si le tag `name` OSM, une fois décodé,
    contient du texte : un `name` vide ou fait uniquement d'espaces/`%` est
    traité comme absent (jamais un nom vide présenté comme un vrai nom OSM).
    """
    if raw_name:
        decoded = decode(str(raw_name))
        if decoded:
            return decoded, True
    return placeholder, False
