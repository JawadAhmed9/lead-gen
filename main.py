"""
main.py — Pipeline Orchestrator

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  PHASE 1 — ACTIVE (you are here)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  python main.py --step collect    # pull leads from Apollo → save to DB
  python main.py --step enrich     # Hunter email + Wappalyzer tech stack → save to DB
  python main.py --step score      # Claude ICP scoring → save to DB
  python main.py --stats           # print pipeline stats

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  PHASE 2 — COMMENTED OUT (cold email)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  python main.py --step send       # Claude email gen + Brevo dispatch

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  PHASE 3 — COMMENTED OUT (Google Ads)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  python main.py --step match      # Google Ads Customer Match upload
  python main.py --step ads        # Google Ads data pull + Claude analysis

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  PHASE 4 — COMMENTED OUT (social scrapers)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  python main.py --step collect --source all   # adds Reddit + LinkedIn + forums
"""

import argparse
import time
import sys
from datetime import datetime

# ─── PHASE 1 IMPORTS (active) ────────────────────────────────────────────────
from database import init_db, get_stats
from database import save_raw_lead, save_enriched, save_score
from database import get_leads_to_enrich, get_leads_to_score
from enricher import enrich_lead
from scorer import score_lead

# ─── PHASE 2 IMPORTS (cold email) — uncomment when ready ─────────────────────
# from email_gen import generate_email
# from dispatcher import send_email
# from database import save_outreach, get_leads_to_send

# ─── PHASE 3 IMPORTS (Google Ads) — uncomment when ready ─────────────────────
# from ads_customer_match import run_customer_match_upload
# from ads_puller import pull_ads_data
# from ga4_puller import pull_ga4_data
# from ads_optimizer import analyze_ads


def print_banner():
    print("""
╔══════════════════════════════════════════════════════╗
║     Industrial Lead Pipeline — AI-Powered Outreach   ║
║     Phase 1: Collect → Enrich → Score → DB           ║
╚══════════════════════════════════════════════════════╝
""")


# ─────────────────────────────────────────────────────────────────────────────
#  PHASE 1 — ACTIVE
# ─────────────────────────────────────────────────────────────────────────────

