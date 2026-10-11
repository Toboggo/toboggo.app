#!/usr/bin/env python3
"""Le snapshot d'import ne peut pas écrire : toute requête non SELECT est refusée avant envoi."""
import importlib.util
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("snap", HERE / "prod-import-snapshot.py")
snap = importlib.util.module_from_spec(spec)
spec.loader.exec_module(snap)


class TestReadOnlyGuard(unittest.TestCase):
    def test_selects_pass(self):
        for sql in ("select 1", "  SELECT count(*) from parks", "with x as (select 1) select * from x",
                    "select 'insert into x' as s, 'delete' as d"):   # mots interdits dans un littéral : OK
            with self.subTest(sql):
                snap.assert_read_only(sql)

    def test_writes_rejected(self):
        for sql in ("insert into parks values (1)", "delete from parks", "update parks set name='x'",
                    "drop table parks", "select 1; delete from parks", "with d as (delete from parks returning 1) select * from d",
                    "create table x()", "truncate parks", "grant select on parks to anon", "do $$ begin end $$"):
            with self.subTest(sql):
                with self.assertRaises(ValueError):
                    snap.assert_read_only(sql)

    def test_snapshot_queries_are_all_read_only(self):
        seen = []
        orig = snap.ro
        snap.ro = lambda sql, ref: (snap.assert_read_only(sql), seen.append(sql), [{"h": "x", "n": 0}])[2]
        try:
            snap.snapshot("ref", "US")
        finally:
            snap.ro = orig
        self.assertGreaterEqual(len(seen), 10)


if __name__ == "__main__":
    unittest.main()
