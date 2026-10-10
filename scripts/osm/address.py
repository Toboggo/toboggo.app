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

import re
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


def extract_address_from_tags(props: dict, country_code: str | None = None) -> dict | None:
    """Construit {address_line, postal_code, city, admin_area_1, admin_area_2}
    depuis les tags OSM `addr:*` présents dans `props`.

    Retourne None si aucun des 4 tags addr:* n'est présent (pour ne jamais
    toucher les colonnes adresse d'un parc quand l'objet OSM n'apporte rien).
    FR/ES (comportement historique) : admin_area_1/admin_area_2 restent toujours
    None ici (OSM addr:* français ne les porte pas) ; ils ne sont renseignés que
    par le reverse geocoding (Geoapify state/county) ou une source manuelle.

    `country_code == "US"` : la rue est abrégée comme côté Geoapify
    (« West 42nd Street » → « W 42nd St », cohérence entre sources) et
    `addr:state` (très présent dans les données US : « NY ») est converti en nom
    complet d'État quand il est reconnu — jamais deviné.
    """
    housenumber = decode_osm_value(props.get(ADDR_HOUSENUMBER))
    street = decode_osm_value(props.get(ADDR_STREET))
    postcode = decode_osm_value(props.get(ADDR_POSTCODE))
    city = decode_osm_value(props.get(ADDR_CITY))

    if not any([housenumber, street, postcode, city]):
        return None

    is_us = (country_code or "").upper() == "US"
    if is_us and street:
        street = abbreviate_us_street(street)

    address_line = None
    if housenumber and street:
        address_line = f"{housenumber} {street}"
    elif street:
        address_line = street

    return {
        "address_line": address_line,
        "postal_code": postcode,
        "city": city,
        "admin_area_1": us_state_name(decode_osm_value(props.get("addr:state"))) if is_us else None,
        "admin_area_2": None,
    }


def has_usable_address(d: dict | None) -> bool:
    if not d:
        return False
    return any(d.get(k) for k in ADDRESS_FIELDS)


def build_formatted_address(d: dict | None, country_code: str | None = None) -> str | None:
    """Reproduit la formule de `park_public.formatted_address` (migration
    0017 ; US : migration 0049) pour l'affichage en dry-run / rapports, sans
    toucher la vue SQL. `country_code` absent ou ≠ « US » ⇒ formule historique
    FR/ES, strictement inchangée."""
    if not d:
        return None
    if (country_code or "").upper() == "US":
        return build_us_formatted_address(d)
    line2 = " ".join(filter(None, [d.get("postal_code"), d.get("city")]))
    parts = [p for p in [d.get("address_line"), line2 or None] if p]
    return ", ".join(parts) if parts else None


