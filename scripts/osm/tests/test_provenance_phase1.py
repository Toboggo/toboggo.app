#!/usr/bin/env python3
"""Tests d'intégration — Phase 1 D3 : provenance des corrections manuelles.

Prouve le scénario central de l'audit
(`backups/AUDIT-modele-multisource-2026-09-07.md`, D3 Phase 1) :

  1. parc issu d'OSM ;
  2. OSM fournit un nom A ;
  3. un admin Toboggo remplace par un nom B (RPC `apply_park_attribute`) ;
  4. la provenance humaine (`toboggo`, priorité 100) est créée ;
  5. le nom B devient canonique dans `parks` ;
  6. un nouvel import OSM propose de nouveau A (ou C) ;
  7. la valeur humaine B reste canonique — l'import OSM ne l'écrase pas.

Couvre aussi :
  - archivage de l'ancienne source courante (`is_current = false`) ;
  - barème de priorité (`can_source_replace_attribute`) ;
  - non-régression d'un parc purement OSM (l'import OSM le met toujours à jour) ;
  - remplacement normal quand aucune source plus prioritaire n'existe ;
  - `location` (coordonnées) : même protection ;
  - `import-osm-remote.py::park_sql` gate désormais name/min_age/max_age/location
    (et pas seulement `address`).

Nécessite la base Supabase LOCALE (docker, `supabase start`) migrée
0001→0032. Skip automatique (pas d'échec) si injoignable — jamais staging/prod.

Lancer : python3 -m unittest scripts.osm.tests.test_provenance_phase1 -v
"""
import importlib.util
import json
import sys
import unittest
import uuid
from pathlib import Path

HERE = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(HERE))

try:
    import psycopg
except ImportError:
    psycopg = None

LOCAL_DSN = "postgresql://postgres:postgres@127.0.0.1:54322/postgres"
TEST_PREFIX = "__test_provenance_phase1__"


def _local_db_available() -> bool:
    if psycopg is None:
        return False
    try:
        with psycopg.connect(LOCAL_DSN, connect_timeout=2) as conn:
            with conn.cursor() as cur:
                cur.execute("select to_regprocedure('apply_park_attribute(uuid,text,jsonb,source_type,numeric)')")
                return cur.fetchone()[0] is not None
    except Exception:
        return False


def _load_remote_importer():
    spec = importlib.util.spec_from_file_location(
        "osm_remote", HERE / "import-osm-remote.py"
    )
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


_DB_AVAILABLE = _local_db_available()


