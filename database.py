"""
database.py — All DB setup, models, and helper functions.
Supports both SQLite (local dev) and PostgreSQL (production).

SQLite:  default — no config needed, file at data/leads.db
Postgres: set DATABASE_URL=postgresql://user:pass@host:5432/dbname
          Free options: Supabase (500MB free), Railway ($5/mo), Neon (free tier)
"""

import json
import uuid
import os
from datetime import datetime
from pathlib import Path

DATABASE_URL = os.getenv("DATABASE_URL", "")
_USE_PG = bool(DATABASE_URL)

# SQLite path (ignored when using Postgres) — shared, persistent-disk aware.
from config import DB_PATH


# ─── Connection helpers ───────────────────────────────────────────────────────

def get_conn():
    if _USE_PG:
        import psycopg2
        import psycopg2.extras
        conn = psycopg2.connect(DATABASE_URL)
        conn.autocommit = False
        return conn
    else:
        import sqlite3
        conn = sqlite3.connect(DB_PATH)
        conn.row_factory = sqlite3.Row
        return conn


def _ph(n: int = 1) -> str:
    """Return n placeholders: '?' for SQLite, '%s' for Postgres."""
    ph = "%s" if _USE_PG else "?"
    return ", ".join([ph] * n)


def _one(ph: str = "") -> str:
    return "%s" if _USE_PG else "?"


def _rows(cursor) -> list[dict]:
    """Normalize cursor rows to list of dicts for both drivers."""
    if _USE_PG:
        cols = [d[0] for d in cursor.description]
        return [dict(zip(cols, row)) for row in cursor.fetchall()]
    else:
        return [dict(r) for r in cursor.fetchall()]


def _row(cursor) -> dict | None:
    if _USE_PG:
        cols = [d[0] for d in cursor.description]
        row  = cursor.fetchone()
        return dict(zip(cols, row)) if row else None
    else:
        row = cursor.fetchone()
        return dict(row) if row else None


# ─── Schema init ─────────────────────────────────────────────────────────────

_TABLES_SQLITE = """
    CREATE TABLE IF NOT EXISTS raw_leads (
        id              TEXT PRIMARY KEY,
        source          TEXT,
        first_name      TEXT,
        last_name       TEXT,
        title           TEXT,
        company         TEXT,
        domain          TEXT,
        linkedin_url    TEXT,
        country         TEXT,
        employee_count  INTEGER,
        industry        TEXT,
        phone           TEXT,
        pain_point      TEXT,
        contact_hook    TEXT,
        intent_level    TEXT,
        gclid           TEXT,
        raw_json        TEXT,
        fetched_at      TEXT,
        status          TEXT DEFAULT 'raw'
    );
    CREATE TABLE IF NOT EXISTS enriched_leads (
        id              TEXT PRIMARY KEY,
        lead_id         TEXT REFERENCES raw_leads(id),
        email           TEXT,
        email_verified  INTEGER DEFAULT 0,
        company_size    INTEGER,
        industry        TEXT,
        tech_stack      TEXT,
        enriched_at     TEXT
    );
    CREATE TABLE IF NOT EXISTS scored_leads (
        id              TEXT PRIMARY KEY,
        lead_id         TEXT REFERENCES raw_leads(id),
        icp_score       INTEGER,
        intent_level    TEXT,
        offering_match  TEXT,
        score_reason    TEXT,
        scored_at       TEXT
    );
    CREATE TABLE IF NOT EXISTS outreach_log (
        id              TEXT PRIMARY KEY,
        lead_id         TEXT REFERENCES raw_leads(id),
        email_subject   TEXT,
        email_body      TEXT,
        sent_at         TEXT,
        provider_id     TEXT
    );
    CREATE TABLE IF NOT EXISTS replies (
        id              TEXT PRIMARY KEY,
        lead_id         TEXT REFERENCES raw_leads(id),
        reply_text      TEXT,
        classification  TEXT,
        received_at     TEXT
    );
    CREATE TABLE IF NOT EXISTS ads_audiences (
        id              TEXT PRIMARY KEY,
        lead_id         TEXT REFERENCES raw_leads(id),
        email_hash      TEXT,
        uploaded_at     TEXT,
        upload_status   TEXT DEFAULT 'pending',
        list_resource   TEXT
    );
    CREATE TABLE IF NOT EXISTS apollo_raw (
        id              TEXT PRIMARY KEY,
        raw_json        TEXT,
        fetched_at      TEXT,
        processed       INTEGER DEFAULT 0
    );
"""

