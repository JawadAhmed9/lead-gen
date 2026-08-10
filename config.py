"""
config.py — Central configuration
Fill in your API keys via environment variables or replace the defaults below.
"""

import os
from pathlib import Path


# ─── Load secrets from .env (keys live there, never in source) ────────────────
# Uses python-dotenv if installed; otherwise a tiny built-in parser so the app
# works with zero extra dependencies. Existing environment variables always win.
def _load_env():
    env_path = Path(__file__).parent / ".env"
    try:
        from dotenv import load_dotenv
        load_dotenv(env_path)
        return
    except Exception:
        pass
    if env_path.exists():
        for line in env_path.read_text().splitlines():
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            k, v = line.split("=", 1)
            k, v = k.strip(), v.strip().strip('"').strip("'")
            os.environ.setdefault(k, v)


_load_env()

# ─── DATA DIRECTORY (persistent Render disk in production) ────────────────────
# Locally this is <repo>/data. In production set DATA_DIR to a mounted disk path
# (e.g. /var/data) so the SQLite database survives restarts and redeploys.
# The image ships data/leads.db as the baseline dataset; on first boot with an
# empty disk we copy it across once, then all writes go to persistent storage.
import shutil as _shutil

_REPO_DIR = Path(__file__).resolve().parent
DATA_DIR  = Path(os.getenv("DATA_DIR") or (_REPO_DIR / "data"))
DB_PATH   = DATA_DIR / "leads.db"
_SEED_DB  = _REPO_DIR / "data" / "leads.db"   # baked into the image


def ensure_data_dir():
    """Create the data dir and seed leads.db once from the bundled baseline."""
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    try:
        same = _SEED_DB.resolve() == DB_PATH.resolve()
    except Exception:
        same = False
    if not same and not DB_PATH.exists() and _SEED_DB.exists():
        _shutil.copy2(_SEED_DB, DB_PATH)
        print(f"[config] seeded persistent DB at {DB_PATH} from baseline")


# ─── ANTHROPIC / CLAUDE (Phase 2+) ──────────────────────────────────────────
ANTHROPIC_API_KEY   = os.getenv("ANTHROPIC_API_KEY", "sk-ant-YOUR_KEY_HERE")
CLAUDE_MODEL        = "claude-sonnet-4-6"

# ─── GROQ (free AI scoring — console.groq.com) ───────────────────────────────
# Key loaded from .env (GROQ_API_KEY=...). Placeholder below is only a fallback.
GROQ_API_KEY        = os.getenv("GROQ_API_KEY", "YOUR_GROQ_KEY")

# ─── APOLLO ──────────────────────────────────────────────────────────────────
APOLLO_API_KEY      = os.getenv("APOLLO_API_KEY", "YOUR_APOLLO_KEY")

# ─── HUNTER ──────────────────────────────────────────────────────────────────
HUNTER_API_KEY      = os.getenv("HUNTER_API_KEY", "YOUR_HUNTER_KEY")

# ─── BREVO (replaces SendGrid / Instantly) ───────────────────────────────────
# Free tier: 300 emails/day permanently. Get key at: app.brevo.com → API Keys
BREVO_API_KEY       = os.getenv("BREVO_API_KEY", "YOUR_BREVO_KEY")
BREVO_SENDER_EMAIL  = os.getenv("BREVO_SENDER_EMAIL", "you@yourdomain.com")
BREVO_SENDER_NAME   = os.getenv("BREVO_SENDER_NAME", "Your Name")
# Brevo inbound domain (for reply webhooks) — configure at app.brevo.com → Inbound
BREVO_INBOUND_EMAIL = os.getenv("BREVO_INBOUND_EMAIL", "inbound@mail.yourdomain.com")

# ─── WHATSAPP (Meta WhatsApp Business Cloud API) ─────────────────────────────
# Scaffold: sending stays inactive until both are set. Create a WhatsApp Business
# app at developers.facebook.com → get a permanent token + phone number ID.
WHATSAPP_TOKEN      = os.getenv("WHATSAPP_TOKEN", "YOUR_WHATSAPP_TOKEN")
WHATSAPP_PHONE_ID   = os.getenv("WHATSAPP_PHONE_ID", "YOUR_WHATSAPP_PHONE_ID")

# ─── REDDIT API (praw) ───────────────────────────────────────────────────────
# Create app at: reddit.com/prefs/apps → "script" type
REDDIT_CLIENT_ID     = os.getenv("REDDIT_CLIENT_ID", "YOUR_REDDIT_CLIENT_ID")
REDDIT_CLIENT_SECRET = os.getenv("REDDIT_CLIENT_SECRET", "YOUR_REDDIT_CLIENT_SECRET")
REDDIT_USER_AGENT    = os.getenv("REDDIT_USER_AGENT", "lead-pipeline/1.0 by your_username")

