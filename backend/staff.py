"""EarthRelay organization staff with allotted Staff IDs (CMS-style)."""

from __future__ import annotations

import json
import re
from pathlib import Path

from volunteers import hash_password, utc_now, verify_password

DATA_DIR = Path(__file__).resolve().parent / "data"
STAFF_PATH = DATA_DIR / "staff.json"

SEED_PASSWORD = "EarthRelay1"

ROLES = (
    "case_officer",
    "desk_lead",
    "dispatcher",
    "field_coordinator",
    "admin",
)

ROLE_LABELS = {
    "case_officer": "Case officer",
    "desk_lead": "Desk lead",
    "dispatcher": "Dispatcher",
    "field_coordinator": "Field coordinator",
    "admin": "Organization admin",
}

DESKS = (
    "flood",
    "sewage",
    "fire",
    "wildlife",
    "deforestation",
    "earthquake",
    "dumping",
    "general",
)

DESK_LABELS = {
    "flood": "Flood / water desk",
    "sewage": "Sewage / sanitation desk",
    "fire": "Fire desk",
    "wildlife": "Wildlife desk",
    "deforestation": "Forest / deforestation desk",
    "earthquake": "Earthquake / collapse desk",
    "dumping": "Illegal dumping desk",
    "general": "General operations",
}

GRADE_FROM_ROLE = {
    "case_officer": "Officer",
    "desk_lead": "Desk lead",
    "dispatcher": "Dispatcher",
    "field_coordinator": "Field coordinator",
    "admin": "Organization admin",
}

# Seed roster: identity + employment + pay. Passwords stay hashed separately.
SEED_PEOPLE = [
    {
        "cms_id": "ER-CMS-2401",
        "name": "Ayesha Khan",
        "email": "ayesha.khan@earthrelay.org",
        "phone": "03001234001",
        "role": "case_officer",
        "desk": "flood",
        "joined_on": "2024-03-01",
        "salary_usd": 300,
        "transport_allowance_usd": 30,
        "medical_allowance_usd": 15,
        "leave_balance_days": 18,
        "reports_to": "Zainab Hussain",
        "cnic_last4": "4521",
        "emergency_phone": "03019991001",
        "bank_last4": "2401",
        "office": "Islamabad operations",
    },
    {
        "cms_id": "ER-CMS-2402",
        "name": "Bilal Ahmed",
        "email": "bilal.ahmed@earthrelay.org",
        "phone": "03001234002",
        "role": "desk_lead",
        "desk": "sewage",
        "joined_on": "2023-11-12",
        "salary_usd": 390,
        "transport_allowance_usd": 35,
        "medical_allowance_usd": 20,
        "leave_balance_days": 12,
        "reports_to": "Zainab Hussain",
        "cnic_last4": "8830",
        "emergency_phone": "03019991002",
        "bank_last4": "2402",
        "office": "Islamabad operations",
    },
    {
        "cms_id": "ER-CMS-2403",
        "name": "Sana Malik",
        "email": "sana.malik@earthrelay.org",
        "phone": "03001234003",
        "role": "dispatcher",
        "desk": "fire",
        "joined_on": "2024-01-08",
        "salary_usd": 330,
        "transport_allowance_usd": 30,
        "medical_allowance_usd": 15,
        "leave_balance_days": 15,
        "reports_to": "Zainab Hussain",
        "cnic_last4": "1194",
        "emergency_phone": "03019991003",
        "bank_last4": "2403",
        "office": "Islamabad operations",
    },
    {
        "cms_id": "ER-CMS-2404",
        "name": "Omar Farooq",
        "email": "omar.farooq@earthrelay.org",
        "phone": "03001234004",
        "role": "field_coordinator",
        "desk": "wildlife",
        "joined_on": "2023-08-20",
        "salary_usd": 350,
        "transport_allowance_usd": 45,
        "medical_allowance_usd": 20,
        "leave_balance_days": 9,
        "reports_to": "Zainab Hussain",
        "cnic_last4": "6722",
        "emergency_phone": "03019991004",
        "bank_last4": "2404",
        "office": "Islamabad operations",
    },
    {
        "cms_id": "ER-CMS-2405",
        "name": "Hira Raza",
        "email": "hira.raza@earthrelay.org",
        "phone": "03001234005",
        "role": "case_officer",
        "desk": "deforestation",
        "joined_on": "2024-06-15",
        "salary_usd": 300,
        "transport_allowance_usd": 30,
        "medical_allowance_usd": 15,
        "leave_balance_days": 20,
        "reports_to": "Zainab Hussain",
        "cnic_last4": "3048",
        "emergency_phone": "03019991005",
        "bank_last4": "2405",
        "office": "Islamabad operations",
    },
    {
        "cms_id": "ER-CMS-2406",
        "name": "Usman Ali",
        "email": "usman.ali@earthrelay.org",
        "phone": "03001234006",
        "role": "desk_lead",
        "desk": "earthquake",
        "joined_on": "2023-05-02",
        "salary_usd": 390,
        "transport_allowance_usd": 35,
        "medical_allowance_usd": 20,
        "leave_balance_days": 11,
        "reports_to": "Zainab Hussain",
        "cnic_last4": "5571",
        "emergency_phone": "03019991006",
        "bank_last4": "2406",
        "office": "Islamabad operations",
    },
    {
        "cms_id": "ER-CMS-2407",
        "name": "Nadia Iqbal",
        "email": "nadia.iqbal@earthrelay.org",
        "phone": "03001234007",
        "role": "case_officer",
        "desk": "dumping",
        "joined_on": "2024-09-01",
        "salary_usd": 300,
        "transport_allowance_usd": 30,
        "medical_allowance_usd": 15,
        "leave_balance_days": 16,
        "reports_to": "Zainab Hussain",
        "cnic_last4": "9012",
        "emergency_phone": "03019991007",
        "bank_last4": "2407",
        "office": "Islamabad operations",
    },
    {
        "cms_id": "ER-CMS-2408",
        "name": "Zainab Hussain",
        "email": "zainab.hussain@earthrelay.org",
        "phone": "03001234008",
        "role": "admin",
        "desk": "general",
        "joined_on": "2022-02-14",
        "salary_usd": 500,
        "transport_allowance_usd": 45,
        "medical_allowance_usd": 30,
        "leave_balance_days": 7,
        "reports_to": "Operations board",
        "cnic_last4": "2286",
        "emergency_phone": "03019991008",
        "bank_last4": "2408",
        "office": "Islamabad operations",
    },
]

