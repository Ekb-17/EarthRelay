"""Sync cases to Supabase so the inbox is not only JSON on this laptop.

Prefers a direct Postgres URI (SUPABASE_SECRET_KEY). On Windows that host is
often IPv6-only, so HTTPS REST with SUPABASE_URL + publishable key is the
fallback. Local JSON/photos stay as a cache; filing still works if cloud is down.
"""

from __future__ import annotations

import json
import os
import re
import time
import urllib.error
import urllib.request
from pathlib import Path
from urllib.parse import urlparse

UPLOAD_DIR = Path(__file__).resolve().parent / "data" / "uploads"
CASES_DIR = Path(__file__).resolve().parent / "data" / "cases"
PHOTO_CAP = 4_500_000
_last_pull = 0.0
PULL_EVERY = 12.0

SCHEMA_SQL = """
CREATE TABLE IF NOT EXISTS earthrelay_cases (
  id text PRIMARY KEY,
  display_id text,
  title text,
  incident_type text,
  status text,
  priority text,
  lat double precision,
  lng double precision,
  address text,
  payload jsonb NOT NULL,
  original_jpg bytea,
  annotated_jpg bytea,
  created_at timestamptz,
  updated_at timestamptz
);
"""


def _params() -> dict | None:
    raw = (os.getenv("SUPABASE_SECRET_KEY") or os.getenv("DATABASE_URL") or "").strip().strip('"').strip("'")
    if not raw.startswith("postgres"):
        return None
    rest = re.sub(r"^postgres(?:ql)?://", "", raw, count=1)
    rest, _, _query = rest.partition("?")
    host_idx = max(rest.rfind("@[db."), rest.rfind("@db."))
    if host_idx < 0:
        host_idx = rest.rfind("@")
    if host_idx < 0:
        return None
    userinfo = rest[:host_idx]
    hostpart = rest[host_idx + 1 :]
    if hostpart.startswith("["):
        end = hostpart.find("]")
        if end > 0:
            hostpart = hostpart[1:end] + hostpart[end + 1 :]
    user, _, password = userinfo.partition(":")
    hostport, _, dbpath = hostpart.partition("/")
    port = 5432
    host = hostport
    if ":" in hostport:
        host, port_s = hostport.rsplit(":", 1)
        if port_s.isdigit():
            port = int(port_s)
    dbname = (dbpath.split("/")[0] or "postgres").split("?")[0]
    if not host or not user:
        return None
    return {
        "host": host,
        "port": port,
        "user": user,
        "password": password,
        "dbname": dbname,
        "sslmode": "require",
        "connect_timeout": 8,
    }


def _rest_conf() -> tuple[str, str]:
    url = (os.getenv("SUPABASE_URL") or "").strip().rstrip("/")
    key = (os.getenv("SUPABASE_PUBLISHABLE_KEY") or "").strip()
    if url.startswith("http") and key:
        return url, key
    return "", ""


def configured() -> bool:
    return _params() is not None or bool(_rest_conf()[0])


def project_host() -> str:
    url = (os.getenv("SUPABASE_URL") or "").strip()
    if not url:
        return ""
    return urlparse(url).hostname or ""


def _connect():
    params = _params()
    if not params:
        return None
    try:
        import psycopg

        return psycopg.connect(**params)
    except Exception:
        return None


def _ensure(conn) -> None:
    with conn.cursor() as cur:
        cur.execute(SCHEMA_SQL)
    conn.commit()


def _photo_bytes(path: Path) -> bytes | None:
    if not path.exists() or not path.is_file():
        return None
    data = path.read_bytes()
    if not data or len(data) > PHOTO_CAP:
        return None
    return data


def _write_photo(path: Path, data) -> None:
    if not data:
        return
    blob = bytes(data)
    if not blob:
        return
    path.parent.mkdir(parents=True, exist_ok=True)
    if path.exists() and path.stat().st_size == len(blob):
        return
    path.write_bytes(blob)


