"""
collector.py — Lead Discovery (Stage 1)
Sources:
  - Apollo.io People Search API (primary B2B database, months 1-2)
  - Reddit via praw (r/PLC, r/manufacturing, r/SCADA, r/ControlTheory, r/robotics)
  - LinkedIn job posts via httpx + BeautifulSoup
  - PLC Talk & Eng-Tips forums via httpx + BeautifulSoup

All social leads pass through signal_extractor.py (Stage 2 Claude) before being saved.
"""

import httpx
import uuid
import time
import json
from config import (
    APOLLO_API_KEY, APOLLO_SEARCH,
    REDDIT_CLIENT_ID, REDDIT_CLIENT_SECRET, REDDIT_USER_AGENT,
    REDDIT_SUBREDDITS, REDDIT_KEYWORDS,
)
from signal_extractor import extract_signals, has_buying_signal

APOLLO_BASE = "https://api.apollo.io/api/v1"


# ─── APOLLO ──────────────────────────────────────────────────────────────────

APOLLO_HEADERS = {
    "Content-Type": "application/json",
    "Cache-Control": "no-cache",
    "X-Api-Key": APOLLO_API_KEY,
}


def _bulk_enrich(raw_people: list[dict]) -> dict[str, dict]:
    """
    Calls people/bulk_match using Apollo person IDs (10 per batch).
    Returns a dict keyed by Apollo person ID.
    """
    if not raw_people:
        return {}
    details = [{"id": p["id"]} for p in raw_people if p.get("id")]
    # bulk_match limit: 10 per request — batch accordingly
    result = {}
    for batch_start in range(0, len(details), 10):
        batch = details[batch_start:batch_start + 10]
        try:
            resp = httpx.post(
                "https://api.apollo.io/v1/people/bulk_match",
                json={"details": batch},
                headers=APOLLO_HEADERS,
                timeout=30,
            )
            if resp.status_code != 200:
                print(f"  Apollo bulk_match error: HTTP {resp.status_code} — {resp.text[:200]}")
                continue
            matches = resp.json().get("matches") or resp.json().get("people") or []
            for m in matches:
                if m and m.get("id"):
                    result[m["id"]] = m
            time.sleep(0.5)
        except Exception as e:
            print(f"  Apollo bulk_match error: {e}")
    return result


def fetch_apollo_leads(page: int = 1) -> list[dict]:
    """
    Two-step Apollo collection:
      1. api_search (POST, query params) — free, returns IDs + preview flags only.
         Note: all field values (country, industry, etc.) are gated behind enrichment.
      2. people/bulk_match — spends credits, returns full profiles.
    """
    # api_search takes query params (not JSON body) per Apollo's OpenAPI spec
    params = {
        "per_page": APOLLO_SEARCH.get("per_page", 25),
        "page": page,
    }
    for title in APOLLO_SEARCH.get("person_titles", []):
        params.setdefault("person_titles[]", [])
        params["person_titles[]"].append(title)
    for loc in APOLLO_SEARCH.get("person_locations", []):
        params.setdefault("person_locations[]", [])
        params["person_locations[]"].append(loc)
    for r in APOLLO_SEARCH.get("organization_num_employees_ranges", []):
        params.setdefault("organization_num_employees_ranges[]", [])
        params["organization_num_employees_ranges[]"].append(r)

    try:
        resp = httpx.post(
            f"{APOLLO_BASE}/mixed_people/api_search",
            params=params,
            headers=APOLLO_HEADERS,
            timeout=30,
        )
        resp.raise_for_status()
        data = resp.json()
    except Exception as e:
        print(f"  Apollo api_search error: {e}")
        return []

    total = data.get("total_entries", 0)
    raw_people = data.get("people", [])

    if not raw_people:
        print(f"  Apollo: no results on page {page} (total_entries={total:,})")
        return []

    # Step 2: enrich to get full field values
    enriched_map = _bulk_enrich(raw_people)

    leads = []
    for p in raw_people:
        pid = p.get("id") or str(uuid.uuid4())
        full = enriched_map.get(pid, {})
        org_preview = p.get("organization") or {}
        org_full    = full.get("organization") or {}

        # Phone: Apollo returns it under phone_numbers list or sanitized_phone
        phone_numbers = full.get("phone_numbers") or []
        phone = ""
        if phone_numbers:
            phone = phone_numbers[0].get("sanitized_number") or phone_numbers[0].get("raw_number", "")
        elif full.get("sanitized_phone"):
            phone = full["sanitized_phone"]

        leads.append({
            "id":             pid,
            "source":         "apollo",
            "first_name":     full.get("first_name") or p.get("first_name", ""),
            "last_name":      full.get("last_name", ""),
            "title":          full.get("title") or p.get("title", ""),
            "company":        org_full.get("name") or org_preview.get("name", ""),
            "domain":         org_full.get("primary_domain") or org_preview.get("primary_domain", ""),
            "linkedin_url":   full.get("linkedin_url", ""),
            "country":        full.get("country", ""),
            "employee_count": org_full.get("num_employees") or org_full.get("estimated_num_employees"),
            "industry":       org_full.get("industry", ""),
            "email":          full.get("email", ""),
            "phone":          phone,
            "intent_level":   "",
            "pain_point":     "",
            "contact_hook":   "",
        })

    enriched_count = sum(1 for p in leads if p["last_name"])
    print(f"  Apollo page {page}: {len(leads)} leads found, {enriched_count} fully enriched (total available: {total:,})")
    return leads