def run_apollo_only(pages: int = 2):
    """
    Budget/testing mode — Apollo only, no Hunter, no Claude.
    - Pulls leads from Apollo
    - Auto-enriches leads that already have an email from Apollo
    - Applies a simple rule-based ICP score (no Claude API needed)
    - Leads with emails get status=queued; without email get status=enriched
    Run: python main.py --step apollo-only
    """
    from collector import collect_apollo_leads
    from enricher import enrich_org_apollo
    from scorer import score_lead
    from config import ICP_TITLES, ICP_INDUSTRIES, MIN_ICP_SCORE
    import os as _os

    # Allow API server to override filters via env vars
    import json as _json
    if _os.getenv("PIPELINE_PAGES"):
        pages = int(_os.getenv("PIPELINE_PAGES", pages))
    if _os.getenv("PIPELINE_TITLES"):
        from config import APOLLO_SEARCH
        APOLLO_SEARCH["person_titles"] = _json.loads(_os.getenv("PIPELINE_TITLES"))
    if _os.getenv("PIPELINE_LOCATIONS"):
        from config import APOLLO_SEARCH
        APOLLO_SEARCH["person_locations"] = _json.loads(_os.getenv("PIPELINE_LOCATIONS"))
    if _os.getenv("PIPELINE_EMP_RANGES"):
        from config import APOLLO_SEARCH
        APOLLO_SEARCH["organization_num_employees_ranges"] = _json.loads(_os.getenv("PIPELINE_EMP_RANGES"))
    # Accuracy filters + rotation extras (all optional, backward-compatible)
    from config import APOLLO_SEARCH
    if _os.getenv("PIPELINE_SENIORITIES"):
        APOLLO_SEARCH["person_seniorities"] = _json.loads(_os.getenv("PIPELINE_SENIORITIES"))
    if _os.getenv("PIPELINE_INDUSTRIES"):
        APOLLO_SEARCH["q_organization_keyword_tags"] = _json.loads(_os.getenv("PIPELINE_INDUSTRIES"))
    if _os.getenv("PIPELINE_EMAIL_STATUS"):
        APOLLO_SEARCH["contact_email_status"] = _json.loads(_os.getenv("PIPELINE_EMAIL_STATUS"))
    if _os.getenv("PIPELINE_PER_PAGE"):
        APOLLO_SEARCH["per_page"] = int(_os.getenv("PIPELINE_PER_PAGE"))
    APOLLO_SEARCH["reveal"] = _os.getenv("PIPELINE_REVEAL", "0") == "1"
    start_page = int(_os.getenv("PIPELINE_START_PAGE", "1"))

    print(f"\n[APOLLO-ONLY MODE] Collect + org enrich + rule-based score (pages {start_page}–{start_page + pages - 1})...")
    leads = collect_apollo_leads(pages=pages, start_page=start_page)

    saved = skipped = enriched = scored = queued = 0

    for lead in leads:
        if not save_raw_lead(lead):
            skipped += 1
            continue
        saved += 1

        email    = lead.get("email", "")
        industry = (lead.get("industry") or "").lower()
        emp      = lead.get("employee_count") or 0
        domain   = lead.get("domain", "")
        tech_stack = []

        # ── Apollo org enrichment: fills industry, emp count, tech stack ───
        # Only call if we're missing key fields (saves API quota)
        if domain and (not industry or not emp):
            org_data = enrich_org_apollo(domain)
            if org_data:
                industry   = (org_data.get("industry") or industry).lower()
                emp        = org_data.get("employee_count") or emp
                tech_stack = org_data.get("tech_stack") or []
                # Also backfill country/linkedin on the raw lead if blank
                conn = __import__("database").get_conn()
                if not lead.get("country") and org_data.get("hq_country"):
                    conn.execute("UPDATE raw_leads SET country=? WHERE id=?",
                                 (org_data["hq_country"], lead["id"]))
                if not lead.get("linkedin_url") and org_data.get("linkedin_url"):
                    conn.execute("UPDATE raw_leads SET linkedin_url=? WHERE id=?",
                                 (org_data["linkedin_url"], lead["id"]))
                conn.commit()
                conn.close()

        title = (lead.get("title") or "").lower()

        # ── Gate: only enrich/score leads with valid contact info ──────────
        has_contact = bool(email or lead.get("phone", ""))
        if not has_contact:
            # Leave at raw — Hunter will fill email later when budget allows
            continue

        # ── Save enrichment record ─────────────────────────────────────────
        enriched_data = {
            "email":          email or None,
            "email_verified": bool(email),
            "company_size":   emp,
            "industry":       industry,
            "tech_stack":     tech_stack,
        }
        save_enriched(lead["id"], enriched_data)
        enriched += 1

        # ── Groq AI scoring ────────────────────────────────────────────────
        score_input = {
            **lead,
            "industry":    industry,
            "company_size": emp,
            "tech_stack":  tech_stack,
        }
        score_data = score_lead(score_input)

        # Fallback to rule-based if Groq fails (no key, rate limit, etc.)
        if not score_data:
            icp_title_keywords   = [t.lower() for t in ICP_TITLES]
            icp_industries_lower = [i.lower() for i in ICP_INDUSTRIES]
            score = 0
            if any(kw in title for kw in icp_title_keywords):        score += 40
            elif any(w in title for w in ["engineer","manager","director","head","vp","cto"]): score += 20
            if any(ind in industry for ind in icp_industries_lower):  score += 30
            elif any(w in industry for w in ["industrial","chemical","energy","utilities","oil","petrochemical"]): score += 15
            if 50 <= emp <= 5000: score += 20
            elif emp > 0:         score += 5
            if email:             score += 10
            if tech_stack:        score = min(score + 5, 100)
            score_data = {
                "icp_score":      min(score, 100),
                "intent_level":   "medium" if score >= 60 else "low",
                "offering_match": "industrial automation / IoT",
                "reason":         "Rule-based fallback (Groq unavailable)",
            }

        save_score(lead["id"], score_data)
        scored += 1
        if score_data["icp_score"] >= MIN_ICP_SCORE:
            queued += 1
        time.sleep(2)   # ~30 req/min Groq free-tier limit

    no_contact = saved - enriched
    print(f"\n  ✅ {saved} new leads saved ({skipped} dupes skipped)")
    print(f"  ⏸  {no_contact} left at raw — no email or phone (add Hunter key to enrich later)")
    print(f"  ✅ {enriched} enriched (have email or phone)")
    print(f"  ✅ {scored} scored — {queued} queued for outreach (score ≥ {MIN_ICP_SCORE})")
    print(f"\n  Next: start the UI and review your leads")
    print(f"  uvicorn api_server:app --reload --port 8000")