def _row(case: dict) -> dict:
    return {
        "id": str(case.get("id") or ""),
        "display_id": case.get("display_id"),
        "title": case.get("title"),
        "incident_type": case.get("incident_type"),
        "status": case.get("status"),
        "priority": case.get("priority"),
        "lat": case.get("lat"),
        "lng": case.get("lng"),
        "address": case.get("address"),
        "payload": case,
        "created_at": case.get("created_at"),
        "updated_at": case.get("updated_at"),
    }


def _rest(method: str, path: str, body: dict | None = None, extra: dict | None = None):
    base, key = _rest_conf()
    if not base:
        raise RuntimeError("rest off")
    headers = {
        "apikey": key,
        "Authorization": f"Bearer {key}",
        "Content-Type": "application/json",
        "Accept": "application/json",
    }
    if extra:
        headers.update(extra)
    data = None if body is None else json.dumps(body, default=str).encode("utf-8")
    req = urllib.request.Request(base + path, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=12) as resp:
            raw = resp.read()
            if not raw:
                return []
            return json.loads(raw.decode("utf-8"))
    except urllib.error.HTTPError as exc:
        exc.read()
        raise RuntimeError(f"http {exc.code}") from exc


def _push_postgres(case: dict) -> bool:
    cid = str(case["id"])
    orig = _photo_bytes(UPLOAD_DIR / f"{cid}_original.jpg")
    anno = _photo_bytes(UPLOAD_DIR / f"{cid}_annotated.jpg")
    conn = _connect()
    if conn is None:
        return False
    try:
        _ensure(conn)
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO earthrelay_cases (
                  id, display_id, title, incident_type, status, priority,
                  lat, lng, address, payload, original_jpg, annotated_jpg,
                  created_at, updated_at
                ) VALUES (
                  %(id)s, %(display_id)s, %(title)s, %(incident_type)s, %(status)s, %(priority)s,
                  %(lat)s, %(lng)s, %(address)s, %(payload)s::jsonb, %(original_jpg)s, %(annotated_jpg)s,
                  %(created_at)s, %(updated_at)s
                )
                ON CONFLICT (id) DO UPDATE SET
                  display_id = EXCLUDED.display_id,
                  title = EXCLUDED.title,
                  incident_type = EXCLUDED.incident_type,
                  status = EXCLUDED.status,
                  priority = EXCLUDED.priority,
                  lat = EXCLUDED.lat,
                  lng = EXCLUDED.lng,
                  address = EXCLUDED.address,
                  payload = EXCLUDED.payload,
                  original_jpg = COALESCE(EXCLUDED.original_jpg, earthrelay_cases.original_jpg),
                  annotated_jpg = COALESCE(EXCLUDED.annotated_jpg, earthrelay_cases.annotated_jpg),
                  updated_at = EXCLUDED.updated_at
                """,
                {
                    "id": cid,
                    "display_id": case.get("display_id"),
                    "title": case.get("title"),
                    "incident_type": case.get("incident_type"),
                    "status": case.get("status"),
                    "priority": case.get("priority"),
                    "lat": case.get("lat"),
                    "lng": case.get("lng"),
                    "address": case.get("address"),
                    "payload": json.dumps(case, default=str),
                    "original_jpg": orig,
                    "annotated_jpg": anno,
                    "created_at": case.get("created_at"),
                    "updated_at": case.get("updated_at"),
                },
            )
        conn.commit()
        return True
    finally:
        conn.close()


def _push_rest(case: dict) -> bool:
    if not _rest_conf()[0]:
        return False
    _rest(
        "POST",
        "/rest/v1/earthrelay_cases?on_conflict=id",
        _row(case),
        {"Prefer": "resolution=merge-duplicates,return=minimal"},
    )
    return True


def push_case(case: dict) -> bool:
    if not configured() or not case.get("id"):
        return False
    if _push_postgres(case):
        return True
    return _push_rest(case)


def _materialize(cid: str, payload, original=None, annotated=None) -> dict:
    CASES_DIR.mkdir(parents=True, exist_ok=True)
    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    case = payload if isinstance(payload, dict) else json.loads(payload)
    case["id"] = cid
    (CASES_DIR / f"{cid}.json").write_text(json.dumps(case, indent=2, default=str), encoding="utf-8")
    _write_photo(UPLOAD_DIR / f"{cid}_original.jpg", original)
    _write_photo(UPLOAD_DIR / f"{cid}_annotated.jpg", annotated)
    return case


def _pull_postgres() -> int | None:
    conn = _connect()
    if conn is None:
        return None
    try:
        _ensure(conn)
        with conn.cursor() as cur:
            cur.execute("SELECT id, payload FROM earthrelay_cases")
            rows = cur.fetchall()
            n = 0
            missing = []
            for cid, payload in rows:
                cid = str(cid)
                orig_path = UPLOAD_DIR / f"{cid}_original.jpg"
                _materialize(cid, payload)
                n += 1
                if not orig_path.exists():
                    missing.append(cid)
            if missing:
                cur.execute(
                    "SELECT id, original_jpg, annotated_jpg FROM earthrelay_cases WHERE id = ANY(%s)",
                    (missing,),
                )
                for cid, original, annotated in cur.fetchall():
                    cid = str(cid)
                    _write_photo(UPLOAD_DIR / f"{cid}_original.jpg", original)
                    _write_photo(UPLOAD_DIR / f"{cid}_annotated.jpg", annotated)
        return n
    finally:
        conn.close()


def _pull_rest() -> int:
    rows = _rest("GET", "/rest/v1/earthrelay_cases?select=id,payload")
    n = 0
    for row in rows or []:
        cid = str(row.get("id") or "")
        if not cid:
            continue
        _materialize(cid, row.get("payload") or row)
        n += 1
    return n


def pull_cases() -> int:
    global _last_pull
    if not configured():
        return 0
    now = time.monotonic()
    if _last_pull and now - _last_pull < PULL_EVERY:
        return 0
    n = _pull_postgres()
    if n is None:
        n = _pull_rest()
    _last_pull = now
    return n or 0


def pull_one(case_id: str) -> dict | None:
    if not configured() or not case_id:
        return None
    conn = _connect()
    if conn is not None:
        try:
            _ensure(conn)
            with conn.cursor() as cur:
                cur.execute(
                    "SELECT id, payload, original_jpg, annotated_jpg FROM earthrelay_cases WHERE id = %s",
                    (case_id,),
                )
                row = cur.fetchone()
            if not row:
                return None
            cid, payload, original, annotated = row
            return _materialize(str(cid), payload, original, annotated)
        finally:
            conn.close()
    rows = _rest("GET", f"/rest/v1/earthrelay_cases?id=eq.{case_id}&select=id,payload")
    if not rows:
        return None
    row = rows[0]
    return _materialize(str(row["id"]), row.get("payload") or row)


def supabase_status() -> dict:
    host = project_host()
    if not configured():
        return {"ok": False, "inbox": "local", "detail": "No Supabase URL in .env"}
    try:
        conn = _connect()
        if conn is not None:
            try:
                _ensure(conn)
                with conn.cursor() as cur:
                    cur.execute("SELECT count(*) FROM earthrelay_cases")
                    count = int(cur.fetchone()[0])
            finally:
                conn.close()
            return {"ok": True, "inbox": "supabase", "via": "postgres", "project": host, "cases": count}
        rows = _rest("GET", "/rest/v1/earthrelay_cases?select=id")
        return {
            "ok": True,
            "inbox": "supabase",
            "via": "rest",
            "project": host,
            "cases": len(rows or []),
        }
    except Exception as exc:
        hint = "Could not reach Supabase."
        code = str(exc)
        if "http 404" in code or "http 406" in code:
            hint = "Run backend/supabase_schema.sql in the Supabase SQL editor once."
        elif "http 401" in code or "http 403" in code:
            hint = "Supabase publishable key was rejected."
        else:
            ref = (host or "").split(".")[0]
            if ref:
                hint = (
                    "Supabase is unreachable. Free-tier projects pause after inactivity — "
                    f"restore at https://supabase.com/dashboard/project/{ref}"
                )
        return {"ok": False, "inbox": "local", "project": host, "detail": hint}
