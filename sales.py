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

from config import DB_PATH   # persistent-disk aware path (env DATA_DIR in prod)
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

# Default point weights — RFQ is the primary outcome we measure on.
DEFAULT_WEIGHTS = {
    "rfq":           40,   # points per RFQ secured (the outcome that matters)
    "rfq_value_per_1k": 1, # extra points per $1,000 of RFQ value
    "reply":         15,   # points per reply logged
    "call":           5,   # points per call logged
    "email":          3,   # points per email sent/logged
    "note":           0,   # notes are free
}

ACTIVITY_TYPES = ("call", "email", "reply", "note", "deal")

# Default guided call talk-track (editable later). Shown live in the Call Console.
CALL_SCRIPT = [
    {"phase": "Opening", "seconds": 30, "color": "#2563EB", "points": [
        "Introduce yourself and Stemronic in one line.",
        "Confirm you're speaking with the right person (name / role).",
        "State the reason for the call in a sentence — no pitch yet.",
        "Ask permission: \"Do you have two minutes?\"",
    ]},
    {"phase": "Discovery", "seconds": 120, "color": "#7C3AED", "points": [
        "Ask about their current setup: automation, PLC/SCADA, manual processes.",
        "Probe pain: downtime, quality issues, lack of real-time visibility.",
        "Qualify: any upcoming projects, budget, timeline, who decides?",
        "Listen more than you talk — take notes below.",
    ]},
    {"phase": "Value & Close", "seconds": 90, "color": "#059669", "points": [
        "Connect one specific pain to one Stemronic solution.",
        "Propose a clear next step: send info, book a demo, or request an RFQ.",
        "Ask directly: \"Can we prepare an RFQ / quote for you?\"",
        "Confirm follow-up date and best contact method before hanging up.",
    ]},
]

def get_call_script():
    return CALL_SCRIPT

# Category-specific starter scripts (seeded once; fully editable by admins)
MANUFACTURING_SCRIPT = [
    {"phase": "Opening", "seconds": 30, "color": "#2563EB", "points": [
        "Intro: Stemronic — automation for factories & plants.",
        "Confirm plant/ops role.", "Reason: help reduce downtime & manual work.", "Ask for two minutes."]},
    {"phase": "Discovery", "seconds": 120, "color": "#7C3AED", "points": [
        "Which lines/processes are still manual?", "Any recurring downtime or quality issues?",
        "Current PLC/SCADA/MES setup?", "Planned expansions or upgrades this year?"]},
    {"phase": "Value & Close", "seconds": 90, "color": "#059669", "points": [
        "Tie a specific pain to our PLC/SCADA + IoT offering.",
        "Offer a plant walkthrough or an RFQ for a pilot line.", "Ask directly: can we quote you?", "Set follow-up."]},
]
OILGAS_SCRIPT = [
    {"phase": "Opening", "seconds": 30, "color": "#2563EB", "points": [
        "Intro: Stemronic — industrial automation & safety for energy.",
        "Confirm role (ops / engineering / procurement).", "Reason for call, one line.", "Permission to continue."]},
    {"phase": "Discovery", "seconds": 120, "color": "#7C3AED", "points": [
        "Assets/sites in scope (upstream/midstream/downstream)?", "Compliance, monitoring, or reliability pain?",
        "Existing SCADA / historian / instrumentation?", "Budget cycle and decision process?"]},
    {"phase": "Value & Close", "seconds": 90, "color": "#059669", "points": [
        "Connect pain to remote monitoring / predictive maintenance.",
        "Propose a scoped RFQ or technical review.", "Ask for the RFQ.", "Confirm next step + contact."]},
]

# ─── Industry sample scripts (Stemronic client verticals) ─────────────────────
FOODBEV_SCRIPT = [
    {"phase": "Opening", "seconds": 30, "color": "#2563EB", "points": [
        "Intro: Stemronic — automation, IoT & AI for food & beverage plants.",
        "Confirm production / QA / plant role.",
        "Reason: cut waste and changeover losses, protect yield and food safety.",
        "Ask for two minutes."]},
    {"phase": "Discovery", "seconds": 120, "color": "#7C3AED", "points": [
        "Which lines are still manual — filling, packaging, palletizing?",
        "Recurring downtime, changeover time, or giveaway/overfill losses?",
        "How is batch quality, temperature and yield logged today — paper or system?",
        "Any HACCP / traceability / audit pressure you're preparing for?",
        "Planned capacity expansion or new SKUs this year?"]},
    {"phase": "Value & Close", "seconds": 90, "color": "#059669", "points": [
        "Tie their pain to line automation + IIoT dashboards + AI vision QC (fill level, foreign-object, label check).",
        "Offer a single-line assessment or a pilot on their worst line.",
        "Ask directly: can we quote a pilot?",
        "Confirm follow-up date and the right contact."]},
]

