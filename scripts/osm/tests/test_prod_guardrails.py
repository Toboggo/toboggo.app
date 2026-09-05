#!/usr/bin/env python3
"""Tests unitaires purs — garde-fous d'écriture PRODUCTION du backfill adresses.

Aucun réseau, aucune base : on teste seulement `confirm_prod_commit` et la
surface d'arguments. Le principe vérifié : un `--commit --env prod` ne peut
aboutir que si les quatre verrous cumulatifs sont satisfaits ET la phrase de
confirmation est retapée exactement.

Lancer : python3 -m unittest scripts.osm.tests.test_prod_guardrails -v
"""
import importlib.util
import io
import os
import sys
import unittest
from contextlib import redirect_stdout
from pathlib import Path
from unittest import mock

HERE = Path(__file__).resolve().parents[1]


def _load_backfill_module():
    spec = importlib.util.spec_from_file_location(
        "backfill_addresses", HERE / "backfill-addresses.py"
    )
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


bf = _load_backfill_module()
PROD_REF = bf.PROD_PROJECT_REF
ENV_GATE = bf.PROD_COMMIT_ENV_GATE


def _call(project_ref=PROD_REF, count=5, flag_ack=True, env_ok=True,
          tty=True, typed=None):
    """Exécute confirm_prod_commit dans un contexte entièrement contrôlé."""
    typed = _default_phrase(count) if typed is None else typed
    environ = {ENV_GATE: "1"} if env_ok else {}
    with mock.patch.dict(os.environ, environ, clear=True), \
         mock.patch.object(bf.sys.stdin, "isatty", return_value=tty), \
         mock.patch.object(bf, "input", create=True, return_value=typed), \
         redirect_stdout(io.StringIO()):
        bf.confirm_prod_commit(project_ref, count, flag_ack)


def _default_phrase(count):
    return f"BACKFILL PROD {count}"


class TestProdCommitPhrase(unittest.TestCase):
    def test_phrase_embeds_candidate_count(self):
        self.assertEqual(bf._prod_commit_phrase(2201), "BACKFILL PROD 2201")
        self.assertNotEqual(bf._prod_commit_phrase(10), bf._prod_commit_phrase(11))


class TestConfirmProdCommitGates(unittest.TestCase):
    def test_all_gates_satisfied_passes(self):
        _call()  # ne lève pas

    def test_wrong_project_ref_refused(self):
        with self.assertRaises(SystemExit):
            _call(project_ref="hfuaouskwysqxiwpwvqy")  # staging

    def test_missing_cli_flag_refused(self):
        with self.assertRaises(SystemExit):
            _call(flag_ack=False)

    def test_missing_env_gate_refused(self):
        with self.assertRaises(SystemExit):
            _call(env_ok=False)

    def test_non_interactive_refused(self):
        with self.assertRaises(SystemExit):
            _call(tty=False)

    def test_wrong_confirmation_phrase_refused(self):
        with self.assertRaises(SystemExit):
            _call(typed="backfill prod 5")
        with self.assertRaises(SystemExit):
            _call(count=5, typed="BACKFILL PROD 6")

    def test_env_gate_must_be_exactly_one(self):
        for bad in ("0", "true", "yes", "", "1 "):
            with mock.patch.dict(os.environ, {ENV_GATE: bad}, clear=True), \
                 mock.patch.object(bf.sys.stdin, "isatty", return_value=True), \
                 mock.patch.object(bf, "input", create=True,
                                   return_value=_default_phrase(5)), \
                 redirect_stdout(io.StringIO()):
                with self.assertRaises(SystemExit):
                    bf.confirm_prod_commit(PROD_REF, 5, True)


class TestArgSurface(unittest.TestCase):
    def test_prod_is_an_accepted_env(self):
        argv = ["backfill-addresses.py", "--env", "prod", "--limit", "3"]
        with mock.patch.object(sys, "argv", argv):
            args = bf.parse_args()
        self.assertEqual(args.env, "prod")
        self.assertFalse(args.commit)
        self.assertFalse(args.i_understand_prod)

    def test_prod_ack_flag_parsed(self):
        argv = ["backfill-addresses.py", "--env", "prod", "--commit",
                "--i-understand-this-writes-to-production"]
        with mock.patch.object(sys, "argv", argv):
            args = bf.parse_args()
        self.assertTrue(args.commit)
        self.assertTrue(args.i_understand_prod)

    def test_remote_conn_targets_explicit_ref(self):
        c = bf.RemoteConn(bf.PROD_PROJECT_REF, "Toboggo Production")
        self.assertEqual(c.project_ref, "dfzrsygetbhnjzfssgub")


if __name__ == "__main__":
    unittest.main()