_TABLES_PG = """
    CREATE TABLE IF NOT EXISTS raw_leads (
        id              TEXT PRIMARY KEY,
        source          TEXT,
        first_name      TEXT,
        last_name       TEXT,
        title           TEXT,
        company         TEXT,
        domain          TEXT,
        linkedin_url    TEXT,
        country         TEXT,
        employee_count  INTEGER,
        industry        TEXT,
        phone           TEXT,
        pain_point      TEXT,
        contact_hook    TEXT,
        intent_level    TEXT,
        gclid           TEXT,
        raw_json        TEXT,
        fetched_at      TEXT,
        status          TEXT DEFAULT 'raw'
    );
    CREATE TABLE IF NOT EXISTS enriched_leads (
        id              TEXT PRIMARY KEY,
        lead_id         TEXT REFERENCES raw_leads(id),
        email           TEXT,
        email_verified  INTEGER DEFAULT 0,
        company_size    INTEGER,
        industry        TEXT,
        tech_stack      TEXT,
        enriched_at     TEXT
    );
    CREATE TABLE IF NOT EXISTS scored_leads (
        id              TEXT PRIMARY KEY,
        lead_id         TEXT REFERENCES raw_leads(id),
        icp_score       INTEGER,
        intent_level    TEXT,
        offering_match  TEXT,
        score_reason    TEXT,
        scored_at       TEXT
    );
    CREATE TABLE IF NOT EXISTS outreach_log (
        id              TEXT PRIMARY KEY,
        lead_id         TEXT REFERENCES raw_leads(id),
        email_subject   TEXT,
        email_body      TEXT,
        sent_at         TEXT,
        provider_id     TEXT
    );
    CREATE TABLE IF NOT EXISTS replies (
        id              TEXT PRIMARY KEY,
        lead_id         TEXT REFERENCES raw_leads(id),
        reply_text      TEXT,
        classification  TEXT,
        received_at     TEXT
    );
    CREATE TABLE IF NOT EXISTS ads_audiences (
        id              TEXT PRIMARY KEY,
        lead_id         TEXT REFERENCES raw_leads(id),
        email_hash      TEXT,
        uploaded_at     TEXT,
        upload_status   TEXT DEFAULT 'pending',
        list_resource   TEXT
    );
    CREATE TABLE IF NOT EXISTS apollo_raw (
        id              TEXT PRIMARY KEY,
        raw_json        TEXT,
        fetched_at      TEXT,
        processed       INTEGER DEFAULT 0
    );
"""


def init_db():
    """Create all tables on first run. Safe to call repeatedly."""
    if not _USE_PG:
        DB_PATH.parent.mkdir(exist_ok=True)

    conn = get_conn()
    cur  = conn.cursor()

    if _USE_PG:
        for stmt in [s.strip() for s in _TABLES_PG.split(";") if s.strip()]:
            cur.execute(stmt)
        # Add phone column if migrating from older schema
        try:
            cur.execute("ALTER TABLE raw_leads ADD COLUMN IF NOT EXISTS phone TEXT")
        except Exception:
            pass
    else:
        import sqlite3 as _sq
        conn.executescript(_TABLES_SQLITE)
        try:
            conn.execute("ALTER TABLE raw_leads ADD COLUMN phone TEXT")
        except Exception:
            pass

    conn.commit()
    conn.close()
    print(f"Database initialized ({'PostgreSQL' if _USE_PG else 'SQLite'})")


# ─── RAW LEADS ───────────────────────────────────────────────────────────────