PHARMA_SCRIPT = [
    {"phase": "Opening", "seconds": 30, "color": "#2563EB", "points": [
        "Intro: Stemronic — automation, IoT & AI for regulated manufacturing.",
        "Confirm ops / quality / validation role.",
        "Reason: fewer deviations, faster batch release, audit-ready data.",
        "Ask for two minutes."]},
    {"phase": "Discovery", "seconds": 120, "color": "#7C3AED", "points": [
        "Which steps are still paper/manual — batch records, environmental monitoring, logbooks?",
        "Deviation / CAPA volume and where time is lost?",
        "Serialization / track-and-trace and data-integrity (21 CFR Part 11) posture?",
        "Current SCADA / MES and cleanroom & utility monitoring gaps?",
        "Upcoming audits, expansions or new product lines?"]},
    {"phase": "Value & Close", "seconds": 90, "color": "#059669", "points": [
        "Tie pain to SCADA/MES integration + IIoT environmental monitoring + electronic batch records.",
        "Offer a compliance & automation gap assessment.",
        "Ask to quote a validated pilot.",
        "Confirm next step and decision process."]},
]

LOGISTICS_SCRIPT = [
    {"phase": "Opening", "seconds": 30, "color": "#2563EB", "points": [
        "Intro: Stemronic — IoT & automation for warehouses and distribution centers.",
        "Confirm operations / warehouse role.",
        "Reason: real-time visibility, fewer errors, faster throughput.",
        "Ask for two minutes."]},
    {"phase": "Discovery", "seconds": 120, "color": "#7C3AED", "points": [
        "Picking / sorting still manual or paper-driven?",
        "Inventory accuracy, mis-ships, or stockout issues?",
        "Any conveyors, AS/RS or robotics in place today?",
        "Real-time tracking of assets or temperature (cold chain)?",
        "Where do peak-season throughput bottlenecks hit hardest?"]},
    {"phase": "Value & Close", "seconds": 90, "color": "#059669", "points": [
        "Tie pain to warehouse IoT (RFID/sensors + live dashboards) + automation/robotics integration + AI throughput analytics.",
        "Offer a site walkthrough or a pilot in one zone.",
        "Ask to quote a pilot zone.",
        "Confirm follow-up and stakeholders."]},
]

AUTOMOTIVE_SCRIPT = [
    {"phase": "Opening", "seconds": 30, "color": "#2563EB", "points": [
        "Intro: Stemronic — robotics & automation for automotive and metal fabrication.",
        "Confirm plant / production / process role.",
        "Reason: higher throughput, consistent quality, less scrap and rework.",
        "Ask for two minutes."]},
    {"phase": "Discovery", "seconds": 120, "color": "#7C3AED", "points": [
        "Which cells are still manual — welding, assembly, material handling?",
        "Current OEE, scrap and rework rates?",
        "Existing robots / PLC / SCADA and where integration breaks down?",
        "Part-level traceability requirements from your OEM customers?",
        "Any line expansion, retool, or new model launch coming?"]},
    {"phase": "Value & Close", "seconds": 90, "color": "#059669", "points": [
        "Tie pain to robotic cells + PLC/SCADA integration + AI vision inspection + OEE dashboards.",
        "Offer an OEE / line assessment.",
        "Ask to quote a robotic cell or a retrofit.",
        "Confirm next step and budget cycle."]},
]

UTILITIES_SCRIPT = [
    {"phase": "Opening", "seconds": 30, "color": "#2563EB", "points": [
        "Intro: Stemronic — SCADA & IIoT for utilities, water and wastewater.",
        "Confirm plant / SCADA / operations role.",
        "Reason: remote visibility, uptime, energy efficiency and easier compliance.",
        "Ask for two minutes."]},
    {"phase": "Discovery", "seconds": 120, "color": "#7C3AED", "points": [
        "Are remote assets monitored live, or via manual rounds today?",
        "Unplanned outages or pump/motor failures — how often?",
        "Age and gaps of the existing SCADA / telemetry?",
        "Energy cost and efficiency targets?",
        "How heavy is the regulatory reporting burden right now?"]},
    {"phase": "Value & Close", "seconds": 90, "color": "#059669", "points": [
        "Tie pain to SCADA modernization + IIoT remote monitoring + AI predictive maintenance for pumps/motors + automated compliance reporting.",
        "Offer a network / asset assessment.",
        "Ask to quote a pilot site.",
        "Confirm follow-up and approvals path."]},
]