@unittest.skipUnless(_DB_AVAILABLE, "Supabase local injoignable ou 0032 non appliquée")
class ProvenancePhase1Base(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.remote = _load_remote_importer()

    def setUp(self):
        self.conn = psycopg.connect(LOCAL_DSN)
        self.park_id = str(uuid.uuid4())
        self.osm_ext = f"node/{uuid.uuid4().int % 10**12}"
        with self.conn.cursor() as cur:
            cur.execute(
                """
                insert into parks (id, name, latitude, longitude, country_code,
                    timezone, moderation_status, verification_status)
                values (%s, %s, 43.60, 1.44, 'FR', 'Europe/Paris', 'published', 'unverified')
                """,
                (self.park_id, f"{TEST_PREFIX} A"),
            )
            cur.execute(
                "insert into external_ids (park_id, provider, external_id) values (%s, 'osm', %s)",
                (self.park_id, self.osm_ext),
            )
            cur.execute(
                "insert into park_sources (park_id, source_type, source_name) "
                "values (%s, 'osm', 'OpenStreetMap') returning id",
                (self.park_id,),
            )
            self.osm_source_id = cur.fetchone()[0]
        self.conn.commit()

    def tearDown(self):
        self.conn.rollback()
        with self.conn.cursor() as cur:
            cur.execute("delete from parks where id = %s::uuid", (self.park_id,))
            cur.execute(
                "delete from audit_log where entity_type = 'parks' and entity_id = %s::uuid",
                (self.park_id,),
            )
        self.conn.commit()
        self.conn.close()

    # ── helpers ──────────────────────────────────────────────────────────
    def _record_osm(self, key, value):
        with self.conn.cursor() as cur:
            cur.execute(
                "select set_park_attribute_source(%s::uuid, %s, %s::jsonb, %s::uuid, 0.700, null)",
                (self.park_id, key, json.dumps(value), self.osm_source_id),
            )
        self.conn.commit()

    def _apply(self, key, value, source_type="toboggo", confidence=1.0):
        with self.conn.cursor() as cur:
            cur.execute(
                "select apply_park_attribute(%s::uuid, %s, %s::jsonb, %s::source_type, %s::numeric)",
                (self.park_id, key, json.dumps(value), source_type, confidence),
            )
            return cur.fetchone()[0]
        # commit by caller

    def _col(self, col):
        with self.conn.cursor() as cur:
            cur.execute(f"select {col} from parks where id = %s", (self.park_id,))
            return cur.fetchone()[0]

    def _can_replace(self, key, src):
        with self.conn.cursor() as cur:
            cur.execute(
                "select can_source_replace_attribute(%s::uuid, %s, %s::source_type)",
                (self.park_id, key, src),
            )
            return cur.fetchone()[0]

    def _run_osm_reimport(self, *, name, lat=43.60, lng=1.44, min_age=None, max_age=None):
        """Génère puis exécute le SQL d'un réimport OSM (branche UPDATE) pour
        CE parc, via la vraie fonction `import-osm-remote.py::park_sql`."""
        p = {
            "osm_type": "node",
            "osm_id": self.osm_ext.split("/")[1],
            "external_id": self.osm_ext,
            "name": name,
            # Every caller here simulates OSM re-supplying a concrete `name`
            # (never the "OSM has no name tag" case — see park-display-name
            # Phase 2, §H) — always True, matching import-osm-remote.py's own
            # `has_osm_name = bool(props.get("name"))`.
            "has_osm_name": True,
            "latitude": lat,
            "longitude": lng,
            "min_age": min_age,
            "max_age": max_age,
            "address": None,
            "features": [],
            "attribute_features": [],
        }
        sql = self.remote.park_sql(p, publish=False)
        with self.conn.cursor() as cur:
            cur.execute(sql)
        self.conn.commit()


class TestCentralScenario(ProvenancePhase1Base):
    def test_human_name_survives_osm_reimport(self):
        # 2. OSM fournit le nom A
        self._record_osm("name", f"{TEST_PREFIX} A")

        # 3-5. un admin Toboggo remplace par B
        self._apply("name", f"{TEST_PREFIX} B")
        self.conn.commit()
        self.assertEqual(self._col("name"), f"{TEST_PREFIX} B")

        # 4. provenance humaine créée + prioritaire
        self.assertFalse(self._can_replace("name", "osm"))
        with self.conn.cursor() as cur:
            cur.execute(
                """
                select ps.source_type
                from park_attribute_sources pas
                join park_sources ps on ps.id = pas.source_id
                where pas.park_id = %s and pas.attribute_key = 'name' and pas.is_current
                """,
                (self.park_id,),
            )
            self.assertEqual(cur.fetchone()[0], "toboggo")

        # archivage de l'ancienne source OSM
        with self.conn.cursor() as cur:
            cur.execute(
                "select count(*) filter (where is_current), count(*) filter (where not is_current) "
                "from park_attribute_sources where park_id = %s and attribute_key = 'name'",
                (self.park_id,),
            )
            current, archived = cur.fetchone()
        self.assertEqual(current, 1)
        self.assertGreaterEqual(archived, 1)

        # 6-7. réimport OSM proposant C -> B reste canonique
        self._run_osm_reimport(name=f"{TEST_PREFIX} C")
        self.assertEqual(self._col("name"), f"{TEST_PREFIX} B")

    def test_pure_osm_park_still_updated_by_reimport(self):
        """Non-régression : sans édition humaine, l'import OSM met à jour name."""
        self._record_osm("name", f"{TEST_PREFIX} A")
        self.assertTrue(self._can_replace("name", "osm"))
        self._run_osm_reimport(name=f"{TEST_PREFIX} C")
        self.assertEqual(self._col("name"), f"{TEST_PREFIX} C")

    def test_normal_replacement_when_no_higher_priority(self):
        """min_age jamais enregistré -> apply_park_attribute l'écrit et le projette."""
        self._apply("min_age", 3)
        self.conn.commit()
        self.assertEqual(self._col("min_age"), 3)
        self.assertFalse(self._col("ages_derived"))

    def test_location_survives_osm_reimport(self):
        self._apply("location", {"lat": 43.61, "lng": 1.45})
        self.conn.commit()
        self.assertAlmostEqual(float(self._col("latitude")), 43.61, places=5)
        self.assertFalse(self._can_replace("location", "osm"))

        self._run_osm_reimport(name=f"{TEST_PREFIX} A", lat=43.99, lng=1.99)
        self.assertAlmostEqual(float(self._col("latitude")), 43.61, places=5)
        self.assertAlmostEqual(float(self._col("longitude")), 1.45, places=5)

    def test_address_composite_projected(self):
        self._apply(
            "address",
            {
                "address_line": "1 Rue Test",
                "postal_code": "31000",
                "city": "Toulouse",
                "admin_area_1": None,
                "admin_area_2": None,
            },
            source_type="municipality",
            confidence=None,
        )
        self.conn.commit()
        self.assertEqual(self._col("city"), "Toulouse")
        self.assertEqual(self._col("postal_code"), "31000")
        self.assertFalse(self._can_replace("address", "osm"))

    def test_min_age_and_max_age_gate_on_remote_reimport(self):
        self._apply("min_age", 2)
        self._apply("max_age", 10)
        self.conn.commit()
        self._run_osm_reimport(name=f"{TEST_PREFIX} A", min_age=5, max_age=8)
        self.assertEqual(self._col("min_age"), 2)
        self.assertEqual(self._col("max_age"), 10)

    def test_idempotent_apply_does_not_grow_history(self):
        self._apply("name", f"{TEST_PREFIX} B")
        self._apply("name", f"{TEST_PREFIX} B")
        self._apply("name", f"{TEST_PREFIX} B")
        self.conn.commit()
        with self.conn.cursor() as cur:
            cur.execute(
                "select count(*) from park_attribute_sources "
                "where park_id = %s and attribute_key = 'name'",
                (self.park_id,),
            )
            self.assertEqual(cur.fetchone()[0], 1)

    def test_municipality_cannot_override_toboggo(self):
        self._apply("name", f"{TEST_PREFIX} B", source_type="toboggo")
        self.conn.commit()
        with self.assertRaises(psycopg.errors.CheckViolation):
            with self.conn.cursor() as cur:
                cur.execute(
                    "select apply_park_attribute(%s::uuid, 'name', %s::jsonb, 'municipality', null)",
                    (self.park_id, json.dumps(f"{TEST_PREFIX} X")),
                )
        self.conn.rollback()
        self.assertEqual(self._col("name"), f"{TEST_PREFIX} B")


if __name__ == "__main__":
    unittest.main()