def run_collect(source: str = "apollo"):
    """
    Pulls leads and saves them to raw_leads table.
    source="apollo"  → Apollo only (default while testing)
    source="all"     → Apollo + Reddit + LinkedIn + forums  [Phase 4]
    """
    print(f"\n[STEP 1] Collecting leads (source={source})...")

    if source == "apollo":
        from collector import collect_apollo_leads
        leads = collect_apollo_leads(pages=2)
    else:
        # Phase 4 — social scrapers (requires praw + beautifulsoup4)
        from collector import collect_leads
        leads = collect_leads(pages=2)

    saved = 0
    skipped = 0
    for lead in leads:
        if save_raw_lead(lead):
            saved += 1
        else:
            skipped += 1

    print(f"\n  ✅ Saved {saved} new leads, {skipped} duplicates skipped")


def run_enrich():
    """
    Enriches raw leads:
    - Hunter.io  → finds verified work email
    - Wappalyzer → detects tech stack from company domain
    Saves results to enriched_leads table.
    """
    print("\n[STEP 2] Enriching leads (Hunter email + Wappalyzer tech stack)...")
    leads = get_leads_to_enrich()

    if not leads:
        print("  ⚠️  No raw leads to enrich. Run --step collect first.")
        return

    enriched = 0
    for i, lead in enumerate(leads):
        name = f"{lead['first_name']} {lead['last_name']}".strip() or "Unknown"
        print(f"\n  [{i+1}/{len(leads)}] {name} @ {lead['company']}")
        data = enrich_lead(lead)
        save_enriched(lead["id"], data)
        enriched += 1
        time.sleep(0.5)   # Hunter rate limit: ~1 req/sec on Starter plan

    print(f"\n  ✅ Enriched {enriched} leads")


def run_score():
    """
    Scores enriched leads with Claude ICP scorer.
    - Drops leads scoring below MIN_ICP_SCORE (45)
    - Queues leads scoring ≥ 45 for outreach
    Saves results to scored_leads table.
    """
    from config import MIN_ICP_SCORE
    print("\n[STEP 3] Scoring leads with Claude...")
    leads = get_leads_to_score()

    if not leads:
        print("  ⚠️  No enriched leads to score. Run --step enrich first.")
        return

    queued = dropped = 0
    for i, lead in enumerate(leads):
        name = f"{lead['first_name']} {lead['last_name']}".strip() or "Unknown"
        print(f"\n  [{i+1}/{len(leads)}] {name} @ {lead['company']}")
        score = score_lead(lead)
        if score:
            save_score(lead["id"], score)
            if score["icp_score"] >= MIN_ICP_SCORE:
                queued += 1
            else:
                dropped += 1
        time.sleep(0.3)

    print(f"\n  ✅ Scored: {queued} queued for outreach, {dropped} dropped (below {MIN_ICP_SCORE})")


def run_import(file_path: str):
    """
    Import leads from an Excel (.xlsx) or CSV (.csv) file.
    Leads that have an email column skip Hunter enrichment automatically.
    """
    from pathlib import Path
    path = Path(file_path)
    if not path.exists():
        print(f"\n  File not found: {file_path}")
        return

    print(f"\n[IMPORT] Reading {path.name}...")
    from excel_importer import import_file
    result = import_file(path)

    print(f"\n  Imported : {result['imported']} leads")
    print(f"  Skipped  : {result['skipped']} rows")

    if result["errors"]:
        print(f"\n  Warnings ({len(result['errors'])}):")
        for e in result["errors"][:10]:
            print(f"    - {e}")

    if result["imported"] > 0:
        print(f"\n  Next step: python main.py --step score")
        print(f"  (Leads with emails are already enriched — Hunter not needed)")


def run_stats():
    """Prints current counts at each pipeline stage."""
    stats = get_stats()

    print("\n📊 PIPELINE STATS")
    print("─" * 45)
    stages = ["raw", "enriched", "scored", "queued", "sent", "replied"]
    for stage in stages:
        n = stats.get(stage, 0)
        bar = "█" * min(n, 35)
        print(f"  {stage:12} {n:5d}  {bar}")

    replies = stats.get("replies", {})
    if replies:
        print("\n  Reply breakdown:")
        for cls, count in replies.items():
            print(f"    {cls:15} {count}")
    print()


# ─────────────────────────────────────────────────────────────────────────────
#  PHASE 2 — COLD EMAIL  (commented out, uncomment when ready)
# ─────────────────────────────────────────────────────────────────────────────

