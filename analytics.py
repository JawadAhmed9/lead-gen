"""
analytics.py — Read-only analytics + explainability layer for the Lead Pipeline API.

Everything here is ADDITIVE and READ-ONLY. It does not touch the collect/enrich/
score pipeline. All numbers are computed live from the existing SQLite tables
(raw_leads / enriched_leads / scored_leads). The only non-DB inputs are the
business assumptions (avg deal size, win rate, monthly tooling cost) which are
user-editable and persisted in pipeline_settings.json — never hard-coded results.

The raw data is messy (city names in the country column, numeric junk in
industry, employee_count=0 for most Apollo rows), so we normalize at query time
for display. Normalization is transparent and reversible — we never mutate the
stored rows.
"""

from __future__ import annotations
import re

# ─── Config pulled from the single source of truth (config.py) ────────────────
try:
    from config import (
        ICP_TITLES, ICP_INDUSTRIES, ICP_COMPANY_SIZE,
        MIN_ICP_SCORE, HIGH_INTENT_SCORE,
    )
except Exception:  # keep analytics resilient even if config import changes
    ICP_TITLES = []
    ICP_INDUSTRIES = ["manufacturing", "automotive", "food processing",
                      "oil and gas", "pharmaceuticals", "logistics"]
    ICP_COMPANY_SIZE = {"min": 50, "max": 5000}
    MIN_ICP_SCORE = 45
    HIGH_INTENT_SCORE = 70


# ─── Country normalization (GCC-aware) ────────────────────────────────────────
# The country column mixes ISO codes, country names, and city names. Map every
# known GCC city/code to its canonical country so charts read cleanly.
_CITY_TO_COUNTRY = {
    # Saudi Arabia
    "sa": "Saudi Arabia", "ksa": "Saudi Arabia", "saudi arabia": "Saudi Arabia",
    "jeddah": "Saudi Arabia", "riyadh": "Saudi Arabia", "dammam": "Saudi Arabia",
    "khobar": "Saudi Arabia", "al khobar": "Saudi Arabia", "jubail": "Saudi Arabia",
    "yanbu": "Saudi Arabia", "tabuk": "Saudi Arabia", "najran": "Saudi Arabia",
    "makkah": "Saudi Arabia", "mecca": "Saudi Arabia", "medina": "Saudi Arabia",
    "kaec": "Saudi Arabia", "dhahran": "Saudi Arabia", "abha": "Saudi Arabia",
    "hail": "Saudi Arabia", "qassim": "Saudi Arabia", "buraidah": "Saudi Arabia",
    # UAE
    "united arab emirates": "United Arab Emirates", "uae": "United Arab Emirates",
    "ae": "United Arab Emirates", "dubai": "United Arab Emirates",
    "abu dhabi": "United Arab Emirates", "sharjah": "United Arab Emirates",
    "ajman": "United Arab Emirates", "al ain": "United Arab Emirates",
    # Qatar
    "qatar": "Qatar", "qa": "Qatar", "doha": "Qatar",
    # Kuwait
    "kuwait": "Kuwait", "kw": "Kuwait", "kuwait city": "Kuwait",
    # Bahrain
    "bahrain": "Bahrain", "bh": "Bahrain", "manama": "Bahrain",
    # Oman
    "oman": "Oman", "om": "Oman", "muscat": "Oman", "sohar": "Oman", "salalah": "Oman",
}

GCC_COUNTRIES = ["Saudi Arabia", "United Arab Emirates", "Qatar",
                 "Kuwait", "Bahrain", "Oman"]


def normalize_country(raw: str | None) -> str:
    if not raw:
        return "Unspecified"
    key = str(raw).strip().lower()
    if not key or key in ("_", "-", "n/a", "na", "none", "null"):
        return "Unspecified"
    return _CITY_TO_COUNTRY.get(key, str(raw).strip().title())


def is_gcc(raw: str | None) -> bool:
    return normalize_country(raw) in GCC_COUNTRIES


# ─── Industry normalization ───────────────────────────────────────────────────
_NUMERIC_RE = re.compile(r"^\s*\d+(\.\d+)?\s*$")


def normalize_industry(raw: str | None) -> str:
    if not raw:
        return "Unspecified"
    v = str(raw).strip()
    if not v or v in ("_", "-") or _NUMERIC_RE.match(v):
        return "Unspecified"
    # Title-case but keep common acronyms tidy
    return v[:1].upper() + v[1:] if len(v) > 1 else v.upper()