SEED_HR = {row["cms_id"]: row for row in SEED_PEOPLE}

# Approximate PKR→USD for migrating older staff records that still store *_pkr.
_PKR_PER_USD = 280

HR_INT_KEYS = (
    "salary_usd",
    "transport_allowance_usd",
    "medical_allowance_usd",
    "leave_balance_days",
)


def _as_int(value, fallback=0) -> int:
    try:
        return int(value)
    except (TypeError, ValueError):
        return fallback


def _migrate_pay_currency(row: dict) -> dict:
    """Rename legacy *_pkr pay fields to USD and drop obsolete gross_pkr."""
    for old, new in (
        ("salary_pkr", "salary_usd"),
        ("transport_allowance_pkr", "transport_allowance_usd"),
        ("medical_allowance_pkr", "medical_allowance_usd"),
    ):
        if old in row:
            if new not in row:
                row[new] = max(0, round(_as_int(row.get(old), 0) / _PKR_PER_USD))
            row.pop(old, None)
    row.pop("gross_pkr", None)
    return row


def _employment_defaults(row: dict) -> dict:
    phone = normalize_phone(row.get("phone") or "")
    role = row.get("role") or "case_officer"
    _migrate_pay_currency(row)
    row.setdefault("status", "active")
    row.setdefault("pay_cycle", "monthly")
    row.setdefault("employment_type", "full_time")
    row.setdefault("joined_on", "")
    row.setdefault("office", "Islamabad operations")
    row.setdefault("reports_to", "")
    row.setdefault("grade", GRADE_FROM_ROLE.get(role, ROLE_LABELS.get(role, "")))
    row.setdefault("cnic_last4", phone[-4:] if len(phone) >= 4 else "")
    row.setdefault("emergency_phone", "")
    row.setdefault("bank_last4", phone[-4:] if len(phone) >= 4 else "")
    row.setdefault("salary_usd", 285)
    row.setdefault("transport_allowance_usd", 20)
    row.setdefault("medical_allowance_usd", 10)
    row.setdefault("leave_balance_days", 14)
    for key in HR_INT_KEYS:
        row[key] = _as_int(row.get(key), 0)
    return row


def _seed_rows() -> list[dict]:
    hashed = hash_password(SEED_PASSWORD)
    now = utc_now()
    rows = []
    for person in SEED_PEOPLE:
        row = {
            "id": person["cms_id"].lower().replace("-", ""),
            "cms_id": person["cms_id"],
            "name": person["name"],
            "email": person["email"],
            "phone": person["phone"],
            "role": person["role"],
            "desk": person["desk"],
            "status": "active",
            "password_hash": hashed,
            "pay_cycle": "monthly",
            "employment_type": "full_time",
            "created_at": now,
        }
        row.update({k: person[k] for k in person if k not in ("cms_id", "name", "email", "phone", "role", "desk")})
        rows.append(_employment_defaults(row))
    return rows