def collect_apollo_leads(pages: int = 2, start_page: int = 1) -> list[dict]:
    all_leads = []
    for page in range(start_page, start_page + pages):
        all_leads.extend(fetch_apollo_leads(page))
        if page < start_page + pages - 1:
            time.sleep(1)
    return all_leads


# ─── REDDIT ──────────────────────────────────────────────────────────────────

def collect_reddit_leads(posts_per_sub: int = 25) -> list[dict]:
    """
    Searches target subreddits for posts with buying signals.
    Requires: pip install praw
    Credentials: create a "script" app at reddit.com/prefs/apps
    """
    try:
        import praw
    except ImportError:
        print("  Reddit: praw not installed. Run: pip install praw")
        return []

    if not REDDIT_CLIENT_ID or REDDIT_CLIENT_ID == "YOUR_REDDIT_CLIENT_ID":
        print("  Reddit: credentials not configured in config.py, skipping")
        return []

    try:
        reddit = praw.Reddit(
            client_id=REDDIT_CLIENT_ID,
            client_secret=REDDIT_CLIENT_SECRET,
            user_agent=REDDIT_USER_AGENT,
            read_only=True,
        )
    except Exception as e:
        print(f"  Reddit auth error: {e}")
        return []

    leads = []
    search_query = " OR ".join(REDDIT_KEYWORDS[:8])  # praw search has a length limit

    for sub_name in REDDIT_SUBREDDITS:
        try:
            subreddit = reddit.subreddit(sub_name)
            posts = list(subreddit.search(search_query, sort="new", limit=posts_per_sub))
        except Exception as e:
            print(f"  Reddit r/{sub_name} error: {e}")
            continue

        for post in posts:
            full_text = f"Title: {post.title}\n\nBody: {post.selftext}"

            if not has_buying_signal(full_text):
                continue

            signals = extract_signals(full_text, source=f"reddit/r/{sub_name}")
            if not signals:
                continue

            # Drop posts with no buying signal after Claude analysis
            if signals.get("intent_level") in ("none", None):
                continue

            # Split person_name into first/last
            name_parts = signals.get("person_name", "").split(" ", 1)

            leads.append({
                "id":            str(uuid.uuid4()),
                "source":        "reddit",
                "first_name":    name_parts[0] if name_parts else "",
                "last_name":     name_parts[1] if len(name_parts) > 1 else "",
                "title":         signals.get("role", ""),
                "company":       signals.get("company", ""),
                "domain":        signals.get("domain", ""),
                "linkedin_url":  "",
                "country":       "",
                "employee_count": None,
                "industry":      "",
                "pain_point":    signals.get("pain_point", ""),
                "contact_hook":  signals.get("contact_hook", ""),
                "intent_level":  signals.get("intent_level", "low"),
                "raw_json": json.dumps({
                    "reddit_url": f"https://reddit.com{post.permalink}",
                    "subreddit":  sub_name,
                    "post_title": post.title,
                }),
            })

        print(f"  Reddit r/{sub_name}: {len([l for l in leads if json.loads(l.get('raw_json','{}') or '{}').get('subreddit') == sub_name])} signal leads found")
        time.sleep(1)  # Reddit rate limit: 60 req/min

    print(f"  Reddit total: {len(leads)} leads with buying signals")
    return leads


# ─── LINKEDIN JOB POSTS ──────────────────────────────────────────────────────

