"""Organization desk: first-visit setup vs locked sign-in."""

from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path
from unittest import mock

import volunteers as vol


class OrgSetupAuthTests(unittest.TestCase):
    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.org_path = Path(self._tmp.name) / "org.json"
        self._patcher = mock.patch.object(vol, "ORG_PATH", self.org_path)
        self._patcher.start()
        self._data_patcher = mock.patch.object(vol, "DATA_DIR", Path(self._tmp.name))
        self._data_patcher.start()

    def tearDown(self):
        self._patcher.stop()
        self._data_patcher.stop()
        self._tmp.cleanup()

    def test_missing_file_needs_setup(self):
        row = vol.public_org()
        self.assertTrue(row["setup"])
        self.assertEqual(row["username"], "")
        self.assertFalse(row["has_recovery_email"])

    def test_blank_credentials_need_setup(self):
        self.org_path.write_text(
            json.dumps({"name": "Demo Org", "username": "", "password_hash": ""}),
            encoding="utf-8",
        )
        self.assertTrue(vol.public_org()["setup"])

    def test_setup_then_sign_in(self):
        created = vol.setup_org_login(
            "JudgeDesk",
            "JudgePass1",
            name="Hackathon Org",
            email="judge@example.com",
        )
        self.assertFalse(created["setup"])
        self.assertEqual(created["username"], "judgedesk")
        self.assertTrue(created["has_recovery_email"])

        again = vol.public_org()
        self.assertFalse(again["setup"])

        session, error = vol.session_for_org("judgedesk", "JudgePass1")
        self.assertIsNone(error)
        self.assertEqual(session["username"], "judgedesk")

        bad, bad_error = vol.session_for_org("judgedesk", "wrong-password")
        self.assertIsNone(bad)
        self.assertIn("incorrect", bad_error.lower())

    def test_setup_rejected_when_already_set(self):
        vol.setup_org_login("firstuser", "Password12", email="a@example.com")
        with self.assertRaises(ValueError) as ctx:
            vol.setup_org_login("second", "Password34", email="b@example.com")
        self.assertIn("already set", str(ctx.exception).lower())

    def test_sign_in_before_setup_fails_clearly(self):
        row, error = vol.session_for_org("anyone", "Password12")
        self.assertIsNone(row)
        self.assertIn("not set up", error.lower())

    def test_setup_requires_valid_email_and_password(self):
        with self.assertRaises(ValueError):
            vol.setup_org_login("deskuser", "short", email="a@example.com")
        with self.assertRaises(ValueError):
            vol.setup_org_login("deskuser", "Password12", email="not-an-email")
        with self.assertRaises(ValueError):
            vol.setup_org_login("ab", "Password12", email="a@example.com")


if __name__ == "__main__":
    unittest.main()