def _seed_scripts(conn):
    """Ensure each sample script exists (idempotent by name) so newly added
    verticals appear even on a database that already has scripts."""
    now = datetime.utcnow().isoformat()
    seed = [
        ("General outreach",            "General",                CALL_SCRIPT,        1),
        ("Manufacturing / Factories",   "Manufacturing",          MANUFACTURING_SCRIPT, 0),
        ("Oil & Gas / Energy",          "Oil & Gas",              OILGAS_SCRIPT,      0),
        ("Food & Beverage Processing",  "Food & Beverage",        FOODBEV_SCRIPT,     0),
        ("Pharmaceuticals & Life Sciences", "Pharmaceuticals",    PHARMA_SCRIPT,      0),
        ("Logistics & Warehousing",     "Logistics & Warehousing", LOGISTICS_SCRIPT,  0),
        ("Automotive & Metal Fabrication", "Automotive & Metals", AUTOMOTIVE_SCRIPT,  0),
        ("Utilities, Water & Wastewater", "Utilities & Water",    UTILITIES_SCRIPT,   0),
    ]
    existing = {r[0] for r in conn.execute("SELECT name FROM call_scripts").fetchall()}
    added = 0
    for name, cat, steps, dflt in seed:
        if name in existing:
            continue
        conn.execute("INSERT INTO call_scripts (id,name,category,steps,is_default,created_by,updated_at) VALUES (?,?,?,?,?,?,?)",
                     (str(uuid.uuid4()), name, cat, json.dumps(steps), dflt, "system", now))
        added += 1
    if added:
        conn.commit()
        print(f"[sales] seeded {added} call scripts")

def _script_row(r):
    d = dict(r)
    try:
        d["steps"] = json.loads(d["steps"]) if d.get("steps") else []
    except Exception:
        d["steps"] = []
    return d

def list_scripts() -> list[dict]:
    conn = get_conn()
    rows = conn.execute("SELECT * FROM call_scripts ORDER BY is_default DESC, category, name").fetchall()
    conn.close()
    return [_script_row(r) for r in rows]

def get_script(sid: str) -> dict | None:
    conn = get_conn()
    r = conn.execute("SELECT * FROM call_scripts WHERE id=?", (sid,)).fetchone()
    conn.close()
    return _script_row(r) if r else None

def create_script(name, category, steps, created_by) -> dict:
    sid = str(uuid.uuid4())
    conn = get_conn()
    conn.execute("INSERT INTO call_scripts (id,name,category,steps,is_default,created_by,updated_at) VALUES (?,?,?,?,0,?,?)",
                 (sid, name, category, json.dumps(steps), created_by, datetime.utcnow().isoformat()))
    conn.commit(); conn.close()
    return get_script(sid)

def update_script(sid, name, category, steps) -> dict:
    conn = get_conn()
    conn.execute("UPDATE call_scripts SET name=?, category=?, steps=?, updated_at=? WHERE id=?",
                 (name, category, json.dumps(steps), datetime.utcnow().isoformat(), sid))
    conn.commit(); conn.close()
    return get_script(sid)

def delete_script(sid) -> bool:
    conn = get_conn()
    conn.execute("DELETE FROM call_scripts WHERE id=?", (sid,))
    conn.commit(); conn.close()
    return True

# ─── RFQ opportunities / pipeline ─────────────────────────────────────────────
RFQ_STAGES = ["new", "quoted", "won", "lost"]
RFQ_STAGE_WEIGHT = {"new": 0.3, "quoted": 0.6, "won": 1.0, "lost": 0.0}

def create_rfq(lead_id, agent_id, title, value=0, count=1, notes="") -> dict:
    rid = str(uuid.uuid4()); now = datetime.utcnow().isoformat()
    conn = get_conn()
    conn.execute("INSERT INTO rfqs (id,lead_id,agent_id,title,value,count,stage,notes,created_at,updated_at) "
                 "VALUES (?,?,?,?,?,?,'new',?,?,?)",
                 (rid, lead_id, agent_id, title, float(value or 0), int(count or 1), notes, now, now))
    conn.commit(); conn.close()
    return {"id": rid}

def update_rfq_stage(rid, stage) -> bool:
    if stage not in RFQ_STAGES:
        return False
    conn = get_conn()
    conn.execute("UPDATE rfqs SET stage=?, updated_at=? WHERE id=?", (stage, datetime.utcnow().isoformat(), rid))
    conn.commit(); conn.close()
    return True