LINKEDIN_JOB_KEYWORDS = [
    "PLC programmer", "SCADA engineer", "automation engineer",
    "controls engineer", "MES implementation", "IoT engineer",
    "industrial automation", "process automation",
]

def collect_linkedin_job_leads(max_results: int = 30) -> list[dict]:
    """
    Scrapes LinkedIn job search results for ICP companies actively hiring
    automation/controls roles — a strong buying signal for our services.
    Uses httpx with browser-like headers (no login required for job search).
    """
    try:
        from bs4 import BeautifulSoup
    except ImportError:
        print("  LinkedIn: BeautifulSoup not installed. Run: pip install beautifulsoup4")
        return []

    leads = []
    seen_companies = set()

    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                      "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        "Accept-Language": "en-US,en;q=0.9",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    }

    for keyword in LINKEDIN_JOB_KEYWORDS[:4]:  # limit to keep scraping reasonable
        url = (
            "https://www.linkedin.com/jobs/search"
            f"?keywords={keyword.replace(' ', '%20')}"
            "&location=United%20States"
            "&f_TPR=r604800"   # posted in last 7 days
            "&position=1&pageNum=0"
        )

        try:
            resp = httpx.get(url, headers=headers, timeout=20, follow_redirects=True)
            if resp.status_code != 200:
                print(f"  LinkedIn jobs: HTTP {resp.status_code} for '{keyword}', skipping")
                time.sleep(2)
                continue

            soup = BeautifulSoup(resp.text, "html.parser")
            job_cards = soup.select("div.base-card")[:max_results // len(LINKEDIN_JOB_KEYWORDS[:4])]

        except Exception as e:
            print(f"  LinkedIn jobs error for '{keyword}': {e}")
            time.sleep(2)
            continue

        for card in job_cards:
            try:
                company_el = card.select_one("h4.base-search-card__subtitle a")
                title_el   = card.select_one("h3.base-search-card__title")
                location_el = card.select_one("span.job-search-card__location")

                company = company_el.get_text(strip=True) if company_el else ""
                job_title = title_el.get_text(strip=True) if title_el else ""
                location = location_el.get_text(strip=True) if location_el else ""

                if not company or company in seen_companies:
                    continue
                seen_companies.add(company)

                raw_text = (
                    f"LinkedIn Job Post\n"
                    f"Company: {company}\n"
                    f"Hiring for: {job_title}\n"
                    f"Location: {location}\n"
                    f"Context: This company is actively hiring for industrial automation/controls roles."
                )

                if not has_buying_signal(raw_text):
                    continue

                signals = extract_signals(raw_text, source="linkedin_jobs")
                if not signals or signals.get("intent_level") in ("none", "low", None):
                    continue

                leads.append({
                    "id":            str(uuid.uuid4()),
                    "source":        "linkedin_jobs",
                    "first_name":    "",
                    "last_name":     "",
                    "title":         "",   # enricher will find decision-maker via Hunter
                    "company":       company,
                    "domain":        signals.get("domain", ""),
                    "linkedin_url":  "",
                    "country":       "US",
                    "employee_count": None,
                    "industry":      "",
                    "pain_point":    signals.get("pain_point", f"Actively hiring {job_title}"),
                    "contact_hook":  signals.get("contact_hook", ""),
                    "intent_level":  signals.get("intent_level", "medium"),
                    "raw_json": json.dumps({
                        "job_title": job_title,
                        "location":  location,
                        "search_keyword": keyword,
                    }),
                })

            except Exception:
                continue

        print(f"  LinkedIn jobs '{keyword}': scraped {len(job_cards)} postings")
        time.sleep(3)  # be respectful to LinkedIn

    print(f"  LinkedIn jobs total: {len(leads)} signal leads")
    return leads


# ─── FORUMS (PLC TALK + ENG-TIPS) ────────────────────────────────────────────

FORUM_SOURCES = [
    {
        "name": "PLCtalk",
        "search_url": "https://www.plctalk.net/qanda/search.php?do=process&query={query}&showposts=1",
        "thread_selector": "div.threadbit h3 a",
        "post_selector": "div.postcontent",
    },
    {
        "name": "EngTips",
        "search_url": "https://www.eng-tips.com/search.cfm?q={query}&forum=0",
        "thread_selector": "td.forumResults a",
        "post_selector": "p.threadPost",
    },
]

FORUM_SEARCH_TERMS = [
    "need help integrating PLC",
    "SCADA upgrade help",
    "looking for automation vendor",
    "MES integration problem",
    "IoT sensor network",
]


def collect_forum_leads(max_per_forum: int = 10) -> list[dict]:
    """
    Scrapes PLC Talk and Eng-Tips for threads with buying signals.
    Uses httpx + BeautifulSoup. No login required for public search.
    """
    try:
        from bs4 import BeautifulSoup
    except ImportError:
        print("  Forums: BeautifulSoup not installed. Run: pip install beautifulsoup4")
        return []

    leads = []
    headers = {
        "User-Agent": "Mozilla/5.0 (compatible; research-bot/1.0)",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    }

    for forum in FORUM_SOURCES:
        forum_leads = 0
        for term in FORUM_SEARCH_TERMS[:3]:
            url = forum["search_url"].format(query=term.replace(" ", "+"))
            try:
                resp = httpx.get(url, headers=headers, timeout=20, follow_redirects=True)
                if resp.status_code != 200:
                    time.sleep(2)
                    continue

                soup = BeautifulSoup(resp.text, "html.parser")
                thread_links = soup.select(forum["thread_selector"])[:max_per_forum]

            except Exception as e:
                print(f"  {forum['name']} search error: {e}")
                time.sleep(2)
                continue

            for link in thread_links:
                thread_url = link.get("href", "")
                if not thread_url.startswith("http"):
                    base = forum["search_url"].split("/search")[0]
                    thread_url = base + "/" + thread_url.lstrip("/")

                try:
                    thread_resp = httpx.get(thread_url, headers=headers,
                                           timeout=15, follow_redirects=True)
                    if thread_resp.status_code != 200:
                        continue

                    thread_soup = BeautifulSoup(thread_resp.text, "html.parser")
                    post_el = thread_soup.select_one(forum["post_selector"])
                    post_text = post_el.get_text(" ", strip=True)[:1500] if post_el else ""

                    if not post_text or not has_buying_signal(post_text):
                        continue

                    full_text = f"Forum: {forum['name']}\nThread: {link.get_text(strip=True)}\n\n{post_text}"
                    signals = extract_signals(full_text, source=forum["name"].lower())

                    if not signals or signals.get("intent_level") in ("none", "low", None):
                        continue

                    name_parts = signals.get("person_name", "").split(" ", 1)
                    leads.append({
                        "id":            str(uuid.uuid4()),
                        "source":        f"forum_{forum['name'].lower()}",
                        "first_name":    name_parts[0] if name_parts else "",
                        "last_name":     name_parts[1] if len(name_parts) > 1 else "",
                        "title":         signals.get("role", ""),
                        "company":       signals.get("company", ""),
                        "domain":        signals.get("domain", ""),
                        "linkedin_url":  "",
                        "country":       "",
                        "employee_count": None,
                        "industry":      "",
                        "pain_point":    signals.get("pain_point", ""),
                        "contact_hook":  signals.get("contact_hook", ""),
                        "intent_level":  signals.get("intent_level", "medium"),
                        "raw_json": json.dumps({
                            "forum":       forum["name"],
                            "thread_url":  thread_url,
                            "search_term": term,
                        }),
                    })
                    forum_leads += 1

                except Exception:
                    continue

                time.sleep(1)

            time.sleep(2)

        print(f"  {forum['name']}: {forum_leads} signal leads found")

    print(f"  Forums total: {len(leads)} leads")
    return leads


# ─── MASTER COLLECTOR ────────────────────────────────────────────────────────

def collect_leads(
    pages: int = 2,
    include_reddit: bool = True,
    include_linkedin: bool = True,
    include_forums: bool = True,
) -> list[dict]:
    """
    Pull leads from all configured sources.
    Social leads are passed through signal_extractor (Stage 2) inline.
    """
    all_leads = []

    print("  [Apollo] Pulling from API...")
    all_leads.extend(collect_apollo_leads(pages=pages))

    if include_reddit:
        print("\n  [Reddit] Scanning subreddits for buying signals...")
        all_leads.extend(collect_reddit_leads())

    if include_linkedin:
        print("\n  [LinkedIn] Scraping job posts for ICP companies...")
        all_leads.extend(collect_linkedin_job_leads())

    if include_forums:
        print("\n  [Forums] Scanning PLC Talk + Eng-Tips...")
        all_leads.extend(collect_forum_leads())

    print(f"\n  Total collected: {len(all_leads)} leads from all sources")
    return all_leads