def save_raw_lead(lead: dict) -> bool:
    """
    Save a lead. Returns True if inserted, False if duplicate.
    Dedup: Apollo ID (primary key) → domain+first_name → LinkedIn URL.
    """
    conn = get_conn()
    cur  = conn.cursor()
    ph   = "%s" if _USE_PG else "?"

    domain   = (lead.get("domain") or "").strip().lower()
    first    = (lead.get("first_name") or "").strip().lower()
    linkedin = (lead.get("linkedin_url") or "").strip()

    # Cross-source dedup checks
    if domain and first:
        cur.execute(f"SELECT id FROM raw_leads WHERE LOWER(domain)={ph} AND LOWER(first_name)={ph} LIMIT 1",
                    (domain, first))
        if cur.fetchone():
            conn.close(); return False

    if linkedin:
        cur.execute(f"SELECT id FROM raw_leads WHERE linkedin_url={ph} LIMIT 1", (linkedin,))
        if cur.fetchone():
            conn.close(); return False

    cols = "(id, source, first_name, last_name, title, company, domain, linkedin_url, country, employee_count, industry, phone, pain_point, contact_hook, intent_level, gclid, raw_json, fetched_at, status)"
    vals = (
        lead["id"],
        lead.get("source", "apollo"),
        lead.get("first_name", ""),
        lead.get("last_name", ""),
        lead.get("title", ""),
        lead.get("company", ""),
        lead.get("domain", ""),
        lead.get("linkedin_url", ""),
        lead.get("country", ""),
        lead.get("employee_count"),
        lead.get("industry", ""),
        lead.get("phone", ""),
        lead.get("pain_point", ""),
        lead.get("contact_hook", ""),
        lead.get("intent_level", ""),
        lead.get("gclid", ""),
        json.dumps(lead),
        datetime.utcnow().isoformat(),
        "raw",
    )

    if _USE_PG:
        placeholders = ", ".join(["%s"] * len(vals))
        cur.execute(f"INSERT INTO raw_leads {cols} VALUES ({placeholders}) ON CONFLICT (id) DO NOTHING", vals)
    else:
        placeholders = ", ".join(["?"] * len(vals))
        cur.execute(f"INSERT OR IGNORE INTO raw_leads {cols} VALUES ({placeholders})", vals)

    conn.commit()
    conn.close()
    return True


def get_leads_to_enrich(limit: int = 50) -> list[dict]:
    ph = "%s" if _USE_PG else "?"
    conn = get_conn(); cur = conn.cursor()
    cur.execute(f"""
        SELECT * FROM raw_leads
        WHERE status = 'raw'
        AND (intent_level != 'none' OR intent_level IS NULL OR intent_level = '')
        LIMIT {ph}
    """, (limit,))
    rows = _rows(cur); conn.close(); return rows


def get_leads_to_score(limit: int = 50) -> list[dict]:
    ph = "%s" if _USE_PG else "?"
    conn = get_conn(); cur = conn.cursor()
    cur.execute(f"""
        SELECT r.*, e.email, e.company_size, e.industry, e.tech_stack
        FROM raw_leads r
        JOIN enriched_leads e ON e.lead_id = r.id
        WHERE r.status = 'enriched'
        LIMIT {ph}
    """, (limit,))
    rows = _rows(cur); conn.close(); return rows


def get_leads_to_send(limit: int = 20) -> list[dict]:
    ph = "%s" if _USE_PG else "?"
    conn = get_conn(); cur = conn.cursor()
    cur.execute(f"""
        SELECT r.*, e.email, e.company_size, e.industry, e.tech_stack,
               s.icp_score, s.intent_level, s.offering_match
        FROM raw_leads r
        JOIN enriched_leads e ON e.lead_id = r.id
        JOIN scored_leads s ON s.lead_id = r.id
        WHERE r.status = 'queued'
        AND e.email IS NOT NULL AND e.email_verified = 1
        LIMIT {ph}
    """, (limit,))
    rows = _rows(cur); conn.close(); return rows


def get_leads_for_customer_match(min_score: int = 70, limit: int = 500) -> list[dict]:
    ph = "%s" if _USE_PG else "?"
    conn = get_conn(); cur = conn.cursor()
    cur.execute(f"""
        SELECT r.id, e.email, s.icp_score
        FROM raw_leads r
        JOIN enriched_leads e ON e.lead_id = r.id
        JOIN scored_leads s ON s.lead_id = r.id
        WHERE s.icp_score >= {ph}
        AND e.email IS NOT NULL AND e.email_verified = 1
        AND r.id NOT IN (SELECT lead_id FROM ads_audiences)
        LIMIT {ph}
    """, (min_score, limit))
    rows = _rows(cur); conn.close(); return rows


