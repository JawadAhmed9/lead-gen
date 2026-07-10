"""
modules/enricher.py — Lead Enrichment
Finds verified work email via Hunter.io
Detects tech stack via Wappalyzer API
Powered by: Hunter API (bought) + Wappalyzer API (free tier available)
"""

import httpx
import json
from config import HUNTER_API_KEY, APOLLO_API_KEY


HUNTER_BASE     = "https://api.hunter.io/v2"
WAPPALYZER_BASE = "https://api.wappalyzer.com/v2"   # free: 50 lookups/mo
APOLLO_BASE     = "https://api.apollo.io/v1"

APOLLO_HEADERS  = {
    "Content-Type": "application/json",
    "Cache-Control": "no-cache",
    "X-Api-Key": APOLLO_API_KEY,
}


def enrich_org_apollo(domain: str) -> dict:
    """
    Apollo Organization Enrichment — feed a domain, get back:
    industry, employee count, revenue, tech stack, HQ location, LinkedIn URL.
    No email credits consumed — uses org enrichment quota.
    Returns {} if domain is empty or call fails.
    """
    if not domain:
        return {}
    try:
        resp = httpx.post(
            f"{APOLLO_BASE}/organizations/enrich",
            params={"domain": domain},
            headers=APOLLO_HEADERS,
            timeout=15,
        )
        if resp.status_code != 200:
            return {}
        org = resp.json().get("organization") or {}
        return {
            "industry":       org.get("industry", ""),
            "employee_count": org.get("estimated_num_employees"),
            "revenue":        org.get("annual_revenue_printed", ""),
            "hq_city":        org.get("city", ""),
            "hq_country":     org.get("country", ""),
            "linkedin_url":   org.get("linkedin_url", ""),
            "tech_stack":     [t.get("name") for t in (org.get("current_technologies") or []) if t.get("name")][:20],
            "short_desc":     org.get("short_description", ""),
        }
    except Exception as e:
        print(f"    Apollo org enrich error for {domain}: {e}")
        return {}


def find_email(first_name: str, last_name: str, domain: str) -> dict:
    """
    Hunter.io email finder — returns email + confidence score.
    Returns {} if not found.
    """
    if not domain or not first_name:
        return {}

    try:
        resp = httpx.get(
            f"{HUNTER_BASE}/email-finder",
            params={
                "domain":       domain,
                "first_name":   first_name,
                "last_name":    last_name,
                "api_key":      HUNTER_API_KEY,
            },
            timeout=15,
        )
        resp.raise_for_status()
        data = resp.json().get("data", {})

        return {
            "email":          data.get("email"),
            "email_verified": data.get("verification", {}).get("status") == "valid",
            "confidence":     data.get("score", 0),
        }
    except Exception as e:
        print(f"    Hunter error for {domain}: {e}")
        return {}


def get_tech_stack(domain: str) -> list[str]:
    """
    Wappalyzer API — detects tech stack from company domain.
    Falls back to empty list on error (non-critical).
    Free tier: 50 lookups/month. Enough for validation phase.
    """
    if not domain:
        return []

    try:
        resp = httpx.get(
            f"{WAPPALYZER_BASE}/lookup/",
            params={"urls": f"https://{domain}"},
            headers={"x-api-key": "free"},   # replace with paid key when ready
            timeout=15,
        )
        if resp.status_code != 200:
            return []
        results = resp.json()
        if not results:
            return []

        techs = []
        for entry in results:
            for tech in entry.get("technologies", []):
                name = tech.get("name", "")
                if name:
                    techs.append(name)
        return techs[:20]   # cap to top 20

    except Exception:
        return []


def enrich_lead(lead: dict) -> dict:
    """
    Runs full enrichment on a single lead.
    Returns merged enrichment dict.
    """
    print(f"  Enriching: {lead['first_name']} {lead['last_name']} @ {lead['company']}")

    # 1. Find email
    email_data = find_email(
        lead.get("first_name", ""),
        lead.get("last_name", ""),
        lead.get("domain", ""),
    )

    # 2. Detect tech stack
    tech_stack = get_tech_stack(lead.get("domain", ""))

    enrichment = {
        "email":          email_data.get("email"),
        "email_verified": email_data.get("email_verified", False),
        "confidence":     email_data.get("confidence", 0),
        "company_size":   lead.get("employee_count"),
        "industry":       lead.get("industry"),
        "tech_stack":     tech_stack,
    }

    status = "✅" if enrichment["email"] and enrichment["email_verified"] else "⚠️ no verified email"
    print(f"    {status} — {enrichment.get('email', 'none')}")

    return enrichment