# ── États-Unis ───────────────────────────────────────────────────────────────
# Format d'adresse US : « 123 W 42nd St, New York, NY 10036 »
#   numéro · direction (W/E/N/S) · rue · ville · ÉTAT (2 lettres) · ZIP.
# `admin_area_1` reste le NOM complet de l'État (même sémantique que partout) ;
# l'abréviation est dérivée à l'affichage (ici et dans la vue SQL
# `us_state_abbr`, migration 0049 — les deux tables DOIVENT rester identiques,
# vérifié par tests/test_address_us.py).
US_STATES = [
    ("AL", "Alabama"), ("AK", "Alaska"), ("AZ", "Arizona"), ("AR", "Arkansas"), ("CA", "California"),
    ("CO", "Colorado"), ("CT", "Connecticut"), ("DE", "Delaware"), ("DC", "District of Columbia"),
    ("FL", "Florida"), ("GA", "Georgia"), ("HI", "Hawaii"), ("ID", "Idaho"), ("IL", "Illinois"),
    ("IN", "Indiana"), ("IA", "Iowa"), ("KS", "Kansas"), ("KY", "Kentucky"), ("LA", "Louisiana"),
    ("ME", "Maine"), ("MD", "Maryland"), ("MA", "Massachusetts"), ("MI", "Michigan"), ("MN", "Minnesota"),
    ("MS", "Mississippi"), ("MO", "Missouri"), ("MT", "Montana"), ("NE", "Nebraska"), ("NV", "Nevada"),
    ("NH", "New Hampshire"), ("NJ", "New Jersey"), ("NM", "New Mexico"), ("NY", "New York"),
    ("NC", "North Carolina"), ("ND", "North Dakota"), ("OH", "Ohio"), ("OK", "Oklahoma"), ("OR", "Oregon"),
    ("PA", "Pennsylvania"), ("RI", "Rhode Island"), ("SC", "South Carolina"), ("SD", "South Dakota"),
    ("TN", "Tennessee"), ("TX", "Texas"), ("UT", "Utah"), ("VT", "Vermont"), ("VA", "Virginia"),
    ("WA", "Washington"), ("WV", "West Virginia"), ("WI", "Wisconsin"), ("WY", "Wyoming"),
    ("PR", "Puerto Rico"), ("GU", "Guam"), ("AS", "American Samoa"), ("VI", "U.S. Virgin Islands"),
    ("MP", "Northern Mariana Islands"),
]
US_STATE_ABBR = {name.lower(): code for code, name in US_STATES}
US_STATE_ABBR["united states virgin islands"] = "VI"
_US_STATE_BY_CODE = {code: name for code, name in US_STATES}
_US_STATE_CODES = set(_US_STATE_BY_CODE)

US_DIRECTIONS = {
    "north": "N", "south": "S", "east": "E", "west": "W",
    "northeast": "NE", "northwest": "NW", "southeast": "SE", "southwest": "SW",
}
US_STREET_SUFFIXES = {
    "street": "St", "avenue": "Ave", "boulevard": "Blvd", "road": "Rd", "drive": "Dr",
    "place": "Pl", "lane": "Ln", "court": "Ct", "terrace": "Ter", "parkway": "Pkwy",
    "highway": "Hwy", "square": "Sq", "circle": "Cir", "trail": "Trl",
}


def us_state_abbr(value):
    """« New York » → « NY » ; un code déjà valide est conservé ; sinon la valeur
    d'origine (jamais d'abréviation inventée)."""
    if not value:
        return None
    v = value.strip()
    if v.upper() in _US_STATE_CODES:
        return v.upper()
    return US_STATE_ABBR.get(v.lower(), v)


def us_state_name(value):
    """« NY » ou « new york » → « New York » (nom complet) ; valeur non reconnue ⇒ None
    (pas d'État deviné : un `addr:state` hors États-Unis ne doit jamais être réinterprété)."""
    if not value:
        return None
    v = value.strip()
    if v.upper() in _US_STATE_BY_CODE:
        return _US_STATE_BY_CODE[v.upper()]
    code = US_STATE_ABBR.get(v.lower())
    return _US_STATE_BY_CODE.get(code) if code else None


def abbreviate_us_street(street):
    """« West 42nd Street » → « W 42nd St ». Conservateur : seule une direction EN
    TÊTE et un suffixe de voie EN FIN sont abrégés, et jamais s'ils constituent le
    nom entier (« Park Avenue » → « Park Ave », mais « Place » reste « Place »)."""
    if not street:
        return street
    words = street.split()
    if len(words) >= 2 and words[0].lower() in US_DIRECTIONS and len(words) > 2:
        words[0] = US_DIRECTIONS[words[0].lower()]
    if len(words) >= 2 and words[-1].lower() in US_STREET_SUFFIXES:
        words[-1] = US_STREET_SUFFIXES[words[-1].lower()]
    return " ".join(words)


def build_us_formatted_address(d):
    """« 123 W 42nd St, New York, NY 10036 » — aucune pièce absente n'est inventée."""
    state_zip = " ".join(filter(None, [us_state_abbr(d.get("admin_area_1")), d.get("postal_code")]))
    parts = [d.get("address_line") or None, d.get("city") or None, state_zip or None]
    parts = [p for p in parts if p]
    return ", ".join(parts) if parts else None
