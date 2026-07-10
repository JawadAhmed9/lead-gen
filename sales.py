"""
sales.py — Sales-team operations layer (additive, self-contained).

Adds on top of the existing pipeline, without touching collect/enrich/score:
  • Persistent users with roles (admin / manager / agent / viewer) and teams
    (each agent belongs to a manager).
  • Lead assignment (manager -> agent) via new columns on raw_leads.
  • Activity tracking (calls, emails, replies, notes, deals) in lead_activities.
  • Weighted, points-based performance / leaderboard computed live.
  • Brevo email sending (ready-but-inactive until a key is set in .env).

All schema changes are idempotent: CREATE TABLE IF NOT EXISTS + guarded ALTERs.
Nothing is dropped or rewritten.
"""

from __future__ import annotations
import sqlite3, uuid, hashlib, secrets, json, os
from datetime import datetime
from pathlib import Path

DB_PATH = Path(__file__).parent / "data" / "leads.db"
EVAL_SETTINGS_FILE = Path(__file__).parent / "eval_settings.json"

ROLES = ("admin", "manager", "agent", "viewer")

# ─── SEEDED USERS (the persistent roster) ─────────────────────────────────────
# These accounts are recreated on every startup, so they survive the free tier's
# filesystem resets. This is the ONE place to manage who can log in.
#   role:    admin | manager | agent | viewer
#   manager: (agents only) the email of the manager whose team they belong to
# Change passwords before sharing widely.
SEED_USERS = [
    {"name": "Admin User",    "email": "admin@company.com",   "password": "admin123",   "role": "admin"},
    {"name": "Sales Manager", "email": "manager@company.com", "password": "manager123", "role": "manager"},
    {"name": "Analyst",       "email": "viewer@company.com",  "password": "viewer123",  "role": "viewer"},
    {"name": "Sarah (Agent)", "email": "agent@company.com",   "password": "agent123",   "role": "agent", "manager": "manager@company.com"},
    {"name": "Omar (Agent)",  "email": "agent2@company.com",  "password": "agent123",   "role": "agent", "manager": "manager@company.com"},

    # ─── Stemronic team (real accounts) ───
    {"name": "Jawad Ahmed Khan",   "email": "jawad@stemronic.com",  "password": "stemronic432", "role": "admin"},
    {"name": "Muhammad Asad Khan", "email": "khan@stemronic.com",   "password": "stemronic432", "role": "admin"},
    {"name": "Mohsin Rafiq",       "email": "mohsin@stemronic.com", "password": "stemronic432", "role": "admin"},
]

# On a fresh database, auto-assign this many leads to each agent so they have
# real, workable leads to test with immediately (0 disables auto-assignment).
LEADS_PER_AGENT_ON_SEED = 25

# Default point weights — editable in-app by managers/admins.
DEFAULT_WEIGHTS = {
    "deal_won":     100,   # points per deal marked won
    "revenue_per_1k": 1,   # extra points per $1,000 of won-deal value
    "reply":         15,   # points per reply logged
    "call":           5,   # points per call logged
    "email":          3,   # points per email sent/logged
    "note":           0,   # notes are free
}

ACTIVITY_TYPES = ("call", "email", "reply", "note", "deal")


# ─── Connection ───────────────────────────────────────────────────────────────

def get_conn():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


# ─── Password hashing (stdlib only) ───────────────────────────────────────────

def hash_pw(pw: str) -> str:
    salt = secrets.token_hex(8)
    h = hashlib.sha256((salt + pw).encode()).hexdigest()
    return f"{salt}${h}"

def verify_pw(pw: str, stored: str) -> bool:
    if not stored or "$" not in stored:
        # tolerate a legacy plaintext password (pre-migration)
        return pw == stored
    salt, h = stored.split("$", 1)
    return hashlib.sha256((salt + pw).encode()).hexdigest() == h


# ─── Schema init + seed ───────────────────────────────────────────────────────

