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
    deal_won: Optional[float] = None
    revenue_per_1k: Optional[float] = None
    reply: Optional[float] = None
    call: Optional[float] = None
    email: Optional[float] = None
    note: Optional[float] = None

@router.post("/performance/weights")
def set_weights(req: WeightsReq, user=Depends(current_user)):
    require(user, "admin", "manager")
    return sales.save_weights({k: v for k, v in req.dict().items() if v is not None})
