"""
sales_api.py — REST endpoints for the sales-team layer (assignment, activities,
performance/leaderboard). Mounted onto the main app via app.include_router().

Kept in its own module so the large main file stays small. All routes reuse the
shared auth dependency and the sales.py data layer.
"""

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Optional

import sales
from auth import current_user, require

router = APIRouter(prefix="/api")


# ─── Assignment ───────────────────────────────────────────────────────────────

def _assert_can_assign_to(scope_user: dict, agent_id: str):
    """Manager may only assign to their own agents; admin to anyone."""
    if scope_user["role"] == "admin":
        if not sales.get_user_by_id(agent_id):
            raise HTTPException(404, "Agent not found")
        return
    allowed = {a["id"] for a in sales.list_agents(scope_user)}
    if agent_id not in allowed:
        raise HTTPException(403, "That agent isn't in your team")


class AssignReq(BaseModel):
    agent_id: Optional[str] = None

@router.post("/leads/{lid}/assign")
def assign_one(lid: str, req: AssignReq, user=Depends(current_user)):
    require(user, "admin", "manager")
    if req.agent_id:
        _assert_can_assign_to(user, req.agent_id)
    sales.assign_lead(lid, req.agent_id, user)
    return {"ok": True}

class BulkAssignReq(BaseModel):
    lead_ids: list[str]
    agent_id: str

@router.post("/leads/assign")
def assign_bulk(req: BulkAssignReq, user=Depends(current_user)):
    require(user, "admin", "manager")
    _assert_can_assign_to(user, req.agent_id)
    n = sales.bulk_assign(req.lead_ids, req.agent_id, user)
    return {"ok": True, "assigned": n}


# ─── Activities ───────────────────────────────────────────────────────────────

class ActivityReq(BaseModel):
    type: str                      # call | email | reply | note | deal
    outcome: str = ""
    notes: str = ""
    duration: Optional[int] = None
    value: Optional[float] = None

@router.post("/leads/{lid}/activity")
def log_activity(lid: str, req: ActivityReq, user=Depends(current_user)):
    # viewers can't log; everyone else logs as themselves
    require(user, "admin", "manager", "agent")
    if req.type not in sales.ACTIVITY_TYPES:
        raise HTTPException(400, f"Invalid activity type: {req.type}")
    row = sales.add_activity(lid, user["id"], req.type, req.outcome,
                             req.notes, req.duration, req.value)
    return row

@router.get("/leads/{lid}/activities")
def lead_activities(lid: str, user=Depends(current_user)):
    return {"activities": sales.list_lead_activities(lid)}


# ─── Guided call console ──────────────────────────────────────────────────────

@router.get("/call/script")
def call_script(user=Depends(current_user)):
    return {"script": sales.get_call_script()}

# ─── Editable call scripts (by category) ──────────────────────────────────────

@router.get("/call/scripts")
def call_scripts(user=Depends(current_user)):
    return {"scripts": sales.list_scripts()}

class ScriptReq(BaseModel):
    name: str
    category: str = "General"
    steps: list = []

@router.post("/call/scripts")
def create_script(req: ScriptReq, user=Depends(current_user)):
    require(user, "admin", "manager", "agent")
    return sales.create_script(req.name, req.category, req.steps, user["id"])

@router.put("/call/scripts/{sid}")
def update_script(sid: str, req: ScriptReq, user=Depends(current_user)):
    require(user, "admin", "manager", "agent")
    return sales.update_script(sid, req.name, req.category, req.steps)

@router.delete("/call/scripts/{sid}")
def delete_script(sid: str, user=Depends(current_user)):
    require(user, "admin", "manager", "agent")
    sales.delete_script(sid)
    return {"ok": True}

# ─── RFQ pipeline ─────────────────────────────────────────────────────────────

@router.get("/rfqs")
def rfqs(user=Depends(current_user)):
    return sales.list_rfqs(user)

class RfqReq(BaseModel):
    lead_id: str
    title: str = "RFQ"
    value: float = 0
    count: int = 1
    notes: str = ""

@router.post("/rfqs")
def create_rfq(req: RfqReq, user=Depends(current_user)):
    require(user, "admin", "manager", "agent")
    owner = sales.lead_owner(req.lead_id) or user["id"]
    return sales.create_rfq(req.lead_id, owner, req.title, req.value, req.count, req.notes)

class StageReq(BaseModel):
    stage: str

@router.put("/rfqs/{rid}/stage")
def move_rfq(rid: str, req: StageReq, user=Depends(current_user)):
    require(user, "admin", "manager", "agent")
    if not sales.update_rfq_stage(rid, req.stage):
        raise HTTPException(400, "Invalid stage")
    return {"ok": True}

class CallLogReq(BaseModel):
    duration: int = 0                 # seconds on the call
    outcome: str = "connected"        # connected | voicemail | no answer | callback | not interested
    live_notes: str = ""              # notes taken during the call
    wrap_notes: str = ""              # post-call summary
    rfq_secured: bool = False
    rfq_count: int = 0
    rfq_value: Optional[float] = None
    interest: Optional[int] = None    # 1–10 interest rating from the agent
    follow_up_days: int = 0           # if >0, auto-create a follow-up task