def ensure_tables():
    conn = get_conn(); cur = conn.cursor()
    cur.execute("""
        CREATE TABLE IF NOT EXISTS users (
            id          TEXT PRIMARY KEY,
            name        TEXT,
            email       TEXT UNIQUE,
            password    TEXT,
            role        TEXT,
            manager_id  TEXT,
            created_at  TEXT
        )
    """)
    cur.execute("""
        CREATE TABLE IF NOT EXISTS lead_activities (
            id          TEXT PRIMARY KEY,
            lead_id     TEXT,
            agent_id    TEXT,
            type        TEXT,        -- call | email | reply | note | deal
            outcome     TEXT,        -- e.g. connected/voicemail, won/lost, interested
            notes       TEXT,
            duration    INTEGER,     -- seconds (calls)
            value       REAL,        -- deal value (deals)
            created_at  TEXT
        )
    """)
    # Assignment columns on raw_leads (guarded — safe to run repeatedly)
    for col, decl in [("assigned_to", "TEXT"), ("assigned_by", "TEXT"), ("assigned_at", "TEXT")]:
        try:
            cur.execute(f"ALTER TABLE raw_leads ADD COLUMN {col} {decl}")
        except Exception:
            pass
    conn.commit()

    _seed_users(conn)
    _autodistribute_leads(conn)
    conn.close()


def _seed_users(conn):
    """Recreate the SEED_USERS roster if the users table is empty. Runs on every
    startup, so seeded accounts survive filesystem resets."""
    if conn.execute("SELECT COUNT(*) FROM users").fetchone()[0] > 0:
        return
    email_to_id = {u["email"]: f"u_{i+1}" for i, u in enumerate(SEED_USERS)}
    now = datetime.utcnow().isoformat()
    for u in SEED_USERS:
        mgr_id = email_to_id.get(u.get("manager")) if u.get("manager") else None
        conn.execute(
            "INSERT INTO users (id,name,email,password,role,manager_id,created_at) VALUES (?,?,?,?,?,?,?)",
            (email_to_id[u["email"]], u["name"], u["email"], hash_pw(u["password"]),
             u["role"], mgr_id, now),
        )
    conn.commit()
    print(f"[sales] seeded {len(SEED_USERS)} users")


def _autodistribute_leads(conn):
    """On a fresh DB (no assignments yet), hand each agent a slice of workable
    leads so their view isn't empty. Idempotent — skips if anything is assigned."""
    if LEADS_PER_AGENT_ON_SEED <= 0:
        return
    agents = [r[0] for r in conn.execute("SELECT id FROM users WHERE role='agent' ORDER BY name").fetchall()]
    if not agents:
        return
    assigned = conn.execute(
        "SELECT COUNT(*) FROM raw_leads WHERE assigned_to IS NOT NULL AND assigned_to != ''"
    ).fetchone()[0]
    if assigned:
        return
    limit = LEADS_PER_AGENT_ON_SEED * len(agents)
    # Prefer scored, then leads with an email, then most recent.
    rows = [r[0] for r in conn.execute("""
        SELECT r.id FROM raw_leads r
        LEFT JOIN enriched_leads e ON e.lead_id = r.id
        LEFT JOIN scored_leads s ON s.lead_id = r.id
        ORDER BY (s.icp_score IS NOT NULL) DESC, (e.email IS NOT NULL AND e.email != '') DESC, r.fetched_at DESC
        LIMIT ?
    """, (limit,)).fetchall()]
    now = datetime.utcnow().isoformat()
    for i, lid in enumerate(rows):
        conn.execute(
            "UPDATE raw_leads SET assigned_to=?, assigned_by=?, assigned_at=? WHERE id=?",
            (agents[i % len(agents)], "system", now, lid),
        )
    conn.commit()
    if rows:
        print(f"[sales] auto-assigned {len(rows)} leads across {len(agents)} agents")


# ─── User helpers ─────────────────────────────────────────────────────────────

def _pub(row: dict) -> dict:
    """Public user shape (no password)."""
    return {"id": row["id"], "name": row["name"], "email": row["email"],
            "role": row["role"], "manager_id": row["manager_id"]}

def get_user_by_email(email: str) -> dict | None:
    conn = get_conn()
    r = conn.execute("SELECT * FROM users WHERE email=?", (email,)).fetchone()
    conn.close()
    return dict(r) if r else None

