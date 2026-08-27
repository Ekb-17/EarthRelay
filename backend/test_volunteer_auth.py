"""Volunteer join / sign-in: wrong password never succeeds; new emails can join."""

from __future__ import annotations

import tempfile
import unittest
from pathlib import Path
from unittest import mock

import phone as phone_mod
import volunteers as vol


class PhoneMatchTests(unittest.TestCase):
    def test_local_and_country_code_match(self):
        self.assertTrue(phone_mod.phones_match("03149712765", "923149712765"))
        self.assertTrue(phone_mod.phones_match("03001110001", "923001110001"))

    def test_short_suffix_does_not_match(self):
        self.assertFalse(phone_mod.phones_match("03001110001", "1110001"))


class VolunteerAuthTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.path = Path(self.tmp.name) / "volunteers.json"
        self.path.write_text(
            '[{"id":"keep","email":"keep-file@invalid.local","status":"declined","phone":""}]',
            encoding="utf-8",
        )
        self.patcher = mock.patch.object(vol, "VOLUNTEERS_PATH", self.path)
        self.patcher.start()

    def tearDown(self):
        self.patcher.stop()
        self.tmp.cleanup()

    def _join(self, email, password, phone, name="Test Volunteer"):
        return vol.create_volunteer(
            {
                "name": name,
                "email": email,
                "phone": phone,
                "password": password,
                "capabilities": ["cleanup"],
            }
        )

    def test_wrong_password_is_rejected(self):
        row = self._join("one@example.org", "correcthorse", "03001119991")
        row["status"] = "active"
        vol.save_volunteers([row])
        ok, err = vol.session_for_email("one@example.org", "wronghorse", "03001119991")
        self.assertIsNone(ok)
        self.assertEqual(err, "Email or password is incorrect.")

    def test_right_password_works_when_active(self):
        row = self._join("one@example.org", "correcthorse", "03001119991")
        row["status"] = "active"
        vol.save_volunteers([row])
        ok, err = vol.session_for_email("one@example.org", "correcthorse", "03001119991")
        self.assertEqual(err, "")
        self.assertEqual(ok["email"], "one@example.org")

    def test_pending_cannot_sign_in(self):
        self._join("one@example.org", "correcthorse", "03001119991")
        ok, err = vol.session_for_email("one@example.org", "correcthorse", "03001119991")
        self.assertIsNone(ok)
        self.assertIn("approval", err.lower())

    def test_second_join_same_email_is_blocked(self):
        self._join("one@example.org", "correcthorse", "03001119991")
        with self.assertRaises(ValueError) as caught:
            self._join("one@example.org", "correcthorse", "03001119992")
        self.assertIn("already has a request", str(caught.exception).lower())

    def test_join_again_does_not_replace_password(self):
        row = self._join("one@example.org", "correcthorse", "03001119991")
        stored = row["password_hash"]
        count = len(vol.load_volunteers())
        with self.assertRaises(ValueError) as caught:
            self._join("one@example.org", "wronghorse", "03001119991")
        self.assertIn("already has a request", str(caught.exception).lower())
        self.assertIn("one@example.org", str(caught.exception).lower())
        again = vol.find_by_email("one@example.org")
        self.assertEqual(len(vol.load_volunteers()), count)
        self.assertEqual(again["password_hash"], stored)
        self.assertTrue(vol.verify_password("correcthorse", again["password_hash"]))

    def test_join_again_does_not_change_active_account(self):
        row = self._join("one@example.org", "correcthorse", "03001119991")
        row["status"] = "active"
        vol.save_volunteers([row])
        stored = row["password_hash"]
        with self.assertRaises(ValueError) as caught:
            self._join("one@example.org", "wronghorse", "03001119991")
        self.assertIn("sign in instead", str(caught.exception).lower())
        again = vol.find_by_email("one@example.org")
        self.assertEqual(again["password_hash"], stored)
        self.assertEqual(again["status"], "active")

    def test_different_email_can_join(self):
        self._join("one@example.org", "correcthorse", "03001119991")
        other = self._join("two@example.org", "correcthorse", "03001119993")
        self.assertEqual(other["email"], "two@example.org")
        self.assertEqual(other["status"], "pending")

    def test_same_phone_different_email_is_allowed(self):
        self._join("one@example.org", "correcthorse", "03001119991")
        other = self._join("two@example.org", "otherpass1", "03001119991")
        self.assertEqual(other["email"], "two@example.org")
        self.assertEqual(other["phone"], "03001119991")
        self.assertEqual(other["status"], "pending")
        sister = self._join("sis@example.org", "sispass12", "03009998888")
        self.assertEqual(sister["phone"], "03009998888")
        self.assertEqual(sister["status"], "pending")

    def test_empty_volunteers_file_roundtrip(self):
        rows = vol.load_volunteers()
        self.assertTrue(any(item.get("id") == "keep" for item in rows))


if __name__ == "__main__":
    unittest.main()
