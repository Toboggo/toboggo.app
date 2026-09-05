"""Client de reverse geocoding Geoapify — serveur/script UNIQUEMENT.

Sécurité :
  - la clé API vient EXCLUSIVEMENT de la variable d'environnement
    `GEOAPIFY_API_KEY` (ou passée explicitement en paramètre par un appelant
    qui la lit lui-même depuis l'environnement) — jamais en dur dans ce
    fichier, jamais committée, jamais exposée côté frontend (ce module ne
    doit être importé que par des scripts `scripts/osm/*.py` exécutés côté
    serveur/CLI, jamais par `apps/mobile` ou `apps/backoffice`).

Ne dépend que de la stdlib (urllib) : `requests` n'est pas installé dans cet
environnement et le repo n'a pas de requirements.txt pour les scripts OSM.
"""
from __future__ import annotations

import json
import os
import time
import urllib.error
import urllib.parse
import urllib.request

GEOAPIFY_BASE_URL = "https://api.geoapify.com/v1/geocode/reverse"
DEFAULT_TIMEOUT_S = 10
DEFAULT_MAX_RETRIES = 3
# ~4 req/s : conservateur sous la limite du plan gratuit Geoapify (5 req/s).
DEFAULT_MIN_INTERVAL_S = 0.25


class GeoapifyError(RuntimeError):
    """Erreur définitive (clé absente, HTTP non réessayable, retries épuisés)."""


class GeoapifyClient:
    def __init__(
        self,
        api_key: str | None = None,
        min_interval_s: float = DEFAULT_MIN_INTERVAL_S,
        max_retries: int = DEFAULT_MAX_RETRIES,
        timeout_s: float = DEFAULT_TIMEOUT_S,
    ):
        self.api_key = api_key or os.environ.get("GEOAPIFY_API_KEY")
        if not self.api_key:
            raise GeoapifyError(
                "GEOAPIFY_API_KEY absente de l'environnement. "
                "Jamais de clé en dur : `export GEOAPIFY_API_KEY=...` avant "
                "de lancer ce script."
            )
        self.min_interval_s = min_interval_s
        self.max_retries = max_retries
        self.timeout_s = timeout_s
        self._last_request_at = 0.0

    def _throttle(self):
        elapsed = time.monotonic() - self._last_request_at
        wait = self.min_interval_s - elapsed
        if wait > 0:
            time.sleep(wait)

    def reverse_geocode(self, lat: float, lon: float) -> dict | None:
        """Reverse-geocode (lat, lon) via Geoapify.

        Retourne {address_line, postal_code, city, admin_area_1,
        admin_area_2, confidence, formatted} ou None si Geoapify ne renvoie
        aucun résultat exploitable (aucun des 3 champs adresse principaux).

        Lève `GeoapifyError` après épuisement des retries sur une erreur
        transitoire (429 / 5xx / réseau), ou immédiatement sur une erreur
        HTTP non réessayable (ex. 401 clé invalide, 400 requête malformée).
        """
        params = urllib.parse.urlencode(
            {"lat": lat, "lon": lon, "apiKey": self.api_key, "format": "json"}
        )
        url = f"{GEOAPIFY_BASE_URL}?{params}"

        attempt = 0
        while True:
            attempt += 1
            self._throttle()
            self._last_request_at = time.monotonic()
            try:
                req = urllib.request.Request(
                    url, headers={"User-Agent": "Toboggo/1.0 (address-backfill)"}
                )
                with urllib.request.urlopen(req, timeout=self.timeout_s) as resp:
                    body = resp.read()
                data = json.loads(body)
                return self._extract(data)
            except urllib.error.HTTPError as e:
                if e.code == 429 or e.code >= 500:
                    if attempt > self.max_retries:
                        raise GeoapifyError(
                            f"Geoapify HTTP {e.code} après {attempt} tentatives "
                            f"(lat={lat}, lon={lon})"
                        ) from e
                    retry_after = e.headers.get("Retry-After") if e.headers else None
                    delay = float(retry_after) if retry_after else min(2**attempt, 30)
                    time.sleep(delay)
                    continue
                # 4xx autre que 429 (401 clé invalide, 400 requête malformée, …) :
                # erreur permanente, ne jamais boucler dessus.
                raise GeoapifyError(
                    f"Geoapify HTTP {e.code} non réessayable "
                    f"(lat={lat}, lon={lon}): {e.reason}"
                ) from e
            except (urllib.error.URLError, TimeoutError, json.JSONDecodeError) as e:
                if attempt > self.max_retries:
                    raise GeoapifyError(
                        f"Geoapify injoignable après {attempt} tentatives "
                        f"(lat={lat}, lon={lon}): {e}"
                    ) from e
                time.sleep(min(2**attempt, 30))
                continue

    @staticmethod
    def _extract(data: dict) -> dict | None:
        results = data.get("results") or []
        if not results:
            return None
        r = results[0]

        housenumber = r.get("housenumber")
        street = r.get("street")
        if housenumber and street:
            address_line = f"{housenumber} {street}"
        elif street:
            address_line = street
        else:
            address_line = r.get("address_line1")

        city = r.get("city") or r.get("town") or r.get("village")
        postal_code = r.get("postcode")
        admin_area_1 = r.get("state")
        admin_area_2 = r.get("county") or r.get("state_district")

        # Geoapify ne renvoie pas toujours `rank.confidence` en reverse
        # geocoding (constaté sur le test réel de 10 parcs staging : absent
        # sur 10/10). Ne JAMAIS fabriquer une valeur par défaut à sa place —
        # ce serait présenter une estimation comme une mesure réelle. `None`
        # se traduit en `NULL` en base (`set_park_attribute_source` accepte
        # `p_confidence` nullable).
        rank = r.get("rank")
        confidence = rank.get("confidence") if isinstance(rank, dict) else None

        result = {
            "address_line": address_line,
            "postal_code": postal_code,
            "city": city,
            "admin_area_1": admin_area_1,
            "admin_area_2": admin_area_2,
            "confidence": confidence,
            "formatted": r.get("formatted"),
        }
        if not any([result["address_line"], result["postal_code"], result["city"]]):
            return None
        return result