def get_user_by_id(uid: str) -> dict | None:
    conn = get_conn()
    r = conn.execute("SELECT * FROM users WHERE id=?", (uid,)).fetchone()
    conn.close()
    return dict(r) if r else None

def list_users(scope_user: dict | None = None) -> list[dict]:
    """Admins see everyone; managers see themselves + their agents; others see self."""
    conn = get_conn()
    rows = [dict(r) for r in conn.execute("SELECT * FROM users ORDER BY role, name").fetchall()]
    conn.close()
    if not scope_user or scope_user["role"] == "admin":
        return [_pub(r) for r in rows]
    if scope_user["role"] == "manager":
        return [_pub(r) for r in rows
                if r["id"] == scope_user["id"] or r["manager_id"] == scope_user["id"]]
    return [_pub(r) for r in rows if r["id"] == scope_user["id"]]

def list_agents(scope_user: dict | None = None) -> list[dict]:
    """Agents visible to this user for leaderboard/metrics.
    admin/viewer: all agents · manager: own team · agent: their teammates."""
    conn = get_conn()
    rows = [dict(r) for r in conn.execute("SELECT * FROM users WHERE role='agent' ORDER BY name").fetchall()]
    conn.close()
    if not scope_user or scope_user["role"] in ("admin", "viewer"):
        return [_pub(r) for r in rows]
    if scope_user["role"] == "manager":
        return [_pub(r) for r in rows if r["manager_id"] == scope_user["id"]]
    if scope_user["role"] == "agent":
        return [_pub(r) for r in rows if r["manager_id"] == scope_user.get("manager_id")]
    return []

def create_user(name, email, password, role, manager_id=None) -> dict:
    if role not in ROLES:
        raise ValueError("invalid role")
    if get_user_by_email(email):
        raise ValueError("user already exists")
    uid = str(uuid.uuid4())
    conn = get_conn()
    conn.execute(
        "INSERT INTO users (id,name,email,password,role,manager_id,created_at) VALUES (?,?,?,?,?,?,?)",
        (uid, name, email, hash_pw(password), role, manager_id, datetime.utcnow().isoformat()),
    )
    conn.commit(); conn.close()
    return {"id": uid, "name": name, "email": email, "role": role, "manager_id": manager_id}

def update_user_role(uid: str, role: str):
    if role not in ROLES:
        raise ValueError("invalid role")
    conn = get_conn()
    conn.execute("UPDATE users SET role=? WHERE id=?", (role, uid))
    conn.commit(); conn.close()

def set_manager(uid: str, manager_id: str | None):
    conn = get_conn()
    conn.execute("UPDATE users SET manager_id=? WHERE id=?", (manager_id, uid))
    conn.commit(); conn.close()

def delete_user(uid: str):
    conn = get_conn()
    conn.execute("DELETE FROM users WHERE id=?", (uid,))
    # orphaned assignments fall back to unassigned
    conn.execute("UPDATE raw_leads SET assigned_to=NULL WHERE assigned_to=?", (uid,))
    conn.commit(); conn.close()


# ─── Assignment ───────────────────────────────────────────────────────────────

def _agent_ids_for(scope_user: dict) -> list[str]:
    """Agent IDs this user is allowed to see metrics/leads for."""
    if scope_user["role"] == "admin":
        return [u["id"] for u in list_agents(None)]
    if scope_user["role"] == "manager":
        return [u["id"] for u in list_agents(scope_user)]
    return [scope_user["id"]]

def assign_lead(lead_id: str, agent_id: str | None, by_user: dict):
    conn = get_conn()
    if agent_id:
        conn.execute(
            "UPDATE raw_leads SET assigned_to=?, assigned_by=?, assigned_at=? WHERE id=?",
            (agent_id, by_user["id"], datetime.utcnow().isoformat(), lead_id),
        )
    else:
        conn.execute("UPDATE raw_leads SET assigned_to=NULL, assigned_by=NULL, assigned_at=NULL WHERE id=?", (lead_id,))
    conn.commit(); conn.close()