def _backfill_seed_hr(row: dict) -> dict:
    """Fill missing HR fields on the original seed roster without touching allotted staff."""
    seed = SEED_HR.get(row.get("cms_id") or "")
    if not seed:
        return row
    # Original seed files had empty joined_on / bank_last4. Newly allotted IDs always have joined_on.
    if row.get("joined_on"):
        for key in ("office", "grade", "reports_to", "cnic_last4", "emergency_phone"):
            if not row.get(key) and seed.get(key):
                row[key] = seed[key]
        return row
    for key, value in seed.items():
        if key in ("cms_id", "name", "email", "phone", "role", "desk"):
            continue
        row[key] = value
    return row


def normalize_cms_id(value: str) -> str:
    raw = (value or "").strip().upper()
    return re.sub(r"\s+", "", raw)


def normalize_phone(value: str) -> str:
    from phone import canonicalize

    return canonicalize(value)


def phones_match(stored: str, given: str) -> bool:
    from phone import phones_match as match

    return match(stored, given)


def looks_like_email(value: str) -> bool:
    return "@" in (value or "")


def public_staff(row: dict | None) -> dict | None:
    if not row:
        return None
    out = dict(row)
    out.pop("password_hash", None)
    out["has_password"] = bool(row.get("password_hash"))
    out["must_change_password"] = bool(row.get("must_change_password"))
    out["role_label"] = ROLE_LABELS.get(row.get("role") or "", row.get("role") or "")
    out["desk_label"] = DESK_LABELS.get(row.get("desk") or "", row.get("desk") or "")
    out["grade"] = row.get("grade") or GRADE_FROM_ROLE.get(row.get("role") or "", out["role_label"])
    for key in HR_INT_KEYS:
        out[key] = _as_int(row.get(key), 0)
    out["gross_usd"] = out["salary_usd"] + out["transport_allowance_usd"] + out["medical_allowance_usd"]
    return out


def next_cms_id(rows: list[dict] | None = None) -> str:
    rows = rows if rows is not None else load_staff()
    best = 2400
    for row in rows:
        digits = "".join(ch for ch in str(row.get("cms_id") or "") if ch.isdigit())
        if digits:
            best = max(best, int(digits))
    return f"ER-CMS-{best + 1}"