def list_rfqs(scope_user: dict) -> dict:
    ids = _agent_ids_for(scope_user)
    conn = get_conn()
    if ids:
        ph = ",".join("?" * len(ids))
        rows = conn.execute(f"""
            SELECT q.*, r.company AS company, u.name AS agent_name
            FROM rfqs q LEFT JOIN raw_leads r ON r.id=q.lead_id
            LEFT JOIN users u ON u.id=q.agent_id
            WHERE q.agent_id IN ({ph}) ORDER BY q.updated_at DESC
        """, ids).fetchall()
    else:
        rows = []
    conn.close()
    items = [dict(r) for r in rows]
    by_stage = {s: [x for x in items if x["stage"] == s] for s in RFQ_STAGES}
    forecast = sum((x["value"] or 0) * RFQ_STAGE_WEIGHT.get(x["stage"], 0) for x in items)
    won_value = sum((x["value"] or 0) for x in items if x["stage"] == "won")
    open_value = sum((x["value"] or 0) for x in items if x["stage"] in ("new", "quoted"))
    return {"stages": RFQ_STAGES, "by_stage": by_stage, "count": len(items),
            "forecast": round(forecast), "won_value": round(won_value), "open_value": round(open_value)}


# ─── Connection ───────────────────────────────────────────────────────────────

def get_conn():
    # timeout: wait (don't instantly fail) if another agent holds a write lock.
    conn = sqlite3.connect(DB_PATH, timeout=30)
    conn.row_factory = sqlite3.Row
    # WAL lets readers and a writer work concurrently — needed once a whole
    # sales team is logging calls/RFQs at the same time.
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA busy_timeout=30000")
    conn.execute("PRAGMA synchronous=NORMAL")
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
    # Call/RFQ columns on lead_activities (guarded)
    for col, decl in [("rfq_count", "INTEGER DEFAULT 0"), ("rfq_value", "REAL"),
                      ("meta", "TEXT"), ("interest", "INTEGER")]:
        try:
            cur.execute(f"ALTER TABLE lead_activities ADD COLUMN {col} {decl}")
        except Exception:
            pass
    # Per-agent daily targets
    cur.execute("""
        CREATE TABLE IF NOT EXISTS agent_targets (
            agent_id      TEXT PRIMARY KEY,
            daily_calls   INTEGER DEFAULT 20,
            daily_rfqs    INTEGER DEFAULT 2,
            daily_revenue REAL    DEFAULT 0,
            updated_at    TEXT
        )
    """)
    # Tasks / follow-ups
    cur.execute("""
        CREATE TABLE IF NOT EXISTS tasks (
            id          TEXT PRIMARY KEY,
            lead_id     TEXT,
            agent_id    TEXT,
            title       TEXT,
            type        TEXT,        -- call | email | followup | todo
            due_at      TEXT,        -- YYYY-MM-DD
            status      TEXT DEFAULT 'open',   -- open | done
            sequence    TEXT,        -- cadence name if created by a cadence
            created_by  TEXT,
            created_at  TEXT,
            done_at     TEXT
        )
    """)
    # Editable call scripts (by client category)
    cur.execute("""
        CREATE TABLE IF NOT EXISTS call_scripts (
            id          TEXT PRIMARY KEY,
            name        TEXT,
            category    TEXT,
            steps       TEXT,        -- JSON list of phases
            is_default  INTEGER DEFAULT 0,
            created_by  TEXT,
            updated_at  TEXT
        )
    """)
    # RFQ opportunities (pipeline)
    cur.execute("""
        CREATE TABLE IF NOT EXISTS rfqs (
            id          TEXT PRIMARY KEY,
            lead_id     TEXT,
            agent_id    TEXT,
            title       TEXT,
            value       REAL,
            count       INTEGER DEFAULT 1,
            stage       TEXT DEFAULT 'new',    -- new | quoted | won | lost
            close_date  TEXT,
            notes       TEXT,
            created_at  TEXT,
            updated_at  TEXT
        )
    """)
    # Agent inbox — proposals from background agents awaiting human approval (L4)
    cur.execute("""
        CREATE TABLE IF NOT EXISTS agent_inbox (
            id          TEXT PRIMARY KEY,
            kind        TEXT,                  -- prospect_email | stale_rfq | ...
            title       TEXT,
            summary     TEXT,
            payload     TEXT,                  -- JSON proposal (type + params)
            for_user    TEXT,                  -- who should review it
            status      TEXT DEFAULT 'pending',-- pending | approved | dismissed
            created_at  TEXT,
            resolved_at TEXT
        )
    """)
    conn.commit()
    _seed_scripts(conn)

    _seed_users(conn)
    _autodistribute_leads(conn)
    conn.close()


