"""
test_apollo.py — End-to-end Apollo integration test
Usage: python test_apollo.py
"""

import httpx
import json
from config import APOLLO_API_KEY, APOLLO_SEARCH

BASE = "https://api.apollo.io/api/v1"
HEADERS = {
    "Content-Type": "application/json",
    "Cache-Control": "no-cache",
    "X-Api-Key": APOLLO_API_KEY,
}


def test_search():
    """Step 1: api_search — free, returns IDs + flags only."""
    print("=" * 55)
    print("STEP 1: api_search (no credits)")

    params = {"per_page": 5, "page": 1}
    for t in APOLLO_SEARCH.get("person_titles", []):
        params.setdefault("person_titles[]", [])
        params["person_titles[]"].append(t)
    for loc in APOLLO_SEARCH.get("person_locations", []):
        params.setdefault("person_locations[]", [])
        params["person_locations[]"].append(loc)
    for r in APOLLO_SEARCH.get("organization_num_employees_ranges", []):
        params.setdefault("organization_num_employees_ranges[]", [])
        params["organization_num_employees_ranges[]"].append(r)

    resp = httpx.post(f"{BASE}/mixed_people/api_search", params=params, headers=HEADERS, timeout=15)
    print(f"  Status: {resp.status_code}")

    if resp.status_code != 200:
        print(f"  Error: {resp.text[:400]}")
        return None

    data = resp.json()
    total = data.get("total_entries", 0)
    people = data.get("people", [])
    print(f"  Total ICP leads in Gulf: {total:,}")
    print(f"  Returned this page: {len(people)}")
    print(f"  Sample IDs + companies:")
    for p in people:
        org = p.get("organization") or {}
        print(f"    {p['id']} | {p.get('first_name')} | {p.get('title')} | {org.get('name')} | has_email={p.get('has_email')}")

    return people


def test_bulk_match(raw_people):
    """Step 2: bulk_match — match by name+company, returns full profiles."""
    print("\nSTEP 2: people/bulk_match (uses credits)")
    if not raw_people:
        print("  No people to enrich.")
        return

    details = [
        {"first_name": p.get("first_name", ""), "organization_name": (p.get("organization") or {}).get("name", "")}
        for p in raw_people[:3]
    ]
    resp = httpx.post(
        f"{BASE}/people/bulk_match",
        json={"details": details},
        headers=HEADERS,
        timeout=20,
    )
    print(f"  Status: {resp.status_code}")

    if resp.status_code != 200:
        print(f"  Error: {resp.text[:400]}")
        return

    data = resp.json()
    matches = data.get("matches") or data.get("people") or []
    print(f"  Matches returned: {len(matches)}")

    for m in matches:
        org = m.get("organization") or {}
        print(f"\n  Name:      {m.get('first_name')} {m.get('last_name')}")
        print(f"  Title:     {m.get('title')}")
        print(f"  Company:   {org.get('name')}")
        print(f"  Domain:    {org.get('primary_domain')}")
        print(f"  Industry:  {org.get('industry')}")
        print(f"  Employees: {org.get('num_employees')}")
        print(f"  Country:   {m.get('country')}")
        print(f"  Email:     {m.get('email') or '(not available)'}")
        print(f"  LinkedIn:  {m.get('linkedin_url') or '(not available)'}")


if __name__ == "__main__":
    ids = test_search()
    if ids:
        test_bulk_match(ids)
    print("\n" + "=" * 55)
