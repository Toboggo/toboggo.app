"""Adresse — extraction des tags OSM `addr:*` et priorité de provenance.

Module partagé par `import-osm-local.py`, `import-osm-remote.py` et
`backfill-addresses.py`. Ne dépend d'aucun autre script du dossier (pas
d'import via nom de fichier à tiret) pour rester importable normalement :

    sys.path.insert(0, str(Path(__file__).resolve().parent))
    import address

Un seul `attribute_key` de provenance ('address') couvre les 5 champs pour
garantir un remplacement atomique : jamais un mélange numéro-OSM +
ville-reverse-geocode.
"""
from __future__ import annotations

import urllib.parse

# Tags OSM `addr:*` réellement exploitables pour construire une adresse.
# Constat du diagnostic : sur les 2201 candidats Midi-Pyrénées, seuls ces 4
# tags addr:* apparaissent (0 addr:place / addr:suburb / is_in / place).
ADDR_HOUSENUMBER = "addr:housenumber"
ADDR_STREET = "addr:street"
ADDR_POSTCODE = "addr:postcode"
ADDR_CITY = "addr:city"

# Champs `parks` correspondants, dans l'ordre où `park_public` les expose.
ADDRESS_FIELDS = ("address_line", "postal_code", "city", "admin_area_1", "admin_area_2")


def decode_osm_value(value):
    """Même décodage que `import-osm-local.decode_osm_value` (dupliqué ici
    à dessein : module autonome, sans dépendance vers un fichier à tiret)."""
    if value is None:
        return None
    value = urllib.parse.unquote(str(value))
    value = value.replace("%20%", " ")
    value = value.replace("%20", " ")
    value = value.replace("%", " ")
    return value.strip()


def extract_address_from_tags(props: dict) -> dict | None:
    """Construit {address_line, postal_code, city, admin_area_1, admin_area_2}
    depuis les tags OSM `addr:*` présents dans `props`.

    Retourne None si aucun des 4 tags addr:* n'est présent (pour ne jamais
    toucher les colonnes adresse d'un parc quand l'objet OSM n'apporte rien).
    admin_area_1/admin_area_2 restent toujours None ici : OSM addr:* français
    ne les porte pas (confirmé par le diagnostic) ; ils ne sont renseignés que
    par le reverse geocoding (Geoapify state/county) ou une source manuelle.
    """
    housenumber = decode_osm_value(props.get(ADDR_HOUSENUMBER))
    street = decode_osm_value(props.get(ADDR_STREET))
    postcode = decode_osm_value(props.get(ADDR_POSTCODE))
    city = decode_osm_value(props.get(ADDR_CITY))

    if not any([housenumber, street, postcode, city]):
        return None

    address_line = None
    if housenumber and street:
        address_line = f"{housenumber} {street}"
    elif street:
        address_line = street

    return {
        "address_line": address_line,
        "postal_code": postcode,
        "city": city,
        "admin_area_1": None,
        "admin_area_2": None,
    }


def has_usable_address(d: dict | None) -> bool:
    if not d:
        return False
    return any(d.get(k) for k in ADDRESS_FIELDS)


def build_formatted_address(d: dict | None) -> str | None:
    """Reproduit la formule de `park_public.formatted_address` (migration
    0017) pour l'affichage en dry-run / rapports, sans toucher la vue SQL."""
    if not d:
        return None
    line2 = " ".join(filter(None, [d.get("postal_code"), d.get("city")]))
    parts = [p for p in [d.get("address_line"), line2 or None] if p]
    return ", ".join(parts) if parts else None