def _seed_users(conn):
    """Ensure every SEED_USERS account exists (idempotent per-user). Runs on
    every startup, so seeded accounts survive filesystem resets AND newly added
    roster members appear even on a database that already has other users."""
    rows = conn.execute("SELECT id, email FROM users").fetchall()
    id_by_email = {r[1]: r[0] for r in rows}
    taken_ids = {r[0] for r in rows}
    now = datetime.utcnow().isoformat()

    # Pass 1: allocate ids for any missing roster members (so manager links resolve).
    to_add = []
    for i, u in enumerate(SEED_USERS):
        if u["email"] in id_by_email:
            continue
        uid = f"u_{i+1}"
        if uid in taken_ids:
            uid = "u_" + uuid.uuid4().hex[:8]
        taken_ids.add(uid)
        id_by_email[u["email"]] = uid
        to_add.append((uid, u))

    # Pass 2: insert them, resolving manager email -> id.
    for uid, u in to_add:
        mgr_id = id_by_email.get(u.get("manager")) if u.get("manager") else None
        conn.execute(
            "INSERT INTO users (id,name,email,password,role,manager_id,created_at) VALUES (?,?,?,?,?,?,?)",
            (uid, u["name"], u["email"], hash_pw(u["password"]), u["role"], mgr_id, now),
        )
    if to_add:
        conn.commit()
        print(f"[sales] seeded {len(to_add)} missing users: {', '.join(u['email'] for _, u in to_add)}")


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

def set_password(uid: str, new_password: str):
    conn = get_conn()
    conn.execute("UPDATE users SET password=? WHERE id=?", (hash_pw(new_password), uid))
    conn.commit(); conn.close()

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


# ─── Agent inbox (L4 — background-agent proposals awaiting approval) ──────────

def inbox_add(kind, title, summary, payload: dict, for_user: str) -> str:
    conn = get_conn(); iid = str(uuid.uuid4())
    conn.execute("INSERT INTO agent_inbox (id,kind,title,summary,payload,for_user,status,created_at) VALUES (?,?,?,?,?,?, 'pending', ?)",
                 (iid, kind, title, summary, json.dumps(payload), for_user, datetime.utcnow().isoformat()))
    conn.commit(); conn.close(); return iid

def inbox_pending_lead_ids(for_user: str) -> set:
    conn = get_conn()
    rows = conn.execute("SELECT payload FROM agent_inbox WHERE for_user=? AND status='pending'", (for_user,)).fetchall()
    conn.close()
    ids = set()
    for r in rows:
        try: ids.add(json.loads(r[0]).get("lead_id"))
        except Exception: pass
    return ids

def inbox_list(scope_user: dict) -> list[dict]:
    ids = set(_agent_ids_for(scope_user)); ids.add(scope_user["id"])
    if not ids: return []
    conn = get_conn()
    ph = ",".join("?" * len(ids))
    rows = conn.execute(f"SELECT * FROM agent_inbox WHERE status='pending' AND for_user IN ({ph}) ORDER BY created_at DESC LIMIT 100", tuple(ids)).fetchall()
    conn.close()
    out = []
    for r in rows:
        d = dict(r)
        try: d["payload"] = json.loads(d["payload"])
        except Exception: d["payload"] = {}
        out.append(d)
    return out

def inbox_get(iid: str) -> dict | None:
    conn = get_conn(); r = conn.execute("SELECT * FROM agent_inbox WHERE id=?", (iid,)).fetchone(); conn.close()
    if not r: return None
    d = dict(r)
    try: d["payload"] = json.loads(d["payload"])
    except Exception: d["payload"] = {}
    return d

def inbox_resolve(iid: str, status: str):
    conn = get_conn()
    conn.execute("UPDATE agent_inbox SET status=?, resolved_at=? WHERE id=?", (status, datetime.utcnow().isoformat(), iid))
    conn.commit(); conn.close()


# ─── Activities ───────────────────────────────────────────────────────────────