@router.post("/leads/{lid}/call")
def log_call(lid: str, req: CallLogReq, user=Depends(current_user)):
    require(user, "admin", "manager", "agent")
    # If an RFQ was secured on the call, count at least 1 even if the agent didn't specify how many.
    rfqs = max(req.rfq_count, 1) if req.rfq_secured else 0
    notes = req.wrap_notes or req.live_notes
    interest = req.interest if (req.interest and 1 <= req.interest <= 10) else None
    row = sales.add_activity(
        lid, user["id"], "call",
        outcome=req.outcome, notes=notes, duration=req.duration, interest=interest,
        rfq_count=rfqs, rfq_value=(req.rfq_value if req.rfq_secured else None),
        meta={"live_notes": req.live_notes, "wrap_notes": req.wrap_notes,
              "disposition": req.outcome, "rfq_secured": req.rfq_secured, "interest": interest},
    )
    mins = f"{req.duration // 60}:{req.duration % 60:02d}"
    detail = f"{mins} call · {req.outcome}" + (f" · {rfqs} RFQ" if rfqs else "")
    sales.audit(user, "call.logged", detail)
    # An RFQ secured on the call becomes an opportunity in the RFQ pipeline
    if rfqs:
        sales.create_rfq(lid, user["id"], "RFQ from call",
                         value=(req.rfq_value or 0), count=rfqs, notes=req.wrap_notes)
    # Optional: schedule a follow-up task from the wrap-up
    if getattr(req, "follow_up_days", 0):
        from datetime import date, timedelta
        due = (date.today() + timedelta(days=int(req.follow_up_days))).isoformat()
        sales.create_task(lid, user["id"], "Follow-up call", "followup", due, user["id"])
    return row


# ─── Tasks / follow-ups ───────────────────────────────────────────────────────

class TaskReq(BaseModel):
    lead_id: str
    title: str
    type: str = "todo"
    due_at: str            # YYYY-MM-DD

@router.post("/tasks")
def create_task(req: TaskReq, user=Depends(current_user)):
    require(user, "admin", "manager", "agent")
    owner = sales.lead_owner(req.lead_id) or user["id"]
    return sales.create_task(req.lead_id, owner, req.title, req.type, req.due_at, user["id"])

@router.get("/tasks/mine")
def my_tasks(user=Depends(current_user)):
    return {"tasks": sales.my_tasks(user["id"]), "counts": sales.task_counts(user["id"])}

@router.post("/tasks/{tid}/complete")
def complete_task(tid: str, user=Depends(current_user)):
    sales.complete_task(tid, user["id"])
    return {"ok": True}

@router.get("/leads/{lid}/tasks")
def lead_tasks(lid: str, user=Depends(current_user)):
    return {"tasks": sales.list_lead_tasks(lid)}

@router.get("/cadences")
def cadences(user=Depends(current_user)):
    return {"cadences": sales.list_cadences()}

class EnrollReq(BaseModel):
    cadence: str

@router.post("/leads/{lid}/enroll")
def enroll(lid: str, req: EnrollReq, user=Depends(current_user)):
    require(user, "admin", "manager", "agent")
    owner = sales.lead_owner(lid) or user["id"]
    n = sales.enroll_cadence(lid, owner, req.cadence, user["id"])
    if not n:
        raise HTTPException(400, "Unknown cadence")
    sales.audit(user, "cadence.enroll", f"Enrolled lead in cadence ({n} tasks)")
    return {"ok": True, "tasks_created": n}


# ─── Performance / leaderboard ────────────────────────────────────────────────

@router.get("/performance/leaderboard")
def leaderboard(frm: str = "", to: str = "", user=Depends(current_user)):
    # `frm`/`to` are YYYY-MM-DD (optional)
    return sales.leaderboard(user, frm, to)

@router.get("/performance/agent/{agent_id}")
def agent_perf(agent_id: str, frm: str = "", to: str = "", user=Depends(current_user)):
    # agents may only see themselves; managers their team; admins anyone
    if user["role"] == "agent" and agent_id != user["id"]:
        raise HTTPException(403, "Agents can only view their own performance")
    if user["role"] == "manager":
        team = {a["id"] for a in sales.list_agents(user)}
        if agent_id not in team and agent_id != user["id"]:
            raise HTTPException(403, "That agent isn't in your team")
    data = sales.agent_performance(agent_id, frm, to)
    if not data:
        raise HTTPException(404, "Agent not found")
    return data

@router.get("/performance/weights")
def get_weights(user=Depends(current_user)):
    return sales.get_weights()

class WeightsReq(BaseModel):
    rfq: Optional[float] = None
    rfq_value_per_1k: Optional[float] = None
    reply: Optional[float] = None
    call: Optional[float] = None
    email: Optional[float] = None
    note: Optional[float] = None


# ─── Targets / goals + daily series ───────────────────────────────────────────

@router.get("/targets")
def get_targets(user=Depends(current_user)):
    agents = sales.list_agents(user)
    return {"targets": [{**a, "targets": sales.get_targets(a["id"])} for a in agents]}

class TargetReq(BaseModel):
    agent_id: str
    daily_calls: int = 20
    daily_rfqs: int = 2
    daily_revenue: float = 0

@router.post("/targets")
def set_target(req: TargetReq, user=Depends(current_user)):
    require(user, "admin", "manager")
    if user["role"] == "manager":
        team = {a["id"] for a in sales.list_agents(user)}
        if req.agent_id not in team:
            raise HTTPException(403, "That agent isn't in your team")
    return sales.set_targets(req.agent_id, req.daily_calls, req.daily_rfqs, req.daily_revenue)

@router.get("/performance/daily")
def performance_daily(agent: str = "", days: int = 7, user=Depends(current_user)):
    days = max(1, min(days, 30))
    if user["role"] == "agent":
        ids = [user["id"]]
    elif agent:
        ids = [agent]
    else:
        ids = [a["id"] for a in sales.list_agents(user)]
    return {"series": sales.daily_series(ids, days)}

@router.post("/performance/weights")
def set_weights(req: WeightsReq, user=Depends(current_user)):
    require(user, "admin", "manager")
    return sales.save_weights({k: v for k, v in req.dict().items() if v is not None})
