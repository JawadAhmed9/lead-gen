"""
rotation.py — Apollo search-profile rotation.

Instead of paging one fixed filter combination until it's exhausted, we split
the search into many "profiles" (one per location × company-size band) and
rotate through them. Each profile keeps its OWN page offset, so every Collect
run advances a different slice and nothing is skipped or re-fetched. Rotating
combinations is what surfaces genuinely new leads once a single query runs dry.

Profiles are stored in rotation_profiles.json (separate from pipeline_settings).
Additive and self-contained — importing this never affects the pipeline.
"""

import json
from pathlib import Path
from datetime import datetime

PROFILES_FILE = Path(__file__).parent / "rotation_profiles.json"


def generate_profiles(settings: dict) -> list[dict]:
    """Build a profile per (location × employee-size band). Shared titles,
    industries and seniorities are carried into every profile."""
    titles      = settings.get("person_titles", [])
    locations   = settings.get("person_locations", []) or ["Saudi Arabia"]
    ranges      = settings.get("organization_num_employees_ranges", []) or ["51,200"]
    industries  = settings.get("industries", [])
    seniorities = settings.get("seniorities", [])
    pages       = settings.get("pages", 2)

    profiles, i = [], 0
    for loc in locations:
        for rng in ranges:
            i += 1
            profiles.append({
                "id": f"p{i}",
                "name": f"{loc} · {rng.replace(',', '–')} emp",
                "person_titles": titles,
                "person_locations": [loc],
                "organization_num_employees_ranges": [rng],
                "industries": industries,
                "seniorities": seniorities,
                "offset": 1,          # this profile's own page cursor
                "pages": pages,
                "runs": 0,
                "fetched": 0,
                "last_run": None,
            })
    return profiles


def load_profiles() -> list[dict]:
    if PROFILES_FILE.exists():
        try:
            return json.loads(PROFILES_FILE.read_text())
        except Exception:
            return []
    return []


def save_profiles(profiles: list[dict]):
    PROFILES_FILE.write_text(json.dumps(profiles, indent=2))


def ensure_profiles(settings: dict) -> list[dict]:
    """Load existing profiles, or generate + persist them on first use."""
    profs = load_profiles()
    if not profs:
        profs = generate_profiles(settings)
        save_profiles(profs)
    return profs


def regenerate(settings: dict) -> list[dict]:
    """Rebuild profiles from current settings (resets offsets)."""
    profs = generate_profiles(settings)
    save_profiles(profs)
    return profs


def next_profile(profiles: list[dict]) -> dict | None:
    """Least-recently-run profile goes next (never-run first), then lowest
    offset — so runs sweep breadth across all combinations evenly."""
    if not profiles:
        return None
    return sorted(profiles, key=lambda p: (p.get("last_run") or "", p.get("offset", 1)))[0]


def record_run(profiles: list[dict], profile_id: str, pages: int, fetched: int = 0) -> list[dict]:
    for p in profiles:
        if p["id"] == profile_id:
            p["offset"] = p.get("offset", 1) + pages
            p["runs"] = p.get("runs", 0) + 1
            p["fetched"] = p.get("fetched", 0) + fetched
            p["last_run"] = datetime.utcnow().isoformat()
            break
    save_profiles(profiles)
    return profiles