def add_activity(lead_id, agent_id, type_, outcome="", notes="", duration=None, value=None,
                 rfq_count=0, rfq_value=None, meta=None, interest=None) -> dict:
    if type_ not in ACTIVITY_TYPES:
        raise ValueError("invalid activity type")
    aid = str(uuid.uuid4()); now = datetime.utcnow().isoformat()
    meta_json = json.dumps(meta) if isinstance(meta, (dict, list)) else (meta or None)
    conn = get_conn()
    conn.execute(
        "INSERT INTO lead_activities (id,lead_id,agent_id,type,outcome,notes,duration,value,rfq_count,rfq_value,meta,interest,created_at) "
        "VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)",
        (aid, lead_id, agent_id, type_, outcome, notes, duration, value,
         int(rfq_count or 0), rfq_value, meta_json, interest, now),
    )
    conn.commit(); conn.close()
    return {"id": aid, "lead_id": lead_id, "agent_id": agent_id, "type": type_,
            "outcome": outcome, "notes": notes, "duration": duration, "value": value,
            "rfq_count": int(rfq_count or 0), "rfq_value": rfq_value, "interest": interest, "created_at": now}

def audit(user: dict, action: str, detail: str = ""):
    """Write a row to the admin activity_log (used by the Activity page).
    Self-contained so the sales layer can log without importing api_server."""
    try:
        conn = get_conn()
        conn.execute("""CREATE TABLE IF NOT EXISTS activity_log (
            id TEXT PRIMARY KEY, ts TEXT, actor_name TEXT, actor_email TEXT,
            actor_role TEXT, action TEXT, detail TEXT)""")
        conn.execute(
            "INSERT INTO activity_log (id,ts,actor_name,actor_email,actor_role,action,detail) VALUES (?,?,?,?,?,?,?)",
            (str(uuid.uuid4()), datetime.utcnow().isoformat(), (user or {}).get("name", ""),
             (user or {}).get("email", ""), (user or {}).get("role", ""), action, detail))
        conn.commit(); conn.close()
    except Exception:
        pass


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


# ─── Targets / goals ──────────────────────────────────────────────────────────

DEFAULT_TARGETS = {"daily_calls": 20, "daily_rfqs": 2, "daily_revenue": 0}

def get_targets(agent_id: str) -> dict:
    conn = get_conn()
    r = conn.execute("SELECT daily_calls, daily_rfqs, daily_revenue FROM agent_targets WHERE agent_id=?",
                     (agent_id,)).fetchone()
    conn.close()
    if r:
        return {"daily_calls": r[0], "daily_rfqs": r[1], "daily_revenue": r[2]}
    return dict(DEFAULT_TARGETS)

def set_targets(agent_id: str, daily_calls, daily_rfqs, daily_revenue) -> dict:
    conn = get_conn()
    conn.execute("""
        INSERT INTO agent_targets (agent_id, daily_calls, daily_rfqs, daily_revenue, updated_at)
        VALUES (?,?,?,?,?)
        ON CONFLICT(agent_id) DO UPDATE SET
            daily_calls=excluded.daily_calls, daily_rfqs=excluded.daily_rfqs,
            daily_revenue=excluded.daily_revenue, updated_at=excluded.updated_at
    """, (agent_id, int(daily_calls or 0), int(daily_rfqs or 0), float(daily_revenue or 0),
          datetime.utcnow().isoformat()))
    conn.commit(); conn.close()
    return get_targets(agent_id)

TASK_TYPES = ("call", "email", "followup", "todo")

# Multi-step cadences — enrolling a lead generates one dated task per step.
CADENCES = {
    "standard": {
        "name": "Standard outreach (9 days)",
        "steps": [
            {"day": 0, "type": "call",  "title": "Intro call"},
            {"day": 2, "type": "email", "title": "Follow-up email"},
            {"day": 5, "type": "call",  "title": "Check-in call"},
            {"day": 9, "type": "email", "title": "Final follow-up email"},
        ],
    },
    "fast": {
        "name": "Fast close (4 days)",
        "steps": [
            {"day": 0, "type": "call",  "title": "Qualify call"},
            {"day": 1, "type": "email", "title": "Send proposal / RFQ ask"},
            {"day": 4, "type": "call",  "title": "Close call"},
        ],
    },
    "nurture": {
        "name": "Long nurture (30 days)",
        "steps": [
            {"day": 0,  "type": "call",  "title": "Intro call"},
            {"day": 7,  "type": "email", "title": "Value email"},
            {"day": 14, "type": "call",  "title": "Check-in call"},
            {"day": 30, "type": "email", "title": "Re-engage email"},
        ],
    },
}

def lead_owner(lead_id: str) -> str | None:
    conn = get_conn()
    r = conn.execute("SELECT assigned_to FROM raw_leads WHERE id=?", (lead_id,)).fetchone()
    conn.close()
    return (r[0] if r and r[0] else None)