def bulk_assign(lead_ids: list[str], agent_id: str, by_user: dict) -> int:
    conn = get_conn(); n = 0
    now = datetime.utcnow().isoformat()
    for lid in lead_ids:
        conn.execute("UPDATE raw_leads SET assigned_to=?, assigned_by=?, assigned_at=? WHERE id=?",
                     (agent_id, by_user["id"], now, lid))
        n += 1
    conn.commit(); conn.close()
    return n


# ─── Activities ───────────────────────────────────────────────────────────────

def add_activity(lead_id, agent_id, type_, outcome="", notes="", duration=None, value=None) -> dict:
    if type_ not in ACTIVITY_TYPES:
        raise ValueError("invalid activity type")
    aid = str(uuid.uuid4()); now = datetime.utcnow().isoformat()
    conn = get_conn()
    conn.execute(
        "INSERT INTO lead_activities (id,lead_id,agent_id,type,outcome,notes,duration,value,created_at) "
        "VALUES (?,?,?,?,?,?,?,?,?)",
        (aid, lead_id, agent_id, type_, outcome, notes, duration, value, now),
    )
    conn.commit(); conn.close()
    return {"id": aid, "lead_id": lead_id, "agent_id": agent_id, "type": type_,
            "outcome": outcome, "notes": notes, "duration": duration, "value": value, "created_at": now}

def list_lead_activities(lead_id: str) -> list[dict]:
    conn = get_conn()
    rows = conn.execute("""
        SELECT a.*, u.name AS agent_name
        FROM lead_activities a LEFT JOIN users u ON u.id = a.agent_id
        WHERE a.lead_id=? ORDER BY a.created_at DESC
    """, (lead_id,)).fetchall()
    conn.close()
    return [dict(r) for r in rows]


# ─── Weights ──────────────────────────────────────────────────────────────────

def get_weights() -> dict:
    if EVAL_SETTINGS_FILE.exists():
        try:
            saved = json.loads(EVAL_SETTINGS_FILE.read_text())
            return {**DEFAULT_WEIGHTS, **saved}
        except Exception:
            pass
    return dict(DEFAULT_WEIGHTS)

def save_weights(new: dict) -> dict:
    w = get_weights()
    for k in DEFAULT_WEIGHTS:
        if k in new and new[k] is not None:
            w[k] = new[k]
    EVAL_SETTINGS_FILE.write_text(json.dumps(w, indent=2))
    return w


# ─── Performance / leaderboard ────────────────────────────────────────────────

def _date_clause(frm, to):
    conds, params = [], []
    if frm:
        conds.append("created_at >= ?"); params.append(frm)
    if to:
        conds.append("created_at <= ?"); params.append(to + "T23:59:59")
    return (" AND " + " AND ".join(conds)) if conds else "", params

def _agent_metrics(conn, agent_id, frm, to) -> dict:
    dc, dp = _date_clause(frm, to)
    def cnt(sql, extra=()):
        return conn.execute(sql, (agent_id, *extra, *dp)).fetchone()[0]
    calls   = cnt(f"SELECT COUNT(*) FROM lead_activities WHERE agent_id=? AND type='call'{dc}")
    emails  = cnt(f"SELECT COUNT(*) FROM lead_activities WHERE agent_id=? AND type='email'{dc}")
    replies = cnt(f"SELECT COUNT(*) FROM lead_activities WHERE agent_id=? AND type='reply'{dc}")
    won     = cnt(f"SELECT COUNT(*) FROM lead_activities WHERE agent_id=? AND type='deal' AND outcome='won'{dc}")
    lost    = cnt(f"SELECT COUNT(*) FROM lead_activities WHERE agent_id=? AND type='deal' AND outcome='lost'{dc}")
    rev_row = conn.execute(
        f"SELECT COALESCE(SUM(value),0) FROM lead_activities WHERE agent_id=? AND type='deal' AND outcome='won'{dc}",
        (agent_id, *dp)).fetchone()
    revenue = float(rev_row[0] or 0)
    assigned = conn.execute("SELECT COUNT(*) FROM raw_leads WHERE assigned_to=?", (agent_id,)).fetchone()[0]
    return {"calls": calls, "emails": emails, "replies": replies,
            "deals_won": won, "deals_lost": lost, "revenue": revenue, "leads_assigned": assigned}

