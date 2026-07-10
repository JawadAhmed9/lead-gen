# Lead Gen AI — 5-Minute C-Level Demo Walkthrough

A tight script for demoing to executives (CEO / CRO / CFO). The through-line:
**"We turn ad-hoc prospecting into a measurable, defensible revenue pipeline —
and the AI shows its work."** Lead with money, prove trust, close on control.

**Before you start:** run the API (`uvicorn api_server:app --port 8000`) and the
UI (`npm run dev`), log in as `admin@company.com` / `admin123`, and have the
**Analytics** page pre-loaded in the tab.

---

## 0:00 — Open on the outcome (Analytics page) · ~60s

Start on **Analytics**, not the Dashboard. Executives care about dollars first.

> "This is our GCC industrial-automation pipeline. Off 913 sourced contacts,
> the system has qualified 51 — and here's what that's worth."

Point to the top row: **Weighted Pipeline Value**, **Total Pipeline Value**,
**Cost per Qualified Lead**.

**The move that lands:** grab the **Avg deal size** and **Win rate** sliders and
drag them. The pipeline value updates live.

> "These are your assumptions, not ours — set them to your numbers and the model
> re-prices instantly. At a $25K deal and 20% win rate, this pipeline is worth
> ~$255K weighted, at roughly $2.50 per qualified lead."

Why it works: you've reframed a lead list as a revenue forecast the CFO can own.

---

## 1:00 — Prove the funnel is real (Analytics · Conversion Funnel) · ~45s

Scroll to the **Conversion Funnel**.

> "This isn't a mock-up — it's live. 913 collected, 28.8% enrich to a real
> contact, 35% of those get scored, and 55% of scored leads clear our
> qualification bar. Every percentage is computed from the database on load."

Point to the **ICP score distribution** beside it.

> "Green is at or above our qualification threshold. This is our quality curve —
> and it's how we'd tighten or loosen the funnel deliberately."

---

## 1:45 — Market coverage (Analytics · Market Intelligence) · ~40s

Scroll to the **by-country / by-industry / by-size** breakdowns and the
**top-companies leaderboard**.

> "Coverage is concentrated where we want it — Saudi Arabia leads, then the UAE.
> Blue bars are our GCC target market. And here are the highest-scoring accounts
> to prioritize this week."

Aside worth saying: *"The raw data is messy — the system normalizes cities to
countries and cleans junk fields automatically, so what you see is always
board-ready."*

---

## 2:25 — Trust the AI (Leads → lead-360 drawer) · ~60s

Go to **Leads**, click any high-scoring row. The **lead-360 drawer** opens.

> "Every executive's first question about an AI score is 'why should I trust it?'
> So we made the model show its work."

Point to **"Why this lead?"** — the factor bars (title, industry, region, company
size, contactability) and the model's written reasoning.

> "This lead scores high because it's a decision-maker, in a target industry, in
> the GCC, at the right company size, with a verified email. That's the ICP fit —
> next to the model's own score and its one-line rationale."

Point to the **timeline**: *"And here's its full history — collected, enriched,
scored, with timestamps."*

---

## 3:25 — Speed & control (command palette + bulk) · ~35s

Press **⌘/Ctrl-K**.

> "Operators live in this — jump to any view or search any lead instantly."

Type a name, hit enter. Back in the table, tick a couple of checkboxes.

> "Select leads, score them in bulk, save a filter as a reusable view. This is
> built for a team working at volume, not a spreadsheet."

---

## 4:00 — Governance (Activity page) · ~35s

Open **Activity**.

> "Every action is audited — who scored what, who imported, who ran the pipeline,
> who changed a teammate's role, with timestamps. Combined with our
> admin/manager/viewer roles, that's the governance an enterprise buyer expects."

Optionally: *"Keys are stored as environment secrets, never in the codebase."*

---

## 4:35 — Close with a leave-behind (Analytics · Export report) · ~25s

Back on **Analytics**, click **Export report**.

> "One click gives you a board-ready summary — outcomes, funnel, coverage, top
> accounts — as a PDF you can take into your next review."

**Closing line:**

> "So: a pipeline that prices itself in your terms, an AI that explains every
> decision, and a full audit trail. That's the difference between prospecting and
> a revenue system."

---

## Quick reference — what to click

| Time | Screen | Action | Point |
|---|---|---|---|
| 0:00 | Analytics | Drag deal-size / win-rate sliders | Pipeline value in dollars |
| 1:00 | Analytics | Conversion funnel + score histogram | It's live & real |
| 1:45 | Analytics | Country / industry / size + leaderboard | Market coverage |
| 2:25 | Leads → drawer | "Why this lead?" factors + reasoning | Trust the AI |
| 3:25 | Anywhere | ⌘/Ctrl-K, bulk select | Speed & scale |
| 4:00 | Activity | Scroll the audit feed | Governance |
| 4:35 | Analytics | Export report → PDF | Leave-behind |

## Handling the two likely questions

- **"Are you actually emailing these people yet?"** — "Sourcing, enrichment, and
  scoring are live today. Outreach, reply handling, and ad retargeting are built
  and staged for Phase 2 — deliberately gated so we prove list quality before we
  send a single email."
- **"How much does this cost to run?"** — "The live path is ~$49/month: Apollo for
  sourcing, and Groq's free tier for AI scoring. That's the cost-per-qualified
  number you saw up top."