def list_cadences() -> list[dict]:
    return [{"id": k, "name": v["name"], "steps": len(v["steps"])} for k, v in CADENCES.items()]

def create_task(lead_id, agent_id, title, type_, due_at, created_by, sequence=None) -> dict:
    tid = str(uuid.uuid4()); now = datetime.utcnow().isoformat()
    conn = get_conn()
    conn.execute(
        "INSERT INTO tasks (id,lead_id,agent_id,title,type,due_at,status,sequence,created_by,created_at) "
        "VALUES (?,?,?,?,?,?,'open',?,?,?)",
        (tid, lead_id, agent_id, title, type_ if type_ in TASK_TYPES else "todo", due_at, sequence, created_by, now))
    conn.commit(); conn.close()
    return {"id": tid, "lead_id": lead_id, "agent_id": agent_id, "title": title,
            "type": type_, "due_at": due_at, "status": "open", "sequence": sequence}

def complete_task(task_id, agent_id=None) -> bool:
    conn = get_conn()
    conn.execute("UPDATE tasks SET status='done', done_at=? WHERE id=?",
                 (datetime.utcnow().isoformat(), task_id))
    conn.commit(); conn.close()
    return True

def list_lead_tasks(lead_id: str) -> list[dict]:
    conn = get_conn()
    rows = conn.execute("""SELECT t.*, u.name AS agent_name FROM tasks t
        LEFT JOIN users u ON u.id=t.agent_id
        WHERE t.lead_id=? ORDER BY (t.status='done'), t.due_at""", (lead_id,)).fetchall()
    conn.close()
    return [dict(r) for r in rows]

def my_tasks(agent_id: str, include_done_days: int = 0) -> list[dict]:
    conn = get_conn()
    rows = conn.execute("""
        SELECT t.*, r.company AS company, r.first_name, r.last_name, r.phone,
               r.assigned_to, e.email AS email
        FROM tasks t
        LEFT JOIN raw_leads r ON r.id=t.lead_id
        LEFT JOIN enriched_leads e ON e.lead_id=t.lead_id
        WHERE t.agent_id=? AND t.status='open'
        ORDER BY t.due_at
    """, (agent_id,)).fetchall()
    conn.close()
    return [dict(r) for r in rows]

def task_counts(agent_id: str) -> dict:
    from datetime import date
    today = date.today().isoformat()
    conn = get_conn()
    op = conn.execute("SELECT COUNT(*) FROM tasks WHERE agent_id=? AND status='open'", (agent_id,)).fetchone()[0]
    od = conn.execute("SELECT COUNT(*) FROM tasks WHERE agent_id=? AND status='open' AND due_at < ?",
                      (agent_id, today)).fetchone()[0]
    tod = conn.execute("SELECT COUNT(*) FROM tasks WHERE agent_id=? AND status='open' AND due_at = ?",
                       (agent_id, today)).fetchone()[0]
    conn.close()
    return {"open": op, "overdue": od, "today": tod}

def enroll_cadence(lead_id, agent_id, cadence_id, created_by) -> int:
    from datetime import date, timedelta
    cad = CADENCES.get(cadence_id)
    if not cad:
        return 0
    for step in cad["steps"]:
        due = (date.today() + timedelta(days=step["day"])).isoformat()
        create_task(lead_id, agent_id, step["title"], step["type"], due, created_by, sequence=cad["name"])
    return len(cad["steps"])


