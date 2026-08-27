"""Volunteer roster and org settings as JSON. Prototype store for invite / join / assign."""


from __future__ import annotations

import hashlib
import hmac
import json
import re
import secrets
import uuid
import logging
from datetime import datetime, timedelta, timezone
from pathlib import Path

DATA_DIR = Path(__file__).resolve().parent / "data"
VOLUNTEERS_PATH = DATA_DIR / "volunteers.json"
ORG_PATH = DATA_DIR / "org.json"
RESET_TTL_SECONDS = 600
RESET_COOLDOWN_SECONDS = 60
log = logging.getLogger("earthrelay")

NEEDS = (
    "cleanup",
    "field_assessment",
    "supplies",
    "community",
)

NEED_LABELS = {
    "cleanup": "Cleanup",
    "field_assessment": "Field assessment",
    "supplies": "Supplies",
    "community": "Community outreach",
}

NEED_ALIASES = {
    "site_assessment": "field_assessment",
    "debris_cleanup": "cleanup",
    "wildlife_assistance": "field_assessment",
    "community_support": "community",
    "emergency_response": "cleanup",
}

LEGACY_NEED_LABELS = {
    "site_assessment": "Field assessment",
    "debris_cleanup": "Cleanup",
    "wildlife_assistance": "Field assessment",
    "community_support": "Community outreach",
    "emergency_response": "Cleanup",
}


def need_label(need: str) -> str:
    key = (need or "").strip()
    return NEED_LABELS.get(key) or LEGACY_NEED_LABELS.get(key) or key.replace("_", " ")


def normalize_need(need: str) -> str:
    raw = (need or "").strip()
    if raw in NEEDS:
        return raw
    return NEED_ALIASES.get(raw, "")

ROLES = ("field_volunteer",)
STATUSES = ("pending", "invited", "active", "declined")

SEED = [
    {
        "id": "green-valley",
        "name": "Green Valley Volunteers",
        "email": "greenvalley@example.org",
        "phone": "03001110001",
        "role": "field_volunteer",
        "kind": "group",
        "status": "active",
        "organization": "Green Valley Volunteers",
        "capabilities": ["cleanup", "field_assessment"],
        "access": {"assigned_only": True, "photos": True, "location": True, "contact_citizen": False},
    },
    {
        "id": "cleanup-team",
        "name": "Community Cleanup Team",
        "email": "cleanup@example.org",
        "phone": "03001110002",
        "role": "field_volunteer",
        "kind": "group",
        "status": "active",
        "organization": "Community Cleanup Team",
        "capabilities": ["cleanup", "supplies"],
        "access": {"assigned_only": True, "photos": True, "location": True, "contact_citizen": False},
    },
    {
        "id": "sarah",
        "name": "Sarah — Field Volunteer",
        "email": "sarah@example.org",
        "phone": "03001110003",
        "role": "field_volunteer",
        "kind": "person",
        "status": "active",
        "organization": "",
        "capabilities": ["field_assessment", "documentation"],
        "access": {"assigned_only": True, "photos": True, "location": True, "contact_citizen": False},
    },
    {
        "id": "local-relief",
        "name": "Local Relief Group",
        "email": "relief@example.org",
        "phone": "03001110004",
        "role": "field_volunteer",
        "kind": "group",
        "status": "active",
        "organization": "Local Relief Group",
        "capabilities": ["supplies", "community"],
        "access": {"assigned_only": True, "photos": True, "location": True, "contact_citizen": False},
    },
    {
        "id": "alex-pending",
        "name": "Alex Rivera",
        "email": "alex@example.org",
        "phone": "03001110005",
        "role": "field_volunteer",
        "kind": "person",
        "status": "pending",
        "organization": "",
        "capabilities": ["cleanup", "field_assessment"],
        "access": {"assigned_only": True, "photos": True, "location": True, "contact_citizen": False},
    },
]

DEFAULT_ORG = {
    "name": "EarthRelay Response Team",
    "username": "",
    "access_defaults": {"assigned_only": True, "photos": True, "location": True, "contact_citizen": False},
}


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _normalize_email(value: str) -> str:
    return (value or "").strip().lower()


def hash_password(password: str) -> str:
    salt = secrets.token_hex(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), bytes.fromhex(salt), 120_000).hex()
    return f"pbkdf2$120000${salt}${digest}"


