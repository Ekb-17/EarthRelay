"""Volunteer roster and org settings as JSON. Prototype store for invite / join / assign."""

from __future__ import annotations

import hashlib
import hmac
import json
import re
import secrets
import uuid
from datetime import datetime, timezone
from pathlib import Path

DATA_DIR = Path(__file__).resolve().parent / "data"
VOLUNTEERS_PATH = DATA_DIR / "volunteers.json"
ORG_PATH = DATA_DIR / "org.json"

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
    out["has_password"] = bool(row.get("password_hash"))
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
    return merged


def save_org(fields: dict) -> dict:
    org = load_org()
    if fields.get("name"):
        org["name"] = str(fields["name"]).strip()
    if isinstance(fields.get("access_defaults"), dict):
        org["access_defaults"] = default_access(fields["access_defaults"])
    ORG_PATH.write_text(json.dumps(org, indent=2), encoding="utf-8")
    return org


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
    existing = find_by_email(email)
    if existing:
        if existing.get("password_hash"):
            raise ValueError("An account already exists for this email. Sign in instead.")
        if require_password:
            existing["password_hash"] = hash_password(password)
        if fields.get("name"):
            existing["name"] = str(fields["name"]).strip()
        if fields.get("organization") is not None:
            existing["organization"] = str(fields.get("organization") or "").strip()
        if isinstance(fields.get("capabilities"), list) and fields["capabilities"]:
            existing["capabilities"] = list(fields["capabilities"])
        existing["updated_at"] = utc_now()
        rows = [existing if row.get("id") == existing["id"] else row for row in load_volunteers()]
        save_volunteers(rows)
        return existing
    name = (fields.get("name") or email.split("@")[0]).strip()
    row = {
        "id": _slug(name) + "-" + str(uuid.uuid4())[:4],
        "name": name,
        "email": email,
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


def session_for_email(email: str, password: str = "") -> dict | None:
    row = find_by_email(email)
    if not row:
        return None
    if row.get("status") not in ("active", "invited"):
        return None
    secret = (password or "").strip()
    if len(secret) < 8:
        return None
    stored = row.get("password_hash") or ""
    if not stored:
        row["password_hash"] = hash_password(secret)
        rows = [row if item.get("id") == row["id"] else item for item in load_volunteers()]
        save_volunteers(rows)
        return row
    if not verify_password(secret, stored):
        return None
    return row