def daily_series(agent_ids, days: int = 7) -> list[dict]:
    """Last N days of actual calls + RFQs vs the summed daily target for the given agents."""
    from datetime import date, timedelta
    if isinstance(agent_ids, str):
        agent_ids = [agent_ids]
    tgt_calls = sum(get_targets(a)["daily_calls"] for a in agent_ids)
    tgt_rfqs = sum(get_targets(a)["daily_rfqs"] for a in agent_ids)
    out = []
    conn = get_conn()
    ph = ",".join("?" * len(agent_ids))
    for i in range(days - 1, -1, -1):
        d = (date.today() - timedelta(days=i)).isoformat()
        calls = rfqs = 0
        if agent_ids:
            row = conn.execute(
                f"""SELECT SUM(CASE WHEN type='call' THEN 1 ELSE 0 END),
                           COALESCE(SUM(CASE WHEN type='call' THEN rfq_count ELSE 0 END),0)
                    FROM lead_activities
                    WHERE agent_id IN ({ph}) AND substr(created_at,1,10)=?""",
                (*agent_ids, d)).fetchone()
            calls = int(row[0] or 0); rfqs = int(row[1] or 0)
        out.append({"date": d[5:], "calls": calls, "rfqs": rfqs,
                    "target_calls": tgt_calls, "target_rfqs": tgt_rfqs})
    conn.close()
    return out


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
    rfq_row = conn.execute(
        f"SELECT COALESCE(SUM(rfq_count),0), COALESCE(SUM(rfq_value),0), COALESCE(SUM(duration),0) "
        f"FROM lead_activities WHERE agent_id=? AND type='call'{dc}", (agent_id, *dp)).fetchone()
    rfqs = int(rfq_row[0] or 0)
    rfq_value = float(rfq_row[1] or 0)
    call_seconds = int(rfq_row[2] or 0)
    ai_row = conn.execute(
        f"SELECT AVG(interest) FROM lead_activities WHERE agent_id=? AND type='call' AND interest IS NOT NULL AND interest>0{dc}",
        (agent_id, *dp)).fetchone()
    avg_interest = round(float(ai_row[0]), 1) if ai_row and ai_row[0] is not None else 0
    assigned = conn.execute("SELECT COUNT(*) FROM raw_leads WHERE assigned_to=?", (agent_id,)).fetchone()[0]
    return {"calls": calls, "emails": emails, "replies": replies,
            "deals_won": won, "deals_lost": lost, "revenue": revenue,
            "rfqs": rfqs, "rfq_value": rfq_value, "avg_interest": avg_interest,
            "call_minutes": round(call_seconds / 60), "leads_assigned": assigned}

def _points(m: dict, w: dict) -> int:
    return round(
        m.get("rfqs", 0) * w.get("rfq", 0)
        + (m.get("rfq_value", 0) / 1000.0) * w.get("rfq_value_per_1k", 0)
        + m["replies"] * w.get("reply", 0)
        + m["calls"] * w.get("call", 0)
        + m["emails"] * w.get("email", 0)
    )

def leaderboard(scope_user: dict, frm: str = "", to: str = "") -> dict:
    w = get_weights()
    conn = get_conn()
    agents = list_agents(scope_user)
    rows = []
    for a in agents:
        m = _agent_metrics(conn, a["id"], frm, to)
        m["points"] = _points(m, w)
        m["conversion"] = round(100.0 * m["rfqs"] / m["calls"], 1) if m["calls"] else 0.0  # RFQ rate = RFQs per call
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
                "rfqs": sum(r.get("rfqs", 0) for r in rows),
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


# ─── WhatsApp outreach (scaffold — inactive until connected) ──────────────────

def whatsapp_ready() -> bool:
    tok = os.getenv("WHATSAPP_TOKEN", "")
    pid = os.getenv("WHATSAPP_PHONE_ID", "")
    return bool(tok and not tok.startswith("YOUR_") and pid and not pid.startswith("YOUR_"))

def send_whatsapp(to_number: str, message: str) -> dict:
    """Send a WhatsApp message via the Meta (WhatsApp Business) Cloud API.
    Inactive until WHATSAPP_TOKEN + WHATSAPP_PHONE_ID are set — returns a clear
    setup message rather than a fake success, exactly like the email path."""
    if not to_number:
        return {"ok": False, "error": "No recipient WhatsApp number"}
    if not whatsapp_ready():
        return {"ok": False, "configured": False,
                "error": "WhatsApp isn't connected yet. Add WHATSAPP_TOKEN and WHATSAPP_PHONE_ID (Meta WhatsApp Business Cloud API) to enable sending."}
    import httpx
    tok = os.getenv("WHATSAPP_TOKEN"); pid = os.getenv("WHATSAPP_PHONE_ID")
    num = "".join(ch for ch in str(to_number) if ch.isdigit())
    try:
        resp = httpx.post(f"https://graph.facebook.com/v20.0/{pid}/messages",
                          headers={"Authorization": f"Bearer {tok}", "Content-Type": "application/json"},
                          json={"messaging_product": "whatsapp", "to": num,
                                "type": "text", "text": {"body": message}}, timeout=20)
        if resp.status_code in (200, 201):
            data = resp.json()
            mid = (data.get("messages") or [{}])[0].get("id", "")
            return {"ok": True, "configured": True, "provider_id": mid}
        return {"ok": False, "configured": True, "error": f"WhatsApp error {resp.status_code}: {resp.text[:200]}"}
    except Exception as e:
        return {"ok": False, "configured": True, "error": str(e)}


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
