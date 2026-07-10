"""
dispatcher.py — Email Outreach via Brevo Transactional Email API
Free tier: 300 emails/day permanently, no expiry, no credit card.
API docs: https://developers.brevo.com/reference/sendtransacemail
"""

import httpx
from datetime import datetime, timedelta
from config import BREVO_API_KEY, BREVO_SENDER_EMAIL, BREVO_SENDER_NAME

BREVO_BASE = "https://api.brevo.com/v3"

HEADERS = {
    "api-key": BREVO_API_KEY,
    "Content-Type": "application/json",
    "Accept": "application/json",
}


def send_email(lead: dict, email: dict) -> str | None:
    """
    Sends a single transactional email via Brevo.
    Returns Brevo messageId on success, None on failure.
    """
    recipient_name = f"{lead.get('first_name', '')} {lead.get('last_name', '')}".strip()

    payload = {
        "sender": {
            "name": BREVO_SENDER_NAME,
            "email": BREVO_SENDER_EMAIL,
        },
        "to": [{"email": lead["email"], "name": recipient_name}],
        "subject": email["subject"],
        "textContent": email["body"],
        "tags": ["cold-outreach", lead.get("offering_match", "automation")],
        "headers": {
            "X-Lead-ID": str(lead.get("id", "")),
            "X-Entity-Ref-ID": str(lead.get("id", "")),
        },
    }

    try:
        resp = httpx.post(
            f"{BREVO_BASE}/smtp/email",
            headers=HEADERS,
            json=payload,
            timeout=20,
        )
        resp.raise_for_status()
        message_id = resp.json().get("messageId", "")
        print(f"    Sent via Brevo — messageId: {message_id}")
        return message_id

    except httpx.HTTPStatusError as e:
        print(f"    Brevo HTTP {e.response.status_code}: {e.response.text[:200]}")
        return None
    except Exception as e:
        print(f"    Brevo error: {e}")
        return None


def get_send_stats(days: int = 7) -> dict:
    """Fetch aggregated transactional email stats from Brevo."""
    start = (datetime.utcnow() - timedelta(days=days)).strftime("%Y-%m-%d")
    end = datetime.utcnow().strftime("%Y-%m-%d")

    try:
        resp = httpx.get(
            f"{BREVO_BASE}/smtp/statistics/aggregatedReport",
            headers=HEADERS,
            params={"startDate": start, "endDate": end},
            timeout=15,
        )
        resp.raise_for_status()
        return resp.json()
    except Exception as e:
        print(f"Could not fetch Brevo stats: {e}")
        return {}


def add_contact_to_list(email: str, list_id: int, attributes: dict = None) -> bool:
    """
    Upserts a contact in Brevo and adds them to a list.
    Useful for segmenting replied/unsubscribed contacts.
    """
    payload = {
        "email": email,
        "listIds": [list_id],
        "updateEnabled": True,
    }
    if attributes:
        payload["attributes"] = attributes

    try:
        resp = httpx.post(
            f"{BREVO_BASE}/contacts",
            headers=HEADERS,
            json=payload,
            timeout=15,
        )
        # 201 = created, 204 = updated (both are success)
        return resp.status_code in (201, 204)
    except Exception as e:
        print(f"    Brevo contact upsert error: {e}")
        return False


def add_to_suppression(email: str) -> bool:
    """Adds an email to Brevo's transactional blocklist (unsubscribe)."""
    try:
        resp = httpx.post(
            f"{BREVO_BASE}/contacts/blocklist",
            headers=HEADERS,
            json={"emails": [email]},
            timeout=15,
        )
        resp.raise_for_status()
        return True
    except Exception as e:
        print(f"    Brevo suppression error: {e}")
        return False
