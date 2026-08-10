"""
signal_extractor.py — Stage 2: AI Signal Extractor (Groq)
Reads raw post/job text from any social source and returns structured lead data.
Called by collector.py for Reddit, LinkedIn jobs, and forum scrapers.
"""

import httpx
import json
from config import GROQ_API_KEY, YOUR_COMPANY

# Uses Groq (same free LLM the scorer/email generator use) — no separate
# Anthropic key needed. Falls back gracefully if the key isn't configured.
GROQ_URL   = "https://api.groq.com/openai/v1/chat/completions"
GROQ_MODEL = "llama-3.3-70b-versatile"

EXTRACT_SYSTEM_PROMPT = f"""You are a B2B signal extraction engine for an industrial automation company.

COMPANY CONTEXT:
{YOUR_COMPANY}

Your job: read raw text (Reddit post, LinkedIn job listing, or forum thread) and extract structured lead data.

EXTRACTION RULES:
- company: company name if mentioned, else empty string
- person_name: poster's name or hiring manager if found, else empty string
- role: their job title or inferred role, else empty string
- domain: company website domain if found (e.g. "acme.com"), else empty string
- pain_point: 1 sentence describing their specific problem. Must reference their actual words. Empty string if no clear pain.
- intent_level: classify buying signal strength:
    "high"   = actively asking for vendor help, requesting quotes, evaluating solutions
    "medium" = describing a problem they want to solve, looking for guidance
    "low"    = general discussion, learning, theoretical
    "none"   = no buying signal, irrelevant content
- contact_hook: a ready-to-use cold email opening sentence (max 20 words) referencing their specific situation.
    Example: "Saw your post on r/PLC about integrating legacy Siemens PLCs with your MES — we've solved that exact problem."
    Empty string if intent_level is "none" or "low".

CRITICAL: Respond ONLY with valid JSON. No markdown, no preamble.
Schema:
{{
  "company": "<string>",
  "person_name": "<string>",
  "role": "<string>",
  "domain": "<string>",
  "pain_point": "<string>",
  "intent_level": "none" | "low" | "medium" | "high",
  "contact_hook": "<string>"
}}"""


def extract_signals(raw_text: str, source: str = "unknown") -> dict | None:
    """
    Sends raw social/forum/job text to Claude and returns structured lead dict.
    Returns None on API failure.
    """
    if not raw_text or len(raw_text.strip()) < 50:
        return None

    if not GROQ_API_KEY or GROQ_API_KEY == "YOUR_GROQ_KEY":
        print("    Signal extractor: GROQ_API_KEY not configured, skipping social extraction")
        return None

    # Truncate to keep token cost low — 2,000 chars is plenty for signal extraction
    truncated = raw_text[:2000]

    try:
        resp = httpx.post(
            GROQ_URL,
            headers={
                "Authorization": f"Bearer {GROQ_API_KEY}",
                "Content-Type":  "application/json",
            },
            json={
                "model":       GROQ_MODEL,
                "max_tokens":  300,
                "temperature": 0.1,
                "messages": [
                    {"role": "system", "content": EXTRACT_SYSTEM_PROMPT},
                    {"role": "user",   "content": f"Source: {source}\n\n{truncated}"},
                ],
            },
            timeout=30,
        )
        resp.raise_for_status()
        raw = resp.json()["choices"][0]["message"]["content"].strip()

        if raw.startswith("```"):
            raw = raw.split("```")[1]
            if raw.startswith("json"):
                raw = raw[4:]

        return json.loads(raw)

    except json.JSONDecodeError as e:
        print(f"    Signal extractor JSON error: {e}")
        return None
    except Exception as e:
        print(f"    Signal extractor error: {e}")
        return None


def has_buying_signal(text: str) -> bool:
    """
    Fast keyword pre-screen before calling Claude.
    Filters out clearly irrelevant posts to save API tokens.
    """
    text_lower = text.lower()
    buying_keywords = [
        "looking for", "need help", "recommend", "vendor", "integrat",
        "automat", "upgrade", "replac", "downtime", "solution",
        "plc", "scada", "mes", "iot", "opc", "historian",
        "siemens", "rockwell", "allen-bradley", "ignition",
        "predictive maintenance", "quality control", "sensor network",
        "real-time", "dashboard", "monitoring",
    ]
    return any(kw in text_lower for kw in buying_keywords)
