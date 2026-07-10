"""
reply_handler.py — Incoming Reply Classifier + Notification Hub
Classifies inbound email replies as: interested | objection | unsubscribe | ooo
Fires Slack/Telegram alerts on "interested" replies.
Sends Google Ads offline conversion for leads that came via Google Ads (have a gclid).

HOW TO USE:
  Run as a separate process: python reply_handler.py
  Point your Brevo inbound webhook to: http://YOUR_SERVER:8001/webhook/reply
  Get a public URL for local testing: ngrok http 8001

BREVO INBOUND SETUP:
  1. Go to app.brevo.com → Inbound Parsing
  2. Add your domain and point MX records to Brevo
  3. Set webhook URL to http://YOUR_SERVER:8001/webhook/reply
"""

import httpx
import json
from config import (
    ANTHROPIC_API_KEY, CLAUDE_MODEL,
    SLACK_WEBHOOK_URL,
    TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID,
)

ANTHROPIC_URL = "https://api.anthropic.com/v1/messages"

CLASSIFY_PROMPT = """You classify cold email replies for a B2B industrial automation company.

Reply classifications:
- "interested"   — any buying signal, wants to talk, asks a question about the product/service
- "objection"    — not now, wrong time, already have a solution, budget issue, wrong person
- "unsubscribe"  — remove me, stop emailing, unsubscribe, not interested (explicitly stated)
- "ooo"          — out of office auto-reply

CRITICAL: Respond ONLY with valid JSON.
Schema: {"classification": "interested" | "objection" | "unsubscribe" | "ooo", "summary": "<5 words max>"}"""


# ─── CLAUDE CLASSIFICATION ───────────────────────────────────────────────────

def classify_reply(reply_text: str) -> dict:
    """Send reply text to Claude for classification. Returns classification dict."""
    try:
        resp = httpx.post(
            ANTHROPIC_URL,
            headers={
                "x-api-key":         ANTHROPIC_API_KEY,
                "anthropic-version": "2023-06-01",
                "content-type":      "application/json",
            },
            json={
                "model":      CLAUDE_MODEL,
                "max_tokens": 64,
                "system":     CLASSIFY_PROMPT,
                "messages":   [{"role": "user", "content": f"Reply:\n{reply_text}"}],
            },
            timeout=20,
        )
        resp.raise_for_status()
        raw = resp.json()["content"][0]["text"].strip()
        return json.loads(raw)
    except Exception as e:
        print(f"Reply classification error: {e}")
        return {"classification": "objection", "summary": "classification failed"}


# ─── NOTIFICATIONS ───────────────────────────────────────────────────────────

def notify_slack(lead_email: str, summary: str, reply_text: str):
    """Fire a Slack incoming webhook notification for an interested reply."""
    if not SLACK_WEBHOOK_URL:
        return

    message = {
        "text": f":fire: *Interested Reply* from `{lead_email}`",
        "blocks": [
            {
                "type": "section",
                "text": {
                    "type": "mrkdwn",
                    "text": f":fire: *Interested reply* from `{lead_email}`\n*Summary:* {summary}",
                },
            },
            {
                "type": "section",
                "text": {
                    "type": "mrkdwn",
                    "text": f"*Reply:*\n```{reply_text[:500]}```",
                },
            },
        ],
    }

    try:
        resp = httpx.post(SLACK_WEBHOOK_URL, json=message, timeout=10)
        resp.raise_for_status()
        print(f"  Slack notified")
    except Exception as e:
        print(f"  Slack notification failed: {e}")


def notify_telegram(lead_email: str, summary: str, reply_text: str):
    """Send a Telegram bot message for an interested reply."""
    if not TELEGRAM_BOT_TOKEN or not TELEGRAM_CHAT_ID:
        return

    text = (
        f"🔥 *Interested Reply*\n"
        f"From: `{lead_email}`\n"
        f"Summary: {summary}\n\n"
        f"Reply:\n_{reply_text[:400]}_"
    )

    try:
        resp = httpx.post(
            f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/sendMessage",
            json={
                "chat_id":    TELEGRAM_CHAT_ID,
                "text":       text,
                "parse_mode": "Markdown",
            },
            timeout=10,
        )
        resp.raise_for_status()
        print(f"  Telegram notified")
    except Exception as e:
        print(f"  Telegram notification failed: {e}")