# ─── Company-size bands ───────────────────────────────────────────────────────
# Prefer the enriched company_size; fall back to raw employee_count. Apollo rows
# very often have employee_count=0, which we treat as unknown (not "1-50").
_BANDS = [
    (1, 50, "1–50"),
    (51, 200, "51–200"),
    (201, 1000, "201–1,000"),
    (1001, 5000, "1,001–5,000"),
    (5001, 10**9, "5,000+"),
]
BAND_ORDER = ["1–50", "51–200", "201–1,000", "1,001–5,000", "5,000+", "Unknown"]


def size_band(company_size, employee_count) -> str:
    n = None
    for candidate in (company_size, employee_count):
        try:
            c = int(candidate) if candidate is not None else 0
        except (TypeError, ValueError):
            c = 0
        if c and c > 0:
            n = c
            break
    if not n:
        return "Unknown"
    for lo, hi, label in _BANDS:
        if lo <= n <= hi:
            return label
    return "Unknown"


# ─── ICP fit factors (explainability) ─────────────────────────────────────────
# A transparent decomposition of *why* a lead fits the ICP, derived from the
# lead's real attributes vs. the ICP config. This complements the model's stored
# icp_score/reason — it is clearly labelled in the UI as "ICP fit factors" and is
# not presented as the model's own output.

def _title_fit(title: str | None) -> int:
    if not title:
        return 0
    t = title.lower()
    # Strong signals for decision-maker / relevant IC titles
    senior = ["ceo", "cto", "coo", "vp", "vice president", "director", "head",
              "chief", "owner", "founder", "president", "gm", "general manager"]
    mid = ["manager", "lead", "superintendent"]
    relevant = ["operation", "plant", "manufactur", "engineer", "automation",
                "production", "maintenance", "process", "control", "technical"]
    # Exact-ish match against configured ICP titles
    for it in ICP_TITLES:
        if it.lower() in t or t in it.lower():
            return 100
    has_relevant = any(k in t for k in relevant)
    if any(k in t for k in senior):
        return 100 if has_relevant else 75
    if any(k in t for k in mid):
        return 85 if has_relevant else 60
    if has_relevant:
        return 70
    return 30


def _industry_fit(industry: str | None) -> int:
    norm = normalize_industry(industry)
    if norm == "Unspecified":
        return 0
    low = norm.lower()
    for icp in ICP_INDUSTRIES:
        if icp.lower() in low or low in icp.lower():
            return 100
    keywords = ["manufactur", "automation", "industrial", "oil", "gas", "energy",
                "chemical", "pharma", "food", "logistic", "mining", "plastic",
                "packaging", "paper", "machinery", "automotive"]
    if any(k in low for k in keywords):
        return 85
    return 25


def _region_fit(country: str | None) -> int:
    return 100 if is_gcc(country) else 0


def _size_fit(company_size, employee_count) -> int:
    band = size_band(company_size, employee_count)
    if band == "Unknown":
        return 0
    n = None
    for candidate in (company_size, employee_count):
        try:
            c = int(candidate) if candidate is not None else 0
        except (TypeError, ValueError):
            c = 0
        if c > 0:
            n = c
            break
    lo, hi = ICP_COMPANY_SIZE.get("min", 50), ICP_COMPANY_SIZE.get("max", 5000)
    if n is None:
        return 0
    if lo <= n <= hi:
        return 100
    if n < lo:
        return 55 if n >= lo / 2 else 35
    return 70  # bigger than target — still a real opportunity


def _contact_fit(email, email_verified, phone) -> int:
    score = 0
    if email:
        score += 60 if email_verified else 35
    if phone:
        score += 40
    return min(score, 100)


# weights sum to 100
_FACTOR_WEIGHTS = {
    "Title / seniority": 25,
    "Industry": 25,
    "Region": 20,
    "Company size": 15,
    "Contactability": 15,
}


def icp_factors(lead: dict) -> dict:
    """Return a transparent breakdown of ICP fit for a single lead dict."""
    factors = {
        "Title / seniority": _title_fit(lead.get("title")),
        "Industry": _industry_fit(lead.get("enriched_industry") or lead.get("industry")),
        "Region": _region_fit(lead.get("country")),
        "Company size": _size_fit(lead.get("company_size"), lead.get("employee_count")),
        "Contactability": _contact_fit(
            lead.get("email"), lead.get("email_verified"), lead.get("phone")
        ),
    }
    weighted = sum(factors[k] * _FACTOR_WEIGHTS[k] for k in factors) / 100.0
    return {
        "factors": [
            {"label": k, "score": factors[k], "weight": _FACTOR_WEIGHTS[k]}
            for k in _FACTOR_WEIGHTS
        ],
        "fit_score": round(weighted),
    }


# ─── Aggregate helpers (operate on a sqlite3 connection with Row factory) ─────

def _scalar(conn, sql, params=()):
    row = conn.execute(sql, params).fetchone()
    return row[0] if row else 0