def verify_password(password: str, stored: str) -> bool:
    try:
        algo, rounds, salt, digest = (stored or "").split("$", 3)
        if algo != "pbkdf2":
            return False
        check = hashlib.pbkdf2_hmac(
            "sha256",
            password.encode("utf-8"),
            bytes.fromhex(salt),
            int(rounds),
        ).hex()
        return hmac.compare_digest(check, digest)
    except (ValueError, TypeError):
        return False


def public_volunteer(row: dict | None) -> dict | None:
    if not row:
        return None
    out = dict(row)
    out.pop("password_hash", None)
    out.pop("reset_code_hash", None)
    out.pop("reset_expires", None)
    out.pop("reset_requested_at", None)
    out["has_password"] = bool(row.get("password_hash"))
    out["must_change_password"] = bool(row.get("must_change_password"))
    return out


def _require_password(password: str) -> str:
    secret = (password or "").strip()
    if len(secret) < 8:
        raise ValueError("Password must be at least 8 characters.")
    return secret


def default_access(extra: dict | None = None) -> dict:
    access = {"assigned_only": True, "photos": True, "location": True, "contact_citizen": False}
    if extra:
        access["photos"] = bool(extra.get("photos", True))
        access["location"] = bool(extra.get("location", True))
        access["contact_citizen"] = bool(extra.get("contact_citizen", False))
        access["assigned_only"] = True
    return access