# ─── ENRICHED LEADS ──────────────────────────────────────────────────────────

def save_enriched(lead_id: str, data: dict):
    ph   = "%s" if _USE_PG else "?"
    conn = get_conn(); cur = conn.cursor()
    vals = (
        f"enr_{lead_id}", lead_id,
        data.get("email"),
        int(data.get("email_verified", False)),
        data.get("company_size"),
        data.get("industry"),
        json.dumps(data.get("tech_stack", [])),
        datetime.utcnow().isoformat(),
    )
    if _USE_PG:
        cur.execute("""
            INSERT INTO enriched_leads (id, lead_id, email, email_verified, company_size, industry, tech_stack, enriched_at)
            VALUES (%s,%s,%s,%s,%s,%s,%s,%s)
            ON CONFLICT (id) DO UPDATE SET
              email=EXCLUDED.email, email_verified=EXCLUDED.email_verified,
              company_size=EXCLUDED.company_size, industry=EXCLUDED.industry,
              tech_stack=EXCLUDED.tech_stack, enriched_at=EXCLUDED.enriched_at
        """, vals)
        cur.execute("UPDATE raw_leads SET status='enriched' WHERE id=%s", (lead_id,))
    else:
        cur.execute("""
            INSERT OR REPLACE INTO enriched_leads
            (id, lead_id, email, email_verified, company_size, industry, tech_stack, enriched_at)
            VALUES (?,?,?,?,?,?,?,?)
        """, vals)
        cur.execute("UPDATE raw_leads SET status='enriched' WHERE id=?", (lead_id,))
    conn.commit(); conn.close()


# ─── SCORED LEADS ────────────────────────────────────────────────────────────

def save_score(lead_id: str, score: dict):
    from config import MIN_ICP_SCORE
    ph   = "%s" if _USE_PG else "?"
    conn = get_conn(); cur = conn.cursor()
    vals = (
        f"sc_{lead_id}", lead_id,
        score.get("icp_score"),
        score.get("intent_level"),
        score.get("offering_match"),
        score.get("reason"),
        datetime.utcnow().isoformat(),
    )
    status = "queued" if score.get("icp_score", 0) >= MIN_ICP_SCORE else "scored"

    if _USE_PG:
        cur.execute("""
            INSERT INTO scored_leads (id, lead_id, icp_score, intent_level, offering_match, score_reason, scored_at)
            VALUES (%s,%s,%s,%s,%s,%s,%s)
            ON CONFLICT (id) DO UPDATE SET
              icp_score=EXCLUDED.icp_score, intent_level=EXCLUDED.intent_level,
              offering_match=EXCLUDED.offering_match, score_reason=EXCLUDED.score_reason,
              scored_at=EXCLUDED.scored_at
        """, vals)
        cur.execute("UPDATE raw_leads SET status=%s WHERE id=%s", (status, lead_id))
    else:
        cur.execute("""
            INSERT OR REPLACE INTO scored_leads
            (id, lead_id, icp_score, intent_level, offering_match, score_reason, scored_at)
            VALUES (?,?,?,?,?,?,?)
        """, vals)
        cur.execute("UPDATE raw_leads SET status=? WHERE id=?", (status, lead_id))

    conn.commit(); conn.close()


# ─── OUTREACH LOG ─────────────────────────────────────────────────────────────

def save_outreach(lead_id: str, subject: str, body: str, provider_id: str = None):
    ph   = "%s" if _USE_PG else "?"
    conn = get_conn(); cur = conn.cursor()
    vals = (str(uuid.uuid4()), lead_id, subject, body, datetime.utcnow().isoformat(), provider_id)
    if _USE_PG:
        cur.execute("INSERT INTO outreach_log (id,lead_id,email_subject,email_body,sent_at,provider_id) VALUES (%s,%s,%s,%s,%s,%s)", vals)
        cur.execute("UPDATE raw_leads SET status='sent' WHERE id=%s", (lead_id,))
    else:
        cur.execute("INSERT INTO outreach_log (id,lead_id,email_subject,email_body,sent_at,provider_id) VALUES (?,?,?,?,?,?)", vals)
        cur.execute("UPDATE raw_leads SET status='sent' WHERE id=?", (lead_id,))
    conn.commit(); conn.close()