def overview(conn, economics: dict) -> dict:
    """Outcome KPIs + conversion funnel. economics = user-set assumptions."""
    stage = {s: _scalar(conn, "SELECT COUNT(*) FROM raw_leads WHERE status=?", (s,))
             for s in ["raw", "enriched", "scored", "queued", "sent", "replied"]}
    total = _scalar(conn, "SELECT COUNT(*) FROM raw_leads")

    # A lead is "qualified" once it reaches queued (score >= MIN_ICP_SCORE).
    qualified = stage["queued"]
    # cumulative counts for a meaningful funnel (each stage includes those beyond it)
    reached = {
        "collected": total,
        "enriched": _scalar(conn, "SELECT COUNT(*) FROM enriched_leads"),
        "scored": _scalar(conn, "SELECT COUNT(*) FROM scored_leads"),
        "qualified": qualified,
    }

    def rate(n, d):
        return round(100.0 * n / d, 1) if d else 0.0

    funnel = [
        {"stage": "Collected", "count": reached["collected"], "rate_from_prev": 100.0},
        {"stage": "Enriched", "count": reached["enriched"],
         "rate_from_prev": rate(reached["enriched"], reached["collected"])},
        {"stage": "Scored", "count": reached["scored"],
         "rate_from_prev": rate(reached["scored"], reached["enriched"])},
        {"stage": "Qualified", "count": reached["qualified"],
         "rate_from_prev": rate(reached["qualified"], reached["scored"])},
    ]

    # Data-quality signals (real hygiene metrics)
    with_email = _scalar(conn, "SELECT COUNT(DISTINCT lead_id) FROM enriched_leads WHERE email IS NOT NULL AND email!=''")
    verified = _scalar(conn, "SELECT COUNT(DISTINCT lead_id) FROM enriched_leads WHERE email_verified=1")
    with_phone = _scalar(conn, "SELECT COUNT(*) FROM raw_leads WHERE phone IS NOT NULL AND phone!=''")
    contactable = _scalar(conn, """
        SELECT COUNT(*) FROM raw_leads r
        LEFT JOIN enriched_leads e ON e.lead_id=r.id
        WHERE (e.email IS NOT NULL AND e.email!='') OR (r.phone IS NOT NULL AND r.phone!='')
    """)
    unique_companies = _scalar(conn, "SELECT COUNT(DISTINCT LOWER(company)) FROM raw_leads WHERE company IS NOT NULL AND company!=''")
    high_intent = _scalar(conn, "SELECT COUNT(*) FROM scored_leads WHERE icp_score>=?", (HIGH_INTENT_SCORE,))

    # Business outcomes from user-set assumptions (never fabricated)
    deal_size = float(economics.get("avg_deal_size", 0) or 0)
    win_rate = float(economics.get("win_rate", 0) or 0)  # 0..1
    monthly_cost = float(economics.get("monthly_cost", 0) or 0)

    pipeline_value = qualified * deal_size
    weighted_value = pipeline_value * win_rate
    cost_per_qualified = round(monthly_cost / qualified, 2) if qualified else None

    return {
        "stage": stage,
        "funnel": funnel,
        "totals": {
            "total_leads": total,
            "qualified": qualified,
            "high_intent": high_intent,
            "unique_companies": unique_companies,
        },
        "conversion": {
            "enrich_rate": rate(reached["enriched"], reached["collected"]),
            "score_rate": rate(reached["scored"], reached["enriched"]),
            "qualify_rate": rate(qualified, reached["scored"]),
            "overall_qualify_rate": rate(qualified, total),
        },
        "data_quality": {
            "with_email": with_email,
            "verified_email": verified,
            "with_phone": with_phone,
            "contactable": contactable,
            "contactable_rate": rate(contactable, total),
        },
        "economics": {
            "avg_deal_size": deal_size,
            "win_rate": win_rate,
            "monthly_cost": monthly_cost,
            "pipeline_value": pipeline_value,
            "weighted_value": weighted_value,
            "cost_per_qualified": cost_per_qualified,
        },
        "future_stages": {"sent": stage["sent"], "replied": stage["replied"]},
    }


