"""
email_gen.py — Personalized cold-email generator.

Powered by Groq (the same free key the scorer uses) so drafting works with the
key you already have — no Anthropic/Claude key required. Falls back to a clean
template if Groq is unavailable, so the Compose screen always returns a draft.
"""

import httpx
import json
from config import GROQ_API_KEY, YOUR_COMPANY

GROQ_URL   = "https://api.groq.com/openai/v1/chat/completions"
GROQ_MODEL = "llama-3.3-70b-versatile"

EMAIL_SYSTEM_PROMPT = f"""You are a cold email copywriter for an industrial automation company.

COMPANY:
{YOUR_COMPANY}

RULES:
- Body: 3 sentences max (not counting greeting/sign-off).
- First sentence: reference something specific about their company/role (not generic).
- Second sentence: connect their likely challenge to one specific thing we do.
- Third sentence: low-pressure CTA — ask for a 15-min call.
- Subject: max 8 words, no clickbait, no exclamation marks.
- Tone: peer-to-peer, confident, not salesy. Address by first name only.
- Avoid: "I hope this email finds you well", "touch base", "synergy", "leverage".

Respond ONLY with valid JSON, no markdown:
{{"subject": "<subject>", "body": "<full body with greeting and sign-off>"}}"""


def _template(lead: dict, score: dict) -> dict:
    """Deterministic fallback draft — used if Groq isn't available."""
    first = lead.get("first_name") or "there"
    company = lead.get("company") or "your team"
    offer = score.get("offering_match") or "industrial automation"
    subject = f"{company} — {offer}".strip(" —")[:60]
    body = (
        f"Hi {first},\n\n"
        f"I came across {company} and wanted to reach out. We help industrial and "
        f"manufacturing teams cut downtime and gain real-time visibility with "
        f"{offer} solutions. Would you be open to a quick 15-minute call to see if "
        f"it's relevant for your operations?\n\n"
        f"Best,\nThe Stemronic Team"
    )
    return {"subject": subject, "body": body}


def generate_email(lead: dict, score: dict) -> dict | None:
    """Generate a personalized cold email. Returns {subject, body}."""
    if not GROQ_API_KEY or GROQ_API_KEY in ("", "YOUR_GROQ_KEY"):
        return _template(lead, score)

    tech_stack = lead.get("tech_stack", "[]")
    if isinstance(tech_stack, str):
        try:
            tech_stack = json.loads(tech_stack)
        except Exception:
            tech_stack = []
    relevant = [t for t in tech_stack if any(kw in str(t).lower() for kw in
                ["sap", "scada", "plc", "mes", "erp", "oracle", "siemens",
                 "rockwell", "ignition", "wonderware", "aveva", "opc", "historian"])]

    lead_context = f"""Write a cold email for this lead:
- First name: {lead.get('first_name', 'there')}
- Title: {lead.get('title', 'Unknown role')}
- Company: {lead.get('company', 'their company')}
- Industry: {lead.get('industry', 'manufacturing')}
- Company size: {lead.get('company_size', 'mid-size')} employees
- Relevant tech: {', '.join(relevant) if relevant else 'standard industrial stack'}
- Best offering match: {score.get('offering_match', 'automation')}
Sign off as "The Stemronic Team"."""

    try:
        resp = httpx.post(
            GROQ_URL,
            headers={"Authorization": f"Bearer {GROQ_API_KEY}", "Content-Type": "application/json"},
            json={
                "model": GROQ_MODEL,
                "max_tokens": 400,
                "temperature": 0.5,
                "messages": [
                    {"role": "system", "content": EMAIL_SYSTEM_PROMPT},
                    {"role": "user", "content": lead_context},
                ],
            },
            timeout=25,
        )
        resp.raise_for_status()
        raw = resp.json()["choices"][0]["message"]["content"].strip()
        if raw.startswith("```"):
            raw = raw.split("```")[1]
            if raw.startswith("json"):
                raw = raw[4:]
        email = json.loads(raw.strip())
        if not email.get("subject") or not email.get("body"):
            return _template(lead, score)
        return {"subject": email["subject"], "body": email["body"]}
    except Exception as e:
        print(f"    email gen fell back to template: {e}")
        return _template(lead, score)
