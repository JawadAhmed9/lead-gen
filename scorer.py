"""
scorer.py — AI Lead Scoring Engine
Powered by: Groq API (free tier) — llama-3.3-70b-versatile
Drop-in replacement for the Claude scorer. Same interface, same output schema.
Free tier: 14,400 requests/day, 30 req/min — more than enough for this pipeline.
Get your free key at: console.groq.com
"""

import httpx
import json
from config import GROQ_API_KEY, YOUR_COMPANY, MIN_ICP_SCORE

GROQ_URL   = "https://api.groq.com/openai/v1/chat/completions"
GROQ_MODEL = "llama-3.3-70b-versatile"   # best free model on Groq

SYSTEM_PROMPT = f"""You are a B2B lead scoring engine for an industrial automation company.

COMPANY CONTEXT:
{YOUR_COMPANY}

Score the lead and return ONLY valid JSON — no markdown, no explanation.

SCORING RULES:
- icp_score: 0–100
  90-100: Decision maker (VP/Director/Manager) at manufacturer/oil & gas/pharma, Gulf region, 50-5000 employees
  70-89:  Engineer or senior IC at right industry, Gulf region
  50-69:  Partial fit — right title wrong industry, or right industry wrong seniority
  20-49:  Weak fit — adjacent industry or junior title
  0-19:   Wrong industry, student, or non-Gulf
- intent_level: "high" | "medium" | "low"
- offering_match: "iot" | "ai" | "automation" | "multiple" | "none"
- reason: 1 sentence max

Return ONLY this JSON:
{{"icp_score": <int>, "intent_level": "<high|medium|low>", "offering_match": "<value>", "reason": "<1 sentence>"}}"""


def score_lead(lead: dict) -> dict | None:
    """
    Score a single enriched lead via Groq. Returns score dict or None on failure.
    """
    if not GROQ_API_KEY or GROQ_API_KEY == "YOUR_GROQ_KEY":
        print("    ⚠️  GROQ_API_KEY not set — skipping AI score")
        return None

    tech_stack = lead.get("tech_stack", "[]")
    if isinstance(tech_stack, str):
        try:
            tech_stack = json.loads(tech_stack)
        except Exception:
            tech_stack = []

    lead_prompt = f"""Score this lead:
- Name: {lead.get('first_name', '')} {lead.get('last_name', '')}
- Title: {lead.get('title', 'Unknown')}
- Company: {lead.get('company', 'Unknown')}
- Industry: {lead.get('industry') or lead.get('company_size') or 'Unknown'}
- Employees: {lead.get('company_size') or lead.get('employee_count', 'Unknown')}
- Tech stack: {', '.join(tech_stack) if tech_stack else 'None'}
- Country: {lead.get('country', 'Unknown')}
- Has email: {bool(lead.get('email'))}"""

    import time as _time

    PAYLOAD = {
        "model":       GROQ_MODEL,
        "max_tokens":  200,
        "temperature": 0.1,
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user",   "content": lead_prompt},
        ],
    }
    HEADERS = {
        "Authorization": f"Bearer {GROQ_API_KEY}",
        "Content-Type":  "application/json",
    }

    # Retry up to 4 times on 429 with exponential backoff (2s → 4s → 8s → 16s)
    for attempt in range(4):
        try:
            resp = httpx.post(GROQ_URL, headers=HEADERS, json=PAYLOAD, timeout=20)

            if resp.status_code == 429:
                wait = 2 ** (attempt + 1)
                print(f"    ⏳ Groq rate limit — waiting {wait}s (attempt {attempt+1}/4)")
                _time.sleep(wait)
                continue

            resp.raise_for_status()
            raw = resp.json()["choices"][0]["message"]["content"].strip()

            # Strip markdown fences if model adds them
            if raw.startswith("```"):
                raw = raw.split("```")[1]
                if raw.startswith("json"):
                    raw = raw[4:]
            raw = raw.strip()

            score = json.loads(raw)
            verdict = "🟢 QUEUE" if score["icp_score"] >= MIN_ICP_SCORE else "🔴 DROP"
            print(f"    {verdict} score={score['icp_score']} intent={score['intent_level']} match={score['offering_match']}")
            print(f"    Reason: {score['reason']}")
            return score

        except json.JSONDecodeError as e:
            print(f"    ❌ Groq returned invalid JSON: {e} | raw: {raw[:100]}")
            return None
        except Exception as e:
            if "429" in str(e):
                wait = 2 ** (attempt + 1)
                print(f"    ⏳ Groq rate limit — waiting {wait}s (attempt {attempt+1}/4)")
                _time.sleep(wait)
                continue
            print(f"    ❌ Scoring error: {e}")
            return None

    print("    ❌ Groq rate limit persists after 4 retries — falling back to rule-based")
    return None