def segments(conn) -> dict:
    """Market-intelligence breakdowns (normalized for display)."""
    # By country
    country_counts: dict[str, int] = {}
    for r in conn.execute("SELECT country FROM raw_leads").fetchall():
        c = normalize_country(r[0])
        country_counts[c] = country_counts.get(c, 0) + 1
    by_country = sorted(
        [{"key": k, "count": v} for k, v in country_counts.items()],
        key=lambda x: x["count"], reverse=True,
    )

    # By industry (top 10, rest folded into Other)
    ind_counts: dict[str, int] = {}
    for r in conn.execute("SELECT industry FROM raw_leads").fetchall():
        c = normalize_industry(r[0])
        ind_counts[c] = ind_counts.get(c, 0) + 1
    ind_sorted = sorted(ind_counts.items(), key=lambda x: x[1], reverse=True)
    top_ind = ind_sorted[:10]
    other = sum(v for _, v in ind_sorted[10:])
    by_industry = [{"key": k, "count": v} for k, v in top_ind]
    if other:
        by_industry.append({"key": "Other", "count": other})

    # By company-size band (join enriched for company_size)
    band_counts = {b: 0 for b in BAND_ORDER}
    for r in conn.execute("""
        SELECT r.employee_count, e.company_size
        FROM raw_leads r LEFT JOIN enriched_leads e ON e.lead_id=r.id
    """).fetchall():
        band_counts[size_band(r["company_size"], r["employee_count"])] += 1
    by_size = [{"key": b, "count": band_counts[b]} for b in BAND_ORDER if band_counts[b]]

    # Score distribution (histogram of scored leads)
    buckets = [(0, 20, "0–19"), (20, 45, "20–44"), (45, 70, "45–69"),
               (70, 90, "70–89"), (90, 101, "90–100")]
    hist = []
    for lo, hi, label in buckets:
        n = _scalar(conn, "SELECT COUNT(*) FROM scored_leads WHERE icp_score>=? AND icp_score<?", (lo, hi))
        hist.append({"key": label, "count": n, "qualified": lo >= MIN_ICP_SCORE})

    # Top companies by aggregate score (real, from scored leads)
    top_companies = []
    rows = conn.execute("""
        SELECT r.company AS company, COUNT(*) AS contacts,
               ROUND(AVG(s.icp_score)) AS avg_score, MAX(s.icp_score) AS best_score
        FROM raw_leads r
        JOIN scored_leads s ON s.lead_id=r.id
        WHERE r.company IS NOT NULL AND r.company!=''
        GROUP BY LOWER(r.company)
        ORDER BY avg_score DESC, contacts DESC
        LIMIT 10
    """).fetchall()
    for r in rows:
        top_companies.append({
            "company": r["company"], "contacts": r["contacts"],
            "avg_score": int(r["avg_score"] or 0), "best_score": r["best_score"],
        })

    return {
        "by_country": by_country,
        "by_industry": by_industry,
        "by_size": by_size,
        "score_histogram": hist,
        "top_companies": top_companies,
        "gcc_countries": GCC_COUNTRIES,
        "min_icp_score": MIN_ICP_SCORE,
    }


def lead_detail(conn, lead_id: str) -> dict | None:
    """Full 360 record for one lead: profile + enrichment + score + timeline + factors."""
    row = conn.execute("""
        SELECT r.id, r.source, r.first_name, r.last_name, r.title, r.company,
               r.domain, r.linkedin_url, r.country, r.employee_count, r.industry,
               r.phone, r.pain_point, r.contact_hook, r.intent_level AS raw_intent,
               r.fetched_at, r.status, r.assigned_to,
               e.email, e.email_verified, e.company_size, e.industry AS enriched_industry,
               e.tech_stack, e.enriched_at,
               s.icp_score, s.intent_level AS scored_intent, s.offering_match,
               s.score_reason, s.scored_at
        FROM raw_leads r
        LEFT JOIN enriched_leads e ON e.lead_id=r.id
        LEFT JOIN scored_leads s ON s.lead_id=r.id
        WHERE r.id=?
    """, (lead_id,)).fetchone()
    if not row:
        return None

    d = dict(row)
    # tech_stack JSON → list
    ts = d.get("tech_stack")
    if ts:
        import json
        try:
            d["tech_stack"] = json.loads(ts)
        except Exception:
            d["tech_stack"] = []
    else:
        d["tech_stack"] = []

    d["normalized_country"] = normalize_country(d.get("country"))
    d["normalized_industry"] = normalize_industry(d.get("enriched_industry") or d.get("industry"))
    d["size_band"] = size_band(d.get("company_size"), d.get("employee_count"))
    d["explain"] = icp_factors(d)

    # Timeline of real pipeline events
    timeline = []
    if d.get("fetched_at"):
        timeline.append({"event": "Collected", "at": d["fetched_at"],
                         "detail": f"Sourced via {d.get('source') or 'unknown'}"})
    if d.get("enriched_at"):
        detail = "Email found" if d.get("email") else "Enrichment run"
        if d.get("email") and d.get("email_verified"):
            detail = "Verified email found"
        timeline.append({"event": "Enriched", "at": d["enriched_at"], "detail": detail})
    if d.get("scored_at"):
        timeline.append({"event": "Scored", "at": d["scored_at"],
                         "detail": f"ICP score {d.get('icp_score')} · {d.get('scored_intent') or ''} intent".strip(" ·")})
    d["timeline"] = timeline
    return d
