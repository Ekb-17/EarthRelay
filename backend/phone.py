"""Phone normalize / match for local 0… and international +country forms."""

from __future__ import annotations

import re

# ITU E.164: country code + subscriber, max 15 digits. Some regions use 7+.
MIN_DIGITS = 7
MAX_DIGITS = 15


def digits_only(value: str) -> str:
    return re.sub(r"\D+", "", value or "")


def canonicalize(value: str) -> str:
    """Digits only. Leading 00 (intl access) becomes the country-code form."""
    digits = digits_only(value)
    if digits.startswith("00"):
        digits = digits[2:]
    return digits


def _national_core(digits: str) -> str:
    """Drop a single trunk '0' (e.g. 0300… → 300…)."""
    if digits.startswith("0") and not digits.startswith("00") and len(digits) >= MIN_DIGITS + 1:
        return digits[1:]
    return digits


def phones_match(stored: str, given: str) -> bool:
    """
    True when two phone strings are the same line.
    Accepts 0300… vs +92 300…, 07… vs +44 7…, (555)… vs +1 555…, spaces/dashes.
    """
    left = canonicalize(stored)
    right = canonicalize(given)
    if not left or not right:
        return False
    if left == right:
        return True

    core_l = _national_core(left)
    core_r = _national_core(right)
    if core_l == core_r and len(core_l) >= MIN_DIGITS:
        return True

    # Local trunk 0X… matches international country-code + national number.
    for local, other in ((left, right), (right, left)):
        if local.startswith("0") and not local.startswith("00"):
            core = local[1:]
            extra_len = len(other) - len(core)
            if len(core) >= 9 and extra_len >= 1 and extra_len <= 3 and other.endswith(core):
                return True

    # Country-code prefix: extra 1–3 digits in front of the same national number.
    if len(core_l) >= 9 and len(core_r) >= 9:
        shorter, longer = (core_l, core_r) if len(core_l) <= len(core_r) else (core_r, core_l)
        extra_len = len(longer) - len(shorter)
        if 1 <= extra_len <= 3 and longer.endswith(shorter):
            return True

    return False


def require_phone(value: str) -> str:
    """Validate and return canonical digits for storage. Accepts +country and local 0…."""
    raw = (value or "").strip()
    if not raw:
        raise ValueError("A valid phone number is required.")
    digits = canonicalize(raw)
    if len(digits) < MIN_DIGITS or len(digits) > MAX_DIGITS:
        raise ValueError(
            f"Enter a valid phone number ({MIN_DIGITS}-{MAX_DIGITS} digits). "
            "Local numbers (0...) and international (+country code) are both accepted."
        )
    return digits


def optional_phone(value: str) -> str:
    """Empty stays empty; otherwise same rules as require_phone."""
    raw = (value or "").strip()
    if not raw:
        return ""
    return require_phone(raw)
