"""
api_server.py — REST API for the Lead Pipeline UI
Reads/writes the existing SQLite database (data/leads.db).

Run: uvicorn api_server:app --reload --port 8000
Docs: http://localhost:8000/docs
"""

from fastapi import FastAPI, Depends, HTTPException, Header, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import PlainTextResponse, FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from typing import Optional
import sqlite3, json, uuid, secrets, tempfile, os
from datetime import datetime
from pathlib import Path

import analytics  # read-only analytics + explainability layer (additive)
import sales       # sales-team layer: users/teams, assignment, activities, performance
import sales_api   # router for the sales endpoints
from auth import current_user, require, login_user, logout_token, public_user
# v1.2: sales-team layer — DB users/teams, lead assignment, activity tracking, leaderboard.

app = FastAPI(title="Lead Pipeline API", version="1.2.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

DB_PATH = Path("data/leads.db")

# Create sales-layer tables (users, lead_activities, assignment columns) + seed users.
sales.ensure_tables()
# Mount the sales endpoints (assignment, activities, performance).
app.include_router(sales_api.router)


def db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


# ─── Activity / audit log ─────────────────────────────────────────────────────
# Additive table — created on startup, never interferes with the pipeline tables.

def _ensure_activity_table():
    try:
        conn = db()
        conn.execute("""
            CREATE TABLE IF NOT EXISTS activity_log (
                id           TEXT PRIMARY KEY,
                ts           TEXT,
                actor_name   TEXT,
                actor_email  TEXT,
                actor_role   TEXT,
                action       TEXT,
                detail       TEXT
            )
        """)
        conn.commit(); conn.close()
    except Exception as e:
        print(f"[activity_log] init skipped: {e}")


_ensure_activity_table()


def _email_for(user: dict) -> str:
    return (user or {}).get("email", "")


def log_activity(user: dict | None, action: str, detail: str = "",
                 actor_email: str | None = None):
    """Record an auditable event. Failures never break the request."""
    try:
        conn = db()
        conn.execute(
            "INSERT INTO activity_log (id, ts, actor_name, actor_email, actor_role, action, detail) "
            "VALUES (?,?,?,?,?,?,?)",
            (str(uuid.uuid4()), datetime.utcnow().isoformat(),
             (user or {}).get("name", "System"),
             actor_email or (_email_for(user) if user else ""),
             (user or {}).get("role", "system"),
             action, detail),
        )
        conn.commit(); conn.close()
    except Exception as e:
        print(f"[activity_log] write skipped: {e}")


ECONOMICS_DEFAULTS = {"avg_deal_size": 25000, "win_rate": 0.20, "monthly_cost": 130}


def _economics() -> dict:
    """Business assumptions used for pipeline-value math. User-editable, persisted
    in pipeline_settings.json — these are inputs, not fabricated results."""
    s = _load_pipeline_settings()
    return {k: s.get(k, ECONOMICS_DEFAULTS[k]) for k in ECONOMICS_DEFAULTS}


# current_user + require are imported from auth (DB-backed).

# ─── Auth ─────────────────────────────────────────────────────────────────────

class LoginReq(BaseModel):
    email: str
    password: str

@app.post("/api/auth/login")
def login(req: LoginReq):
    result = login_user(req.email, req.password)
    if not result:
        raise HTTPException(401, "Invalid credentials")
    token, u = result
    log_activity(u, "auth.login", "Signed in", actor_email=u["email"])
    return {"token": token, "user": public_user(u)}

@app.post("/api/auth/logout")
def logout(user=Depends(current_user), authorization: str = Header(None)):
    logout_token(authorization)
    return {"ok": True}

@app.get("/api/auth/me")
def me(user=Depends(current_user)):
    return public_user(user)

class PasswordReq(BaseModel):
    current_password: str
    new_password: str

@app.post("/api/auth/password")
def change_password(req: PasswordReq, user=Depends(current_user)):
    full = sales.get_user_by_id(user["id"])
    if not full or not sales.verify_pw(req.current_password, full.get("password", "")):
        raise HTTPException(400, "Current password is incorrect")
    if len(req.new_password) < 6:
        raise HTTPException(400, "New password must be at least 6 characters")
    sales.set_password(user["id"], req.new_password)
    log_activity(user, "auth.password", "Changed own password")
    return {"ok": True}


# ─── Stats ────────────────────────────────────────────────────────────────────

@app.get("/api/stats")
def get_stats(user=Depends(current_user)):
    conn = db()
    stats = {}
    for s in ["raw", "enriched", "scored", "queued", "sent", "replied"]:
        stats[s] = conn.execute("SELECT COUNT(*) FROM raw_leads WHERE status=?", (s,)).fetchone()[0]

    stats["replies"] = {
        r[0]: r[1] for r in conn.execute(
            "SELECT classification, COUNT(*) FROM replies GROUP BY classification"
        ).fetchall()
    }
    stats["by_source"] = {
        r[0]: r[1] for r in conn.execute(
            "SELECT source, COUNT(*) FROM raw_leads GROUP BY source"
        ).fetchall()
    }
    stats["daily"] = [
        {"date": r[0], "leads": r[1]} for r in conn.execute("""
            SELECT DATE(fetched_at) as d, COUNT(*) as n
            FROM raw_leads WHERE fetched_at >= DATE('now','-14 days')
            GROUP BY d ORDER BY d
        """).fetchall()
    ]
    conn.close()
    return stats


# ─── Analytics (read-only, computed live from the DB) ─────────────────────────

@app.get("/api/analytics/overview")
def analytics_overview(user=Depends(current_user)):
    conn = db()
    try:
        return analytics.overview(conn, _economics())
    finally:
        conn.close()

@app.get("/api/analytics/segments")
def analytics_segments(user=Depends(current_user)):
    conn = db()
    try:
        return analytics.segments(conn)
    finally:
        conn.close()

@app.get("/api/analytics/economics")
def get_economics(user=Depends(current_user)):
    return _economics()

class EconomicsReq(BaseModel):
    avg_deal_size: float | None = None
    win_rate: float | None = None
    monthly_cost: float | None = None

@app.post("/api/analytics/economics")
def save_economics(req: EconomicsReq, user=Depends(current_user)):
    require(user, "admin", "manager")
    current = _load_pipeline_settings()
    for k, v in req.dict().items():
        if v is not None:
            current[k] = v
    PIPELINE_SETTINGS_FILE.write_text(json.dumps(current, indent=2))
    log_activity(user, "economics.update",
                 f"deal=${current.get('avg_deal_size')}, win={current.get('win_rate')}, cost=${current.get('monthly_cost')}")
    return _economics()


# ─── Activity / audit feed ────────────────────────────────────────────────────

@app.get("/api/activity")
def get_activity(limit: int = 50, user=Depends(current_user)):
    conn = db()
    rows = conn.execute(
        "SELECT id, ts, actor_name, actor_email, actor_role, action, detail "
        "FROM activity_log ORDER BY ts DESC LIMIT ?", (limit,)
    ).fetchall()
    conn.close()
    return {"events": [dict(r) for r in rows]}


# ─── Leads ────────────────────────────────────────────────────────────────────

_SORT_COLS = {"company": "r.company", "status": "r.status", "score": "s.icp_score",
              "created": "r.fetched_at", "name": "r.first_name"}

@app.get("/api/leads")
def get_leads(
    page: int = 1, limit: int = 25,
    search: str = "", status: str = "", source: str = "", assigned_to: str = "",
    sort: str = "created", direction: str = "desc",
    user=Depends(current_user),
):
    conn = db()
    conds, params = [], []
    if search:
        conds.append("(r.first_name||' '||r.last_name LIKE ? OR r.company LIKE ? OR e.email LIKE ?)")
        like = f"%{search}%"
        params += [like, like, like]
    if status:
        conds.append("r.status=?"); params.append(status)
    if source:
        conds.append("r.source=?"); params.append(source)

    # Access scope: agents only ever see leads assigned to them.
    if user["role"] == "agent":
        conds.append("r.assigned_to=?"); params.append(user["id"])
    elif assigned_to == "unassigned":
        conds.append("(r.assigned_to IS NULL OR r.assigned_to='')")
    elif assigned_to:
        conds.append("r.assigned_to=?"); params.append(assigned_to)

    where = ("WHERE " + " AND ".join(conds)) if conds else ""

    total = conn.execute(
        f"SELECT COUNT(*) FROM raw_leads r LEFT JOIN enriched_leads e ON e.lead_id=r.id {where}",
        params
    ).fetchone()[0]

    rows = conn.execute(f"""
        SELECT r.id, r.source, r.first_name, r.last_name, r.title, r.company,
               r.domain, r.country, r.industry, r.phone, r.status, r.intent_level,
               r.pain_point, r.contact_hook, r.fetched_at,
               r.assigned_to, ua.name AS assigned_to_name,
               e.email, e.email_verified, e.company_size, e.tech_stack,
               s.icp_score, s.intent_level as scored_intent, s.offering_match, s.score_reason
        FROM raw_leads r
        LEFT JOIN enriched_leads e ON e.lead_id = r.id
        LEFT JOIN scored_leads s ON s.lead_id = r.id
        LEFT JOIN users ua ON ua.id = r.assigned_to
        {where}
        ORDER BY {_SORT_COLS.get(sort, "r.fetched_at")} {"ASC" if direction == "asc" else "DESC"}
        LIMIT ? OFFSET ?
    """, params + [limit, (page - 1) * limit]).fetchall()

    leads = []
    for r in rows:
        d = dict(r)
        if d.get("tech_stack"):
            try: d["tech_stack"] = json.loads(d["tech_stack"])
            except: d["tech_stack"] = []
        leads.append(d)

    conn.close()
    return {"leads": leads, "total": total, "page": page, "pages": max(1, -(-total // limit))}


@app.get("/api/leads/{lid}/detail")
def lead_detail(lid: str, user=Depends(current_user)):
    """Full 360 record: profile + enrichment + score + ICP-fit factors + timeline."""
    conn = db()
    try:
        detail = analytics.lead_detail(conn, lid)
    finally:
        conn.close()
    if not detail:
        raise HTTPException(404, "Lead not found")
    return detail


class AddLeadReq(BaseModel):
    first_name: str
    last_name: str
    company: str
    title: str = ""
    domain: str = ""
    email: str = ""
    phone: str = ""
    industry: str = ""
    country: str = ""

@app.post("/api/leads", status_code=201)
def add_lead(req: AddLeadReq, user=Depends(current_user)):
    require(user, "admin", "manager")
    conn = db()
    lid = str(uuid.uuid4())
    conn.execute("""
        INSERT INTO raw_leads
        (id, source, first_name, last_name, title, company, domain, country, industry, phone, raw_json, fetched_at, status)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)
    """, (lid, "manual", req.first_name, req.last_name, req.title,
          req.company, req.domain, req.country, req.industry, req.phone,
          json.dumps(req.dict()), datetime.utcnow().isoformat(), "raw"))
    if req.email:
        conn.execute("""
            INSERT OR REPLACE INTO enriched_leads (id, lead_id, email, email_verified, enriched_at)
            VALUES (?,?,?,0,?)
        """, (f"enr_{lid}", lid, req.email, datetime.utcnow().isoformat()))
        conn.execute("UPDATE raw_leads SET status='enriched' WHERE id=?", (lid,))
    conn.commit(); conn.close()
    log_activity(user, "lead.add", f"Added {req.first_name} {req.last_name} — {req.company}")
    return {"id": lid}

@app.delete("/api/leads/{lid}")
def delete_lead(lid: str, user=Depends(current_user)):
    require(user, "admin", "manager")
    conn = db()
    for tbl in ("enriched_leads", "scored_leads", "outreach_log", "replies"):
        col = "lead_id" if tbl != "raw_leads" else "id"
        conn.execute(f"DELETE FROM {tbl} WHERE {col}=?", (lid,))
    conn.execute("DELETE FROM raw_leads WHERE id=?", (lid,))
    conn.commit(); conn.close()
    log_activity(user, "lead.delete", f"Deleted lead {lid}")
    return {"ok": True}


@app.post("/api/leads/{lid}/score")
def score_single_lead(lid: str, user=Depends(current_user)):
    """Run Groq AI scoring on a single lead. Works on any status."""
    require(user, "admin", "manager")
    conn = db()
    row = conn.execute("""
        SELECT r.*, e.email, e.company_size, e.industry as enriched_industry, e.tech_stack
        FROM raw_leads r
        LEFT JOIN enriched_leads e ON e.lead_id = r.id
        WHERE r.id = ?
    """, (lid,)).fetchone()
    conn.close()
    if not row:
        raise HTTPException(404, "Lead not found")

    lead = dict(row)
    # Prefer enriched industry over raw if available
    if not lead.get("industry") and lead.get("enriched_industry"):
        lead["industry"] = lead["enriched_industry"]

    try:
        from scorer import score_lead
        result = score_lead(lead)
        if not result:
            raise HTTPException(503, "Groq scoring returned no result — check GROQ_API_KEY")
        from database import save_score
        save_score(lid, result)
        nm = (lead.get("company") or f"{lead.get('first_name','')} {lead.get('last_name','')}").strip()
        log_activity(user, "lead.score", f"Scored {nm or lid} → {result.get('icp_score')} ({result.get('intent_level')} intent)")
        return result
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, str(e))


# ─── Email ────────────────────────────────────────────────────────────────────

@app.get("/api/email/generate")
def gen_email(lead_id: str, user=Depends(current_user)):
    require(user, "admin", "manager")
    conn = db()
    row = conn.execute("""
        SELECT r.*, e.email, e.company_size, e.industry, e.tech_stack,
               s.icp_score, s.intent_level, s.offering_match
        FROM raw_leads r
        LEFT JOIN enriched_leads e ON e.lead_id=r.id
        LEFT JOIN scored_leads s ON s.lead_id=r.id
        WHERE r.id=?
    """, (lead_id,)).fetchone()
    conn.close()
    if not row: raise HTTPException(404, "Lead not found")

    lead = dict(row)
    score = {
        "icp_score": lead.get("icp_score", 50),
        "intent_level": lead.get("intent_level", "medium"),
        "offering_match": lead.get("offering_match", "automation"),
        "reason": "",
    }
    try:
        from email_gen import generate_email
        result = generate_email(lead, score)
        return result or {"subject": "", "body": ""}
    except Exception as e:
        raise HTTPException(500, str(e))


class SendEmailReq(BaseModel):
    lead_id: str
    to_email: str
    subject: str
    body: str

@app.post("/api/email/send")
def send_email_manual(req: SendEmailReq, user=Depends(current_user)):
    # agents can email their own leads; managers/admins any
    require(user, "admin", "manager", "agent")
    result = sales.send_email(req.to_email, req.subject, req.body)
    if not result.get("ok"):
        # 400 for "not configured", 502 for a real send failure
        code = 400 if result.get("configured") is False else 502
        raise HTTPException(code, result.get("error", "Send failed"))

    provider_id = result.get("provider_id", "")
    conn = db()
    conn.execute("""
        INSERT INTO outreach_log (id, lead_id, email_subject, email_body, sent_at, provider_id)
        VALUES (?,?,?,?,?,?)
    """, (str(uuid.uuid4()), req.lead_id, req.subject, req.body, datetime.utcnow().isoformat(), provider_id))
    conn.execute("UPDATE raw_leads SET status='sent' WHERE id=?", (req.lead_id,))
    conn.commit(); conn.close()

    # Track as an agent activity so it counts toward performance.
    sales.add_activity(req.lead_id, user["id"], "email", outcome="sent", notes=req.subject)
    log_activity(user, "email.send", f"Emailed lead {req.lead_id}")
    return {"ok": True, "provider_id": provider_id}


# ─── Excel / CSV Import ───────────────────────────────────────────────────────

@app.get("/api/leads/template", response_class=PlainTextResponse)
def download_template(user=Depends(current_user)):
    """Returns a ready-to-fill CSV template with all supported columns."""
    from excel_importer import get_template_csv
    content = get_template_csv()
    return PlainTextResponse(
        content=content,
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=leads_template.csv"},
    )


@app.post("/api/leads/import")
async def import_leads(file: UploadFile = File(...), user=Depends(current_user)):
    """
    Upload a .xlsx or .csv file to bulk-import leads.
    Leads with an email column skip Hunter enrichment automatically.
    Accepts: multipart/form-data with field name 'file'.
    """
    require(user, "admin", "manager")

    suffix = Path(file.filename or "").suffix.lower()
    if suffix not in (".xlsx", ".csv", ".txt"):
        raise HTTPException(400, "Only .xlsx or .csv files are supported")

    # Write to a temp file so the importer can read it
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
        tmp.write(await file.read())
        tmp_path = tmp.name

    try:
        from excel_importer import import_file
        result = import_file(tmp_path)
    finally:
        os.unlink(tmp_path)

    log_activity(user, "lead.import",
                 f"Imported {file.filename}: {result['imported']} added, {result['skipped']} skipped")
    return {
        "filename":  file.filename,
        "imported":  result["imported"],
        "skipped":   result["skipped"],
        "errors":    result["errors"],
        "sheets":    result.get("sheets", []),
    }


# ─── Pipeline triggers ────────────────────────────────────────────────────────

PIPELINE_SETTINGS_FILE = Path(__file__).parent / "pipeline_settings.json"

def _pipeline_defaults() -> dict:
    from config import APOLLO_SEARCH
    return {
        "person_titles": APOLLO_SEARCH.get("person_titles", []),
        "person_locations": APOLLO_SEARCH.get("person_locations", [
            "Saudi Arabia", "United Arab Emirates", "Qatar", "Kuwait", "Bahrain", "Oman"
        ]),
        "organization_num_employees_ranges": APOLLO_SEARCH.get(
            "organization_num_employees_ranges", ["51,200", "201,1000", "1001,5000"]),
        "pages": 2,
        # ─── Rotation + accuracy filters ───
        "rotation_enabled": True,
        "industries": ["manufacturing", "industrial automation", "oil and gas",
                       "chemicals", "machinery", "mining", "plastics", "packaging",
                       "food processing", "automotive"],
        "seniorities": ["owner", "c_suite", "vp", "director", "manager"],
        "per_page": 100,            # 4x more leads per search call than the old 25
        "reveal_contacts": False,   # unlock email/phone via Apollo credits (opt-in)
        "contact_email_status": [], # e.g. ["verified"] for reachable-only (fewer, higher quality)
    }

def _load_pipeline_settings() -> dict:
    """Merge saved settings over defaults, so newly-added keys always resolve."""
    base = _pipeline_defaults()
    if PIPELINE_SETTINGS_FILE.exists():
        try:
            base.update(json.loads(PIPELINE_SETTINGS_FILE.read_text()))
        except Exception:
            pass
    return base

@app.get("/api/pipeline/settings")
def get_pipeline_settings(user=Depends(current_user)):
    return _load_pipeline_settings()

@app.post("/api/pipeline/settings")
def save_pipeline_settings(settings: dict, user=Depends(current_user)):
    require(user, "admin", "manager")
    current = _load_pipeline_settings()
    current.update(settings)
    PIPELINE_SETTINGS_FILE.write_text(json.dumps(current, indent=2))
    log_activity(user, "settings.update", "Updated Apollo search filters")
    return {"ok": True}

@app.post("/api/pipeline/{step}")
def trigger_step(step: str, user=Depends(current_user)):
    require(user, "admin", "manager")
    if step not in ("collect", "enrich", "score", "apollo-only"):
        raise HTTPException(400, "Invalid step")
    import subprocess, sys
    env = os.environ.copy()
    run_label = step
    if step == "apollo-only":
        settings = _load_pipeline_settings()
        pages = settings.get("pages", 2)
        # Shared accuracy filters passed to every collect run
        env["PIPELINE_PER_PAGE"]     = str(settings.get("per_page", 100))
        env["PIPELINE_REVEAL"]       = "1" if settings.get("reveal_contacts") else "0"
        env["PIPELINE_EMAIL_STATUS"] = json.dumps(settings.get("contact_email_status", []))
        env["PIPELINE_SENIORITIES"]  = json.dumps(settings.get("seniorities", []))
        env["PIPELINE_INDUSTRIES"]   = json.dumps(settings.get("industries", []))

        if settings.get("rotation_enabled", True):
            # Rotate to the next filter profile; each keeps its own page offset.
            import rotation
            profs = rotation.ensure_profiles(settings)
            prof = rotation.next_profile(profs)
            off = prof.get("offset", 1); pg = prof.get("pages", pages)
            env["PIPELINE_PAGES"]      = str(pg)
            env["PIPELINE_START_PAGE"] = str(off)
            env["PIPELINE_TITLES"]     = json.dumps(prof.get("person_titles", []))
            env["PIPELINE_LOCATIONS"]  = json.dumps(prof.get("person_locations", []))
            env["PIPELINE_EMP_RANGES"] = json.dumps(prof.get("organization_num_employees_ranges", []))
            if prof.get("industries"):
                env["PIPELINE_INDUSTRIES"] = json.dumps(prof["industries"])
            if prof.get("seniorities"):
                env["PIPELINE_SENIORITIES"] = json.dumps(prof["seniorities"])
            rotation.record_run(profs, prof["id"], pg)
            run_label = f"profile '{prof['name']}' pages {off}–{off + pg - 1}"
        else:
            # Legacy single-search sweep
            start_page = settings.get("page_offset", 1)
            env["PIPELINE_PAGES"]      = str(pages)
            env["PIPELINE_START_PAGE"] = str(start_page)
            env["PIPELINE_TITLES"]     = json.dumps(settings.get("person_titles", []))
            env["PIPELINE_LOCATIONS"]  = json.dumps(settings.get("person_locations", []))
            env["PIPELINE_EMP_RANGES"] = json.dumps(settings.get("organization_num_employees_ranges", []))
            settings["page_offset"] = start_page + pages
            PIPELINE_SETTINGS_FILE.write_text(json.dumps(settings, indent=2))
            run_label = f"pages {start_page}–{start_page + pages - 1}"
    subprocess.Popen(
        [sys.executable, "main.py", "--step", step],
        cwd=str(Path(__file__).parent),
        env=env,
    )
    if step == "apollo-only":
        log_activity(user, "pipeline.run", f"Collect — {run_label} (rotating filters, no re-fetch)")
    else:
        log_activity(user, "pipeline.run", f"Triggered '{step}' step")
    return {"ok": True, "step": step}

@app.get("/api/pipeline/status")
def pipeline_status(user=Depends(current_user)):
    """Returns current lead counts — used to poll progress after triggering a step."""
    from database import get_stats
    return get_stats()


# ─── Filter rotation ──────────────────────────────────────────────────────────

@app.get("/api/pipeline/rotation")
def pipeline_rotation(user=Depends(current_user)):
    import rotation
    settings = _load_pipeline_settings()
    enabled = settings.get("rotation_enabled", True)
    profs = rotation.ensure_profiles(settings) if enabled else []
    return {
        "enabled": enabled,
        "profiles": profs,
        "next": rotation.next_profile(profs) if profs else None,
        "reveal_contacts": settings.get("reveal_contacts", False),
        "per_page": settings.get("per_page", 100),
        "industries": settings.get("industries", []),
        "seniorities": settings.get("seniorities", []),
    }

@app.post("/api/pipeline/rotation/regenerate")
def pipeline_rotation_regenerate(user=Depends(current_user)):
    """Rebuild the profile grid from current filters (resets per-profile offsets)."""
    require(user, "admin", "manager")
    import rotation
    profs = rotation.regenerate(_load_pipeline_settings())
    log_activity(user, "pipeline.rotation", f"Regenerated {len(profs)} search profiles")
    return {"ok": True, "count": len(profs)}


# ─── Users / RBAC ─────────────────────────────────────────────────────────────

@app.get("/api/users")
def list_users(user=Depends(current_user)):
    # admins see everyone; managers see themselves + their team; agents/viewers see self
    require(user, "admin", "manager")
    return sales.list_users(user)

class InviteReq(BaseModel):
    name: str
    email: str
    role: str
    password: str = "changeme123"
    manager_id: Optional[str] = None

@app.post("/api/users", status_code=201)
def invite_user(req: InviteReq, user=Depends(current_user)):
    require(user, "admin", "manager")
    # Managers can only create agents, auto-assigned to their own team.
    role = req.role
    manager_id = req.manager_id
    if user["role"] == "manager":
        role = "agent"
        manager_id = user["id"]
    if role not in sales.ROLES:
        raise HTTPException(400, "Invalid role")
    try:
        created = sales.create_user(req.name, req.email, req.password, role, manager_id)
    except ValueError as e:
        raise HTTPException(400, str(e))
    log_activity(user, "user.invite", f"Added {req.email} as {role}")
    return {"ok": True, "user": created}

class RoleReq(BaseModel):
    role: str

@app.put("/api/users/{uid}/role")
def set_role(uid: str, req: RoleReq, user=Depends(current_user)):
    require(user, "admin")
    if req.role not in sales.ROLES: raise HTTPException(400, "Invalid role")
    target = sales.get_user_by_id(uid)
    if not target: raise HTTPException(404, "User not found")
    sales.update_user_role(uid, req.role)
    log_activity(user, "user.role", f"Changed {target['email']} → {req.role}")
    return {"ok": True}

@app.delete("/api/users/{uid}")
def remove_user(uid: str, user=Depends(current_user)):
    require(user, "admin", "manager")
    if user["id"] == uid: raise HTTPException(400, "Cannot remove yourself")
    target = sales.get_user_by_id(uid)
    if not target: raise HTTPException(404, "User not found")
    # Managers may only remove their own agents.
    if user["role"] == "manager" and not (target["role"] == "agent" and target.get("manager_id") == user["id"]):
        raise HTTPException(403, "You can only remove agents in your team")
    sales.delete_user(uid)
    log_activity(user, "user.remove", f"Removed {target['email']}")
    return {"ok": True}


# ─── Serve the built React app (single-service deploy) ────────────────────────
# In production the frontend is built to ui/dist and served from here, so the
# whole app is one URL and /api calls are same-origin (no CORS). Guarded by dist
# existence so local API-only dev is unaffected.
_DIST = Path(__file__).parent / "ui" / "dist"
if _DIST.exists():
    app.mount("/assets", StaticFiles(directory=str(_DIST / "assets")), name="assets")

    @app.get("/{full_path:path}")
    def serve_spa(full_path: str):
        # never hijack the API namespace
        if full_path.startswith("api/") or full_path == "api":
            raise HTTPException(404, "Not found")
        candidate = _DIST / full_path
        if full_path and candidate.is_file():
            return FileResponse(str(candidate))
        # SPA fallback — let React Router handle client-side routes
        return FileResponse(str(_DIST / "index.html"))