# ─── SLACK NOTIFICATIONS ─────────────────────────────────────────────────────
# Create incoming webhook at: api.slack.com/apps → Incoming Webhooks
# Leave empty string to disable Slack notifications
SLACK_WEBHOOK_URL   = os.getenv("SLACK_WEBHOOK_URL", "")

# ─── TELEGRAM NOTIFICATIONS ──────────────────────────────────────────────────
# Create bot via @BotFather, get chat_id by messaging @userinfobot
# Leave empty strings to disable Telegram notifications
TELEGRAM_BOT_TOKEN  = os.getenv("TELEGRAM_BOT_TOKEN", "")
TELEGRAM_CHAT_ID    = os.getenv("TELEGRAM_CHAT_ID", "")

# ─── GOOGLE ADS ──────────────────────────────────────────────────────────────
# Customer ID format: 123-456-7890 (find in Google Ads top-right corner)
GOOGLE_ADS_CUSTOMER_ID          = os.getenv("GOOGLE_ADS_CUSTOMER_ID", "")
# Conversion action resource name — from Google Ads → Goals → Conversions
# Format: "customers/{customer_id}/conversionActions/{conversion_action_id}"
GOOGLE_ADS_CONVERSION_ACTION    = os.getenv("GOOGLE_ADS_CONVERSION_ACTION", "")
# Path to google-ads.yaml credentials file
GOOGLE_ADS_YAML_PATH            = os.getenv("GOOGLE_ADS_YAML_PATH", "google-ads.yaml")
# Customer Match user list resource name
# Format: "customers/{customer_id}/userLists/{user_list_id}"
GOOGLE_ADS_CUSTOMER_MATCH_LIST  = os.getenv("GOOGLE_ADS_CUSTOMER_MATCH_LIST", "")

# ─── DATABASE ────────────────────────────────────────────────────────────────
# SQLite path for local dev. For prod, set DATABASE_URL=postgresql://...
DATABASE_URL        = os.getenv("DATABASE_URL", "")   # empty = use SQLite

# ─── ICP (Ideal Customer Profile) ────────────────────────────────────────────
ICP_INDUSTRIES      = ["manufacturing", "automotive", "food processing",
                       "oil and gas", "pharmaceuticals", "logistics"]

ICP_TITLES          = ["Operations Manager", "Plant Manager", "VP Operations",
                       "CTO", "Head of Manufacturing", "Director of Engineering",
                       "Automation Engineer", "Process Engineer",
                       "Control Systems Engineer"]

ICP_COMPANY_SIZE    = {"min": 50, "max": 5000}

# ─── SCORING THRESHOLDS ──────────────────────────────────────────────────────
MIN_ICP_SCORE           = 45    # drop leads below this score
HIGH_INTENT_SCORE       = 70    # flag for Google Ads Customer Match at this score
HIGH_INTENT_ONLY        = False # if True, only queue high-intent leads

# ─── REDDIT SUBREDDITS TO SCRAPE ─────────────────────────────────────────────
REDDIT_SUBREDDITS   = ["PLC", "manufacturing", "SCADA", "ControlTheory",
                       "robotics", "industrialautomation"]

REDDIT_KEYWORDS     = [
    "integrat", "upgrade", "replac", "downtime", "automat",
    "PLC", "SCADA", "MES", "IoT", "OPC", "historian",
    "predictive maintenance", "quality control", "sensor",
    "legacy system", "Siemens", "Rockwell", "Allen Bradley",
]

# ─── APOLLO SEARCH FILTERS ───────────────────────────────────────────────────
APOLLO_SEARCH = {
    "person_titles":        ICP_TITLES,
    "person_locations": [
        "Saudi Arabia", "United Arab Emirates",
        "Qatar", "Kuwait", "Bahrain", "Oman",
    ],
    "organization_num_employees_ranges": ["51,200", "201,1000", "1001,5000"],
    "per_page": 25,
}

# ─── YOUR COMPANY CONTEXT (injected into every Claude prompt) ────────────────
YOUR_COMPANY = """
We build industrial automation solutions, IoT hardware + software systems,
and AI solutions for manufacturing and industrial companies.
Our key offerings:
- Smart factory automation (PLC/SCADA integration, robotics)
- Industrial IoT platforms (sensor networks, real-time dashboards)
- AI-powered quality control and predictive maintenance
We target mid-size manufacturers (50–5,000 employees) struggling with
manual processes, downtime, and lack of real-time visibility.
"""