def load_staff() -> list[dict]:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    if not STAFF_PATH.exists():
        rows = _seed_rows()
        STAFF_PATH.write_text(json.dumps(rows, indent=2), encoding="utf-8")
        return rows
    try:
        rows = json.loads(STAFF_PATH.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        rows = []
    if not isinstance(rows, list) or not rows:
        rows = _seed_rows()
        STAFF_PATH.write_text(json.dumps(rows, indent=2), encoding="utf-8")
        return rows
    changed = False
    out = []
    for row in rows:
        before = json.dumps(row, sort_keys=True)
        row = _employment_defaults(_backfill_seed_hr(row))
        if json.dumps(row, sort_keys=True) != before:
            changed = True
        out.append(row)
    if changed:
        save_staff(out)
    return out


def save_staff(rows: list[dict]) -> list[dict]:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    STAFF_PATH.write_text(json.dumps(rows, indent=2), encoding="utf-8")
    return rows


def find_by_cms(cms_id: str) -> dict | None:
    needle = normalize_cms_id(cms_id)
    if not needle:
        return None
    for row in load_staff():
        if normalize_cms_id(row.get("cms_id") or "") == needle:
            return row
    return None


def allot_staff(fields: dict) -> dict:
    """Organization allots the next Staff ID and writes the employee's record."""
    from phone import optional_phone, require_phone

    name = str(fields.get("name") or "").strip()
    if not name:
        raise ValueError("Name is required.")
    phone = require_phone(fields.get("phone") or "")
    password = str(fields.get("password") or "").strip()
    if len(password) < 8:
        raise ValueError("Password must be at least 8 characters.")
    email = str(fields.get("email") or "").strip().lower()
    role = fields.get("role") if fields.get("role") in ROLES else "case_officer"
    desk = fields.get("desk") if fields.get("desk") in DESKS else "general"
    # Accept salary_usd; still accept legacy salary_pkr from older clients.
    if "salary_usd" in fields:
        salary = _as_int(fields.get("salary_usd"), 0)
    elif "salary_pkr" in fields:
        salary = max(0, round(_as_int(fields.get("salary_pkr"), 0) / _PKR_PER_USD))
    else:
        salary = 0
    if salary < 0:
        raise ValueError("Salary cannot be negative.")
    rows = load_staff()
    cms_id = normalize_cms_id(fields.get("cms_id") or "") or next_cms_id(rows)
    if looks_like_email(cms_id):
        raise ValueError("Staff ID cannot be an email address.")
    if find_by_cms(cms_id):
        raise ValueError(f"Staff ID {cms_id} is already allotted.")
    if "transport_allowance_usd" in fields:
        transport = _as_int(fields.get("transport_allowance_usd"), 20)
    elif "transport_allowance_pkr" in fields:
        transport = max(0, round(_as_int(fields.get("transport_allowance_pkr"), 0) / _PKR_PER_USD))
    else:
        transport = 20
    if "medical_allowance_usd" in fields:
        medical = _as_int(fields.get("medical_allowance_usd"), 10)
    elif "medical_allowance_pkr" in fields:
        medical = max(0, round(_as_int(fields.get("medical_allowance_pkr"), 0) / _PKR_PER_USD))
    else:
        medical = 10
    row = _employment_defaults(
        {
            "id": cms_id.lower().replace("-", ""),
            "cms_id": cms_id,
            "name": name,
            "email": email,
            "phone": phone,
            "role": role,
            "desk": desk,
            "status": "active",
            "password_hash": hash_password(password),
            "must_change_password": True,
            "salary_usd": salary or 285,
            "transport_allowance_usd": transport,
            "medical_allowance_usd": medical,
            "pay_cycle": "monthly",
            "joined_on": str(fields.get("joined_on") or utc_now()[:10]),
            "employment_type": "full_time",
            "bank_last4": phone[-4:] if len(phone) >= 4 else cms_id[-4:],
            "cnic_last4": str(fields.get("cnic_last4") or "")[-4:] or phone[-4:],
            "emergency_phone": optional_phone(fields.get("emergency_phone") or ""),
            "leave_balance_days": _as_int(fields.get("leave_balance_days"), 14),
            "reports_to": str(fields.get("reports_to") or "Zainab Hussain").strip(),
            "grade": str(fields.get("grade") or GRADE_FROM_ROLE.get(role, "")).strip(),
            "office": str(fields.get("office") or "Islamabad operations").strip(),
            "created_at": utc_now(),
        }
    )
    rows.append(row)
    save_staff(rows)
    return row


def set_staff_password(cms_id: str, password: str, *, require_change: bool = True) -> dict:
    secret = str(password or "").strip()
    if len(secret) < 8:
        raise ValueError("Password must be at least 8 characters.")
    row = find_by_cms(cms_id)
    if not row:
        raise ValueError("Staff ID not found.")
    rows = load_staff()
    needle = normalize_cms_id(cms_id)
    updated = None
    for item in rows:
        if normalize_cms_id(item.get("cms_id") or "") == needle:
            item["password_hash"] = hash_password(secret)
            item["must_change_password"] = bool(require_change)
            updated = item
            break
    if not updated:
        raise ValueError("Staff ID not found.")
    save_staff(rows)
    return updated


def change_staff_password(cms_id: str, current_password: str, new_password: str) -> dict:
    """Staff self-service: prove the current password, then set a new one."""
    current = str(current_password or "").strip()
    secret = str(new_password or "").strip()
    if len(secret) < 8:
        raise ValueError("New password must be at least 8 characters.")
    if current == secret:
        raise ValueError("New password must be different from the current password.")
    row = find_by_cms(cms_id)
    if not row:
        raise ValueError("Staff ID not found.")
    stored = row.get("password_hash") or ""
    if not stored or not verify_password(current, stored):
        raise ValueError("Current password is incorrect.")
    return set_staff_password(cms_id, secret, require_change=False)


def session_for_cms(cms_id: str, password: str = "", phone: str = "") -> tuple[dict | None, str]:
    if looks_like_email(cms_id):
        return None, "Use the Staff ID allotted by the organization, not an email address."
    row = find_by_cms(cms_id)
    if not row:
        return None, "This Staff ID is not allotted. Use an ID from Staff IDs, not the next ID waiting to be allotted."
    secret = (password or "").strip()
    if len(secret) < 8:
        return None, "Staff ID or password is incorrect."
    stored = row.get("password_hash") or ""
    if not stored or not verify_password(secret, stored):
        return None, "Password is incorrect. Set it on Staff IDs, then sign in with that Staff ID."
    expected = row.get("phone") or ""
    given = phone or ""
    if expected and given and not phones_match(expected, given):
        return None, "Phone number does not match this Staff ID."
    if row.get("status") != "active":
        return None, "This staff account is not active."
    return row, ""


def delete_staff(cms_id: str) -> bool:
    needle = normalize_cms_id(cms_id)
    if not needle:
        return False
    rows = load_staff()
    kept = [row for row in rows if normalize_cms_id(row.get("cms_id") or "") != needle]
    if len(kept) == len(rows):
        return False
    save_staff(kept)
    return True
