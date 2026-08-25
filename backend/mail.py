"""Optional SMTP for volunteer invitations. If env is empty, invites still save."""

from __future__ import annotations

import os
import smtplib
from email.message import EmailMessage


def configured() -> bool:
    host = (os.getenv("SMTP_HOST") or "").strip()
    user = (os.getenv("SMTP_USER") or "").strip()
    password = (os.getenv("SMTP_PASSWORD") or "").strip()
    return bool(host and user and password)


def send_invite(*, to_email: str, role_label: str, join_url: str) -> dict:
    if not configured():
        return {"sent": False, "detail": "SMTP is not configured. Invitation is saved; email was not sent."}
    host = os.getenv("SMTP_HOST", "").strip()
    port = int(os.getenv("SMTP_PORT") or "587")
    user = os.getenv("SMTP_USER", "").strip()
    password = os.getenv("SMTP_PASSWORD", "").strip()
    sender = (os.getenv("SMTP_FROM") or user).strip()
    org = (os.getenv("ORG_NAME") or "EarthRelay Response Team").strip()
    msg = EmailMessage()
    msg["Subject"] = f"Invitation to Community Response — {org}"
    msg["From"] = sender
    msg["To"] = to_email
    msg.set_content(
        f"{org} invited you as {role_label}.\n\n"
        f"Open Community Response and sign in with this email:\n{join_url}\n\n"
        "You will only see field tasks assigned to you, not citizen names or phone numbers.\n"
    )
    try:
        with smtplib.SMTP(host, port, timeout=12) as smtp:
            smtp.starttls()
            smtp.login(user, password)
            smtp.send_message(msg)
        return {"sent": True, "detail": "Invitation email sent."}
    except Exception as exc:
        return {"sent": False, "detail": f"Could not send email: {exc}"}