def _points(m: dict, w: dict) -> int:
    return round(
        m["deals_won"] * w["deal_won"]
        + (m["revenue"] / 1000.0) * w["revenue_per_1k"]
        + m["replies"] * w["reply"]
        + m["calls"] * w["call"]
        + m["emails"] * w["email"]
    )

def leaderboard(scope_user: dict, frm: str = "", to: str = "") -> dict:
    w = get_weights()
    conn = get_conn()
    agents = list_agents(scope_user)
    rows = []
    for a in agents:
        m = _agent_metrics(conn, a["id"], frm, to)
        m["points"] = _points(m, w)
        m["conversion"] = round(100.0 * m["deals_won"] / m["leads_assigned"], 1) if m["leads_assigned"] else 0.0
        rows.append({**a, **m})
    conn.close()
    rows.sort(key=lambda r: (r["points"], r["revenue"]), reverse=True)
    for i, r in enumerate(rows):
        r["rank"] = i + 1
    return {"agents": rows, "weights": w,
            "totals": {
                "calls": sum(r["calls"] for r in rows),
                "emails": sum(r["emails"] for r in rows),
                "replies": sum(r["replies"] for r in rows),
                "deals_won": sum(r["deals_won"] for r in rows),
                "revenue": sum(r["revenue"] for r in rows),
            }}

def agent_performance(agent_id: str, frm: str = "", to: str = "") -> dict:
    conn = get_conn()
    u = conn.execute("SELECT * FROM users WHERE id=?", (agent_id,)).fetchone()
    if not u:
        conn.close(); return None
    w = get_weights()
    m = _agent_metrics(conn, agent_id, frm, to)
    m["points"] = _points(m, w)
    m["conversion"] = round(100.0 * m["deals_won"] / m["leads_assigned"], 1) if m["leads_assigned"] else 0.0
    # recent activity
    recent = conn.execute("""
        SELECT a.*, r.company AS company, r.first_name, r.last_name
        FROM lead_activities a LEFT JOIN raw_leads r ON r.id = a.lead_id
        WHERE a.agent_id=? ORDER BY a.created_at DESC LIMIT 25
    """, (agent_id,)).fetchall()
    conn.close()
    return {"agent": _pub(dict(u)), "metrics": m, "weights": w,
            "recent": [dict(x) for x in recent]}


# ─── Brevo email (ready-but-inactive until configured) ────────────────────────

def brevo_ready() -> bool:
    key = os.getenv("BREVO_API_KEY", "")
    sender = os.getenv("BREVO_SENDER_EMAIL", "")
    return bool(key and not key.startswith("YOUR_") and sender and not sender.startswith("you@"))

def send_email(to_email: str, subject: str, body: str, to_name: str = "") -> dict:
    """Send via Brevo transactional API. Returns {ok, provider_id|error}.
    If Brevo isn't configured, returns ok=False with a clear setup message —
    never a silent/fake success."""
    if not to_email:
        return {"ok": False, "error": "No recipient email"}
    if not brevo_ready():
        return {"ok": False, "configured": False,
                "error": "Email sending is not configured yet. Add BREVO_API_KEY and BREVO_SENDER_EMAIL to .env to enable delivery."}
    import httpx
    key = os.getenv("BREVO_API_KEY")
    sender_email = os.getenv("BREVO_SENDER_EMAIL")
    sender_name = os.getenv("BREVO_SENDER_NAME", "Sales")
    payload = {
        "sender": {"email": sender_email, "name": sender_name},
        "to": [{"email": to_email, "name": to_name or to_email}],
        "subject": subject,
        "htmlContent": f"<html><body>{body}</body></html>",
    }
    try:
        resp = httpx.post("https://api.brevo.com/v3/smtp/email",
                          headers={"api-key": key, "Content-Type": "application/json",
                                   "accept": "application/json"},
                          json=payload, timeout=20)
        if resp.status_code in (200, 201):
            return {"ok": True, "configured": True, "provider_id": resp.json().get("messageId", "")}
        return {"ok": False, "configured": True, "error": f"Brevo error {resp.status_code}: {resp.text[:200]}"}
    except Exception as e:
        return {"ok": False, "configured": True, "error": str(e)}
