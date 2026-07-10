"""
modules/email_gen.py — Personalized Cold Email Generator
Generates unique, context-aware cold emails per lead.
Powered by: Claude API (Anthropic) ← no templates, every email is unique
"""

import httpx
import json
from config import ANTHROPIC_API_KEY, CLAUDE_MODEL, YOUR_COMPANY


ANTHROPIC_URL = "https://api.anthropic.com/v1/messages"

EMAIL_SYSTEM_PROMPT = f"""You are a cold email copywriter for an industrial automation company.

COMPANY:
{YOUR_COMPANY}

RULES:
- Email must be 3 sentences max in the body (not counting subject)
- First sentence: reference something specific about their company/role (not generic)
- Second sentence: connect their apparent challenge to one specific thing we do
- Third sentence: low-pressure CTA — ask for a 15-min call or if they're the right person
- Subject line: max 8 words, no clickbait, no "quick question", no exclamation marks
- Tone: peer-to-peer, confident, not salesy
- Never mention "AI-generated" or "automated"
- Always address by first name only
- Do NOT use: "I hope this email finds you well", "touch base", "synergy", "leverage"

CRITICAL: Respond ONLY with valid JSON. No markdown.
Schema:
{{
  "subject": "<email subject>",
  "body": "<full email body — 3 sentences, include greeting and sign-off>"
}}"""


def generate_email(lead: dict, score: dict) -> dict | None:
    """
    Generates a personalized cold email for a scored lead.
    Returns dict with subject + body, or None on failure.
    """
    tech_stack = lead.get("tech_stack", "[]")
    if isinstance(tech_stack, str):
        try:
            tech_stack = json.loads(tech_stack)
        except Exception:
            tech_stack = []

    # Filter tech stack to relevant OT/industrial tools for context
    relevant_tech = [t for t in tech_stack if any(
        kw in t.lower() for kw in
        ["sap", "scada", "plc", "mes", "erp", "oracle", "siemens", "rockwell",
         "ignition", "wonderware", "aveva", "opc", "historian"]
    )]

    lead_context = f"""
Write a cold email for this lead:
- First name: {lead.get('first_name', 'there')}
- Title: {lead.get('title', 'Unknown role')}
- Company: {lead.get('company', 'their company')}
- Industry: {lead.get('industry', 'manufacturing')}
- Company size: {lead.get('company_size', 'mid-size')} employees
- Detected tech stack (relevant): {', '.join(relevant_tech) if relevant_tech else 'standard industrial stack'}
- Our best offering match for them: {score.get('offering_match', 'automation')}
- Scoring reason: {score.get('reason', '')}

Sign the email from: "The [Your Name] Team" — replace [Your Name] with a placeholder.
"""

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
                "max_tokens": 512,
                "system":     EMAIL_SYSTEM_PROMPT,
                "messages":   [{"role": "user", "content": lead_context}],
            },
            timeout=30,
        )
        resp.raise_for_status()
        raw = resp.json()["content"][0]["text"].strip()

        if raw.startswith("```"):
            raw = raw.split("```")[1]
            if raw.startswith("json"):
                raw = raw[4:]

        email = json.loads(raw)
        print(f"    ✉️  Subject: {email['subject']}")
        return email

    except json.JSONDecodeError as e:
        print(f"    ❌ Email gen JSON error: {e}")
        return None
    except Exception as e:
        print(f"    ❌ Email gen error: {e}")
        return None