def load_org() -> dict:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    if not ORG_PATH.exists():
        ORG_PATH.write_text(json.dumps(DEFAULT_ORG, indent=2), encoding="utf-8")
        return dict(DEFAULT_ORG)
    try:
        data = json.loads(ORG_PATH.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return dict(DEFAULT_ORG)
    merged = dict(DEFAULT_ORG)
    merged.update(data or {})
    # Treat blank username / hash as unset so the setup screen still appears.
    if not str(merged.get("username") or "").strip():
        merged["username"] = ""
    if not str(merged.get("password_hash") or "").strip():
        merged.pop("password_hash", None)
    return merged


def _persist_org(org: dict) -> None:
    ORG_PATH.write_text(json.dumps(org, indent=2), encoding="utf-8")


def _parse_iso(value: str) -> datetime | None:
    try:
        parsed = datetime.fromisoformat(value or "")
    except (TypeError, ValueError):
        return None
    if parsed.tzinfo is None:
        return parsed.replace(tzinfo=timezone.utc)
    return parsed


def _valid_email(value: str) -> str:
    email = _normalize_email(value)
    if not re.fullmatch(r"[^@\s]+@[^@\s]+\.[^@\s]+", email):
        raise ValueError("Enter a valid email address.")
    return email


def _email_hint(email: str) -> str:
    text = _normalize_email(email)
    if "@" not in text:
        return ""
    local, _, domain = text.partition("@")
    if not local:
        return f"*@{domain}"
    return f"{local[0]}***@{domain}"


def public_org() -> dict:
    org = load_org()
    email = org.get("recovery_email") or ""
    return {
        "name": org.get("name") or DEFAULT_ORG["name"],
        "username": org.get("username") or "",
        "access_defaults": default_access(org.get("access_defaults")),
        "setup": not bool(org.get("password_hash") and org.get("username")),
        "has_recovery_email": bool(email),
        "recovery_email_hint": _email_hint(email),
    }


def _normalize_username(value: str) -> str:
    return re.sub(r"\s+", "", (value or "").strip().lower())


def setup_org_login(username: str, password: str, name: str = "", email: str = "") -> dict:
    org = load_org()
    if org.get("password_hash") and org.get("username"):
        raise ValueError("Organization login is already set. Sign in with the existing username and password.")
    user = _normalize_username(username)
    if not re.fullmatch(r"[a-z0-9._-]{3,40}", user or ""):
        raise ValueError("Username must be 3-40 letters, numbers, dots, or hyphens.")
    secret = _require_password(password)
    recovery = _valid_email(email)
    if str(name or "").strip():
        org["name"] = str(name).strip()
    org["username"] = user
    org["password_hash"] = hash_password(secret)
    org["recovery_email"] = recovery
    _persist_org(org)
    # Same shape as a successful sign-in so the desk opens immediately after create.
    return public_org()


def session_for_org(username: str, password: str) -> tuple[dict | None, str]:
    org = load_org()
    if not org.get("password_hash") or not org.get("username"):
        return None, "Organization login is not set up yet."
    if _normalize_username(username) != _normalize_username(org.get("username") or ""):
        return None, "Username or password is incorrect."
    if not verify_password((password or "").strip(), org["password_hash"]):
        return None, "Username or password is incorrect."
    return public_org(), None


def start_org_reset(username: str, email: str) -> dict:
    from mail import send_org_reset

    org = load_org()
    if not org.get("password_hash") or not org.get("username"):
        raise ValueError("Organization login is not set up yet.")
    if not org.get("recovery_email"):
        raise ValueError("This desk has no recovery email yet. Sign in and add one in Settings.")
    if _normalize_username(username) != _normalize_username(org.get("username") or ""):
        raise ValueError("Username or recovery email is incorrect.")
    if _normalize_email(email) != _normalize_email(org.get("recovery_email") or ""):
        raise ValueError("Username or recovery email is incorrect.")
    last = _parse_iso(org.get("reset_requested_at") or "")
    if last and (datetime.now(timezone.utc) - last).total_seconds() < RESET_COOLDOWN_SECONDS:
        raise ValueError("Wait a minute before requesting another code.")
    code = f"{secrets.randbelow(1_000_000):06d}"
    org["reset_code_hash"] = hash_password(code)
    org["reset_expires"] = (datetime.now(timezone.utc) + timedelta(seconds=RESET_TTL_SECONDS)).isoformat()
    org["reset_requested_at"] = utc_now()
    _persist_org(org)
    sent = send_org_reset(to_email=org["recovery_email"], code=code, username=org["username"])
    if not sent.get("sent"):
        log.warning("Organization reset code for %s (email not sent): %s", org["username"], code)
        org.pop("reset_code_hash", None)
        org.pop("reset_expires", None)
        _persist_org(org)
        raise ValueError(
            "Could not send the verification email. Check EarthRelay email settings, then try again."
        )
    return {
        "ok": True,
        "detail": "We sent a 6-digit verification code to your email. It expires in 10 minutes. Check spam if you do not see it.",
        "email_sent": True,
    }


def complete_org_reset(username: str, email: str, code: str, password: str) -> dict:
    org = load_org()
    if _normalize_username(username) != _normalize_username(org.get("username") or ""):
        raise ValueError("Username, email, or code is incorrect.")
    if _normalize_email(email) != _normalize_email(org.get("recovery_email") or ""):
        raise ValueError("Username, email, or code is incorrect.")
    until = _parse_iso(org.get("reset_expires") or "")
    if not until or datetime.now(timezone.utc) > until:
        raise ValueError("That code has expired. Request a new one.")
    if not verify_password((code or "").strip(), org.get("reset_code_hash") or ""):
        raise ValueError("Username, email, or code is incorrect.")
    org["password_hash"] = hash_password(_require_password(password))
    org.pop("reset_code_hash", None)
    org.pop("reset_expires", None)
    org.pop("reset_requested_at", None)
    _persist_org(org)
    return public_org()


def set_org_recovery_email(username: str, password: str, email: str) -> dict:
    row, error = session_for_org(username, password)
    if not row:
        raise ValueError(error or "Username or password is incorrect.")
    org = load_org()
    org["recovery_email"] = _valid_email(email)
    _persist_org(org)
    return public_org()


def change_org_password(username: str, password: str, new_password: str) -> dict:
    row, error = session_for_org(username, password)
    if not row:
        raise ValueError(error or "Username or password is incorrect.")
    org = load_org()
    org["password_hash"] = hash_password(_require_password(new_password))
    org.pop("reset_code_hash", None)
    org.pop("reset_expires", None)
    org.pop("reset_requested_at", None)
    _persist_org(org)
    return public_org()


def save_org(fields: dict) -> dict:
    org = load_org()
    if fields.get("name"):
        org["name"] = str(fields["name"]).strip()
    if isinstance(fields.get("access_defaults"), dict):
        org["access_defaults"] = default_access(fields["access_defaults"])
    _persist_org(org)
    return public_org()


def _normalize_phone(value: str) -> str:
    from phone import canonicalize

    return canonicalize(value)


def _phones_match(stored: str, given: str) -> bool:
    from phone import phones_match

    return phones_match(stored, given)


def _require_phone(value: str) -> str:
    from phone import require_phone

    return require_phone(value)


def load_volunteers() -> list[dict]:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    if not VOLUNTEERS_PATH.exists():
        VOLUNTEERS_PATH.write_text(json.dumps(SEED, indent=2), encoding="utf-8")
        return [dict(item) for item in SEED]
    try:
        rows = json.loads(VOLUNTEERS_PATH.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        rows = []
    if not isinstance(rows, list) or not rows:
        VOLUNTEERS_PATH.write_text(json.dumps(SEED, indent=2), encoding="utf-8")
        return [dict(item) for item in SEED]
    # Backfill phone on older seed rows when missing
    by_id = {item["id"]: item for item in SEED}
    changed = False
    for row in rows:
        if not row.get("phone") and row.get("id") in by_id:
            row["phone"] = by_id[row["id"]].get("phone") or ""
            changed = True
        row.setdefault("phone", "")
    if changed:
        save_volunteers(rows)
    return rows


def save_volunteers(rows: list[dict]) -> list[dict]:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    VOLUNTEERS_PATH.write_text(json.dumps(rows, indent=2), encoding="utf-8")
    return rows


def get_volunteer(volunteer_id: str) -> dict | None:
    for row in load_volunteers():
        if row.get("id") == volunteer_id:
            return row
    return None


def find_by_email(email: str) -> dict | None:
    needle = _normalize_email(email)
    if not needle:
        return None
    for row in load_volunteers():
        if _normalize_email(row.get("email") or "") == needle:
            return row
    return None


def find_by_phone(phone: str) -> dict | None:
    given = (phone or "").strip()
    if not _normalize_phone(given):
        return None
    for row in load_volunteers():
        stored = row.get("phone") or ""
        if stored and _phones_match(stored, given):
            return row
    return None


def assignable() -> list[dict]:
    return [row for row in load_volunteers() if row.get("status") in ("active", "invited")]


def _slug(name: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", (name or "").lower()).strip("-")
    return slug[:24] or str(uuid.uuid4())[:8]


def create_volunteer(fields: dict, *, require_password: bool = True) -> dict:
    email = _normalize_email(fields.get("email") or "")
    if not email or "@" not in email:
        raise ValueError("A valid email is required.")
    password = (fields.get("password") or "").strip()
    if require_password:
        password = _require_password(password)
    phone = ""
    if fields.get("phone") is not None or require_password:
        phone = _require_phone(fields.get("phone") or "")
    existing = find_by_email(email)
    if existing:
        if not require_password:
            return existing
        status = existing.get("status") or ""
        # Join never checks or replaces a password. Any phone may be shared across emails.
        if status == "pending":
            raise ValueError(
                f"{email} already has a request waiting for organization approval. "
                "Password does not matter on Join for this email - after they approve you, "
                "use Sign in with the password you set the first time."
            )
        if status == "declined":
            # Re-open a declined request with the password they just chose on Join.
            existing["password_hash"] = hash_password(password)
            if fields.get("name"):
                existing["name"] = str(fields["name"]).strip()
            if fields.get("organization") is not None:
                existing["organization"] = str(fields.get("organization") or "").strip()
            if isinstance(fields.get("capabilities"), list) and fields["capabilities"]:
                existing["capabilities"] = list(fields["capabilities"])
            if phone:
                existing["phone"] = phone
            existing["status"] = "pending"
            existing["updated_at"] = utc_now()
            rows = [existing if row.get("id") == existing["id"] else row for row in load_volunteers()]
            save_volunteers(rows)
            return existing
        if existing.get("password_hash") or status in ("active", "invited"):
            raise ValueError(
                f"An account already exists for {email}. Use Sign in instead - Join is only for a new email."
            )
        # Invited / seed row with no password yet: attach the Join password once.
        existing["password_hash"] = hash_password(password)
        if fields.get("name"):
            existing["name"] = str(fields["name"]).strip()
        if fields.get("organization") is not None:
            existing["organization"] = str(fields.get("organization") or "").strip()
        if isinstance(fields.get("capabilities"), list) and fields["capabilities"]:
            existing["capabilities"] = list(fields["capabilities"])
        if phone:
            existing["phone"] = phone
        if status not in STATUSES:
            existing["status"] = "pending"
        existing["updated_at"] = utc_now()
        rows = [existing if row.get("id") == existing["id"] else row for row in load_volunteers()]
        save_volunteers(rows)
        return existing
    # Phone may be shared by several volunteer emails — only email must be unique.
    name = (fields.get("name") or email.split("@")[0]).strip()
    row = {
        "id": _slug(name) + "-" + str(uuid.uuid4())[:4],
        "name": name,
        "email": email,
        "phone": phone,
        "role": "field_volunteer",
        "kind": "person",
        "status": fields.get("status") if fields.get("status") in STATUSES else "pending",
        "organization": (fields.get("organization") or "").strip(),
        "capabilities": list(fields.get("capabilities") or []),
        "access": default_access(fields.get("access")),
        "created_at": utc_now(),
    }
    if password:
        row["password_hash"] = hash_password(password)
    rows = load_volunteers()
    rows.append(row)
    save_volunteers(rows)
    return row


def invite_volunteer(fields: dict) -> dict:
    email = _normalize_email(fields.get("email") or "")
    if not email or "@" not in email:
        raise ValueError("A valid email is required.")
    access = default_access(fields.get("access"))
    existing = find_by_email(email)
    if existing:
        existing["status"] = "invited" if existing.get("status") != "active" else "active"
        existing["access"] = access
        existing["role"] = "field_volunteer"
        existing["invited_at"] = utc_now()
        rows = [existing if row["id"] == existing["id"] else row for row in load_volunteers()]
        save_volunteers(rows)
        return existing
    name = (fields.get("name") or email.split("@")[0]).strip()
    return create_volunteer(
        {
            "name": name,
            "email": email,
            "status": "invited",
            "organization": fields.get("organization") or "",
            "access": access,
        },
        require_password=False,
    )


def update_volunteer(volunteer_id: str, fields: dict) -> dict | None:
    rows = load_volunteers()
    found = None
    for row in rows:
        if row.get("id") != volunteer_id:
            continue
        if fields.get("status") in STATUSES:
            row["status"] = fields["status"]
        if fields.get("name"):
            row["name"] = str(fields["name"]).strip()
        if fields.get("phone") is not None:
            phone = str(fields.get("phone") or "").strip()
            if phone:
                row["phone"] = _require_phone(phone)
        if isinstance(fields.get("access"), dict):
            row["access"] = default_access(fields["access"])
        if isinstance(fields.get("capabilities"), list):
            row["capabilities"] = fields["capabilities"]
        row["updated_at"] = utc_now()
        found = row
        break
    if not found:
        return None
    save_volunteers(rows)
    return found


def set_volunteer_password(volunteer_id: str, password: str) -> dict:
    """Organization desk sets / resets a volunteer password (same idea as staff)."""
    secret = _require_password(password)
    rows = load_volunteers()
    found = None
    for row in rows:
        if row.get("id") != volunteer_id:
            continue
        if row.get("status") not in ("active", "invited"):
            raise ValueError("Only approved or invited volunteers can receive a password.")
        row["password_hash"] = hash_password(secret)
        row["must_change_password"] = True
        row.pop("reset_code_hash", None)
        row.pop("reset_expires", None)
        row.pop("reset_requested_at", None)
        row["updated_at"] = utc_now()
        found = row
        break
    if not found:
        raise ValueError("Volunteer not found.")
    save_volunteers(rows)
    return public_volunteer(found)


def change_volunteer_password(volunteer_id: str, current_password: str, new_password: str) -> dict:
    """Volunteer self-service after a desk reset, or any time they know the current password."""
    current = (current_password or "").strip()
    secret = _require_password(new_password)
    if current == secret:
        raise ValueError("New password must be different from the current password.")
    rows = load_volunteers()
    found = None
    for row in rows:
        if row.get("id") != volunteer_id:
            continue
        stored = row.get("password_hash") or ""
        if not stored or not verify_password(current, stored):
            raise ValueError("Current password is incorrect.")
        row["password_hash"] = hash_password(secret)
        row["must_change_password"] = False
        row["updated_at"] = utc_now()
        found = row
        break
    if not found:
        raise ValueError("Volunteer not found.")
    save_volunteers(rows)
    return public_volunteer(found)


def delete_volunteer(volunteer_id: str) -> bool:
    rows = load_volunteers()
    kept = [row for row in rows if row.get("id") != volunteer_id]
    if len(kept) == len(rows):
        return False
    save_volunteers(kept)
    try:
        from cases import list_cases, save_case

        for case in list_cases():
            assignment = case.get("assignment") or {}
            if assignment.get("responder_id") == volunteer_id:
                case["assignment"] = None
                save_case(case)
    except Exception:
        pass
    return True


def session_for_email(email: str, password: str = "", phone: str = "") -> tuple[dict | None, str]:
    """Returns (row, error). Never auto-sets a password on sign-in."""
    row = find_by_email(email)
    secret = (password or "").strip()
    stored = (row or {}).get("password_hash") or ""
    # Always hash-check when a row exists so a wrong password cannot skip verification.
    if not row or len(secret) < 8 or not stored or not verify_password(secret, stored):
        if row and not stored:
            return None, "No password is set for this email. Ask the organization to set one, then sign in."
        return None, "Email or password is incorrect."
    expected = row.get("phone") or ""
    if expected:
        if not _normalize_phone(phone):
            return None, "Phone number is required."
        if not _phones_match(expected, phone):
            return None, "Phone number does not match this account."
    elif not _normalize_phone(phone):
        return None, "Phone number is required."
    if row.get("status") == "pending":
        return None, "This request is waiting for organization approval."
    if row.get("status") == "declined":
        return None, "This account was declined. Use Join again to request access."
    if row.get("status") not in ("active", "invited"):
        return None, "Email or password is incorrect."
    return row, ""


def start_volunteer_reset(email: str, phone: str) -> dict:
    """Send a 6-digit code to the volunteer email after email + phone match."""
    from mail import send_volunteer_reset

    row = find_by_email(email)
    if not row:
        raise ValueError("Email or phone is incorrect.")
    expected = row.get("phone") or ""
    if not expected or not _phones_match(expected, phone):
        raise ValueError("Email or phone is incorrect.")
    if row.get("status") == "pending":
        raise ValueError("This request is waiting for organization approval.")
    if row.get("status") == "declined":
        raise ValueError("This account was declined. Use Join again to request access.")
    if row.get("status") not in ("active", "invited"):
        raise ValueError("Email or phone is incorrect.")
    last = _parse_iso(row.get("reset_requested_at") or "")
    if last and (datetime.now(timezone.utc) - last).total_seconds() < RESET_COOLDOWN_SECONDS:
        raise ValueError("Wait a minute before requesting another code.")
    code = f"{secrets.randbelow(1_000_000):06d}"
    rows = load_volunteers()
    updated = None
    for item in rows:
        if item.get("id") != row["id"]:
            continue
        item["reset_code_hash"] = hash_password(code)
        item["reset_expires"] = (datetime.now(timezone.utc) + timedelta(seconds=RESET_TTL_SECONDS)).isoformat()
        item["reset_requested_at"] = utc_now()
        item["updated_at"] = utc_now()
        updated = item
        break
    if not updated:
        raise ValueError("Email or phone is incorrect.")
    save_volunteers(rows)
    sent = send_volunteer_reset(to_email=updated["email"], code=code, name=updated.get("name") or "")
    if not sent.get("sent"):
        log.warning("Volunteer reset code for %s (email not sent): %s", updated["email"], code)
        # Do not leave a usable code when the email never left the server.
        for item in rows:
            if item.get("id") != updated["id"]:
                continue
            item.pop("reset_code_hash", None)
            item.pop("reset_expires", None)
            break
        save_volunteers(rows)
        raise ValueError(
            "Could not send the verification email. Check EarthRelay email settings, then use Resend code."
        )
    return {
        "ok": True,
        "detail": "We sent a 6-digit verification code to your email. It expires in 10 minutes. Check spam if you do not see it.",
        "email_sent": True,
    }


def complete_volunteer_reset(email: str, phone: str, code: str, password: str) -> dict:
    """Set a new password only after email, phone, and verification code match."""
    row = find_by_email(email)
    if not row:
        raise ValueError("Email, phone, or code is incorrect.")
    expected = row.get("phone") or ""
    if not expected or not _phones_match(expected, phone):
        raise ValueError("Email, phone, or code is incorrect.")
    if row.get("status") not in ("active", "invited"):
        raise ValueError("Email, phone, or code is incorrect.")
    until = _parse_iso(row.get("reset_expires") or "")
    if not until or datetime.now(timezone.utc) > until:
        raise ValueError("That code has expired. Request a new one.")
    if not verify_password((code or "").strip(), row.get("reset_code_hash") or ""):
        raise ValueError("Email, phone, or code is incorrect.")
    secret = _require_password(password)
    rows = load_volunteers()
    updated = None
    for item in rows:
        if item.get("id") != row["id"]:
            continue
        item["password_hash"] = hash_password(secret)
        item["must_change_password"] = False
        item.pop("reset_code_hash", None)
        item.pop("reset_expires", None)
        item.pop("reset_requested_at", None)
        item["updated_at"] = utc_now()
        updated = item
        break
    if not updated:
        raise ValueError("Email, phone, or code is incorrect.")
    save_volunteers(rows)
    return public_volunteer(updated)  # join/sign-in credentials are never inferred from session.