# ─── REPLIES ──────────────────────────────────────────────────────────────────

def save_reply(lead_id: str, reply_text: str, classification: str):
    ph   = "%s" if _USE_PG else "?"
    conn = get_conn(); cur = conn.cursor()
    vals = (str(uuid.uuid4()), lead_id, reply_text, classification, datetime.utcnow().isoformat())
    if _USE_PG:
        cur.execute("INSERT INTO replies (id,lead_id,reply_text,classification,received_at) VALUES (%s,%s,%s,%s,%s)", vals)
        cur.execute("UPDATE raw_leads SET status='replied' WHERE id=%s", (lead_id,))
    else:
        cur.execute("INSERT INTO replies (id,lead_id,reply_text,classification,received_at) VALUES (?,?,?,?,?)", vals)
        cur.execute("UPDATE raw_leads SET status='replied' WHERE id=?", (lead_id,))
    conn.commit(); conn.close()


def get_lead_by_email(email: str) -> dict | None:
    ph   = "%s" if _USE_PG else "?"
    conn = get_conn(); cur = conn.cursor()
    cur.execute(f"""
        SELECT r.* FROM raw_leads r
        JOIN enriched_leads e ON e.lead_id = r.id
        WHERE e.email = {ph} LIMIT 1
    """, (email,))
    row = _row(cur); conn.close(); return row


# ─── ADS AUDIENCES ───────────────────────────────────────────────────────────

def save_ads_audience_entry(lead_id: str, email_hash: str, list_resource: str):
    ph   = "%s" if _USE_PG else "?"
    conn = get_conn(); cur = conn.cursor()
    vals = (str(uuid.uuid4()), lead_id, email_hash, datetime.utcnow().isoformat(), "uploaded", list_resource)
    if _USE_PG:
        cur.execute("INSERT INTO ads_audiences (id,lead_id,email_hash,uploaded_at,upload_status,list_resource) VALUES (%s,%s,%s,%s,%s,%s) ON CONFLICT (id) DO NOTHING", vals)
    else:
        cur.execute("INSERT OR IGNORE INTO ads_audiences (id,lead_id,email_hash,uploaded_at,upload_status,list_resource) VALUES (?,?,?,?,?,?)", vals)
    conn.commit(); conn.close()


def mark_ads_audience_failed(lead_id: str):
    ph   = "%s" if _USE_PG else "?"
    conn = get_conn(); cur = conn.cursor()
    vals = (str(uuid.uuid4()), lead_id, "", datetime.utcnow().isoformat(), "failed")
    if _USE_PG:
        cur.execute("INSERT INTO ads_audiences (id,lead_id,email_hash,uploaded_at,upload_status) VALUES (%s,%s,%s,%s,%s) ON CONFLICT (id) DO NOTHING", vals)
    else:
        cur.execute("INSERT OR IGNORE INTO ads_audiences (id,lead_id,email_hash,uploaded_at,upload_status) VALUES (?,?,?,?,?)", vals)
    conn.commit(); conn.close()


# ─── STATS ────────────────────────────────────────────────────────────────────

def get_stats() -> dict:
    ph   = "%s" if _USE_PG else "?"
    conn = get_conn(); cur = conn.cursor(); stats = {}

    for status in ["raw", "enriched", "scored", "queued", "sent", "replied"]:
        cur.execute(f"SELECT COUNT(*) FROM raw_leads WHERE status={ph}", (status,))
        row = cur.fetchone()
        stats[status] = row[0] if row else 0

    cur.execute("SELECT classification, COUNT(*) FROM replies GROUP BY classification")
    stats["replies"] = {r[0]: r[1] for r in cur.fetchall()}

    cur.execute("SELECT COUNT(*) FROM ads_audiences WHERE upload_status='uploaded'")
    row = cur.fetchone()
    stats["customer_match_uploaded"] = row[0] if row else 0

    conn.close()
    return stats
