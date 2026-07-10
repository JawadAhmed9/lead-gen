"""
auth.py — DB-backed authentication dependency (shared by api_server + sales_api).

Replaces the old in-memory user dict. Sessions are still in-memory tokens, but
users now live in the `users` table (see sales.py). Kept dependency-light so both
the main app and the sales router can import it without circular imports.
"""

from fastapi import Header, HTTPException
import secrets
import sales

# token -> user_id  (in-memory session store)
SESSIONS: dict[str, str] = {}


def login_user(email: str, password: str):
    """Return (token, user_row) on success, else None."""
    u = sales.get_user_by_email(email)
    if not u or not sales.verify_pw(password, u.get("password", "")):
        return None
    token = secrets.token_urlsafe(32)
    SESSIONS[token] = u["id"]
    return token, u


def logout_token(authorization: str | None):
    if authorization and authorization.startswith("Bearer "):
        SESSIONS.pop(authorization.split(" ", 1)[1], None)


def current_user(authorization: str = Header(None)) -> dict:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(401, "Not authenticated")
    token = authorization.split(" ", 1)[1]
    uid = SESSIONS.get(token)
    if not uid:
        raise HTTPException(401, "Invalid or expired token")
    u = sales.get_user_by_id(uid)
    if not u:
        raise HTTPException(401, "User not found")
    return u


def require(user: dict, *roles: str):
    if user["role"] not in roles:
        raise HTTPException(403, "Insufficient permissions")


def public_user(u: dict) -> dict:
    """Strip sensitive fields for API responses."""
    return {"id": u["id"], "name": u["name"], "email": u["email"],
            "role": u["role"], "manager_id": u.get("manager_id")}