# def run_send():
#     """Generates unique cold emails with Claude and sends via Brevo (300/day free)."""
#     print("\n[STEP 4] Generating emails and dispatching via Brevo...")
#     leads = get_leads_to_send()
#     if not leads:
#         print("  ⚠️  No queued leads to send. Run previous steps first.")
#         return
#
#     print(f"  {len(leads)} leads ready\n")
#     sent = failed = 0
#
#     for i, lead in enumerate(leads):
#         name = f"{lead['first_name']} {lead['last_name']}".strip() or "Unknown"
#         print(f"  [{i+1}/{len(leads)}] {name} @ {lead['company']}")
#
#         score = {
#             "icp_score":      lead.get("icp_score", 50),
#             "intent_level":   lead.get("intent_level", "medium"),
#             "offering_match": lead.get("offering_match", "automation"),
#             "reason":         "",
#         }
#         if lead.get("contact_hook"):
#             score["contact_hook"] = lead["contact_hook"]
#
#         email = generate_email(lead, score)
#         if not email:
#             print("    ⚠️  Email generation failed, skipping")
#             failed += 1
#             continue
#
#         provider_id = send_email(lead, email)
#         save_outreach(lead["id"], email["subject"], email["body"], provider_id)
#         sent += 1
#         time.sleep(0.5)
#
#     print(f"\n  ✅ Sent: {sent} emails dispatched, {failed} failed")


# ─────────────────────────────────────────────────────────────────────────────
#  PHASE 3 — GOOGLE ADS  (commented out, uncomment when ready)
# ─────────────────────────────────────────────────────────────────────────────

# def run_customer_match():
#     """Uploads high-scored leads (≥70) to Google Ads Customer Match."""
#     print("\n[STEP 5] Uploading to Google Ads Customer Match...")
#     uploaded = run_customer_match_upload()
#     print(f"  ✅ Customer Match: {uploaded} leads uploaded")
#
#
# def run_ads():
#     """Pulls Google Ads + GA4 data and generates Claude analysis report."""
#     print("\n[STEP 6] Google Ads data pull + Claude analysis...")
#     ads_data = pull_ads_data()
#     ga4_data = pull_ga4_data()
#     if not ads_data and not ga4_data:
#         print("  No ads data available.")
#         return
#     report = analyze_ads(ads_data, ga4_data)
#     print(report)


# ─────────────────────────────────────────────────────────────────────────────
#  FULL PIPELINE (Phase 1 only for now)
# ─────────────────────────────────────────────────────────────────────────────

def run_full_pipeline():
    run_collect(source="apollo")
    run_enrich()
    run_score()
    # run_send()           # Phase 2 — uncomment when ready
    # run_customer_match() # Phase 3 — uncomment when ready
    run_stats()


# ─────────────────────────────────────────────────────────────────────────────
#  ENTRY POINT
# ─────────────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    print_banner()
    init_db()

    parser = argparse.ArgumentParser(description="Industrial Lead Pipeline — Phase 1")
    parser.add_argument(
        "--step",
        choices=[
            "apollo-only", # Budget/testing mode — no Hunter, no Claude ✅
            "collect",     # Phase 1 ✅
            "enrich",      # Phase 1 ✅
            "score",       # Phase 1 ✅
            # "send",      # Phase 2 — uncomment when ready
            # "match",     # Phase 3 — uncomment when ready
            # "ads",       # Phase 3 — uncomment when ready
        ],
        help="Run a single pipeline step",
    )
    parser.add_argument(
        "--source",
        choices=["apollo", "all"],
        default="apollo",
        help="Lead source: apollo (default) | all (adds social scrapers in Phase 4)",
    )
    parser.add_argument(
        "--import-file",
        dest="import_file",
        metavar="FILE",
        help="Import leads from an Excel (.xlsx) or CSV (.csv) file",
    )
    parser.add_argument("--stats",    action="store_true", help="Show pipeline stats")
    parser.add_argument("--schedule", action="store_true", help="Run full pipeline daily at 08:00")
    args = parser.parse_args()

    start = datetime.utcnow()

    if args.import_file:
        run_import(args.import_file)
    elif args.stats:
        run_stats()
    elif args.schedule:
        try:
            import schedule as sched
        except ImportError:
            print("Install schedule lib: pip install schedule")
            sys.exit(1)
        print("⏰ Scheduler started — pipeline runs daily at 08:00")
        sched.every().day.at("08:00").do(run_full_pipeline)
        while True:
            sched.run_pending()
            time.sleep(60)
    elif args.step == "apollo-only":
        run_apollo_only(pages=2)
    elif args.step == "collect":
        run_collect(source=args.source)
    elif args.step == "enrich":
        run_enrich()
    elif args.step == "score":
        run_score()
    else:
        run_full_pipeline()

    elapsed = (datetime.utcnow() - start).seconds
    print(f"\n⏱  Done in {elapsed}s\n")
