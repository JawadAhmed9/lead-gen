# Lead Gen AI — Industrial Lead Pipeline

AI-powered B2B lead engine for industrial automation companies, focused on the
GCC market (Saudi Arabia, UAE, Qatar, Kuwait, Bahrain, Oman). It sources
decision-makers from Apollo, enriches their contact and company data, scores
them against your ICP with an LLM, and surfaces everything through an
executive-grade analytics UI.

**Stack:** FastAPI · SQLite (or Postgres) · React + Tailwind · Apollo · Groq (LLaMA 3.3-70B)

---

## What's live vs. Phase 2

| Stage | Status |
|---|---|
| Collect (Apollo) | ✅ Live |
| Enrich (contact + company data) | ✅ Live |
| Score (Groq AI + rule-based fallback) | ✅ Live |
| Analytics, explainability, audit log, UI | ✅ Live |
| Send (email outreach via Brevo) | ⏳ Phase 2 — built, disabled |
| Reply classification | ⏳ Phase 2 — built, disabled |
| Google Ads (Customer Match + conversions) | ⏳ Phase 2 — built, disabled |

The `send`, `match`, and `ads` steps exist in the codebase but are intentionally
turned off. Nothing in the live path depends on them.

---

## Setup (10 minutes)

### 1. Install dependencies
```bash
pip install -r requirements.txt          # backend
cd ui && npm install && cd ..            # frontend
```

### 2. Add your API keys to `.env`
Keys live in a gitignored `.env` file (never in source). Copy the example and fill it in:
```bash
cp .env.example .env
```
```bash
# .env
GROQ_API_KEY=gsk_...        # console.groq.com  (free tier — used for scoring)
APOLLO_API_KEY=...          # app.apollo.io → Settings → API  (lead sourcing)

# Optional — only needed when you enable Phase 2:
# ANTHROPIC_API_KEY=...     # console.anthropic.com
# HUNTER_API_KEY=...        # hunter.io  (extra email enrichment)
# BREVO_API_KEY=...         # app.brevo.com  (cold email sending, free 300/day)
# DATABASE_URL=...          # postgresql://...  (leave empty to use local SQLite)
```
`config.py` loads `.env` automatically (via `python-dotenv`, with a zero-dependency
fallback), so no code changes are required.

### 3. Configure your ICP
Edit `config.py`:
- `ICP_INDUSTRIES` — industries you target
- `ICP_TITLES` — decision-maker titles
- `YOUR_COMPANY` — your company description (injected into scoring prompts)
- `MIN_ICP_SCORE` — minimum score to mark a lead "qualified" (default: 45)
- `APOLLO_SEARCH` — default titles/locations/company-size filters

### 4. Initialize the database
```bash
python main.py --stats
```
Creates `data/leads.db` on first run.

---

## Running the app

The app has two parts: the **API server** (backend) and the **UI** (frontend). Run
each in its own terminal.

### API server
```bash
uvicorn api_server:app --reload --port 8000
# docs at http://localhost:8000/docs
```

### UI
```bash
cd ui
npm run dev            # http://localhost:5173
```
Log in with a demo account (admin / manager / viewer):
`admin@company.com` / `admin123`.

From the UI you can collect leads, edit Apollo filters, import spreadsheets,
score on demand, and view all analytics — no command line needed.

---

## Running the pipeline from the CLI (optional)

The UI triggers these for you, but you can also run them directly:

```bash
python main.py --step collect      # pull leads from Apollo → raw_leads
python main.py --step enrich       # add contact + company data → enriched_leads
python main.py --step score        # Groq ICP scoring → scored_leads (queued if ≥ MIN_ICP_SCORE)
python main.py --step apollo-only  # collect + rule-based score in one pass
python main.py --stats             # print counts at each stage
```

Each collect run advances an Apollo page offset, so you never re-fetch the same
leads. Leads without an email or phone are gated at `raw` and never advance.

---

## How it works (live path)

```
Apollo API   → collect  → raw_leads       (3-layer dedup: Apollo ID → domain+name → LinkedIn)
enrichment   → enrich   → enriched_leads  (email, company size, tech stack; contact-gated)
Groq LLM     → score    → scored_leads    (icp_score, intent, offering match; queued if ≥ 45)
                                          ↑ rule-based fallback if Groq is unavailable
```

The React UI reads this data through the FastAPI server and adds:

- **Dashboard** — live stage counts, funnel, 14-day intake trend.
- **Analytics** — pipeline value & cost-per-qualified with adjustable deal-size /
  win-rate assumptions, conversion funnel with rates, market breakdowns by
  country / industry / company size, score histogram, top-company leaderboard,
  and a one-click board-ready PDF export.
- **Leads** — searchable, filterable table with a lead-360 drawer that shows a
  transparent "Why this lead?" ICP-fit breakdown, the model's reasoning, and a
  pipeline timeline. Saved views, bulk scoring, CSV export, Excel/CSV import.
- **Activity** — audit trail of every action (logins, scoring, imports, pipeline
  runs, role changes) with actor and timestamp.
- **Command palette** — `⌘/Ctrl-K` to jump to any page or search leads.
- **Roles** — admin / manager / viewer, enforced on every mutating endpoint.

---

## Data hygiene

Source data is messy (city names in the country field, numeric junk in industry,
zero employee counts on many Apollo rows). The analytics layer **normalizes at
query time** for display — mapping GCC cities to countries, folding junk
industries into "Unspecified", and preferring enriched company size over empty
employee counts. Stored rows are never mutated.

---

## Cost estimate (~500 leads/month, live path)

| Tool | Cost |
|---|---|
| Apollo | ~$49/mo |
| Groq (scoring) | Free tier |
| **Live total** | **~$49/mo** |

Phase 2 adds Brevo (free tier, 300 emails/day), optional Hunter (~$34/mo), and
optional Anthropic/Claude (~$5–15/mo) if you switch scoring providers.

## Scale tips

- Start with `pages=1` in the Pipeline settings — ~25 leads/run.
- Raise `MIN_ICP_SCORE` to 60 for higher-quality, fewer qualified leads.
- For production, set `DATABASE_URL` to a Postgres instance (Supabase/Neon/Railway).
- When enabling Phase 2 sending: ramp volume slowly and use a separate sending domain.