def send_interested_notifications(lead_email: str, summary: str, reply_text: str):
    """Fire all configured notification channels for an interested reply."""
    notify_slack(lead_email, summary, reply_text)
    notify_telegram(lead_email, summary, reply_text)


# ─── UNSUBSCRIBE HANDLING ────────────────────────────────────────────────────

def handle_unsubscribe(lead_email: str):
    """Add email to Brevo suppression list and log it."""
    try:
        from dispatcher import add_to_suppression
        add_to_suppression(lead_email)
        print(f"  Unsubscribed: {lead_email} added to Brevo blocklist")
    except Exception as e:
        print(f"  Suppression error: {e}")


# ─── WEBHOOK SERVER ──────────────────────────────────────────────────────────

if __name__ == "__main__":
    try:
        from fastapi import FastAPI, Request, HTTPException
        import uvicorn
        import sys
        import os
        sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))
        from database import save_reply, get_lead_by_email

        app = FastAPI()

        @app.post("/webhook/reply")
        async def handle_reply(request: Request):
            """
            Handles inbound reply webhook from Brevo.
            Brevo inbound payload: https://developers.brevo.com/docs/inbound-parse-webhooks
            Also supports Brevo transactional event webhooks.
            """
            data = await request.json()

            # Handle both Brevo inbound email format and transactional event format
            if "From" in data:
                # Brevo inbound email webhook
                lead_email = data.get("From", "")
                reply_text = data.get("RawHtmlBody") or data.get("RawTextBody") or ""
                # Strip quoted previous email (lines starting with ">")
                reply_lines = [l for l in reply_text.splitlines() if not l.startswith(">")]
                reply_text = "\n".join(reply_lines).strip()
            elif "email" in data:
                # Generic / Brevo transactional event format
                lead_email = data.get("email", "")
                reply_text = data.get("reply_text") or data.get("body", "")
            else:
                raise HTTPException(status_code=400, detail="Unrecognized webhook payload")

            if not lead_email or not reply_text:
                return {"status": "ignored", "reason": "empty email or body"}

            print(f"\n Reply from {lead_email}")
            result = classify_reply(reply_text)
            classification = result.get("classification", "objection")
            summary = result.get("summary", "")
            print(f"  Classification: {classification} — {summary}")

            # Look up the lead in DB by email
            lead = get_lead_by_email(lead_email)
            lead_id = lead["id"] if lead else lead_email

            save_reply(lead_id, reply_text, classification)

            if classification == "interested":
                print(f"  INTERESTED LEAD: {lead_email}")
                send_interested_notifications(lead_email, summary, reply_text)

                # Google Ads offline conversion — only if lead came from Google Ads
                if lead and lead.get("gclid"):
                    try:
                        from ads_conversion import upload_conversion
                        upload_conversion(
                            gclid=lead["gclid"],
                            conversion_value=0.0,   # no monetary value at reply stage
                        )
                        print(f"  Google Ads conversion uploaded for gclid {lead['gclid'][:12]}...")
                    except Exception as e:
                        print(f"  Google Ads conversion upload failed: {e}")

            elif classification == "unsubscribe":
                handle_unsubscribe(lead_email)

            return {"status": "ok", "classification": classification}

        @app.get("/health")
        async def health():
            return {"status": "ok"}

        print("Reply webhook server starting on port 8001")
        print("Listening at: http://0.0.0.0:8001/webhook/reply")
        uvicorn.run(app, host="0.0.0.0", port=8001)

    except ImportError as e:
        print(f"Missing dependency: {e}")
        print("Install with: pip install fastapi uvicorn")
